/**
 * ADMINISTRATION DES ACCÈS CRM — qui est responsable, qui voit quoi.
 *
 *   GET  /api/crm/assignables            le personnel à qui confier une fiche
 *   GET  /api/crm/grants/:type/:id       responsable + partages d'une fiche   (gestionnaire)
 *   PUT  /api/crm/grants/:type/:id       remplace TOUS les partages d'une fiche (gestionnaire)
 *   GET  /api/crm/capabilities/:userId   les cases « voir tout »               (admin)
 *   PUT  /api/crm/capabilities/:userId   idem, en écriture                     (admin)
 *
 * ── Ce fichier ne DÉCIDE rien ───────────────────────────────────────
 * La règle d'accès est écrite une seule fois, dans server/lib/crmScope.ts.
 * Ici on ne fait qu'écrire les DONNÉES que cette règle relira :
 * `assigned_to`, `crm_record_grants`, `crm_user_capabilities`. Aucune
 * condition de visibilité n'est réécrite à la main — c'est la seule
 * façon d'être sûr que l'écran de réglage promet exactement ce que le
 * serveur applique. Une divergence entre les deux ne serait pas un bug
 * d'affichage : ce serait un partage annoncé qui ne partage rien, ou un
 * accès retiré qui reste ouvert.
 *
 * ── Monté AVANT crudRoutes ──────────────────────────────────────────
 * crud.ts est monté sur `/api` tout court et capte `/api/:table`.
 * Monté après lui, `/api/crm/...` serait compris comme la table « crm »
 * et répondrait 403 ou 404 au lieu d'atteindre ce routeur. L'ordre dans
 * server/index.ts n'est donc pas cosmétique — c'est lui qui rend ce
 * fichier joignable.
 *
 * ── Le rôle vient de la BASE, jamais de la requête ───────────────────
 * `requireRole` relit `tenant_users.role` (cache 30 s) avant chaque
 * appel : un administrateur rétrogradé perd ces écrans en moins d'une
 * minute au lieu d'attendre l'expiration de son jeton (1 h). Rien dans
 * le corps de la requête ne participe à la décision d'autorisation.
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
  estRessourceCrm,
  invaliderCapacites,
  journaliser,
  tableDe,
  type CrmActor,
  type CrmResource,
} from '../lib/crmScope'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* Plafond de partages traités en une fois. Une fiche se partage avec
   quelques collègues, pas avec un annuaire : au-delà, la requête est
   soit une erreur de l'appelant, soit une tentative de faire travailler
   le serveur pour rien. */
const MAX_GRANTS = 100

/* Le rôle est déjà relu en base par requireAuth (getEffectiveRole) :
   req.user.role est fiable, on peut le passer tel quel à crmScope. */
const acteur = (req: Request): CrmActor => ({
  tenantId: req.user!.tenantId,
  userId:   req.user!.userId,
  role:     req.user!.role,
})

/* ── La migration 102 n'est pas encore passée sur cette base ─────────
   Les migrations de ce projet s'appliquent À LA MAIN en production : il
   existe une fenêtre où le code tourne sans les tables (42P01) ni les
   colonnes assigned_to/created_by (42703).

   Contrairement à la messagerie, qui dégrade ses LECTURES en silence, on
   répond ici une erreur explicite dans les deux sens. Un écran d'accès
   qui afficherait « aucun partage » alors que la table manque ferait
   croire à un réglage vierge — et le premier enregistrement suivant
   effacerait des droits qu'on n'a jamais pu lire. */
const CODES_MODULE_ABSENT = new Set(['42P01', '42703'])
const moduleAbsent = (e: any): boolean => CODES_MODULE_ABSENT.has(e?.code)

const ERREUR_MODULE_ABSENT = {
  error: 'Accès CRM non installés sur cette base — migration 102 à appliquer.',
}

/** Erreur porteuse d'un statut HTTP : permet de sortir d'une transaction
 *  avec un 404 lisible plutôt qu'un 500 générique. */
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/** Réponse d'erreur unique : module absent → 503, statut porté → tel
 *  quel, reste → 500 sans détail (le message base ne sort jamais). */
function echec(res: Response, contexte: string, e: any) {
  /* La réponse peut être DÉJÀ partie : le journal s'écrit après le
     res.json du PUT. Réémettre un statut ici lèverait un
     ERR_HTTP_HEADERS_SENT qui masquerait l'erreur d'origine. */
  if (res.headersSent) {
    logger.error(`[crmAccess:${contexte}] après réponse —`, e?.message)
    return
  }
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message })
  if (moduleAbsent(e)) return res.status(503).json(ERREUR_MODULE_ABSENT)
  logger.error(`[crmAccess:${contexte}]`, e?.message)
  return res.status(500).json({ error: 'Erreur serveur' })
}

router.use(requireAuth)

/* ════════════════════════════════════════════════════════════════════
   1. LE PERSONNEL DE L'ESPACE
   ═══════════════════════════════════════════════════════════════════ */

interface Personne {
  user_id: string
  name:    string
  email:   string
  /** Rôle qui FAIT AUTORITÉ : celui de `tenant_users` quand la personne
   *  y a une ligne, sinon `team_member`. Jamais `team_members.role`. */
  role:    string
  /** 'admin' = compte de l'espace d'administration, 'member' = fiche
   *  employé connectée par /team-login. */
  kind:    'admin' | 'member'
  /** Fiche employé correspondante, quand il y en a une. */
  team_member_id: string | null
  /** `team_members.role` — INDICATIF (« commercial », « comptable »…).
   *  Sert à repérer les commerciaux à activer, jamais à autoriser. */
  job_role: string | null
}

/**
 * Les personnes à qui l'on peut confier une fiche ou ouvrir un accès.
 *
 * ── Pourquoi l'union des deux mondes ────────────────────────────────
 * Cet espace a DEUX portes d'entrée : `tenant_users` (/auth, espace
 * d'administration) et `team_members` (/team-login, /my-space). Cette
 * fonction ne lisait que la première, et c'était le blocage central du
 * module : un employé n'apparaissait ni dans la liste des responsables,
 * ni dans l'écran des droits — impossible de lui confier un prospect,
 * impossible de lui accorder la moindre capacité, alors que c'est
 * précisément lui, le commercial.
 *
 * Techniquement rien ne s'y opposait : `assigned_to`, `created_by`,
 * `crm_record_grants.user_id` et `crm_user_capabilities.user_id`
 * référencent tous `users(id)`, et un employé rattaché en a un. D'où le
 * filtre `tm.user_id IS NOT NULL` : une fiche employé simplement saisie,
 * jamais invitée, n'a pas de compte — lui assigner un prospect
 * écrirait un NULL, c'est-à-dire « non attribué ».
 *
 * ── Une seule ligne par personne ────────────────────────────────────
 * La même personne peut porter les deux casquettes (compte
 * d'administration ET fiche employé). On garde alors celle de
 * `tenant_users` : c'est la seule que l'autorisation regarde
 * (getEffectiveRole, crmScope.estGestionnaire). `team_members.role` est
 * décoratif — la migration 091 le dit dans son propre COMMENT :
 * « L'autorisation effective vient de tenant_users.role ». Le publier
 * comme `role` ferait passer pour gestionnaire un employé étiqueté
 * « admin » dans sa fiche RH, et l'écran des droits, qui masque les
 * cases des gestionnaires, refuserait alors de lui en accorder aucune.
 * Il sort donc à part, dans `job_role`.
 *
 * `u.is_active IS NOT FALSE` plutôt que `u.is_active` : la colonne est
 * nullable sur les comptes historiques, et NULL y signifie « jamais
 * désactivé », pas « désactivé ».
 *
 * La Map sert de LISTE BLANCHE aux écritures : tout user_id absent
 * d'ici est refusé (400). Sans ce contrôle, un identifiant d'un autre
 * espace — ou d'un compte parti — s'écrirait dans crm_record_grants et
 * y resterait, invisible de l'écran qui ne sait afficher que le
 * personnel présent.
 */
async function personnelActif(tenantId: string): Promise<Map<string, Personne>> {
  const rows = await tenantQuery<Personne>(
    tenantId,
    `WITH comptes AS (
       SELECT tu.user_id,
              COALESCE(NULLIF(BTRIM(u.name), ''), u.email)  AS name,
              u.email                                       AS email,
              tu.role                                       AS role,
              'admin'::text                                 AS kind,
              NULL::text                                    AS team_member_id,
              NULL::text                                    AS job_role
         FROM public.tenant_users tu
         JOIN public.users u ON u.id = tu.user_id
        WHERE tu.tenant_id = $1
          AND tu.status = 'active'
          AND tu.user_id IS NOT NULL
          AND u.is_active IS NOT FALSE
       UNION ALL
       /* Le nom vient de la FICHE d'abord : c'est celui que l'équipe
          reconnaît, alors que users.name est souvent vide ou reprend
          l'e-mail d'invitation. */
       SELECT tm.user_id,
              COALESCE(NULLIF(BTRIM(CONCAT_WS(' ', tm.prenom, tm.nom)), ''),
                       NULLIF(BTRIM(u.name), ''),
                       u.email)                             AS name,
              COALESCE(NULLIF(BTRIM(tm.email), ''), u.email) AS email,
              'team_member'::text                           AS role,
              'member'::text                                AS kind,
              tm.id::text                                   AS team_member_id,
              NULLIF(BTRIM(tm.role), '')                    AS job_role
         FROM public.team_members tm
         JOIN public.users u ON u.id = tm.user_id
        WHERE tm.tenant_id = $1
          AND tm.account_status = 'active'
          AND tm.user_id IS NOT NULL
          AND u.is_active IS NOT FALSE
     ),
     /* DISTINCT ON : une personne, une ligne. L'ordre place d'abord le
        compte d'administration — la casquette qui décide — et, entre
        deux comptes d'administration (cas impossible aujourd'hui, la
        clé de tenant_users l'interdit), le rôle le plus élevé. */
     retenus AS (
       SELECT DISTINCT ON (user_id)
              user_id, name, email, role, kind,
              /* Les deux casquettes se rejoignent ici : la ligne retenue
                 est celle du compte d'administration, mais la fiche
                 employé de la même personne reste rattachée — sans quoi
                 un administrateur qui est aussi salarié perdrait son
                 identité RH dans cet écran. MAX() sur une PARTITION d'au
                 plus deux lignes, dont une NULL : c'est un « prends
                 celle qui existe », pas un calcul. */
              MAX(team_member_id) OVER (PARTITION BY user_id) AS team_member_id,
              MAX(job_role)       OVER (PARTITION BY user_id) AS job_role
         FROM comptes
        ORDER BY user_id,
                 (kind = 'admin') DESC,
                 CASE LOWER(COALESCE(role, ''))
                   WHEN 'super_admin' THEN 0
                   WHEN 'admin'       THEN 1
                   WHEN 'manager'     THEN 2
                   ELSE 3
                 END
     )
     SELECT user_id, name, email, role, kind, team_member_id, job_role
       FROM retenus
      ORDER BY name`,
    [tenantId],
  )
  return new Map(rows.map(r => [r.user_id, r]))
}

/** Noms d'affichage pour le journal. Passe par `users` et non par le
 *  personnel actif : la personne à qui l'on RETIRE un accès peut déjà
 *  avoir quitté l'espace, et « Accès retiré à <uuid> » ne se lit pas. */
async function nomsDe(tenantId: string, ids: string[]): Promise<Map<string, string>> {
  const uniques = [...new Set(ids)].filter(id => UUID_RE.test(id))
  if (!uniques.length) return new Map()
  try {
    const rows = await tenantQuery<{ id: string; name: string }>(
      tenantId,
      `SELECT id, COALESCE(NULLIF(BTRIM(name), ''), email) AS name
         FROM public.users
        WHERE id = ANY($1::uuid[])`,
      [uniques],
    )
    return new Map(rows.map(r => [r.id, r.name]))
  } catch (e: any) {
    /* Le journal ne doit jamais faire échouer l'enregistrement des
       droits : sans les noms, on écrira les identifiants. */
    logger.error('[crmAccess:noms]', e?.message)
    return new Map()
  }
}

/**
 * GET /api/crm/assignables — le personnel actif de l'espace, comptes
 * d'administration ET employés confondus (cf. personnelActif).
 *
 * Ouvert à tout compte authentifié de l'espace, volontairement : la
 * fiche d'un prospect affiche le nom de son responsable à tout le monde,
 * et la même liste (nom, e-mail, rôle) est déjà servie à chacun par
 * /api/messages/contacts. La restreindre aux gestionnaires ne fermerait
 * donc rien, et casserait l'affichage du responsable chez le commercial.
 * Ce qui est réservé aux gestionnaires, c'est d'ÉCRIRE (PUT ci-dessous).
 */
router.get('/assignables', async (req: Request, res: Response) => {
  const a = acteur(req)
  if (!UUID_RE.test(a.tenantId)) return res.status(400).json({ error: 'Espace invalide' })
  try {
    const personnel = await personnelActif(a.tenantId)
    res.json({ users: [...personnel.values()] })
  } catch (e: any) {
    echec(res, 'assignables', e)
  }
})

/* ════════════════════════════════════════════════════════════════════
   2. PARTAGES D'UNE FICHE
   ═══════════════════════════════════════════════════════════════════ */

interface Droits {
  can_view:    boolean
  can_log:     boolean
  can_edit:    boolean
  can_quote:   boolean
  can_convert: boolean
}

const CLES_DROITS: Array<keyof Droits> =
  ['can_view', 'can_log', 'can_edit', 'can_quote', 'can_convert']

/* Libellés du journal — le lecteur du « Journal d'activité » ne connaît
   pas les noms de colonnes. */
const LIBELLE_DROIT: Record<keyof Droits, string> = {
  can_view:    'consultation',
  can_log:     'saisie d’activité',
  can_edit:    'modification',
  can_quote:   'devis',
  can_convert: 'conversion',
}

const LIBELLE_RESSOURCE: Record<CrmResource, string> = {
  prospect: 'prospect',
  client:   'client',
  devis:    'devis',
}

const listerDroits = (d: Droits): string =>
  CLES_DROITS.filter(k => d[k]).map(k => LIBELLE_DROIT[k]).join(', ') || 'aucun'

const memesDroits = (a: Droits, b: Droits): boolean =>
  CLES_DROITS.every(k => a[k] === b[k])

/**
 * Normalise une entrée du corps de la requête.
 *
 * Renvoie `null` quand aucune case n'est cochée : c'est une SUPPRESSION
 * du partage, pas une ligne à cinq faux. Une ligne inerte en base
 * réapparaîtrait à l'écran comme un partage existant.
 *
 * `can_view` est forcé dès qu'un autre droit est demandé. Sans cela on
 * fabriquerait un droit fantôme : la clause de périmètre des LISTES ne
 * regarde que `can_view` (crmScope.clausePerimetre), alors que
 * `peutAcceder` accepterait la modification. La fiche resterait donc
 * invisible dans l'écran tout en étant modifiable par appel direct —
 * exactement le genre d'incohérence que personne ne remarque avant
 * l'incident.
 */
function normaliserDroits(src: any): Droits | null {
  const d: Droits = {
    can_view:    src?.can_view    === true,
    can_log:     src?.can_log     === true,
    can_edit:    src?.can_edit    === true,
    can_quote:   src?.can_quote   === true,
    can_convert: src?.can_convert === true,
  }
  if (d.can_log || d.can_edit || d.can_quote || d.can_convert) d.can_view = true
  return d.can_view ? d : null
}

interface GrantRow extends Droits {
  user_id: string
  name:    string
  email:   string
}

/** GET /grants/:type/:id — l'état complet des accès d'une fiche. */
router.get('/grants/:type/:id', requireRole('manager'), async (req: Request, res: Response) => {
  const type = req.params.type
  const id   = String(req.params.id ?? '')

  /* `tableDe` interpole son résultat dans le SQL : le type doit sortir
     de la liste fermée de crmScope AVANT d'y arriver. */
  if (!estRessourceCrm(type)) return res.status(400).json({ error: 'Type de fiche inconnu' })
  if (!UUID_RE.test(id))      return res.status(400).json({ error: 'Identifiant de fiche invalide' })

  const a = acteur(req)
  try {
    const fiche = await tenantQueryOne<{ assigned_to: string | null; created_by: string | null }>(
      a.tenantId,
      `SELECT assigned_to, created_by
         FROM public.${tableDe(type)}
        WHERE id = $1 AND tenant_id = $2`,
      [id, a.tenantId],
    )
    if (!fiche) return res.status(404).json({ error: 'Fiche introuvable' })

    /* JOIN et non LEFT JOIN : une ligne dont l'utilisateur a été
       supprimé n'existe plus (FK ON DELETE CASCADE). Le LEFT JOIN
       n'aurait servi qu'à afficher des lignes sans nom. */
    const grants = await tenantQuery<GrantRow>(
      a.tenantId,
      `SELECT g.user_id,
              COALESCE(NULLIF(BTRIM(u.name), ''), u.email) AS name,
              u.email,
              g.can_view, g.can_log, g.can_edit, g.can_quote, g.can_convert
         FROM public.crm_record_grants g
         JOIN public.users u ON u.id = g.user_id
        WHERE g.tenant_id = $1
          AND g.resource_type = $2
          AND g.resource_id = $3
        ORDER BY 2`,
      [a.tenantId, type, id],
    )

    res.json({ assigned_to: fiche.assigned_to, created_by: fiche.created_by, grants })
  } catch (e: any) {
    echec(res, 'grants:get', e)
  }
})

/**
 * PUT /grants/:type/:id — remplace l'INTÉGRALITÉ des partages.
 *
 * Sémantique de remplacement et non de fusion : l'écran affiche l'état
 * complet et renvoie l'état complet. Une API de fusion obligerait le
 * client à envoyer des suppressions explicites, et un partage oublié
 * dans le corps resterait ouvert sans que personne ne le voie.
 *
 * Tout se joue dans UNE transaction : sans elle, une erreur entre le
 * DELETE et les INSERT laisserait la fiche sans aucun partage, c'est-à-
 * dire visible des seuls gestionnaires — une panne d'accès silencieuse
 * pour toute une équipe.
 */
router.put('/grants/:type/:id', requireRole('manager'), async (req: Request, res: Response) => {
  const type = req.params.type
  const id   = String(req.params.id ?? '')

  if (!estRessourceCrm(type)) return res.status(400).json({ error: 'Type de fiche inconnu' })
  if (!UUID_RE.test(id))      return res.status(400).json({ error: 'Identifiant de fiche invalide' })

  const a     = acteur(req)
  const table = tableDe(type)
  const corps = req.body ?? {}

  /* `assigned_to` absent du corps = « ne touche pas au responsable ».
     `null` = « retire le responsable ». Les deux doivent se distinguer :
     un écran qui n'affiche que les partages ne doit pas désassigner la
     fiche au passage. */
  const changeAssignation = Object.prototype.hasOwnProperty.call(corps, 'assigned_to')
  let assignedTo: string | null = null
  if (changeAssignation) {
    const v = corps.assigned_to
    if (v === null || v === '') assignedTo = null
    else if (typeof v === 'string' && UUID_RE.test(v)) assignedTo = v
    else return res.status(400).json({ error: 'Responsable invalide' })
  }

  if (!Array.isArray(corps.grants)) {
    return res.status(400).json({ error: 'Liste des accès manquante' })
  }
  if (corps.grants.length > MAX_GRANTS) {
    return res.status(400).json({ error: `Trop d'accès en une fois (${MAX_GRANTS} maximum)` })
  }

  try {
    const personnel = await personnelActif(a.tenantId)

    if (assignedTo && !personnel.has(assignedTo)) {
      return res.status(400).json({ error: "Ce responsable ne fait pas partie du personnel actif de l'espace" })
    }

    /* Map et non tableau : un même user_id envoyé deux fois donnerait
       deux INSERT dont le second gagnerait par ON CONFLICT. Autant
       trancher ici — la dernière entrée l'emporte, explicitement. */
    const voulus = new Map<string, Droits>()
    for (const g of corps.grants) {
      const uid = typeof g?.user_id === 'string' ? g.user_id : ''
      if (!UUID_RE.test(uid)) {
        return res.status(400).json({ error: 'Utilisateur invalide dans la liste des accès' })
      }
      if (!personnel.has(uid)) {
        return res.status(400).json({ error: "Un des destinataires ne fait pas partie du personnel actif de l'espace" })
      }
      const droits = normaliserDroits(g)
      if (droits) voulus.set(uid, droits)
      /* Aucune case cochée : la ligne n'est simplement pas retenue, donc
         supprimée par le DELETE ci-dessous. */
      else voulus.delete(uid)
    }

    const gardes = [...voulus.keys()]

    const diff = await tenantTransaction(a.tenantId, async (client) => {
      /* FOR UPDATE : deux gestionnaires qui réassignent la même fiche en
         même temps se sérialisent, au lieu de produire un journal qui
         raconte une histoire impossible. */
      const fiche = await client.query<{ assigned_to: string | null; created_by: string | null }>(
        `SELECT assigned_to, created_by
           FROM public.${table}
          WHERE id = $1 AND tenant_id = $2
          FOR UPDATE`,
        [id, a.tenantId],
      )
      if (!fiche.rowCount) throw new HttpError(404, 'Fiche introuvable')
      const avantAssigned = fiche.rows[0].assigned_to

      const anciens = await client.query<Droits & { user_id: string }>(
        `SELECT user_id, can_view, can_log, can_edit, can_quote, can_convert
           FROM public.crm_record_grants
          WHERE tenant_id = $1 AND resource_type = $2 AND resource_id = $3`,
        [a.tenantId, type, id],
      )

      /* Tableau vide : `user_id = ANY('{}')` est faux, NOT faux est vrai
         → tous les partages tombent. C'est bien le résultat voulu quand
         l'écran renvoie une liste vide. */
      await client.query(
        `DELETE FROM public.crm_record_grants
          WHERE tenant_id = $1 AND resource_type = $2 AND resource_id = $3
            AND NOT (user_id = ANY($4::uuid[]))`,
        [a.tenantId, type, id, gardes],
      )

      for (const [uid, d] of voulus) {
        await client.query(
          `INSERT INTO public.crm_record_grants
             (tenant_id, resource_type, resource_id, user_id,
              can_view, can_log, can_edit, can_quote, can_convert, granted_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (tenant_id, resource_type, resource_id, user_id)
           DO UPDATE SET can_view    = EXCLUDED.can_view,
                         can_log     = EXCLUDED.can_log,
                         can_edit    = EXCLUDED.can_edit,
                         can_quote   = EXCLUDED.can_quote,
                         can_convert = EXCLUDED.can_convert,
                         granted_by  = EXCLUDED.granted_by`,
          [a.tenantId, type, id, uid,
           d.can_view, d.can_log, d.can_edit, d.can_quote, d.can_convert, a.userId],
        )
      }

      if (changeAssignation && avantAssigned !== assignedTo) {
        await client.query(
          `UPDATE public.${table}
              SET assigned_to = $1
            WHERE id = $2 AND tenant_id = $3`,
          [assignedTo, id, a.tenantId],
        )
      }

      const avant = new Map<string, Droits>(
        anciens.rows.map(r => [r.user_id, {
          can_view: r.can_view, can_log: r.can_log, can_edit: r.can_edit,
          can_quote: r.can_quote, can_convert: r.can_convert,
        }]),
      )
      return { avantAssigned, avant }
    }, a.userId)

    /* Réponse d'abord : le journal ne doit pas allonger le temps de
       réponse de l'écran, et son échec ne doit rien annuler. */
    res.json({ success: true })

    void journaliserPartages({
      a, type, id,
      changeAssignation,
      avantAssigned: diff.avantAssigned,
      apresAssigned: assignedTo,
      avant: diff.avant,
      apres: voulus,
    })
  } catch (e: any) {
    echec(res, 'grants:put', e)
  }
})

/**
 * Une ligne de journal PAR changement — le « Journal d'activité » doit
 * répondre à « qui a ouvert cet accès, et quand », pas afficher un
 * « accès modifiés » opaque.
 *
 * module_name reprend le nom de TABLE de la fiche et action_type reste
 * `update` : le vocabulaire de la page Journal est fermé
 * (src/pages/ActivityLogs.tsx, server/routes/activity.ts), un module ou
 * une action inédits s'y afficheraient en brut, sans icône ni libellé.
 * Le détail lisible vit donc dans la description, qui, elle, est libre.
 */
async function journaliserPartages(o: {
  a: CrmActor
  type: CrmResource
  id: string
  changeAssignation: boolean
  avantAssigned: string | null
  apresAssigned: string | null
  avant: Map<string, Droits>
  apres: Map<string, Droits>
}): Promise<void> {
  try {
    const module = tableDe(o.type)
    const libelle = LIBELLE_RESSOURCE[o.type]
    const noms = await nomsDe(o.a.tenantId, [
      ...(o.avantAssigned ? [o.avantAssigned] : []),
      ...(o.apresAssigned ? [o.apresAssigned] : []),
      ...o.avant.keys(), ...o.apres.keys(),
    ])
    const nom = (uid: string | null) => (uid ? (noms.get(uid) ?? uid) : 'non attribué')

    if (o.changeAssignation && o.avantAssigned !== o.apresAssigned) {
      await journaliser(o.a, {
        module,
        recordId: o.id,
        action: 'update',
        description: `Responsable commercial du ${libelle} : ${nom(o.avantAssigned)} → ${nom(o.apresAssigned)}`,
        avant: { assigned_to: o.avantAssigned },
        apres: { assigned_to: o.apresAssigned },
      })
    }

    for (const uid of new Set([...o.avant.keys(), ...o.apres.keys()])) {
      const a0 = o.avant.get(uid)
      const a1 = o.apres.get(uid)
      if (a0 && a1 && memesDroits(a0, a1)) continue

      const description = !a1
        ? `Accès au ${libelle} retiré à ${nom(uid)}`
        : !a0
          ? `Accès au ${libelle} partagé avec ${nom(uid)} : ${listerDroits(a1)}`
          : `Accès au ${libelle} de ${nom(uid)} modifié : ${listerDroits(a1)}`

      await journaliser(o.a, {
        module,
        recordId: o.id,
        action: 'update',
        description,
        avant: a0 ? { user_id: uid, ...a0 } : null,
        apres: a1 ? { user_id: uid, ...a1 } : null,
      })
    }
  } catch (e: any) {
    logger.error('[crmAccess:journal-partages]', e?.message)
  }
}

/* ════════════════════════════════════════════════════════════════════
   3. CAPACITÉS TRANSVERSES  (« voir tous les prospects »…)
   ═══════════════════════════════════════════════════════════════════ */

/* Réservé à l'ADMIN, pas au manager : ces cases donnent la vue complète
   d'un module sans passer par une promotion de rôle. Laisser un manager
   se les accorder — ou les accorder à un tiers — reviendrait à laisser
   contourner la hiérarchie des rôles par la porte de service. */

/** Message unique : un identifiant hors du personnel actif est refusé de
 *  la même façon en lecture et en écriture. */
const HORS_PERSONNEL = { error: "Cet utilisateur ne fait pas partie du personnel actif de l'espace" }

/** GET /capabilities/:userId */
router.get('/capabilities/:userId', requireRole('admin'), async (req: Request, res: Response) => {
  const userId = String(req.params.userId ?? '')
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Utilisateur invalide' })

  const a = acteur(req)
  try {
    const personnel = await personnelActif(a.tenantId)
    if (!personnel.has(userId)) return res.status(400).json(HORS_PERSONNEL)

    const row = await tenantQueryOne<{ capabilities: string[] | null }>(
      a.tenantId,
      `SELECT capabilities
         FROM public.crm_user_capabilities
        WHERE tenant_id = $1 AND user_id = $2`,
      [a.tenantId, userId],
    )
    /* Même filtrage qu'à la lecture serveur (crmScope.capacites) : une
       valeur écrite avant un renommage ne doit pas apparaître comme une
       case cochée que l'écran ne sait pas nommer. */
    res.json({ capabilities: (row?.capabilities ?? []).filter(estCapaciteValide) })
  } catch (e: any) {
    echec(res, 'capabilities:get', e)
  }
})

/** PUT /capabilities/:userId — remplace la liste complète. */
router.put('/capabilities/:userId', requireRole('admin'), async (req: Request, res: Response) => {
  const userId = String(req.params.userId ?? '')
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Utilisateur invalide' })

  const brut = req.body?.capabilities
  if (!Array.isArray(brut)) return res.status(400).json({ error: 'Liste de capacités manquante' })

  /* Vocabulaire FERMÉ. Accepter une valeur inconnue ne donnerait aucun
     droit — crmScope filtre à la lecture — mais laisserait un
     administrateur convaincu d'avoir accordé quelque chose. Un 400 dit
     tout de suite ce qui ne va pas. */
  const inconnues = brut.filter((c: unknown) => !estCapaciteValide(c))
  if (inconnues.length) {
    return res.status(400).json({
      error: `Capacité inconnue : ${inconnues.slice(0, 5).map(String).join(', ')}`,
      capacites_connues: CRM_CAPABILITIES,
    })
  }

  /* Dédoublonnage ET ordre canonique en une passe : deux enregistrements
     du même réglage produisent alors exactement le même tableau, donc
     aucune fausse entrée « modifié » dans le journal. */
  const demandees = new Set(brut as string[])
  const capacites = CRM_CAPABILITIES.filter(c => demandees.has(c))

  const a = acteur(req)
  try {
    const personnel = await personnelActif(a.tenantId)
    if (!personnel.has(userId)) return res.status(400).json(HORS_PERSONNEL)

    const avant = await tenantQueryOne<{ capabilities: string[] | null }>(
      a.tenantId,
      `SELECT capabilities
         FROM public.crm_user_capabilities
        WHERE tenant_id = $1 AND user_id = $2`,
      [a.tenantId, userId],
    )
    const anciennes = (avant?.capabilities ?? []).filter(estCapaciteValide)

    await tenantQuery(
      a.tenantId,
      `INSERT INTO public.crm_user_capabilities (tenant_id, user_id, capabilities, updated_by)
       VALUES ($1, $2, $3::text[], $4)
       ON CONFLICT (tenant_id, user_id)
       DO UPDATE SET capabilities = EXCLUDED.capabilities,
                     updated_by   = EXCLUDED.updated_by`,
      [a.tenantId, userId, capacites, a.userId],
    )

    /* SANS cette invalidation, retirer « voir tous les prospects » ne
       prendrait effet qu'à l'expiration du cache de crmScope (30 s) —
       et l'administrateur qui vérifie aussitôt verrait l'ancien
       périmètre, en concluant que le réglage ne marche pas. */
    invaliderCapacites(userId, a.tenantId)

    res.json({ success: true, capabilities: capacites })

    /* module_name = 'team_members' : c'est le seul module de la page
       Journal qui parle des personnes (« Membre modifié(e) ») et qui
       possède déjà une icône. Le détail lisible est dans la description. */
    const retenues = new Set<string>(capacites)
    const changed =
      anciennes.length !== capacites.length ||
      anciennes.some(c => !retenues.has(c))
    if (changed) {
      const nom = personnel.get(userId)?.name ?? userId
      void journaliser(a, {
        module: 'team_members',
        recordId: userId,
        action: 'update',
        description: capacites.length
          ? `Droits CRM de ${nom} : ${capacites.join(', ')}`
          : `Droits CRM de ${nom} retirés`,
        avant: { capabilities: anciennes },
        apres: { capabilities: capacites },
      })
    }
  } catch (e: any) {
    echec(res, 'capabilities:put', e)
  }
})

export default router
