/**
 * ADMINISTRATION DU MODULE « LES COMMERCIAUX ».
 *
 *   GET    /api/commercials                        la liste, avec compteurs et CA
 *   GET    /api/commercials/candidates             qui l'on peut rattacher
 *   POST   /api/commercials                        rattacher quelqu'un (jeu de droits de départ)
 *   DELETE /api/commercials/:userId                retirer l'accès CRM, et lui seul
 *   GET    /api/commercials/:userId                la fiche + ses capacités
 *   PUT    /api/commercials/:userId/capabilities   régler ses capacités
 *   GET    /api/commercials/:userId/prospects      son portefeuille
 *   GET    /api/commercials/:userId/clients
 *   GET    /api/commercials/:userId/activities     ce qu'il a fait / ce qui a bougé chez lui
 *   GET    /api/commercials/:userId/performance    les KPI d'une période
 *   POST   /api/commercials/:userId/prospects      lui attribuer des prospects
 *   DELETE /api/commercials/:userId/prospects/:id  lui en retirer un
 *
 * ── Ce fichier ne DÉCIDE aucun droit d'accès ────────────────────────
 * La règle « qui voit quoi » est écrite UNE seule fois, dans
 * server/lib/crmScope.ts. Ici on ne fait qu'écrire les DONNÉES qu'elle
 * relira (`crm_user_capabilities`, `prospects.assigned_to`) et les
 * restituer telles quelles. Aucune condition de visibilité n'est
 * recopiée : une divergence entre l'écran de réglage et le serveur ne
 * serait pas un bug d'affichage, ce serait un droit annoncé qui
 * n'existe pas — ou pire, un droit retiré qui reste ouvert.
 *
 * ── AUCUNE table de permissions n'est créée ─────────────────────────
 * « Commercial » n'est PAS une entité. C'est un état : une personne de
 * l'espace qui porte la capacité `crm.access`. Le vocabulaire des
 * capacités est fermé EN TYPESCRIPT (CRM_CAPABILITIES) et stocké dans le
 * `text[]` de crm_user_capabilities — la migration 102 le dit
 * explicitement : « le schéma stocke, le code décide ». Ajouter une
 * permission = ajouter une chaîne à cette liste, jamais une migration,
 * et surtout jamais une table de rôles parallèle.
 *
 * ── Les DEUX mondes d'identité, réunis ici ──────────────────────────
 * L'espace connaît deux populations : `tenant_users` (comptes
 * d'administration, connexion /auth) et `team_members` (employés,
 * connexion /team-login). Toutes deux possèdent une ligne
 * `public.users`, et c'est CET identifiant — users.id — que portent
 * `assigned_to`, `created_by` et `crm_user_capabilities.user_id`.
 *
 * server/routes/crmAccess.ts ne regarde aujourd'hui que tenant_users :
 * un employé y est donc invisible, ni assignable ni capacitable. C'est
 * le blocage que ce fichier lève, en construisant sa liste de personnes
 * à partir des DEUX tables. Un team_member sans `user_id` (invitation
 * jamais acceptée) reste exclu : sans ligne users, il n'y a rien à quoi
 * rattacher une capacité ni un prospect.
 *
 * ── Réservé aux gestionnaires (requireRole('manager')) ──────────────
 * Le rôle est relu en base par requireRole (cache 30 s), jamais pris
 * dans le corps de la requête. Un manager peut donc accorder ces
 * capacités : elles n'ouvrent QUE le CRM — jamais la paie, jamais les
 * paramètres de l'espace — et un manager voit déjà tout le CRM par le
 * court-circuit `estGestionnaire`. Il n'y a donc pas d'escalade à
 * craindre, contrairement à une promotion de rôle.
 * (À noter : /api/crm/capabilities/:userId, l'écran historique, est lui
 * réservé à l'admin. Les deux routes écrivent la même colonne ; c'est
 * le contrat de ce module qui fixe le seuil ici.)
 *
 * ── Monté AVANT crudRoutes ──────────────────────────────────────────
 * crud.ts est monté sur `/api` et capte `/api/:table`. Monté après lui,
 * `/api/commercials` serait compris comme la table « commercials » et
 * répondrait 403/404 sans jamais atteindre ce routeur.
 *
 * Schéma associé : supabase/migrations/102_crm_acces_par_utilisateur.sql
 */
import { Router, type Request, type Response } from 'express'
import { tenantQuery, tenantQueryOne, tenantTransaction } from '../db/pool'
import { requireAuth, requireRole } from '../middleware/auth'
import { logger } from '../lib/logger'
import {
  CRM_CAPABILITIES,
  estCapaciteValide,
  invaliderCapacites,
  journaliser,
  type CrmActor,
} from '../lib/crmScope'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* Format d'une date reçue en paramètre : AAAA-MM-JJ, et rien d'autre.
   `new Date('2026-13-45')` ne lève pas, il renvoie Invalid Date qui part
   ensuite en SQL comme la chaîne 'Invalid Date' — un 22007 en pleine
   requête de KPI. On refuse plus tôt et plus clairement. */
const DATE_ISO_RE = /^\d{4}-\d{2}-\d{2}$/

/** L'interrupteur maître : sans cette capacité, aucune route CRM de
 *  l'espace employé ne répond. C'est elle, et elle seule, qui fait de
 *  quelqu'un « un commercial » au sens de cet écran. */
const CAP_ACCES = 'crm.access'

/* Jeu de départ accordé au rattachement : de quoi travailler tout de
   suite sur SON périmètre (voir, créer, modifier ses prospects, et
   journaliser notes, appels et relances) — et rien de plus. Aucune
   capacité `*_all` ici : élargir le périmètre à tout l'espace est une
   décision explicite, prise case par case dans l'écran des capacités,
   jamais un effet de bord du bouton « Ajouter ».

   Typé `string[]` et filtré par `estCapaciteValide` à l'usage : une
   entrée retirée du vocabulaire ne fait alors pas échouer le
   rattachement, elle est simplement ignorée. */
const CAPACITES_DE_DEPART: string[] = [
  CAP_ACCES,
  'prospects.view', 'prospects.create', 'prospects.edit',
  'activities.view', 'activities.create',
  'activities.note', 'activities.call', 'activities.followup',
]

/* Plafond d'attribution en une fois. On attribue un lot de prospects à
   un commercial, pas le fichier entier d'un coup : au-delà, la requête
   est soit une erreur de l'appelant, soit une façon de faire travailler
   le serveur pour rien. */
const MAX_ATTRIBUTIONS = 500

const LIMITE_DEFAUT = 50
const LIMITE_MAX    = 500

/* Le rôle est déjà relu en base par requireAuth (getEffectiveRole) :
   req.user.role est fiable, on peut le passer tel quel à crmScope. */
const acteur = (req: Request): CrmActor => ({
  tenantId: req.user!.tenantId,
  userId:   req.user!.userId,
  role:     req.user!.role,
})

/* ── Le module n'est pas encore installé sur cette base ──────────────
   Les migrations de ce dépôt s'appliquent À LA MAIN en production,
   APRÈS le déploiement automatique du code. Il existe donc une fenêtre
   pendant laquelle ce fichier tourne sans les tables crm_* (42P01) ni
   les colonnes assigned_to/created_by (42703).

   Deux comportements distincts, et c'est voulu :
    • LECTURES → liste vide. L'écran « Les commerciaux » s'affiche vide
      au lieu de peindre un 500 sur tout le module (modèle
      server/routes/messages.ts).
    • ÉCRITURES → 503 explicite. Un accès qu'on croit accordé alors
      qu'il n'est nulle part est bien pire qu'une erreur visible. */
const CODES_MODULE_ABSENT = new Set(['42P01', '42703'])
const moduleAbsent = (e: any): boolean => CODES_MODULE_ABSENT.has(e?.code)

const ERREUR_MODULE_ABSENT = {
  error: 'Module commerciaux non installé sur cette base — migration 102 à appliquer.',
}

/** Erreur porteuse d'un statut HTTP : permet de sortir d'une transaction
 *  avec un 404 lisible plutôt qu'un 500 générique. */
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** Échec d'une LECTURE : le module absent dégrade en `vide`. */
function echecLecture(res: Response, contexte: string, e: any, vide: unknown) {
  if (res.headersSent) {
    logger.error(`[commercials:${contexte}] après réponse —`, e?.message)
    return
  }
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message })
  if (moduleAbsent(e)) {
    logger.warn(`[commercials:${contexte}] module absent —`, e?.message)
    return res.json(vide)
  }
  logger.error(`[commercials:${contexte}]`, e?.message)
  return res.status(500).json({ error: 'Erreur serveur' })
}

/** Échec d'une ÉCRITURE : le module absent devient un 503 explicite. */
function echecEcriture(res: Response, contexte: string, e: any) {
  if (res.headersSent) {
    logger.error(`[commercials:${contexte}] après réponse —`, e?.message)
    return
  }
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message })
  if (moduleAbsent(e)) return res.status(503).json(ERREUR_MODULE_ABSENT)
  logger.error(`[commercials:${contexte}]`, e?.message)
  return res.status(500).json({ error: 'Erreur serveur' })
}

router.use(requireAuth)
router.use(requireRole('manager'))

/* ════════════════════════════════════════════════════════════════════
   1. LES PERSONNES DE L'ESPACE — LES DEUX MONDES RÉUNIS
   ═══════════════════════════════════════════════════════════════════ */

interface Personne {
  user_id:        string
  team_member_id: string | null
  name:           string
  email:          string
  phone:          string | null
  status:         string
  hired_at:       string | null
  department:     string | null
  kind:           'member' | 'admin'
  /** Rôle porté par la ligne d'origine (team_members.role ou
   *  tenant_users.role). Purement informatif : `team_members.role`
   *  vaut 'commercial' chez certains sans ouvrir AUCUN droit — seules
   *  les capacités décident. On l'expose pour que l'écran puisse
   *  proposer « ce membre est marqué commercial, l'activer ? ». */
  role:           string
}

/**
 * Toutes les personnes rattachables de l'espace, indexées par user_id.
 *
 * Deux sources réunies, dans cet ordre de priorité :
 *  1. `team_members` actifs et déjà rattachés à un compte (user_id non
 *     nul) — la population que crmAccess.ts ignorait, et le vrai
 *     « commercial » du terrain ;
 *  2. `tenant_users` actifs, pour les comptes d'administration qui
 *     travaillent aussi le portefeuille.
 *
 * La MÊME personne peut exister des deux côtés (même users.id). La
 * fiche employé gagne : elle porte le téléphone, le département et la
 * date d'embauche que tenant_users n'a pas. Sans cet arbitrage la liste
 * afficherait deux lignes pour un seul portefeuille, et le bouton
 * « retirer » de l'une laisserait l'autre allumée.
 *
 * `u.is_active IS NOT FALSE` plutôt que `u.is_active` : la colonne est
 * nullable sur les comptes historiques, et NULL y signifie « jamais
 * désactivé », pas « désactivé ».
 *
 * Cette Map sert aussi de LISTE BLANCHE aux écritures : tout user_id
 * absent d'ici est refusé. Sans ce contrôle, l'identifiant d'un autre
 * espace — ou d'un compte parti — s'écrirait dans
 * crm_user_capabilities et y resterait, invisible d'un écran qui ne
 * sait afficher que le personnel présent.
 */
async function personnesDeLEspace(tenantId: string): Promise<Map<string, Personne>> {
  const rows = await tenantQuery<Personne>(
    tenantId,
    `WITH membres AS (
       SELECT tm.user_id,
              tm.id::text                                        AS team_member_id,
              COALESCE(
                NULLIF(BTRIM(CONCAT_WS(' ', NULLIF(BTRIM(tm.prenom), ''),
                                            NULLIF(BTRIM(tm.nom), ''))), ''),
                NULLIF(BTRIM(u.name), ''),
                tm.email)                                        AS name,
              COALESCE(NULLIF(BTRIM(tm.email), ''), u.email)     AS email,
              NULLIF(BTRIM(tm.telephone), '')                    AS phone,
              tm.account_status                                  AS status,
              tm.date_embauche                                   AS hired_at,
              COALESCE(NULLIF(BTRIM(tm.departement), ''),
                       NULLIF(BTRIM(tm.job_title), ''))          AS department,
              'member'::text                                     AS kind,
              COALESCE(NULLIF(BTRIM(tm.role), ''), 'employe')    AS role
         FROM public.team_members tm
         JOIN public.users u ON u.id = tm.user_id
        WHERE tm.tenant_id = $1
          AND tm.user_id IS NOT NULL
          AND tm.account_status = 'active'
          AND u.is_active IS NOT FALSE
     ),
     admins AS (
       SELECT tu.user_id,
              NULL::text                                         AS team_member_id,
              COALESCE(NULLIF(BTRIM(u.name), ''), u.email)       AS name,
              u.email                                            AS email,
              NULL::text                                         AS phone,
              tu.status                                          AS status,
              NULL::date                                         AS hired_at,
              NULL::text                                         AS department,
              'admin'::text                                      AS kind,
              tu.role                                            AS role
         FROM public.tenant_users tu
         JOIN public.users u ON u.id = tu.user_id
        WHERE tu.tenant_id = $1
          AND tu.status = 'active'
          AND u.is_active IS NOT FALSE
     )
     SELECT * FROM membres
     UNION ALL
     SELECT a.* FROM admins a
      WHERE NOT EXISTS (SELECT 1 FROM membres m WHERE m.user_id = a.user_id)
     ORDER BY 3`,
    [tenantId],
  )
  return new Map(rows.map(r => [r.user_id, r]))
}

/**
 * Les capacités enregistrées, par utilisateur, pour tout l'espace.
 *
 * Lecture SÉPARÉE de `personnesDeLEspace`, et non une jointure : la
 * table crm_user_capabilities peut manquer (migration 102 non encore
 * appliquée). Jointe, son absence emporterait aussi la liste des
 * personnes, et l'écran « Candidats » n'afficherait plus personne à
 * rattacher — alors qu'il n'a besoin d'aucune table CRM pour exister.
 * Isolée, elle dégrade toute seule en « personne n'a de capacité ».
 *
 * Filtrage par `estCapaciteValide` : une valeur écrite avant un
 * renommage, ou glissée à la main en base, ne doit pas se comporter
 * comme un droit — c'est exactement ce que fait crmScope à la lecture.
 */
async function capacitesDeLEspace(tenantId: string): Promise<Map<string, string[]>> {
  try {
    const rows = await tenantQuery<{ user_id: string; capabilities: string[] | null }>(
      tenantId,
      `SELECT user_id, capabilities
         FROM public.crm_user_capabilities
        WHERE tenant_id = $1`,
      [tenantId],
    )
    return new Map(rows.map(r => [r.user_id, (r.capabilities ?? []).filter(estCapaciteValide)]))
  } catch (e: any) {
    if (!moduleAbsent(e)) throw e
    logger.warn('[commercials:capacites] module absent —', e?.message)
    return new Map()
  }
}

/* ════════════════════════════════════════════════════════════════════
   2. COMPTEURS, CA ET DERNIÈRE ACTIVITÉ
   ═══════════════════════════════════════════════════════════════════ */

interface AgregatRow {
  user_id:          string
  prospects:        number
  conversions:      number
  clients:          number
  devis:            number
  revenue:          number
  last_activity_at: string | null
}

const AGREGAT_VIDE = { prospects: 0, conversions: 0, clients: 0, devis: 0, revenue: 0 }

/**
 * Les compteurs de TOUS les commerciaux, en UNE requête.
 *
 * `unnest($2::uuid[])` déroule la liste des identifiants côté serveur et
 * un LEFT JOIN LATERAL agrège par personne : un aller-retour, quel que
 * soit l'effectif. La boucle « une requête par commercial » qu'on écrit
 * naturellement ici coûterait, elle, une connexion et une transaction
 * PAR LIGNE (cf. tenantQuery) — soit vingt transactions pour peindre un
 * tableau de vingt lignes.
 *
 * ── Périmètre retenu : `assigned_to = lui OU created_by = lui` ───────
 * Exactement le périmètre que crmScope applique à la lecture. Un
 * prospect saisi puis réattribué compte donc chez les DEUX : c'est
 * délibéré et cohérent avec la règle d'accès (created_by ne bouge
 * jamais, précisément pour qu'un commercial ne perde pas son propre
 * travail après une réattribution). Les compteurs de l'écran disent donc
 * « ce à quoi il a accès », pas « ce qu'on lui a donné ce mois-ci » —
 * c'est la route /performance qui répond à cette seconde question.
 *
 * ── Le CA : devis ACCEPTÉS, et rien d'autre ─────────────────────────
 * La chaîne retenue est `devis.statut = 'accepte'` → SUM(montant_ttc),
 * attribué par assigned_to/created_by du DEVIS.
 *
 * Pourquoi pas les factures ni les paiements — qui seraient pourtant
 * plus proches de l'argent réellement encaissé : `factures` et
 * `paiements` ne portent AUCUNE colonne de propriété (la migration 102
 * n'a ajouté created_by/assigned_to que sur prospects, clients et
 * devis). Il faudrait remonter facture → devis → assigned_to, chaîne
 * qui casse sur toute facture émise sans devis (factures.devis_id est
 * nullable, ON DELETE SET NULL). Le chiffre serait alors
 * silencieusement sous-évalué, et différemment selon les commerciaux —
 * un CA faux est pire qu'un CA prudent. Le devis accepté est la seule
 * chaîne intégralement attribuable ; l'écran doit le libeller
 * « CA signé », pas « encaissé ».
 *
 * ── `last_activity_at` : deux sources, faute d'une seule fiable ──────
 * `activity_logs.user_id` dit ce que la personne a FAIT (attribution
 * certaine). `prospect_logs`, la timeline CRM réellement alimentée par
 * l'application, n'a PAS de colonne user_id — seulement `auteur`, du
 * texte libre : on ne peut donc l'attribuer que par la propriété du
 * prospect, ce qui répond à « quand son portefeuille a-t-il bougé ». On
 * prend le plus récent des deux. GREATEST ignore les NULL sous
 * PostgreSQL : une personne sans aucune trace renvoie bien NULL.
 */
async function agregatsParPersonne(
  tenantId: string,
  userIds: string[],
): Promise<Map<string, AgregatRow>> {
  if (!userIds.length) return new Map()
  try {
    const rows = await tenantQuery<AgregatRow>(
      tenantId,
      `SELECT c.user_id,
              COALESCE(pr.total, 0)       AS prospects,
              COALESCE(pr.conversions, 0) AS conversions,
              COALESCE(cl.total, 0)       AS clients,
              COALESCE(dv.total, 0)       AS devis,
              COALESCE(dv.revenue, 0)     AS revenue,
              act.last_activity_at
         FROM unnest($2::uuid[]) AS c(user_id)
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int                                            AS total,
                  COUNT(*) FILTER (WHERE p.statut = 'gagne')::int          AS conversions
             FROM public.prospects p
            WHERE p.tenant_id = $1
              AND (p.assigned_to = c.user_id OR p.created_by = c.user_id)
         ) pr ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS total
             FROM public.clients cli
            WHERE cli.tenant_id = $1
              AND (cli.assigned_to = c.user_id OR cli.created_by = c.user_id)
         ) cl ON TRUE
         LEFT JOIN LATERAL (
           SELECT COUNT(*)::int AS total,
                  COALESCE(SUM(d.montant_ttc) FILTER (WHERE d.statut = 'accepte'), 0) AS revenue
             FROM public.devis d
            WHERE d.tenant_id = $1
              AND (d.assigned_to = c.user_id OR d.created_by = c.user_id)
         ) dv ON TRUE
         LEFT JOIN LATERAL (
           SELECT GREATEST(
                    (SELECT MAX(al.created_at) FROM public.activity_logs al
                      WHERE al.tenant_id = $1 AND al.user_id = c.user_id),
                    (SELECT MAX(pl.created_at) FROM public.prospect_logs pl
                       JOIN public.prospects p2 ON p2.id = pl.prospect_id
                      WHERE pl.tenant_id = $1
                        AND (p2.assigned_to = c.user_id OR p2.created_by = c.user_id))
                  ) AS last_activity_at
         ) act ON TRUE`,
      [tenantId, userIds],
    )
    return new Map(rows.map(r => [r.user_id, r]))
  } catch (e: any) {
    /* Colonnes de propriété absentes : on rend la liste des personnes
       avec des compteurs à zéro plutôt qu'un écran en erreur. */
    if (!moduleAbsent(e)) throw e
    logger.warn('[commercials:agregats] module absent —', e?.message)
    return new Map()
  }
}

interface Commercial extends Personne {
  crm_enabled:      boolean
  capabilities:     string[]
  counts:           { prospects: number; clients: number; devis: number; conversions: number }
  revenue:          number
  last_activity_at: string | null
}

function composer(p: Personne, caps: string[], agg: AgregatRow | undefined): Commercial {
  return {
    ...p,
    crm_enabled: caps.includes(CAP_ACCES),
    capabilities: caps,
    counts: {
      prospects:   agg?.prospects   ?? AGREGAT_VIDE.prospects,
      clients:     agg?.clients     ?? AGREGAT_VIDE.clients,
      devis:       agg?.devis       ?? AGREGAT_VIDE.devis,
      conversions: agg?.conversions ?? AGREGAT_VIDE.conversions,
    },
    revenue:          agg?.revenue ?? AGREGAT_VIDE.revenue,
    last_activity_at: agg?.last_activity_at ?? null,
  }
}

/* ════════════════════════════════════════════════════════════════════
   3. LA LISTE
   ═══════════════════════════════════════════════════════════════════ */

/**
 * GET /api/commercials
 *
 * Deux populations, réunies :
 *  • toute personne portant `crm.access` — c'est la définition même du
 *    commercial actif, quel que soit son monde d'identité ;
 *  • tout employé marqué `role = 'commercial'` dans team_members, même
 *    sans accès accordé. Il apparaît avec crm_enabled = false, prêt à
 *    être activé d'un clic. Sans lui, l'administrateur devrait deviner
 *    qui rattacher : `team_members.role` est décoratif aujourd'hui — il
 *    n'ouvre aucun droit — mais il dit exactement l'intention de celui
 *    qui a créé la fiche employé.
 */
router.get('/', async (req: Request, res: Response) => {
  const a = acteur(req)
  if (!UUID_RE.test(a.tenantId)) return res.status(400).json({ error: 'Espace invalide' })

  try {
    const [personnes, capsParUser] = await Promise.all([
      personnesDeLEspace(a.tenantId),
      capacitesDeLEspace(a.tenantId),
    ])

    const retenues = [...personnes.values()].filter((p) => {
      const caps = capsParUser.get(p.user_id) ?? []
      if (caps.includes(CAP_ACCES)) return true
      return p.kind === 'member' && p.role.toLowerCase().trim() === 'commercial'
    })

    const agg = await agregatsParPersonne(a.tenantId, retenues.map(p => p.user_id))

    res.json({
      commercials: retenues.map(p =>
        composer(p, capsParUser.get(p.user_id) ?? [], agg.get(p.user_id))),
    })
  } catch (e: any) {
    echecLecture(res, 'list', e, { commercials: [] })
  }
})

/**
 * GET /api/commercials/candidates — qui l'on peut rattacher.
 *
 * AUCUNE création de compte ici : on rattache l'existant. Créer un
 * utilisateur depuis cet écran fabriquerait une troisième population
 * d'identités à côté de tenant_users et team_members, avec sa propre
 * procédure d'invitation et sa propre façon de se connecter — un
 * commercial qui n'existerait dans aucun des deux espaces de connexion.
 *
 * Déclaré AVANT `/:userId` : sans cela, Express ferait correspondre
 * « candidates » au paramètre :userId et répondrait « identifiant
 * invalide » sur une route parfaitement valide.
 */
router.get('/candidates', async (req: Request, res: Response) => {
  const a = acteur(req)
  if (!UUID_RE.test(a.tenantId)) return res.status(400).json({ error: 'Espace invalide' })

  try {
    const [personnes, capsParUser] = await Promise.all([
      personnesDeLEspace(a.tenantId),
      capacitesDeLEspace(a.tenantId),
    ])

    res.json({
      people: [...personnes.values()].map(p => ({
        user_id:        p.user_id,
        team_member_id: p.team_member_id,
        name:           p.name,
        email:          p.email,
        kind:           p.kind,
        role:           p.role,
        already:        (capsParUser.get(p.user_id) ?? []).includes(CAP_ACCES),
      })),
    })
  } catch (e: any) {
    echecLecture(res, 'candidates', e, { people: [] })
  }
})

/* ════════════════════════════════════════════════════════════════════
   4. RATTACHER / DÉTACHER
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Écrit la liste complète des capacités d'une personne, sous verrou.
 *
 * `FOR UPDATE` puis calcul en JavaScript plutôt qu'un jeu de fonctions
 * de tableau en SQL : deux administrateurs qui cochent des cases en même
 * temps se sérialisent, au lieu que le second écrase silencieusement le
 * travail du premier. Renvoie l'état AVANT, pour que l'appelant sache
 * s'il y a quelque chose à journaliser.
 */
async function ecrireCapacites(
  a: CrmActor,
  userId: string,
  calcul: (anciennes: string[]) => string[],
): Promise<{ avant: string[]; apres: string[] }> {
  const resultat = await tenantTransaction(a.tenantId, async (client) => {
    const existant = await client.query<{ capabilities: string[] | null }>(
      `SELECT capabilities
         FROM public.crm_user_capabilities
        WHERE tenant_id = $1 AND user_id = $2
        FOR UPDATE`,
      [a.tenantId, userId],
    )
    const avant = (existant.rows[0]?.capabilities ?? []).filter(estCapaciteValide)
    const apres = calcul(avant)

    await client.query(
      `INSERT INTO public.crm_user_capabilities (tenant_id, user_id, capabilities, updated_by)
       VALUES ($1, $2, $3::text[], $4)
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET capabilities = EXCLUDED.capabilities,
                     updated_by   = EXCLUDED.updated_by`,
      [a.tenantId, userId, apres, a.userId],
    )
    return { avant, apres }
  }, a.userId)

  /* SANS cette invalidation, retirer l'accès ne prendrait effet qu'à
     l'expiration du cache de crmScope (30 s) : l'administrateur qui
     vérifie aussitôt verrait l'ancien périmètre et conclurait que le
     réglage ne marche pas. */
  invaliderCapacites(userId, a.tenantId)
  return resultat
}

/** Dédoublonne ET remet dans l'ordre canonique du vocabulaire. Deux
 *  enregistrements du même réglage produisent alors exactement le même
 *  tableau — donc aucune fausse entrée « modifié » dans le journal. */
function canoniser(voulues: Iterable<string>): string[] {
  const demandees = new Set<string>([...voulues].filter(estCapaciteValide))
  return (CRM_CAPABILITIES as readonly string[]).filter(c => demandees.has(c))
}

const memeListe = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((v, i) => v === b[i])

/**
 * POST /api/commercials — rattacher quelqu'un au module.
 *
 * Idempotent : réactiver une personne déjà commerciale ne duplique rien
 * et, surtout, N'ÉCRASE PAS ses capacités par le jeu de départ. Un
 * double-clic sur « Ajouter », ou un retour en arrière du navigateur,
 * rétrograderait sinon un commercial senior réglé finement au niveau
 * d'un débutant — sans le moindre message.
 *
 * Réactiver quelqu'un DÉJÀ détaché (capacités conservées, `crm.access`
 * retiré) lui rend son accès avec ses anciens droits, plus le jeu de
 * départ : on ne redemande pas à l'administrateur de tout recocher.
 */
router.post('/', async (req: Request, res: Response) => {
  const a = acteur(req)
  const userId = String(req.body?.user_id ?? '')
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Utilisateur invalide' })

  try {
    const personnes = await personnesDeLEspace(a.tenantId)
    const personne  = personnes.get(userId)
    if (!personne) {
      return res.status(400).json({
        error: "Cette personne ne fait pas partie du personnel actif de l'espace",
      })
    }

    const { avant, apres } = await ecrireCapacites(a, userId, (anciennes) =>
      anciennes.includes(CAP_ACCES)
        /* Déjà commercial : on ne touche à rien. */
        ? canoniser(anciennes)
        : canoniser([...anciennes, ...CAPACITES_DE_DEPART]))

    const caps = await capacitesDeLEspace(a.tenantId)
    const agg  = await agregatsParPersonne(a.tenantId, [userId])
    res.json({ commercial: composer(personne, caps.get(userId) ?? apres, agg.get(userId)) })

    if (!memeListe(avant, apres)) {
      void journaliser(a, {
        module: 'team_members',
        recordId: userId,
        action: 'update',
        description: `Accès CRM ouvert à ${personne.name} : ${apres.join(', ')}`,
        avant: { capabilities: avant },
        apres: { capabilities: apres },
      })
    }
  } catch (e: any) {
    echecEcriture(res, 'add', e)
  }
})

/**
 * DELETE /api/commercials/:userId — retirer l'accès, et LUI SEUL.
 *
 * On enlève `crm.access` et on laisse tout le reste en place :
 *  • les autres capacités, pour qu'une réactivation rende exactement
 *    les droits d'avant ;
 *  • `assigned_to` sur ses prospects, clients et devis — désattribuer
 *    en masse ferait basculer tout un portefeuille en « non attribué »,
 *    donc invisible de tous sauf des gestionnaires, sans que personne
 *    ne l'ait demandé ;
 *  • ses traces dans activity_logs et prospect_logs.
 * Un départ ne doit pas effacer l'historique commercial de l'espace.
 */
router.delete('/:userId', async (req: Request, res: Response) => {
  const a = acteur(req)
  const userId = String(req.params.userId ?? '')
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Utilisateur invalide' })

  try {
    const personnes = await personnesDeLEspace(a.tenantId)
    /* Pas de 400 si la personne n'est plus au personnel : on doit
       pouvoir refermer l'accès de quelqu'un qui vient de partir. */
    const nom = personnes.get(userId)?.name ?? userId

    const { avant, apres } = await ecrireCapacites(a, userId, (anciennes) =>
      canoniser(anciennes.filter(c => c !== CAP_ACCES)))

    res.json({ success: true, capabilities: apres })

    if (!memeListe(avant, apres)) {
      void journaliser(a, {
        module: 'team_members',
        recordId: userId,
        action: 'update',
        description: `Accès CRM retiré à ${nom}`,
        avant: { capabilities: avant },
        apres: { capabilities: apres },
      })
    }
  } catch (e: any) {
    echecEcriture(res, 'remove', e)
  }
})

/* ════════════════════════════════════════════════════════════════════
   5. LA FICHE ET SES CAPACITÉS
   ═══════════════════════════════════════════════════════════════════ */

/** GET /api/commercials/:userId */
router.get('/:userId', async (req: Request, res: Response) => {
  const a = acteur(req)
  const userId = String(req.params.userId ?? '')
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Utilisateur invalide' })

  try {
    const personnes = await personnesDeLEspace(a.tenantId)
    const personne  = personnes.get(userId)
    if (!personne) return res.status(404).json({ error: 'Commercial introuvable' })

    const caps = (await capacitesDeLEspace(a.tenantId)).get(userId) ?? []
    const agg  = await agregatsParPersonne(a.tenantId, [userId])

    res.json({ commercial: composer(personne, caps, agg.get(userId)), capabilities: caps })
  } catch (e: any) {
    echecLecture(res, 'get', e, { commercial: null, capabilities: [] })
  }
})

/**
 * PUT /api/commercials/:userId/capabilities — remplace la liste complète.
 *
 * Sémantique de remplacement et non de fusion : l'écran affiche l'état
 * complet et renvoie l'état complet. Une API de fusion obligerait le
 * client à envoyer des retraits explicites, et une case décochée dans
 * l'écran mais oubliée dans le corps resterait accordée sans que
 * personne ne le voie.
 *
 * Vocabulaire FERMÉ : toute valeur inconnue vaut 400. L'accepter ne
 * donnerait aucun droit — crmScope filtre à la lecture — mais laisserait
 * un administrateur convaincu d'avoir accordé quelque chose.
 */
router.put('/:userId/capabilities', async (req: Request, res: Response) => {
  const a = acteur(req)
  const userId = String(req.params.userId ?? '')
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Utilisateur invalide' })

  const brut = req.body?.capabilities
  if (!Array.isArray(brut)) return res.status(400).json({ error: 'Liste de capacités manquante' })

  const inconnues = brut.filter((c: unknown) => !estCapaciteValide(c))
  if (inconnues.length) {
    return res.status(400).json({
      error: `Capacité inconnue : ${inconnues.slice(0, 5).map(String).join(', ')}`,
      capacites_connues: CRM_CAPABILITIES,
    })
  }

  try {
    const personnes = await personnesDeLEspace(a.tenantId)
    const personne  = personnes.get(userId)
    if (!personne) {
      return res.status(400).json({
        error: "Cette personne ne fait pas partie du personnel actif de l'espace",
      })
    }

    const voulues = canoniser(brut as string[])
    const { avant, apres } = await ecrireCapacites(a, userId, () => voulues)

    res.json({ success: true, capabilities: apres })

    if (!memeListe(avant, apres)) {
      void journaliser(a, {
        module: 'team_members',
        recordId: userId,
        action: 'update',
        description: apres.length
          ? `Droits CRM de ${personne.name} : ${apres.join(', ')}`
          : `Droits CRM de ${personne.name} retirés`,
        avant: { capabilities: avant },
        apres: { capabilities: apres },
      })
    }
  } catch (e: any) {
    echecEcriture(res, 'capabilities:put', e)
  }
})

/* ════════════════════════════════════════════════════════════════════
   6. SON PORTEFEUILLE
   ═══════════════════════════════════════════════════════════════════ */

/** Borne de pagination : un `limit` absurde ou négatif retombe sur la
 *  valeur par défaut plutôt que d'envoyer `LIMIT -1` à PostgreSQL. */
function borne(valeur: unknown, defaut: number, max: number): number {
  const n = Number(valeur)
  if (!Number.isFinite(n) || n <= 0) return defaut
  return Math.min(Math.floor(n), max)
}

function offsetDe(valeur: unknown): number {
  const n = Number(valeur)
  if (!Number.isFinite(n) || n <= 0) return 0
  return Math.min(Math.floor(n), 100_000)
}

/* Les deux colonnes de propriété, ensemble : c'est le portefeuille tel
   que crmScope le définit — ce qu'on lui a confié ET ce qu'il a saisi. */
const CLAUSE_PORTEFEUILLE = '(t.assigned_to = $2 OR t.created_by = $2)'

/** GET /api/commercials/:userId/prospects */
router.get('/:userId/prospects', async (req: Request, res: Response) => {
  const a = acteur(req)
  const userId = String(req.params.userId ?? '')
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Utilisateur invalide' })

  const limit  = borne(req.query.limit, LIMITE_DEFAUT, LIMITE_MAX)
  const offset = offsetDe(req.query.offset)

  try {
    const prospects = await tenantQuery(
      a.tenantId,
      `SELECT t.id, t.code, t.nom, t.entreprise, t.email, t.telephone,
              t.statut, t.pipeline_stage, t.valeur_estimee, t.temperature,
              t.ville, t.date_relance, t.next_action_date,
              t.created_at, t.assigned_to, t.created_by
         FROM public.prospects t
        WHERE t.tenant_id = $1 AND ${CLAUSE_PORTEFEUILLE}
        ORDER BY t.created_at DESC
        LIMIT $3 OFFSET $4`,
      [a.tenantId, userId, limit, offset],
    )
    res.json({ prospects, limit, offset })
  } catch (e: any) {
    echecLecture(res, 'prospects', e, { prospects: [], limit, offset })
  }
})

/** GET /api/commercials/:userId/clients */
router.get('/:userId/clients', async (req: Request, res: Response) => {
  const a = acteur(req)
  const userId = String(req.params.userId ?? '')
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Utilisateur invalide' })

  const limit  = borne(req.query.limit, LIMITE_DEFAUT, LIMITE_MAX)
  const offset = offsetDe(req.query.offset)

  try {
    const clients = await tenantQuery(
      a.tenantId,
      `SELECT t.id, t.nom, t.entreprise, t.email, t.telephone, t.statut,
              t.ville, t.type_service, t.montant_ttc_annuel, t.budget,
              t.date_dernier_contact, t.created_at, t.assigned_to, t.created_by
         FROM public.clients t
        WHERE t.tenant_id = $1 AND ${CLAUSE_PORTEFEUILLE}
        ORDER BY t.created_at DESC
        LIMIT $3 OFFSET $4`,
      [a.tenantId, userId, limit, offset],
    )
    res.json({ clients, limit, offset })
  } catch (e: any) {
    echecLecture(res, 'clients', e, { clients: [], limit, offset })
  }
})

/**
 * GET /api/commercials/:userId/activities
 *
 * Deux sources fusionnées, parce qu'aucune ne suffit seule :
 *  • `prospect_logs` — la timeline CRM que l'application alimente
 *    vraiment (notes, appels, e-mails). Elle n'a PAS de colonne
 *    user_id : son champ `auteur` est du texte libre, inutilisable pour
 *    une jointure. On l'attribue donc par la PROPRIÉTÉ DU PROSPECT, ce
 *    qui répond à « qu'est-ce qui a bougé dans son portefeuille ».
 *  • `activity_logs` — le journal applicatif, lui indexé par
 *    `user_id`. Il dit ce que la personne a fait de ses propres mains.
 *
 * Les deux sont étiquetées (`source`) pour que l'écran ne les présente
 * pas comme équivalentes : la première n'est pas une preuve d'action
 * personnelle.
 */
router.get('/:userId/activities', async (req: Request, res: Response) => {
  const a = acteur(req)
  const userId = String(req.params.userId ?? '')
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Utilisateur invalide' })

  const limit = borne(req.query.limit, LIMITE_DEFAUT, LIMITE_MAX)

  try {
    const activities = await tenantQuery(
      a.tenantId,
      `(SELECT pl.id::text        AS id,
               'prospect_log'     AS source,
               pl.type            AS type,
               pl.message         AS contenu,
               pl.created_at      AS created_at,
               pl.prospect_id::text AS record_id,
               p.nom              AS libelle
          FROM public.prospect_logs pl
          JOIN public.prospects p ON p.id = pl.prospect_id AND p.tenant_id = $1
         WHERE pl.tenant_id = $1
           AND (p.assigned_to = $2 OR p.created_by = $2))
       UNION ALL
       (SELECT al.id::text, 'journal', al.action_type, al.description,
               al.created_at, al.record_id, al.module_name
          FROM public.activity_logs al
         WHERE al.tenant_id = $1
           AND al.user_id = $2
           AND al.module_name IN ('prospects', 'clients', 'devis', 'prospect_logs'))
       ORDER BY created_at DESC
       LIMIT $3`,
      [a.tenantId, userId, limit],
    )
    res.json({ activities, limit })
  } catch (e: any) {
    echecLecture(res, 'activities', e, { activities: [], limit })
  }
})

/* ════════════════════════════════════════════════════════════════════
   7. PERFORMANCE
   ═══════════════════════════════════════════════════════════════════ */

/** Une date de filtre, ou null. Refuse tout ce qui n'est pas AAAA-MM-JJ
 *  ET réellement existant : '2026-02-31' passe la regex mais pas le
 *  calendrier, et PostgreSQL le refuserait en 22008 au milieu de la
 *  requête. */
function dateOuNull(valeur: unknown): string | null | undefined {
  if (valeur === undefined || valeur === null || valeur === '') return null
  const s = String(valeur)
  if (!DATE_ISO_RE.test(s)) return undefined
  const d = new Date(`${s}T00:00:00Z`)
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return undefined
  return s
}

interface KpiRow {
  prospects_assigned:  number
  prospects_contacted: number
  prospects_open:      number
  devis_sent:          number
  converted:           number
  clients_won:         number
  revenue:             number
}

const KPI_VIDE: KpiRow = {
  prospects_assigned: 0, prospects_contacted: 0, prospects_open: 0,
  devis_sent: 0, converted: 0, clients_won: 0, revenue: 0,
}

/**
 * GET /api/commercials/:userId/performance?from=&to=
 *
 * Sans `from` ni `to`, la période couvre TOUT l'historique : les KPI
 * coïncident alors exactement avec les compteurs de la liste. Un défaut
 * implicite (« les 30 derniers jours ») afficherait deux chiffres
 * différents pour la même personne sur deux écrans voisins, et
 * personne ne saurait lequel croire.
 *
 * `to` est INCLUSIF : on compare à `to + 1 jour` en exclusif, sans quoi
 * une période « du 1er au 31 » perdrait silencieusement tout le 31.
 *
 * Colonne de date par ressource : `created_at` pour les prospects et
 * les clients (le moment où ils entrent au portefeuille),
 * `date_emission` pour les devis — la date qui figure sur le document,
 * la seule que le commercial reconnaisse.
 *
 * Définitions retenues, à partir des statuts réellement présents en
 * base (nouveau, prospect, contacte, qualifie, proposition, gagne,
 * perdu) :
 *   prospects_contacted : sorti de l'état d'entrée, donc travaillé ;
 *   prospects_open      : ni gagné ni perdu — le pipeline vivant ;
 *   devis_sent          : tout devis sorti du brouillon ;
 *   converted           : prospect passé à « gagné » ;
 *   clients_won         : clients entrés au portefeuille sur la période ;
 *   revenue             : cf. agregatsParPersonne — devis ACCEPTÉS, la
 *                         seule chaîne intégralement attribuable à une
 *                         personne dans ce schéma.
 */
router.get('/:userId/performance', async (req: Request, res: Response) => {
  const a = acteur(req)
  const userId = String(req.params.userId ?? '')
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Utilisateur invalide' })

  const from = dateOuNull(req.query.from)
  const to   = dateOuNull(req.query.to)
  if (from === undefined || to === undefined) {
    return res.status(400).json({ error: 'Date invalide (format attendu : AAAA-MM-JJ)' })
  }
  if (from && to && from > to) {
    return res.status(400).json({ error: 'La date de début est postérieure à la date de fin' })
  }

  const periode = { from, to }

  try {
    const row = await tenantQueryOne<KpiRow>(
      a.tenantId,
      `WITH p AS (
         SELECT t.statut
           FROM public.prospects t
          WHERE t.tenant_id = $1 AND ${CLAUSE_PORTEFEUILLE}
            AND ($3::date IS NULL OR t.created_at >= $3::date)
            AND ($4::date IS NULL OR t.created_at < ($4::date + 1))
       ),
       c AS (
         SELECT 1 AS un
           FROM public.clients t
          WHERE t.tenant_id = $1 AND ${CLAUSE_PORTEFEUILLE}
            AND ($3::date IS NULL OR t.created_at >= $3::date)
            AND ($4::date IS NULL OR t.created_at < ($4::date + 1))
       ),
       d AS (
         SELECT t.statut, t.montant_ttc
           FROM public.devis t
          WHERE t.tenant_id = $1 AND ${CLAUSE_PORTEFEUILLE}
            AND ($3::date IS NULL OR t.date_emission >= $3::date)
            AND ($4::date IS NULL OR t.date_emission <= $4::date)
       )
       SELECT (SELECT COUNT(*) FROM p)::int                                              AS prospects_assigned,
              (SELECT COUNT(*) FROM p WHERE statut NOT IN ('nouveau', 'prospect'))::int  AS prospects_contacted,
              (SELECT COUNT(*) FROM p WHERE statut NOT IN ('gagne', 'perdu'))::int       AS prospects_open,
              (SELECT COUNT(*) FROM d WHERE statut <> 'brouillon')::int                  AS devis_sent,
              (SELECT COUNT(*) FROM p WHERE statut = 'gagne')::int                       AS converted,
              (SELECT COUNT(*) FROM c)::int                                              AS clients_won,
              (SELECT COALESCE(SUM(montant_ttc), 0) FROM d WHERE statut = 'accepte')     AS revenue`,
      [a.tenantId, userId, from, to],
    )

    const kpis = row ?? KPI_VIDE
    /* Taux calculé ici et non en SQL : une division par zéro y donnerait
       NULL, que le client afficherait « — » alors que la réponse juste
       est 0 %. Arrondi à une décimale, l'écran n'a rien à recalculer. */
    const taux = kpis.prospects_assigned > 0
      ? Math.round((kpis.converted / kpis.prospects_assigned) * 1000) / 10
      : 0

    res.json({ kpis: { ...kpis, conversion_rate: taux }, periode })
  } catch (e: any) {
    echecLecture(res, 'performance', e, {
      kpis: { ...KPI_VIDE, conversion_rate: 0 }, periode,
    })
  }
})

/* ════════════════════════════════════════════════════════════════════
   8. ATTRIBUER / RETIRER DES PROSPECTS
   ═══════════════════════════════════════════════════════════════════ */

/**
 * POST /api/commercials/:userId/prospects — attribuer un lot.
 *
 * On n'écrit QUE `assigned_to`. `created_by` ne bouge jamais : c'est
 * elle qui garantit qu'un commercial ne perd pas l'accès à sa propre
 * saisie le jour où un manager réattribue le dossier (migration 102).
 *
 * L'UPDATE est filtré par tenant_id en plus de l'être par la RLS :
 * un identifiant venu d'un autre espace ne trouve simplement aucune
 * ligne, et la réponse dit combien ont réellement changé de main.
 */
router.post('/:userId/prospects', async (req: Request, res: Response) => {
  const a = acteur(req)
  const userId = String(req.params.userId ?? '')
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Utilisateur invalide' })

  const brut = req.body?.prospect_ids
  if (!Array.isArray(brut) || !brut.length) {
    return res.status(400).json({ error: 'Aucun prospect à attribuer' })
  }
  if (brut.length > MAX_ATTRIBUTIONS) {
    return res.status(400).json({
      error: `Trop de prospects en une fois (${MAX_ATTRIBUTIONS} maximum)`,
    })
  }
  /* Dédoublonnage : le même identifiant deux fois ferait compter deux
     attributions là où une seule ligne a bougé. */
  const ids = [...new Set(brut.map((v: unknown) => String(v ?? '')))]
  if (ids.some(id => !UUID_RE.test(id))) {
    return res.status(400).json({ error: 'Identifiant de prospect invalide' })
  }

  try {
    const personnes = await personnesDeLEspace(a.tenantId)
    const personne  = personnes.get(userId)
    if (!personne) {
      return res.status(400).json({
        error: "Cette personne ne fait pas partie du personnel actif de l'espace",
      })
    }

    const modifies = await tenantQuery<{ id: string; nom: string; ancien: string | null }>(
      a.tenantId,
      /* Le CTE verrouille et MÉMORISE le responsable précédent : sans
         lui, RETURNING ne peut rendre que la valeur d'après, et le
         journal dirait « attribué à X » sans jamais dire à qui la fiche
         était. `IS DISTINCT FROM` (et non `<>`) parce que l'ancien
         responsable est NULL sur toutes les fiches antérieures à la
         102 : `NULL <> $2` vaut NULL, donc faux, et pas une seule
         attribution ne passerait. */
      `WITH avant AS (
         SELECT id, assigned_to
           FROM public.prospects
          WHERE tenant_id = $1
            AND id = ANY($3::uuid[])
            AND assigned_to IS DISTINCT FROM $2
          FOR UPDATE
       )
       UPDATE public.prospects p
          SET assigned_to = $2
         FROM avant
        WHERE p.id = avant.id AND p.tenant_id = $1
      RETURNING p.id, p.nom, avant.assigned_to AS ancien`,
      [a.tenantId, userId, ids],
      a.userId,
    )

    res.json({ assigned: modifies.length, requested: ids.length })

    for (const m of modifies) {
      void journaliser(a, {
        module: 'prospects',
        recordId: m.id,
        action: 'update',
        description: `Prospect « ${m.nom} » attribué à ${personne.name}`,
        avant: { assigned_to: m.ancien },
        apres: { assigned_to: userId },
      })
    }
  } catch (e: any) {
    echecEcriture(res, 'assign', e)
  }
})

/**
 * DELETE /api/commercials/:userId/prospects/:prospectId
 *
 * `AND assigned_to = $3` dans le WHERE : on ne retire que ce qui est
 * effectivement à cette personne. Sans cette condition, l'écran d'un
 * commercial pourrait désattribuer le prospect d'un collègue par une
 * URL forgée, et la fiche tomberait en « non attribué » — invisible de
 * tous sauf des gestionnaires.
 */
router.delete('/:userId/prospects/:prospectId', async (req: Request, res: Response) => {
  const a = acteur(req)
  const userId     = String(req.params.userId ?? '')
  const prospectId = String(req.params.prospectId ?? '')
  if (!UUID_RE.test(userId))     return res.status(400).json({ error: 'Utilisateur invalide' })
  if (!UUID_RE.test(prospectId)) return res.status(400).json({ error: 'Prospect invalide' })

  try {
    const row = await tenantQueryOne<{ id: string; nom: string }>(
      a.tenantId,
      `UPDATE public.prospects
          SET assigned_to = NULL
        WHERE tenant_id = $1 AND id = $2 AND assigned_to = $3
      RETURNING id, nom`,
      [a.tenantId, prospectId, userId],
      a.userId,
    )
    if (!row) {
      return res.status(404).json({ error: 'Prospect introuvable ou non attribué à cette personne' })
    }

    res.json({ success: true })

    void journaliser(a, {
      module: 'prospects',
      recordId: row.id,
      action: 'update',
      description: `Prospect « ${row.nom} » retiré du portefeuille`,
      avant: { assigned_to: userId },
      apres: { assigned_to: null },
    })
  } catch (e: any) {
    echecEcriture(res, 'unassign', e)
  }
})

export default router
