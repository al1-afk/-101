/**
 * ESPACE DU COMMERCIAL — le CRM vu depuis /my-space.
 *
 *   GET   /api/my-space/crm/permissions                ce que le menu a le droit d'afficher
 *   GET   /api/my-space/crm/prospects                  mes prospects (périmètre appliqué)
 *   GET   /api/my-space/crm/prospects/:id              une fiche + son fil d'activité
 *   POST  /api/my-space/crm/prospects                  créer un prospect
 *   PATCH /api/my-space/crm/prospects/:id              modifier un prospect
 *   POST  /api/my-space/crm/prospects/:id/activities   journaliser note / appel / WhatsApp…
 *   POST  /api/my-space/crm/prospects/:id/convert      convertir en client
 *   GET   /api/my-space/crm/clients                    mes clients
 *   GET   /api/my-space/crm/clients/:id                une fiche client
 *   GET   /api/my-space/crm/devis                      mes devis
 *
 * ── Ce fichier ne DÉCIDE aucun accès ────────────────────────────────
 * Chaque refus vient de server/lib/crmScope.ts : `capacites` pour les
 * droits de module, `clausePerimetre` pour les listes, `peutAcceder`
 * pour une fiche précise. Aucune condition de visibilité n'est réécrite
 * ici. C'est la seule façon d'être certain que l'espace employé et
 * l'écran d'administration promettent exactement la même chose : une
 * règle recopiée finit toujours par diverger, et une divergence dans un
 * contrôle d'accès n'est pas un défaut d'affichage — c'est un
 * portefeuille commercial qui fuit chez le voisin.
 *
 * ── Deux jetons, un seul routeur ────────────────────────────────────
 * Le jeton MEMBRE (team_members, /team-login, role = 'team_member') et
 * le jeton ADMIN (tenant_users, /auth) entrent tous les deux. Le premier
 * est le public visé ; le second permet à un manager d'ouvrir l'écran
 * pour reproduire ce que voit son commercial — sans quoi tout support
 * se ferait à l'aveugle.
 *
 * ── L'interrupteur maître ───────────────────────────────────────────
 * Sans la capacité `crm.access`, TOUTES les routes de ce fichier
 * répondent 403, /permissions comprise. Le front lit ce 403 comme
 * « pas de CRM dans le menu ». Un gestionnaire (admin/manager) n'a pas
 * besoin de la case : le court-circuit de crmScope vaut ici comme
 * ailleurs, sinon un administrateur pourrait se fermer son propre CRM.
 *
 * ── Compte désactivé = CRM fermé ────────────────────────────────────
 * `team_members.account_status` est relu à chaque appel. Suspendre un
 * employé depuis Équipe lui coupe le CRM dans la seconde, sans attendre
 * l'expiration de son jeton (1 h) — exigence explicite du client.
 *
 * Schéma associé : supabase/migrations/102_crm_acces_par_utilisateur.sql
 */
import { Router, type Request, type Response, type NextFunction } from 'express'
import type { PoolClient } from 'pg'
import { tenantQuery, tenantQueryOne, tenantTransaction } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { logger } from '../lib/logger'
import { trackSecurityEvent } from '../lib/securityEvents'
import { markSecurityLogged } from '../middleware/securityMonitor'
import { notifyNewProspect } from '../lib/notificationEmails'
import {
  CRM_CAPABILITIES,
  capacites,
  clausePerimetre,
  estGestionnaire,
  journaliser,
  peutAcceder,
  type CrmActor,
} from '../lib/crmScope'

const router = Router()

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/* ─────────────────────────────────────────────────────────────────
   LE VOCABULAIRE DES DROITS, TEL QU'IL EST LU ICI

   Les chaînes sont écrites en clair plutôt qu'importées comme type :
   crmScope les filtre déjà à la lecture (`capacites` ne garde que le
   vocabulaire fermé), et les nommer ici en dur garde ce fichier
   compilable pendant que CRM_CAPABILITIES s'étend dans le lot voisin.
   Une capacité inconnue de crmScope n'est jamais accordée — le pire cas
   est donc un refus, jamais une ouverture.
───────────────────────────────────────────────────────────────── */
const CAP_ACCESS = 'crm.access'

/* Types d'activité acceptés par l'API de l'espace commercial. */
const TYPES_ACTIVITE = ['note', 'appel', 'whatsapp', 'email', 'rdv', 'relance'] as const
type TypeActivite = typeof TYPES_ACTIVITE[number]

/**
 * Capacité EXIGÉE EN PLUS de `activities.create` pour chaque canal.
 *
 * `email` et `rdv` valent `null` : le catalogue de capacités n'en
 * comporte pas de dédiée. Leur inventer une (`activities.email`…) ici
 * créerait un droit que l'écran d'administration ne saurait pas
 * afficher — donc un droit invisible, impossible à retirer. Ces deux
 * canaux s'appuient donc sur `activities.create` seule.
 */
const CAPACITE_PAR_TYPE: Record<TypeActivite, string | null> = {
  note:     'activities.note',
  appel:    'activities.call',
  whatsapp: 'activities.whatsapp',
  relance:  'activities.followup',
  email:    null,
  rdv:      null,
}

/**
 * Correspondance vers `prospect_logs.type`.
 *
 * La table est celle qu'écrit DÉJÀ l'interface admin (src/hooks/
 * useProspectLogs.ts → POST /api/prospect_logs) : les deux espaces
 * alimentent le même fil, et le commercial retrouve dans /my-space les
 * notes posées par son manager depuis /prospects.
 *
 * Sa contrainte CHECK (migration 084) n'accepte que sept valeurs :
 * creation, statut, note, edit, appel, email, whatsapp. `rdv` et
 * `relance` n'en font pas partie — les insérer tels quels échouerait en
 * 23514 à chaque appel. On les range donc sous `note`, avec un préfixe
 * explicite dans le message : le fil reste lisible et aucune migration
 * n'est nécessaire, ce qui est la contrainte posée.
 */
const TYPE_LOG_SQL: Record<TypeActivite, string> = {
  note:     'note',
  appel:    'appel',
  whatsapp: 'whatsapp',
  email:    'email',
  rdv:      'note',
  relance:  'note',
}

const PREFIXE_MESSAGE: Partial<Record<TypeActivite, string>> = {
  rdv:     'Rendez-vous — ',
  relance: 'Relance — ',
}

/* Valeurs acceptées par les contraintes CHECK des tables visées. On les
   valide AVANT l'INSERT : un 23514 remonterait en 500 illisible, là où
   un 400 dit précisément quoi corriger. */
const STATUTS_PROSPECT = new Set(
  ['nouveau', 'contacte', 'qualifie', 'proposition', 'negocie', 'gagne', 'perdu'],
)
const PRIORITES_PROSPECT = new Set(['premium', 'moyen', 'bas'])

/* Colonnes qu'un commercial peut écrire sur un prospect. Liste FERMÉE et
   interpolée dans le SQL : tenant_id, created_by et assigned_to en sont
   volontairement absents — la propriété est décidée par le serveur, et
   un corps de requête ne doit jamais pouvoir se réattribuer une fiche. */
const CHAMPS_PROSPECT = [
  'nom', 'email', 'telephone', 'entreprise', 'statut', 'valeur_estimee',
  'source', 'notes', 'responsable', 'date_contact', 'date_relance',
  'relance_at', 'priorite',
] as const

/* Plafonds de pagination. 200 lignes est déjà au-delà de ce qu'un écran
   affiche ; au-delà, la demande est une erreur d'appelant ou une
   tentative d'aspirer le portefeuille page par page. */
const LIMITE_DEFAUT = 50
const LIMITE_MAX    = 200

/* Bornes de saisie : un message d'activité est un compte rendu, pas un
   dépôt de fichier. Sans plafond, une seule requête peut gonfler la
   table et ralentir la timeline de tout le monde. */
const MAX_CONTENU = 20_000

/* ─────────────────────────────────────────────────────────────────
   ERREURS
───────────────────────────────────────────────────────────────── */

/** Erreur porteuse d'un statut HTTP : permet de sortir d'une transaction
 *  avec un 409 lisible plutôt qu'un 500 générique. */
class HttpError extends Error {
  constructor(public status: number, message: string) { super(message) }
}

/* Les migrations de ce dépôt s'appliquent À LA MAIN en production, APRÈS
   le déploiement du code. Il existe donc une fenêtre où ce fichier
   tourne sans les colonnes created_by/assigned_to (42703) ni les tables
   de la 102 (42P01). On répond alors 503 explicite : un 500 muet
   enverrait chercher un bug applicatif là où il n'y a qu'une migration
   en retard. */
const CODES_MODULE_ABSENT = new Set(['42P01', '42703'])

function echec(res: Response, contexte: string, e: any) {
  if (res.headersSent) {
    logger.error(`[mySpaceCrm:${contexte}] après réponse —`, e?.message)
    return
  }
  if (e instanceof HttpError) return res.status(e.status).json({ error: e.message })
  if (CODES_MODULE_ABSENT.has(e?.code)) {
    return res.status(503).json({
      error: 'Module CRM non installé sur cette base — migration 102 à appliquer.',
    })
  }
  /* 23514 = une contrainte CHECK a refusé la valeur. C'est une saisie
     invalide, pas une panne : 400 plutôt que 500. */
  if (e?.code === '23514') {
    return res.status(400).json({ error: 'Valeur refusée par le modèle de données.' })
  }
  logger.error(`[mySpaceCrm:${contexte}]`, e?.message)
  return res.status(500).json({ error: 'Erreur serveur' })
}

/**
 * Refus d'accès : 403, plus une trace dans le centre de sécurité.
 *
 * 403 et NON 404, et 403 plutôt qu'une liste vide : le client l'a exigé
 * mot pour mot (« une capacité manquante = 403, pas un écran vide »).
 * Un écran vide fait croire à une base sans données et produit un ticket
 * de support ; un 403 dit à l'employé qu'il doit demander le droit.
 *
 * L'événement est journalisé au même titre qu'un refus RBAC : c'est
 * l'accumulation — quelqu'un qui balaie les fiches des autres en forçant
 * les identifiants — qui est intéressante, pas l'occurrence isolée.
 */
function refuser(req: Request, res: Response, raison: string, message: string): void {
  markSecurityLogged(req)
  trackSecurityEvent({
    type: 'permission_denied',
    req,
    httpStatus: 403,
    reason: `my-space-crm:${raison}`,
  })
  res.status(403).json({ error: message })
}

/* ─────────────────────────────────────────────────────────────────
   QUI PARLE
───────────────────────────────────────────────────────────────── */

interface ActeurEspace {
  /** Exactement ce que crmScope attend — rien d'autre ne circule. */
  crm:  CrmActor
  /** Nom affichable, écrit dans `prospect_logs.auteur` : la timeline dit
   *  QUI a appelé, pas seulement quand. */
  nom:  string
  /** Capacités déjà lues, pour ne pas réinterroger à chaque handler. */
  caps: Set<string>
  estMembre:    boolean
  teamMemberId: string | null
}

/**
 * Résout l'acteur depuis le jeton, quel que soit son monde d'identité.
 *
 * ── Le rôle passé à crmScope ────────────────────────────────────────
 * Pour un membre, c'est LITTÉRALEMENT 'team_member' — jamais
 * `team_members.role`. Cette colonne vaut 'commercial' chez certains,
 * mais rien n'empêche d'y écrire 'manager' depuis l'écran Équipe : la
 * relayer à `estGestionnaire` ouvrirait tout le CRM de l'espace par un
 * simple champ de formulaire. La promotion au rang de gestionnaire
 * passe par `tenant_users`, et par lui seul.
 *
 * Pour un compte admin, `req.user.role` est déjà le rôle EFFECTIF :
 * requireAuth l'a relu dans tenant_users (getEffectiveRole) et refuse en
 * 401 une appartenance révoquée.
 */
async function resolveActeur(req: Request): Promise<ActeurEspace | null> {
  const tenantId = req.user!.tenantId
  const userId   = req.user!.userId
  if (!UUID_RE.test(tenantId ?? '') || !UUID_RE.test(userId ?? '')) return null

  if (req.user!.role === 'team_member') {
    const m = await tenantQueryOne<{
      id: string; prenom: string | null; nom: string | null
      email: string; account_status: string
    }>(
      tenantId,
      `SELECT id, prenom, nom, email, account_status
         FROM public.team_members
        WHERE user_id = $1 AND tenant_id = $2
        LIMIT 1`,
      [userId, tenantId],
    )
    /* Fiche absente ou compte suspendu/archivé : accès coupé. */
    if (!m || m.account_status !== 'active') return null
    return {
      crm: { tenantId, userId, role: 'team_member' },
      nom: [m.prenom, m.nom].filter(Boolean).join(' ').trim() || m.email,
      caps: new Set<string>(),
      estMembre: true,
      teamMemberId: m.id,
    }
  }

  const u = await tenantQueryOne<{ name: string | null; email: string }>(
    tenantId,
    `SELECT name, email FROM public.users WHERE id = $1`,
    [userId],
  )
  return {
    crm: { tenantId, userId, role: req.user!.role },
    nom: (u?.name ?? '').trim() || u?.email || req.user!.email || 'Utilisateur',
    caps: new Set<string>(),
    estMembre: false,
    teamMemberId: null,
  }
}

/** L'acteur du contexte, posé par le garde d'accès. */
function acteurDe(req: Request): ActeurEspace {
  return (req as Request & { _acteurCrm?: ActeurEspace })._acteurCrm!
}

/**
 * Une capacité de MODULE (« ai-je le droit d'ouvrir cet écran ? »).
 *
 * Distincte du périmètre (« ai-je le droit de toucher CETTE fiche ? »),
 * qui reste l'affaire de peutAcceder. Les deux se cumulent : sans la
 * capacité, l'écran n'existe pas ; avec elle, le périmètre décide encore
 * quelles lignes s'affichent.
 */
function aLaCapacite(a: ActeurEspace, cap: string): boolean {
  if (estGestionnaire(a.crm.role)) return true
  return a.caps.has(cap)
}

/** `X.view_all` élargit le périmètre : il implique évidemment `X.view`.
 *  Ne le traiter que comme un élargissement laisserait un porteur de
 *  view_all sans view devant un 403 en ouvrant sa propre liste. */
function peutVoirModule(a: ActeurEspace, prefixe: string): boolean {
  return aLaCapacite(a, `${prefixe}.view`) || aLaCapacite(a, `${prefixe}.view_all`)
}

/** Idem pour la modification : `X.edit_all` implique `X.edit`. */
function peutModifierModule(a: ActeurEspace, prefixe: string): boolean {
  return aLaCapacite(a, `${prefixe}.edit`) || aLaCapacite(a, `${prefixe}.edit_all`)
}

/* ─────────────────────────────────────────────────────────────────
   LE GARDE D'ENTRÉE
───────────────────────────────────────────────────────────────── */

router.use(requireAuth)

router.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    const a = await resolveActeur(req)
    if (!a) {
      return refuser(req, res, 'compte-inactif',
        'Compte désactivé — accès au CRM fermé.')
    }

    /* Les capacités sont lues une fois par requête. `capacites` porte son
       propre cache 30 s : cet appel est en pratique gratuit, ce qui
       compte pour /permissions, première requête de chaque chargement
       d'écran. */
    a.caps = await capacites(a.crm)

    /* Interrupteur maître. Le gestionnaire passe sans la case : c'est le
       même court-circuit que partout ailleurs dans crmScope, et sans lui
       un administrateur pourrait se verrouiller hors de son propre CRM
       en oubliant de se l'accorder. */
    /* EXCEPTION : /permissions répond TOUJOURS, même sans accès.
       C'est la première requête de l'espace employé, et c'est elle qui
       dit au menu s'il doit afficher l'entrée CRM. Refusée en 403, elle
       serait indiscernable d'une panne : le client afficherait « erreur
       de chargement » à quelqu'un dont le compte est simplement dépourvu
       d'accès, et le menu ne saurait jamais qu'il doit se taire. Elle ne
       divulgue rien — juste « vous n'avez pas ce module ». Toutes les
       autres routes restent fermées. */
    const estSondageDroits = req.method === 'GET' && /^\/permissions\/?$/.test(req.path)

    if (!estGestionnaire(a.crm.role) && !a.caps.has(CAP_ACCESS) && !estSondageDroits) {
      return refuser(req, res, 'crm-non-active',
        "Le module CRM n'est pas activé pour votre compte.")
    }

    ;(req as Request & { _acteurCrm?: ActeurEspace })._acteurCrm = a
    next()
  } catch (e: any) {
    echec(res, 'garde', e)
  }
})

/* ─────────────────────────────────────────────────────────────────
   OUTILS DE REQUÊTE
───────────────────────────────────────────────────────────────── */

/** Entier borné, avec repli silencieux : `?limit=abc` ne doit pas faire
 *  échouer un écran, seulement retomber sur le défaut. */
function entierBorne(v: unknown, defaut: number, min: number, max: number): number {
  const n = Number.parseInt(String(v ?? ''), 10)
  if (!Number.isFinite(n)) return defaut
  return Math.min(Math.max(n, min), max)
}

/** `%` et `_` saisis par l'utilisateur sont des JOKERS pour ILIKE :
 *  non échappés, « % » seul renverrait tout le périmètre d'un coup et un
 *  « _ » ferait des correspondances surprenantes. */
function echapperLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`)
}

function texteOuNull(v: unknown, max = 2000): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  if (!s) return null
  return s.slice(0, max)
}

/** Date ISO (jour ou horodatage) → Date, ou null si illisible. */
function dateOuNull(v: unknown): Date | null {
  if (v === null || v === undefined || v === '') return null
  const t = Date.parse(String(v))
  return Number.isFinite(t) ? new Date(t) : null
}

/**
 * Construit le WHERE d'une lecture de LISTE, périmètre compris.
 *
 * `clausePerimetre` rend `null` pour un gestionnaire ou un porteur de
 * `<type>.view_all` : aucun filtre n'est alors ajouté, et le
 * planificateur n'a rien de plus à évaluer.
 */
async function whereAvecPerimetre(
  a: ActeurEspace,
  ressource: 'prospect' | 'client' | 'devis',
  alias: string,
  where: string[],
  params: unknown[],
): Promise<void> {
  const clause = await clausePerimetre(a.crm, ressource, alias, params.length + 1)
  if (!clause) return
  where.push(clause.sql)
  params.push(...clause.params)
}

/* ═════════════════════════════════════════════════════════════════
   1. CE QUE LE MENU A LE DROIT D'AFFICHER
   ═══════════════════════════════════════════════════════════════ */

/**
 * GET /api/my-space/crm/permissions
 *
 * Première requête de l'écran, appelée à chaque chargement : elle ne
 * touche AUCUNE table métier. Tout ce qu'elle rend vient de `capacites`,
 * déjà lue par le garde et servie par son cache 30 s.
 *
 * `enabled` vaut toujours `true` dans une réponse 200 : sans
 * `crm.access`, le garde a déjà répondu 403 — c'est ce 403 que le front
 * traduit par « pas de CRM dans le menu ». Le champ reste au contrat
 * pour que le client typé n'ait pas à distinguer deux formes de réponse.
 */
router.get('/permissions', async (req: Request, res: Response) => {
  try {
    const a = acteurDe(req)

    /* Un gestionnaire n'a pas de ligne dans crm_user_capabilities et n'en
       a pas besoin : il voit et fait tout. On lui renvoie donc le
       catalogue complet plutôt qu'un tableau vide, sinon le menu se
       construirait VIDE pour l'administrateur lui-même — un écran de CRM
       sans CRM, chez la seule personne qui a tous les droits. */
    const gestionnaire = estGestionnaire(a.crm.role)
    const capabilities = gestionnaire
      ? [...CRM_CAPABILITIES]
      : Array.from(a.caps)

    /* `enabled` dit si le CRM est ouvert — pas si la requête a abouti.
       Un compte sans accès reçoit donc 200 + enabled:false, et l'écran
       sait afficher « le CRM n'est pas activé » plutôt qu'une erreur. */
    const ouvert = gestionnaire || a.caps.has(CAP_ACCESS)

    res.json({
      enabled: ouvert,
      capabilities: ouvert ? capabilities : [],
      gestionnaire,
      can: {
        /* Tous faux quand l'accès est fermé : un `can` positif sur un
           compte sans crm.access ferait afficher des boutons que le
           serveur refuserait juste après. */
        prospects_view:    ouvert && peutVoirModule(a, 'prospects'),
        prospects_create:  ouvert && aLaCapacite(a, 'prospects.create'),
        prospects_edit:    ouvert && peutModifierModule(a, 'prospects'),
        prospects_delete:  ouvert && aLaCapacite(a, 'prospects.delete'),
        clients_view:      ouvert && peutVoirModule(a, 'clients'),
        devis_view:        ouvert && peutVoirModule(a, 'devis'),
        devis_create:      ouvert && aLaCapacite(a, 'devis.create'),
        devis_send:        ouvert && aLaCapacite(a, 'devis.send'),
        activities_create: ouvert && aLaCapacite(a, 'activities.create'),
        convert:           ouvert && aLaCapacite(a, 'convert.all'),
      },
    })
  } catch (e: any) {
    echec(res, 'permissions', e)
  }
})

/* ═════════════════════════════════════════════════════════════════
   2. PROSPECTS
   ═══════════════════════════════════════════════════════════════ */

/* Colonnes rendues au front. Énumérées et non `SELECT *` : la 102 ajoute
   created_by/assigned_to, et rien n'oblige à publier l'identité du
   propriétaire dans l'espace employé. */
const COLONNES_PROSPECT = `
  p.id, p.created_at, p.updated_at, p.nom, p.email, p.telephone, p.entreprise,
  p.statut, p.valeur_estimee, p.source, p.notes, p.responsable,
  p.date_contact, p.date_relance, p.relance_at, p.priorite,
  p.assigned_to, p.created_by`

/**
 * GET /api/my-space/crm/prospects?search=&statut=&limit=&offset=
 *
 * Le périmètre est appliqué EN SQL, jamais après coup : filtrer un
 * tableau déjà chargé signifierait avoir sorti de la base les fiches
 * d'autrui, et il suffit d'un `?limit=` mal placé pour qu'elles
 * ressortent.
 */
router.get('/prospects', async (req: Request, res: Response) => {
  const a = acteurDe(req)
  if (!peutVoirModule(a, 'prospects')) {
    return refuser(req, res, 'prospects-view', "Vous n'avez pas accès aux prospects.")
  }

  try {
    const where:  string[]  = ['p.tenant_id = $1']
    const params: unknown[] = [a.crm.tenantId]

    const search = texteOuNull(req.query.search, 120)
    if (search) {
      params.push(`%${echapperLike(search)}%`)
      const i = params.length
      where.push(
        `(p.nom ILIKE $${i} OR p.entreprise ILIKE $${i}`
        + ` OR p.email ILIKE $${i} OR p.telephone ILIKE $${i})`,
      )
    }

    const statut = texteOuNull(req.query.statut, 40)
    if (statut) {
      if (!STATUTS_PROSPECT.has(statut)) {
        return res.status(400).json({ error: 'Statut de prospect inconnu.' })
      }
      params.push(statut)
      where.push(`p.statut = $${params.length}`)
    }

    await whereAvecPerimetre(a, 'prospect', 'p', where, params)

    const limit  = entierBorne(req.query.limit, LIMITE_DEFAUT, 1, LIMITE_MAX)
    const offset = entierBorne(req.query.offset, 0, 0, 1_000_000)
    params.push(limit, offset)

    /* COUNT(*) OVER() : le total du périmètre en une seule requête. Une
       seconde requête de comptage se désynchroniserait de la première
       dès qu'une fiche est créée entre les deux. */
    const rows = await tenantQuery<any>(
      a.crm.tenantId,
      `SELECT ${COLONNES_PROSPECT}, COUNT(*) OVER() AS total_perimetre
         FROM public.prospects p
        WHERE ${where.join(' AND ')}
        ORDER BY p.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )

    const total = rows.length ? Number(rows[0].total_perimetre) : 0
    res.json({
      prospects: rows.map(({ total_perimetre, ...p }) => p),
      total,
      limit,
      offset,
    })
  } catch (e: any) {
    echec(res, 'prospects:list', e)
  }
})

/**
 * GET /api/my-space/crm/prospects/:id
 *
 * `peutAcceder` refuse la fiche d'un collègue même si l'identifiant est
 * forcé à la main : c'est exactement le test que le client fera passer.
 *
 * Renvoie aussi `droits`, pour que l'écran n'affiche pas des boutons
 * qui finiront en 403. Ces booléens sont un CONFORT D'AFFICHAGE : chaque
 * route refait sa propre vérification, ils ne portent aucune décision.
 */
router.get('/prospects/:id', async (req: Request, res: Response) => {
  const a  = acteurDe(req)
  const id = String(req.params.id)

  if (!peutVoirModule(a, 'prospects')) {
    return refuser(req, res, 'prospects-view', "Vous n'avez pas accès aux prospects.")
  }
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Identifiant invalide.' })

  try {
    if (!(await peutAcceder(a.crm, 'prospect', id, 'view'))) {
      return refuser(req, res, 'prospect-hors-perimetre',
        "Ce prospect n'est pas dans votre périmètre.")
    }

    const prospect = await tenantQueryOne<any>(
      a.crm.tenantId,
      `SELECT ${COLONNES_PROSPECT}
         FROM public.prospects p
        WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, a.crm.tenantId],
    )
    /* peutAcceder a dit oui : une absence ici n'est pas un refus mais une
       fiche réellement supprimée entre-temps. */
    if (!prospect) return res.status(404).json({ error: 'Prospect introuvable.' })

    /* Le fil d'activité — la même table que celle lue par l'écran admin.
       Il n'a pas de périmètre propre : il suit celui de son prospect, qui
       vient d'être vérifié. */
    const activites = peutVoirModule(a, 'activities')
      ? await tenantQuery<any>(
          a.crm.tenantId,
          `SELECT id, prospect_id, type, message, auteur, duration_minutes, media, created_at
             FROM public.prospect_logs
            WHERE prospect_id = $1 AND tenant_id = $2
            ORDER BY created_at DESC
            LIMIT 200`,
          [id, a.crm.tenantId],
        )
      : []

    const [peutEditer, peutJournaliser, peutConvertir] = await Promise.all([
      peutModifierModule(a, 'prospects')
        ? peutAcceder(a.crm, 'prospect', id, 'edit')
        : Promise.resolve(false),
      aLaCapacite(a, 'activities.create')
        ? peutAcceder(a.crm, 'prospect', id, 'log')
        : Promise.resolve(false),
      aLaCapacite(a, 'convert.all')
        ? peutAcceder(a.crm, 'prospect', id, 'convert')
        : Promise.resolve(false),
    ])

    res.json({
      prospect,
      activites,
      droits: { edit: peutEditer, log: peutJournaliser, convert: peutConvertir },
    })
  } catch (e: any) {
    echec(res, 'prospects:fiche', e)
  }
})

/**
 * Extrait du corps de requête les seuls champs autorisés, validés.
 *
 * Renvoie une erreur en français plutôt que de laisser la contrainte
 * CHECK parler à sa place : « new row violates check constraint
 * prospects_statut_check » n'aide personne dans un formulaire.
 */
function lireChampsProspect(
  body: any, creation: boolean,
): { erreur: string } | { data: Record<string, unknown> } {
  const data: Record<string, unknown> = {}
  const src = (body ?? {}) as Record<string, unknown>

  for (const champ of CHAMPS_PROSPECT) {
    if (!(champ in src)) continue
    const v = src[champ]

    switch (champ) {
      case 'valeur_estimee': {
        if (v === null || v === '') { data[champ] = null; break }
        const n = Number(v)
        if (!Number.isFinite(n) || n < 0) return { erreur: 'Valeur estimée invalide.' }
        data[champ] = n
        break
      }
      case 'statut': {
        const s = texteOuNull(v, 40)
        if (s && !STATUTS_PROSPECT.has(s)) return { erreur: 'Statut de prospect inconnu.' }
        data[champ] = s
        break
      }
      case 'priorite': {
        const s = texteOuNull(v, 20)
        if (s && !PRIORITES_PROSPECT.has(s)) return { erreur: 'Priorité inconnue.' }
        data[champ] = s
        break
      }
      case 'date_contact':
      case 'date_relance': {
        const d = dateOuNull(v)
        if (v !== null && v !== '' && v !== undefined && !d) {
          return { erreur: `Date invalide (${champ}).` }
        }
        /* Colonnes DATE : on ne garde que le jour, sinon Postgres tronque
           silencieusement et l'heure saisie disparaît sans le dire. */
        data[champ] = d ? d.toISOString().slice(0, 10) : null
        break
      }
      case 'relance_at': {
        const d = dateOuNull(v)
        if (v !== null && v !== '' && v !== undefined && !d) {
          return { erreur: 'Date de relance invalide.' }
        }
        data[champ] = d ? d.toISOString() : null
        break
      }
      case 'notes':
        data[champ] = texteOuNull(v, MAX_CONTENU)
        break
      default:
        data[champ] = texteOuNull(v, 300)
    }
  }

  if (creation) {
    const nom = texteOuNull(src.nom, 300)
    if (!nom) return { erreur: 'Le nom du prospect est obligatoire.' }
    data.nom = nom
  } else if ('nom' in src && !data.nom) {
    return { erreur: 'Le nom du prospect ne peut pas être vide.' }
  }

  return { data }
}

/**
 * POST /api/my-space/crm/prospects — capacité `prospects.create`.
 *
 * La capacité est vérifiée directement (et non via `peutAcceder`) parce
 * qu'une création n'a pas encore d'enregistrement à confronter au
 * périmètre : il n'y a rien à posséder ni à partager.
 *
 * ── Propriété ───────────────────────────────────────────────────────
 * `created_by` ET `assigned_to` valent l'auteur. Contrairement à crud.ts,
 * où un gestionnaire peut créer une fiche volontairement « non
 * attribuée », une fiche saisie DANS SON ESPACE appartient à celui qui
 * la saisit : c'est le geste « j'ajoute mon prospect ». La laisser à NULL
 * la rendrait invisible depuis la liste de son propre auteur dès qu'il
 * ne porte pas `prospects.view_all` — un prospect créé puis disparu.
 */
router.post('/prospects', async (req: Request, res: Response) => {
  const a = acteurDe(req)
  if (!aLaCapacite(a, 'prospects.create')) {
    return refuser(req, res, 'prospects-create',
      "Vous n'avez pas le droit de créer un prospect.")
  }

  const lu = lireChampsProspect(req.body, true)
  if ('erreur' in lu) return res.status(400).json({ error: lu.erreur })

  const data = lu.data
  data.tenant_id   = a.crm.tenantId
  data.created_by  = a.crm.userId
  data.assigned_to = a.crm.userId
  /* `responsable` est du TEXTE LIBRE historique (cf. migration 102) : on
     le pré-remplit avec le nom de l'auteur quand il n'est pas fourni,
     pour que la fiche affiche un responsable lisible côté admin sans
     qu'on ait à toucher aux 176 lignes existantes. */
  if (!data.responsable) data.responsable = a.nom

  const keys = Object.keys(data)
  const cols = keys.join(', ')
  const ph   = keys.map((_, i) => `$${i + 1}`).join(', ')

  try {
    const row = await tenantQueryOne<any>(
      a.crm.tenantId,
      `INSERT INTO public.prospects (${cols}) VALUES (${ph}) RETURNING *`,
      Object.values(data),
      a.crm.userId,
    )
    if (!row) return res.status(500).json({ error: 'Création impossible.' })

    res.status(201).json({ prospect: row })

    /* Suites hors chemin de réponse : ni la trace ni la notification ne
       doivent retarder — encore moins annuler — la création elle-même. */
    void journaliser(a.crm, {
      module:      'prospects',
      recordId:    row.id,
      action:      'create',
      description: `Prospect créé depuis l'espace commercial par ${a.nom}`,
      apres:       { id: row.id, nom: row.nom, assigned_to: a.crm.userId },
    })
    void tenantQuery(
      a.crm.tenantId,
      `INSERT INTO public.prospect_logs (tenant_id, prospect_id, type, message, auteur)
       VALUES ($1, $2, 'creation', $3, $4)`,
      [a.crm.tenantId, row.id, 'Fiche créée', a.nom],
    ).catch((e: any) => logger.error('[mySpaceCrm:log-creation]', e?.message))
    notifyNewProspect(a.crm.tenantId, row)
      .catch((e: any) => logger.error('[mySpaceCrm:notif-prospect]', e?.message))
  } catch (e: any) {
    echec(res, 'prospects:create', e)
  }
})

/**
 * PATCH /api/my-space/crm/prospects/:id
 *
 * DEUX verrous, et il en faut deux :
 *   · la capacité `prospects.edit` (ou `edit_all`) — le droit de MODULE.
 *     Sans elle, un commercial en lecture seule pourrait modifier ses
 *     propres fiches, puisque `peutAcceder` accorde l'action à tout
 *     propriétaire. C'est précisément le test « sans droit de
 *     modification → PATCH refusé ».
 *   · `peutAcceder(..., 'edit')` — le PÉRIMÈTRE, qui interdit de toucher
 *     la fiche d'un collègue même en forçant l'identifiant.
 */
router.patch('/prospects/:id', async (req: Request, res: Response) => {
  const a  = acteurDe(req)
  const id = String(req.params.id)

  if (!peutModifierModule(a, 'prospects')) {
    return refuser(req, res, 'prospects-edit',
      "Vous n'avez pas le droit de modifier un prospect.")
  }
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Identifiant invalide.' })

  const lu = lireChampsProspect(req.body, false)
  if ('erreur' in lu) return res.status(400).json({ error: lu.erreur })
  const data = lu.data
  if (!Object.keys(data).length) {
    return res.status(400).json({ error: 'Aucun champ modifiable fourni.' })
  }

  try {
    if (!(await peutAcceder(a.crm, 'prospect', id, 'edit'))) {
      return refuser(req, res, 'prospect-hors-perimetre',
        "Ce prospect n'est pas dans votre périmètre.")
    }

    /* État AVANT, pour le journal. Sans lui, la trace dirait qu'une fiche
       a changé sans jamais dire de quoi vers quoi. */
    const avant = await tenantQueryOne<any>(
      a.crm.tenantId,
      `SELECT ${COLONNES_PROSPECT} FROM public.prospects p
        WHERE p.id = $1 AND p.tenant_id = $2`,
      [id, a.crm.tenantId],
    )
    if (!avant) return res.status(404).json({ error: 'Prospect introuvable.' })

    const keys = Object.keys(data)
    const set  = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
    const row  = await tenantQueryOne<any>(
      a.crm.tenantId,
      `UPDATE public.prospects
          SET ${set}, updated_at = NOW()
        WHERE id = $${keys.length + 1} AND tenant_id = $${keys.length + 2}
      RETURNING *`,
      [...Object.values(data), id, a.crm.tenantId],
      a.crm.userId,
    )
    if (!row) return res.status(404).json({ error: 'Prospect introuvable.' })

    res.json({ prospect: row })

    /* Le changement de statut mérite sa ligne dans le fil : c'est ce que
       fait déjà l'écran admin (src/pages/Prospects.tsx), et les deux
       espaces doivent produire la même timeline. */
    if (data.statut && data.statut !== avant.statut) {
      void tenantQuery(
        a.crm.tenantId,
        `INSERT INTO public.prospect_logs (tenant_id, prospect_id, type, message, auteur)
         VALUES ($1, $2, 'statut', $3, $4)`,
        [a.crm.tenantId, id, `Statut : ${avant.statut} → ${data.statut}`, a.nom],
      ).catch((e: any) => logger.error('[mySpaceCrm:log-statut]', e?.message))
    }
    void journaliser(a.crm, {
      module:      'prospects',
      recordId:    id,
      action:      'update',
      description: `Prospect modifié depuis l'espace commercial par ${a.nom}`,
      avant,
      apres:       data,
    })
  } catch (e: any) {
    echec(res, 'prospects:patch', e)
  }
})

/* ═════════════════════════════════════════════════════════════════
   3. ACTIVITÉS — le fil d'un prospect
   ═══════════════════════════════════════════════════════════════ */

/**
 * POST /api/my-space/crm/prospects/:id/activities
 * body { type, contenu, date_relance?, duration_minutes? }
 *
 * TROIS verrous :
 *   · `activities.create` — le droit de journaliser, tout canal confondu ;
 *   · la capacité DU CANAL (`activities.call` pour un appel…) : le jeu de
 *     départ d'un commercial ouvre note/appel/relance mais pas WhatsApp,
 *     et cette granularité doit être réelle, pas décorative ;
 *   · `peutAcceder(..., 'log')` — le périmètre. Sans lui, on pouvait
 *     déposer un compte rendu dans le dossier d'un collègue, signé de son
 *     propre nom.
 *
 * Le troisième est EXACTEMENT le contrôle que crud.ts applique au POST
 * sur /api/prospect_logs : même table, même règle, une seule fois écrite.
 */
router.post('/prospects/:id/activities', async (req: Request, res: Response) => {
  const a  = acteurDe(req)
  const id = String(req.params.id)

  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Identifiant invalide.' })

  const type = String((req.body ?? {}).type ?? '').trim().toLowerCase() as TypeActivite
  if (!TYPES_ACTIVITE.includes(type)) {
    return res.status(400).json({
      error: `Type d'activité inconnu. Attendu : ${TYPES_ACTIVITE.join(', ')}.`,
    })
  }

  if (!aLaCapacite(a, 'activities.create')) {
    return refuser(req, res, 'activities-create',
      "Vous n'avez pas le droit d'enregistrer une activité.")
  }
  const capCanal = CAPACITE_PAR_TYPE[type]
  if (capCanal && !aLaCapacite(a, capCanal)) {
    return refuser(req, res, `activities-${type}`,
      `Vous n'avez pas le droit d'enregistrer une activité de type « ${type} ».`)
  }

  const contenu = texteOuNull((req.body ?? {}).contenu, MAX_CONTENU)
  if (!contenu) return res.status(400).json({ error: 'Le contenu est obligatoire.' })

  /* Date de relance : facultative, et refusée si illisible plutôt
     qu'ignorée en silence — un rappel qu'on croit posé et qui n'existe
     pas coûte un client. */
  const brutRelance = (req.body ?? {}).date_relance
  const relance     = dateOuNull(brutRelance)
  if (brutRelance !== undefined && brutRelance !== null && brutRelance !== '' && !relance) {
    return res.status(400).json({ error: 'Date de relance invalide.' })
  }

  /* Durée d'appel : la colonne existe depuis la migration 075 et sert au
     suivi du temps passé au téléphone. */
  let duree: number | null = null
  const brutDuree = (req.body ?? {}).duration_minutes
  if (brutDuree !== undefined && brutDuree !== null && brutDuree !== '') {
    const n = Number.parseInt(String(brutDuree), 10)
    if (!Number.isFinite(n) || n < 0 || n > 24 * 60) {
      return res.status(400).json({ error: 'Durée invalide.' })
    }
    duree = n
  }

  try {
    if (!(await peutAcceder(a.crm, 'prospect', id, 'log'))) {
      return refuser(req, res, 'prospect-hors-perimetre',
        "Ce prospect n'est pas dans votre périmètre.")
    }

    const message = `${PREFIXE_MESSAGE[type] ?? ''}${contenu}`

    const activite = await tenantQueryOne<any>(
      a.crm.tenantId,
      `INSERT INTO public.prospect_logs
         (tenant_id, prospect_id, type, message, auteur, duration_minutes)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, prospect_id, type, message, auteur, duration_minutes, media, created_at`,
      [a.crm.tenantId, id, TYPE_LOG_SQL[type], message, a.nom, duree],
      a.crm.userId,
    )

    /* Poser la relance est le prolongement direct du compte rendu
       (« je rappelle jeudi ») : on l'autorise sous le MÊME droit que
       l'activité. Exiger `prospects.edit` ici priverait de rappel un
       commercial autorisé à téléphoner mais pas à modifier la fiche —
       c'est-à-dire le geste quotidien du métier.

       date_relance (DATE) et relance_at (TIMESTAMPTZ) sont écrites
       ensemble : la liste et le filtre « à contacter aujourd'hui »
       s'appuient sur la première, le rappel à l'heure sur la seconde. */
    let prospect: any = null
    if (relance) {
      prospect = await tenantQueryOne<any>(
        a.crm.tenantId,
        `UPDATE public.prospects
            SET relance_at   = $1::timestamptz,
                date_relance = ($1::timestamptz)::date,
                updated_at   = NOW()
          WHERE id = $2 AND tenant_id = $3
        RETURNING *`,
        [relance.toISOString(), id, a.crm.tenantId],
        a.crm.userId,
      )
    }

    res.status(201).json({ activite, prospect })

    void journaliser(a.crm, {
      module:      'prospects',
      recordId:    id,
      action:      'log',
      description: `Activité « ${type} » enregistrée depuis l'espace commercial par ${a.nom}`,
      apres:       { type, relance_at: relance?.toISOString() ?? null },
    })
  } catch (e: any) {
    echec(res, 'prospects:activite', e)
  }
})

/* ═════════════════════════════════════════════════════════════════
   4. CONVERSION PROSPECT → CLIENT
   ═══════════════════════════════════════════════════════════════ */

/**
 * POST /api/my-space/crm/prospects/:id/convert
 *
 * ── Le même effet que l'admin, pas un effet approchant ───────────────
 * Il n'existe aujourd'hui AUCUNE route dédiée : côté admin, convertir
 * consiste à créer la fiche client (POST /api/clients, cf.
 * src/hooks/useClients.ts) puis à basculer le prospect en « gagne »
 * (src/pages/ProspectDetail.tsx, qui affiche « pense à le convertir »).
 * On reproduit ces deux écritures, plus la ligne de timeline que l'écran
 * admin pose à chaque changement de statut — le tout dans UNE
 * transaction, pour ne jamais laisser un prospect marqué gagné sans le
 * client correspondant.
 *
 * ── Pourquoi `convert.all` en plus du périmètre ─────────────────────
 * `peutAcceder(..., 'convert')` accorde l'action à tout PROPRIÉTAIRE de
 * la fiche : sans capacité en plus, n'importe quel commercial
 * convertirait ses propres prospects, et le test « sans droit de
 * conversion → conversion refusée » tomberait. `convert.all` est la
 * seule capacité de conversion du catalogue : c'est donc elle qui porte
 * le droit de MODULE, pendant que `peutAcceder` porte le périmètre.
 */
router.post('/prospects/:id/convert', async (req: Request, res: Response) => {
  const a  = acteurDe(req)
  const id = String(req.params.id)

  if (!aLaCapacite(a, 'convert.all')) {
    return refuser(req, res, 'convert',
      "Vous n'avez pas le droit de convertir un prospect en client.")
  }
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Identifiant invalide.' })

  try {
    if (!(await peutAcceder(a.crm, 'prospect', id, 'convert'))) {
      return refuser(req, res, 'prospect-hors-perimetre',
        "Ce prospect n'est pas dans votre périmètre.")
    }

    const resultat = await tenantTransaction(a.crm.tenantId, async (c: PoolClient) => {
      const { rows: pr } = await c.query(
        `SELECT * FROM public.prospects WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, a.crm.tenantId],
      )
      const prospect = pr[0]
      if (!prospect) throw new HttpError(404, 'Prospect introuvable.')

      /* ── Garde anti-doublon ────────────────────────────────────────
         Aucune colonne ne relie un client à son prospect d'origine, donc
         rien n'empêche structurellement une double conversion : deux
         clics, deux fiches client, deux facturations. On rapproche donc
         sur l'identité — l'email quand il existe (le seul identifiant
         réellement discriminant), le couple nom + entreprise sinon.
         409 et non 400 : la demande était légitime, c'est l'état qui
         s'y oppose, et on rend l'identifiant du client déjà créé pour
         que l'écran y navigue au lieu d'insister. */
      const email = texteOuNull(prospect.email, 300)
      const { rows: dejaLa } = await c.query(
        `SELECT id, nom FROM public.clients
          WHERE tenant_id = $1
            AND CASE WHEN $2::text IS NOT NULL
                     THEN lower(email) = lower($2)
                     ELSE lower(nom) = lower($3)
                          AND coalesce(lower(entreprise), '') = coalesce(lower($4), '')
                END
          LIMIT 1`,
        [a.crm.tenantId, email, prospect.nom, prospect.entreprise],
      )
      if (dejaLa[0]) {
        throw new HttpError(409,
          `Un client existe déjà pour ce contact (${dejaLa[0].nom}).`)
      }

      /* Le dossier reste à celui qui le suivait. `assigned_to` du
         prospect prime sur l'auteur de la conversion : réattribuer le
         client au convertisseur retirerait le portefeuille au commercial
         qui l'a travaillé — la régression exacte que la conversion
         Outbound avait déjà connue (server/routes/outbound.ts). */
      const assignedTo = prospect.assigned_to ?? a.crm.userId

      const notes = [
        texteOuNull(prospect.notes, MAX_CONTENU) ?? '',
        `— Converti depuis le prospect « ${prospect.nom} » le ${new Date().toISOString().slice(0, 10)} par ${a.nom}`,
        prospect.source ? `Source : ${prospect.source}` : '',
      ].filter(Boolean).join('\n')

      /* statut = 'Actif' : la valeur que pose déjà l'interface admin à la
         création d'un client (src/pages/Clients.tsx). On la recopie
         plutôt que d'en choisir une autre, pour que les deux chemins
         produisent des fiches identiques. */
      const { rows: cl } = await c.query(
        `INSERT INTO public.clients
           (tenant_id, nom, email, telephone, entreprise, notes, statut,
            created_by, assigned_to)
         VALUES ($1, $2, $3, $4, $5, $6, 'Actif', $7, $8)
         RETURNING *`,
        [
          a.crm.tenantId, prospect.nom, prospect.email, prospect.telephone,
          prospect.entreprise, notes, a.crm.userId, assignedTo,
        ],
      )
      const client = cl[0]

      const { rows: up } = await c.query(
        `UPDATE public.prospects
            SET statut = 'gagne', updated_at = NOW()
          WHERE id = $1 AND tenant_id = $2
        RETURNING *`,
        [id, a.crm.tenantId],
      )

      /* La ligne de timeline que l'écran admin pose à chaque bascule de
         statut. Elle porte l'identifiant du client créé : c'est le seul
         lien traçable entre les deux fiches, faute de colonne dédiée. */
      await c.query(
        `INSERT INTO public.prospect_logs (tenant_id, prospect_id, type, message, auteur)
         VALUES ($1, $2, 'statut', $3, $4)`,
        [
          a.crm.tenantId, id,
          `Converti en client — fiche client ${client.id}`,
          a.nom,
        ],
      )

      return { client, prospect: up[0] }
    }, a.crm.userId)

    res.status(201).json(resultat)

    void journaliser(a.crm, {
      module:      'prospects',
      recordId:    id,
      action:      'convert',
      description: `Prospect converti en client depuis l'espace commercial par ${a.nom}`,
      apres:       { client_id: resultat.client.id },
    })
  } catch (e: any) {
    echec(res, 'prospects:convert', e)
  }
})

/* ═════════════════════════════════════════════════════════════════
   5. CLIENTS
   ═══════════════════════════════════════════════════════════════ */

const COLONNES_CLIENT = `
  c.id, c.created_at, c.updated_at, c.nom, c.email, c.telephone, c.entreprise,
  c.adresse, c.ville, c.pays, c.notes, c.statut, c.type_service, c.sous_categorie,
  c.date_debut_contrat, c.montant_ttc_annuel, c.prix_renouvellement,
  c.is_premium, c.date_dernier_contact, c.assigned_to, c.created_by`

/** GET /api/my-space/crm/clients?search=&limit=&offset= — capacité `clients.view`. */
router.get('/clients', async (req: Request, res: Response) => {
  const a = acteurDe(req)
  if (!peutVoirModule(a, 'clients')) {
    return refuser(req, res, 'clients-view', "Vous n'avez pas accès aux clients.")
  }

  try {
    const where:  string[]  = ['c.tenant_id = $1']
    const params: unknown[] = [a.crm.tenantId]

    const search = texteOuNull(req.query.search, 120)
    if (search) {
      params.push(`%${echapperLike(search)}%`)
      const i = params.length
      where.push(
        `(c.nom ILIKE $${i} OR c.entreprise ILIKE $${i}`
        + ` OR c.email ILIKE $${i} OR c.telephone ILIKE $${i})`,
      )
    }

    await whereAvecPerimetre(a, 'client', 'c', where, params)

    const limit  = entierBorne(req.query.limit, LIMITE_DEFAUT, 1, LIMITE_MAX)
    const offset = entierBorne(req.query.offset, 0, 0, 1_000_000)
    params.push(limit, offset)

    const rows = await tenantQuery<any>(
      a.crm.tenantId,
      `SELECT ${COLONNES_CLIENT}, COUNT(*) OVER() AS total_perimetre
         FROM public.clients c
        WHERE ${where.join(' AND ')}
        ORDER BY c.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )

    res.json({
      clients: rows.map(({ total_perimetre, ...c }) => c),
      total:   rows.length ? Number(rows[0].total_perimetre) : 0,
      limit,
      offset,
    })
  } catch (e: any) {
    echec(res, 'clients:list', e)
  }
})

/**
 * GET /api/my-space/crm/clients/:id
 *
 * Hors contrat D, et ajoutée délibérément : le client teste « l'accès
 * direct à un client par son ID ». Sans cette route, Express répondrait
 * 404 — le bon refus par accident, mais un refus qu'aucune règle ne
 * garantit. Ici c'est `peutAcceder` qui refuse, comme partout ailleurs,
 * et le jour où l'écran affichera une fiche client la règle sera déjà
 * posée.
 */
router.get('/clients/:id', async (req: Request, res: Response) => {
  const a  = acteurDe(req)
  const id = String(req.params.id)

  if (!peutVoirModule(a, 'clients')) {
    return refuser(req, res, 'clients-view', "Vous n'avez pas accès aux clients.")
  }
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Identifiant invalide.' })

  try {
    if (!(await peutAcceder(a.crm, 'client', id, 'view'))) {
      return refuser(req, res, 'client-hors-perimetre',
        "Ce client n'est pas dans votre périmètre.")
    }
    const client = await tenantQueryOne<any>(
      a.crm.tenantId,
      `SELECT ${COLONNES_CLIENT} FROM public.clients c
        WHERE c.id = $1 AND c.tenant_id = $2`,
      [id, a.crm.tenantId],
    )
    if (!client) return res.status(404).json({ error: 'Client introuvable.' })
    res.json({ client })
  } catch (e: any) {
    echec(res, 'clients:fiche', e)
  }
})

/* ═════════════════════════════════════════════════════════════════
   6. DEVIS
   ═══════════════════════════════════════════════════════════════ */

/* `lignes` (JSONB) est volontairement absente : une liste n'en a pas
   besoin, et chaque devis peut porter des dizaines de lignes détaillées
   — c'est-à-dire des centaines de kilo-octets rechargés à chaque
   ouverture d'écran pour rien. */
const COLONNES_DEVIS = `
  d.id, d.created_at, d.updated_at, d.numero, d.client_id, d.client_nom,
  d.statut, d.date_emission, d.date_expiration, d.montant_ht, d.tva,
  d.montant_ttc, d.notes, d.assigned_to, d.created_by`

/** GET /api/my-space/crm/devis?search=&statut=&limit=&offset= — capacité `devis.view`. */
router.get('/devis', async (req: Request, res: Response) => {
  const a = acteurDe(req)
  if (!peutVoirModule(a, 'devis')) {
    return refuser(req, res, 'devis-view', "Vous n'avez pas accès aux devis.")
  }

  try {
    const where:  string[]  = ['d.tenant_id = $1']
    const params: unknown[] = [a.crm.tenantId]

    const search = texteOuNull(req.query.search, 120)
    if (search) {
      params.push(`%${echapperLike(search)}%`)
      const i = params.length
      where.push(`(d.numero ILIKE $${i} OR d.client_nom ILIKE $${i})`)
    }

    const statut = texteOuNull(req.query.statut, 40)
    if (statut) {
      params.push(statut)
      where.push(`d.statut = $${params.length}`)
    }

    await whereAvecPerimetre(a, 'devis', 'd', where, params)

    const limit  = entierBorne(req.query.limit, LIMITE_DEFAUT, 1, LIMITE_MAX)
    const offset = entierBorne(req.query.offset, 0, 0, 1_000_000)
    params.push(limit, offset)

    const rows = await tenantQuery<any>(
      a.crm.tenantId,
      `SELECT ${COLONNES_DEVIS}, COUNT(*) OVER() AS total_perimetre
         FROM public.devis d
        WHERE ${where.join(' AND ')}
        ORDER BY d.date_emission DESC, d.created_at DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    )

    res.json({
      devis: rows.map(({ total_perimetre, ...d }) => d),
      total: rows.length ? Number(rows[0].total_perimetre) : 0,
      limit,
      offset,
    })
  } catch (e: any) {
    echec(res, 'devis:list', e)
  }
})

export default router
