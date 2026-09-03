import { Router, Request, Response } from 'express'
import { unlink } from 'node:fs/promises'
import path from 'node:path'
import { tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { safeColumn } from '../middleware/security'
import { tableRbac } from '../middleware/rbac'
import { logger } from '../lib/logger'
import {
  trackSecurityEvent, noteResourceProbe, isProbeThresholdCrossed, PROBE_LIMITS,
} from '../lib/securityEvents'
import { markSecurityLogged } from '../middleware/securityMonitor'
import { ensureTenantColumnCache, tableIsTenantScoped } from '../db/tenantColumns'
import {
  notifyNewProspect, notifyTaskValidation, notifyNewPaiement, notifyDevisAccepte,
} from '../lib/notificationEmails'

const router = Router()
router.use(requireAuth)

/* Même racine que les autres médias (server/routes/mySpaceSops.ts). */
const UPLOAD_DIR = process.env.UPLOAD_DIR
  || (process.env.NODE_ENV === 'production' ? '/app/uploads' : path.resolve(process.cwd(), 'uploads'))
router.use('/:table', tableRbac)

export const EXPOSED_TABLES = new Set([
  'clients', 'prospects', 'devis', 'factures', 'paiements',
  'depenses', 'contrats', 'produits', 'fournisseurs', 'team_members',
  'domaines', 'hebergements', 'cheques_recus', 'cheques_emis',
  'abonnements', 'client_subscriptions', 'taches',
  'automation_rules', 'automation_logs', 'alerts',
  'calendrier_events', 'bank_accounts', 'credits_dettes',
  'bons_commande', 'employee_leaves', 'employee_payroll', 'tache_actions',
  'personal_tasks',
  /* Module Guides (playbook onboarding client) */
  'guide_steps', 'guide_templates', 'guide_checklists',
  'guide_checklist_state', 'guide_template_renders',
  'guide_discovery_questions', 'tenant_vision',
  /* SOPs personnalisés (Procédures internes) */
  'sops',
  /* Collaboration SOP : partage + suivi formation */
  'sop_shares',
  'sop_training_progress',
  /* Stagiaires (Équipe → onglet Stagiaires) */
  'stagiaires',
  /* Projets (gestion de projets clients & internes) */
  'projets',
  'projet_assignees',
  'projet_messages',
  'projet_templates',
  'team_member_tasks',
  /* Bons de livraison (handover projet + mots de passe + liens) */
  'bons_livraison',
  /* Carnet d'adresses : freelances, candidats, artisans, etc. */
  'contacts',
  /* Journal d'activité CRM (timeline prospect : notes, appels, emails…) */
  'prospect_logs',
  /* Bibliothèque de modèles de prestations (devis) */
  'prestation_models',
  /* Module financier : revenus encaissés, prévisions (revenus/dépenses
     à venir), virements internes, ajustements manuels de solde.
     Les ÉCRITURES sensibles passent par /api/finance (atomicité +
     anti-doublon) ; le CRUD générique sert la lecture et les
     modifications simples (cf. TABLE_ACL). */
  'revenus',
  'previsions_financieres',
  'transferts_comptes',
  'bank_account_adjustments',
])

const isProd = process.env.NODE_ENV === 'production'

const SAFE_COL = /^[a-z_][a-z0-9_]{0,63}$/

/**
 * Colonnes qu'aucun client n'a le droit d'écrire par le CRUD générique.
 *
 * Ce sont des champs posés par une transaction serveur, jamais par un
 * formulaire : les écrire directement casserait l'invariant qu'ils
 * représentent. Exemple concret : `previsions_financieres.revenu_id` et
 * `statut` sont écrits ensemble par POST /api/finance/previsions/:id/settle.
 * Un PATCH `{ statut: 'prevu' }` sur une prévision déjà encaissée la
 * rouvrirait sans supprimer le revenu correspondant — et permettrait de
 * l'encaisser une seconde fois. La base pose le même garde-fou (trigger
 * previsions_guard_reouverture) ; ici on refuse plus tôt et plus clairement.
 */
const READONLY_COLUMNS: Record<string, Set<string>> = {
  previsions_financieres: new Set([
    'montant_realise', 'date_realisation', 'revenu_id', 'depense_id',
  ]),
  revenus:  new Set(['prevision_id']),
  depenses: new Set(['prevision_id']),
  /* « Qui a ajouté / modifié » n'a de valeur que si personne ne peut
     l'écrire soi-même : le serveur seul les pose (stampAuthorship). */
  sops:     new Set(['created_by_name', 'updated_by_name']),
  /* Même raison pour l'accusé de consultation d'une tâche : il est posé
     par /api/my-space quand la personne assignée ouvre la tâche. */
  team_member_tasks: new Set(['viewed_at', 'viewed_by_name']),
}

/**
 * Estampille « qui a fait quoi » sur les tables qui l'exposent.
 *
 * Côté membre (espace /my-space) c'est server/routes/mySpace.ts qui pose
 * le nom ; ici on couvre le CRUD générique, donc les écritures faites
 * depuis l'espace admin. Dans les deux cas la valeur vient du serveur,
 * jamais du corps de la requête — sinon le nom affiché ne prouverait
 * rien. Les colonnes sont d'ailleurs dans READONLY_COLUMNS.
 */
async function stampAuthorship(
  table: string,
  data: Record<string, unknown>,
  req: Request,
  mode: 'create' | 'update',
): Promise<void> {
  if (table !== 'sops') return
  delete data.created_by_name
  delete data.updated_by_name
  try {
    const u = await tenantQueryOne<{ name: string | null; email: string }>(
      req.user!.tenantId,
      `SELECT name, email FROM public.users WHERE id = $1`,
      [req.user!.userId],
    )
    const who = (u?.name ?? '').trim() || u?.email || 'Administrateur'
    data.updated_by_name = who
    if (mode === 'create') data.created_by_name = who
  } catch (e: any) {
    /* Une estampille manquante ne doit pas faire échouer l'écriture. */
    logger.error('[crud:stampAuthorship]', e.message)
  }
}

function guardTable(table: string, res: Response, req?: Request): boolean {
  if (!EXPOSED_TABLES.has(table)) {
    /* Une table hors liste blanche, c'est soit un bug client, soit
       quelqu'un qui cherche `users`, `refresh_tokens`, `security_events`…
       Le nom demandé est journalisé (tronqué), la requête est refusée. */
    if (req) {
      trackSecurityEvent({
        type: 'invalid_input', req,
        httpStatus: 400,
        reason: 'table_not_allowed',
        metadata: { table: table.slice(0, 64) },
      })
    }
    res.status(400).json({ error: `Table non autorisée` })
    return false
  }
  return true
}

/**
 * Détecte une falsification explicite de `tenant_id` dans le corps.
 *
 * Le serveur impose déjà le tenant du JWT (POST) ou retire la colonne
 * (PATCH) : l'isolation n'est jamais en jeu. Mais recevoir un tenant_id
 * DIFFÉRENT du sien n'arrive pas par hasard — aucun écran de l'app n'en
 * envoie. C'est le signal IDOR/BOLA le plus net qu'on puisse capter ici,
 * et il est sans faux positif.
 */
function detectForgedTenant(req: Request, table: string): void {
  const claimed = (req.body as Record<string, unknown> | undefined)?.tenant_id
  if (typeof claimed !== 'string' || !claimed) return
  if (claimed === req.user!.tenantId) return
  markSecurityLogged(req)
  trackSecurityEvent({
    type: 'tenant_scope_denied', req,
    reason: 'forged_tenant_id',
    metadata: { table, claimed_tenant: claimed.slice(0, 64) },
  })
}

/**
 * Un 404 isolé est normal ; un balayage d'identifiants ne l'est pas.
 * On ne journalise qu'au franchissement du seuil (compteur en mémoire).
 */
function noteNotFound(req: Request, table: string): void {
  const actor = req.user!.userId
  const count = noteResourceProbe(`${actor}|notfound`)
  if (!isProbeThresholdCrossed(count)) return
  markSecurityLogged(req)
  trackSecurityEvent({
    type: 'tenant_scope_denied', req,
    httpStatus: 404,
    reason: 'resource_enumeration_suspected',
    /* SUSPICIOUS et non CONFIRMED : un client mal synchronisé peut
       produire ce volume. On signale, on n'accuse pas. */
    status: 'suspicious',
    metadata: {
      table, misses: count,
      window_minutes: PROBE_LIMITS.windowMs / 60000,
    },
  })
}

/* Express 5 types req.params[key] as string | string[]; our routes
   always receive a single segment, so narrow once at the top. */
function tableParam(req: Request): string {
  const t = req.params.table
  return Array.isArray(t) ? (t[0] ?? '') : (t ?? '')
}

/* ── GET /api/:table ─────────────────────────────────────────── */
router.get('/:table', async (req: Request, res: Response) => {
  const table = tableParam(req)
  if (!guardTable(table, res, req)) return

  const tenantId = req.user!.tenantId
  const orderBy  = safeColumn(String(req.query.orderBy || 'created_at'))
  const order    = req.query.order === 'asc' ? 'ASC' : 'DESC'
  const limit    = Math.min(Number(req.query.limit  || 500), 1000)
  const offset   = Math.max(Number(req.query.offset || 0), 0)

  /* Filtres d'égalité optionnels : tout query param hors réservés est traité
     comme `colonne = valeur` (nom validé par SAFE_COL, valeur paramétrée).
     Ex. /api/prospect_logs?prospect_id=… → timeline scopée à un prospect. */
  const RESERVED = new Set(['orderBy', 'order', 'limit', 'offset'])
  const whereClauses: string[] = []
  const whereVals: unknown[] = []
  for (const [k, v] of Object.entries(req.query)) {
    if (RESERVED.has(k) || typeof v !== 'string' || !SAFE_COL.test(k)) continue
    whereVals.push(v)
    whereClauses.push(`${k} = $${whereVals.length}`)
  }

  try {
    /* DEUX lignes de défense indépendantes :
       1. RLS PostgreSQL (SET LOCAL app.current_tenant dans tenantQuery) ;
       2. ce filtre applicatif.
       La 1re saute si le rôle est SUPERUSER/BYPASSRLS ou propriétaire
       d'une table dont la RLS n'est pas FORCÉE — situation réellement
       constatée. La 2e ne dépend d'aucune configuration de base. */
    await ensureTenantColumnCache()
    if (tableIsTenantScoped(table)) {
      whereVals.push(tenantId)
      whereClauses.push(`tenant_id = $${whereVals.length}`)
    }
    const whereSql = whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : ''

    const rows = await tenantQuery(
      tenantId,
      `SELECT * FROM ${table} ${whereSql} ORDER BY ${orderBy} ${order} LIMIT $${whereVals.length + 1} OFFSET $${whereVals.length + 2}`,
      [...whereVals, limit, offset]
    )
    res.json(rows)
  } catch (err: any) {
    logger.error(`[GET /api/${table}]`, err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── GET /api/:table/:id ─────────────────────────────────────── */
router.get('/:table/:id', async (req: Request, res: Response) => {
  const table = tableParam(req)
  const { id } = req.params
  if (!guardTable(table, res, req)) return

  try {
    await ensureTenantColumnCache()
    const scope = tableIsTenantScoped(table) ? ' AND tenant_id = $2' : ''
    const params = tableIsTenantScoped(table) ? [id, req.user!.tenantId] : [id]
    const row = await tenantQueryOne(
      req.user!.tenantId,
      `SELECT * FROM ${table} WHERE id = $1${scope}`,
      params
    )
    if (!row) {
      noteNotFound(req, table)
      return res.status(404).json({ error: 'Non trouvé' })
    }
    res.json(row)
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* Colonnes qui sont de VRAIS tableaux Postgres (int[], text[]…) et non
   du jsonb. Elles doivent échapper à la sérialisation JSON ci-dessous :
   pg-node sait déjà écrire un tableau JS en syntaxe Postgres `{30,1440}`,
   alors qu'un JSON.stringify produirait `[30,1440]` — rejeté par la base
   avec « malformed array literal ».

   La liste est explicite plutôt que déduite du schéma : une colonne jsonb
   traitée par erreur comme un tableau natif casserait silencieusement des
   écritures qui fonctionnent aujourd'hui (attachments, recurrence…). */
const NATIVE_ARRAY_COLUMNS: Record<string, Set<string>> = {
  team_member_tasks: new Set(['reminder_offsets']),
}

/* Empty string → null (Postgres rejects "" for date/numeric/uuid/enum columns).
   Arrays/plain objects → JSON string (for jsonb columns — sans cast, pg-node
   les sérialise en syntaxe array Postgres `{a,b}` qui échoue côté jsonb avec
   "Expected ':', but found ','"). */
function normalizeValues(obj: Record<string, unknown>, table?: string): Record<string, unknown> {
  const nativeArrays = table ? NATIVE_ARRAY_COLUMNS[table] : undefined
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (v === '') return [k, null]
      if (v === null || v === undefined) return [k, v]
      if (Array.isArray(v) && nativeArrays?.has(k)) return [k, v]
      if (Array.isArray(v) || (typeof v === 'object' && (v as object).constructor === Object)) {
        return [k, JSON.stringify(v)]
      }
      return [k, v]
    })
  )
}

/* Traduit une erreur Postgres en réponse HTTP lisible côté client.
   Le front (src/lib/api.ts) affiche `data.error` dans un toast, donc ce
   message est vu tel quel par l'utilisateur.
   - P0001 = RAISE EXCEPTION applicatif (garde-fous métier des triggers,
     ex. « Le paiement dépasse le solde restant ») → 400 + message tel quel :
     il est rédigé pour l'utilisateur, pas pour le debug.
   - 23xxx = violations d'intégrité → 400/409 + message court et clair.
   - Sinon → 500 générique + SQLSTATE (aide à repérer une dérive de schéma). */
function sendDbError(res: Response, err: any, ctx: string, extra?: unknown): void {
  const code = typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) ? err.code : null
  logger.error(ctx, code, err?.message, err?.detail, extra ?? '')

  if (code === 'P0001') {
    const msg = typeof err?.message === 'string' && err.message.trim() ? err.message.trim() : 'Opération refusée'
    return void res.status(400).json({ error: msg })
  }
  switch (code) {
    case '23505': return void res.status(409).json({ error: 'Doublon : cet enregistrement existe déjà.' })
    case '23503': return void res.status(400).json({ error: 'Référence liée introuvable ou déjà supprimée.' })
    case '23502': return void res.status(400).json({ error: 'Un champ obligatoire est manquant.' })
    case '23514': return void res.status(400).json({ error: 'Valeur non autorisée pour un des champs.' })
  }
  res.status(500).json({ error: code ? `Erreur serveur (${code})` : 'Erreur serveur' })
}

/* ── POST /api/:table ────────────────────────────────────────── */
router.post('/:table', async (req: Request, res: Response) => {
  const table = tableParam(req)
  if (!guardTable(table, res, req)) return

  detectForgedTenant(req, table)
  const raw  = { ...req.body, tenant_id: req.user!.tenantId }
  const data = normalizeValues(Object.fromEntries(Object.entries(raw).filter(([k]) => SAFE_COL.test(k))), table)
  await stampAuthorship(table, data, req, 'create')
  const keys = Object.keys(data)
  const vals = Object.values(data)
  const ph   = keys.map((_, i) => `$${i + 1}`).join(', ')
  const cols = keys.join(', ')

  try {
    const row = await tenantQueryOne<any>(
      req.user!.tenantId,
      `INSERT INTO ${table} (${cols}) VALUES (${ph}) RETURNING *`,
      vals,
      /* Qui écrit : lu par le déclencheur d'audit (log_mutation). */
      req.user!.userId,
    )
    res.status(201).json(row)

    /* Fire-and-forget notifications email (post-create). */
    if (row) {
      const tid = req.user!.tenantId
      console.log(`[crud:notif-hook] POST /api/${table} → row.id=${row.id} tid=${tid}`)
      if (table === 'prospects') {
        notifyNewProspect(tid, row).catch(e => logger.error('[notif:prospect] async err:', e?.message))
      } else if (table === 'paiements') {
        notifyNewPaiement(tid, row).catch(e => logger.error('[notif:paiement] async err:', e?.message))
      }
    }
  } catch (err: any) {
    sendDbError(res, err, `[POST /api/${table}]`, { keys })
  }
})

/* ── PATCH /api/:table/:id ───────────────────────────────────── */
router.patch('/:table/:id', async (req: Request, res: Response) => {
  const table = tableParam(req)
  const { id } = req.params
  if (!guardTable(table, res, req)) return

  detectForgedTenant(req, table)
  const readonly = READONLY_COLUMNS[table]
  const data = normalizeValues(Object.fromEntries(
    Object.entries(req.body as object)
      .filter(([k]) => SAFE_COL.test(k) && k !== 'tenant_id' && !readonly?.has(k))
  ), table)
  if (!Object.keys(data).length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })
  /* Après le contrôle « au moins un champ » (l'estampille seule ne fait
     pas une mise à jour), mais AVANT le calcul de keys/vals : les deux
     doivent rester alignés sur les mêmes placeholders. */
  await stampAuthorship(table, data, req, 'update')
  const keys = Object.keys(data)

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  const vals = [...Object.values(data), id]

  try {
    await ensureTenantColumnCache()
    /* Le tenant fait partie de la clause WHERE : une ligne d'un autre
       espace ne peut pas être modifiée, même si la RLS est inopérante. */
    let scope = ''
    if (tableIsTenantScoped(table)) {
      vals.push(req.user!.tenantId)
      scope = ` AND tenant_id = $${vals.length}`
    }
    const row = await tenantQueryOne<any>(
      req.user!.tenantId,
      `UPDATE ${table} SET ${sets} WHERE id = $${keys.length + 1}${scope} RETURNING *`,
      vals,
      req.user!.userId,
    )
    if (!row) {
      noteNotFound(req, table)
      return res.status(404).json({ error: 'Non trouvé' })
    }
    res.json(row)

    /* Fire-and-forget notifications email (post-update). */
    const tid = req.user!.tenantId
    if (table === 'team_member_tasks' && data.status === 'validation') {
      void notifyTaskValidation(tid, row)
    } else if (table === 'devis' && data.statut === 'accepte') {
      void notifyDevisAccepte(tid, row)
    }
  } catch (err: any) {
    sendDbError(res, err, `[PATCH /api/${table}/${id}]`, { keys })
  }
})

/* ── DELETE /api/:table/:id ──────────────────────────────────── */
router.delete('/:table/:id', async (req: Request, res: Response) => {
  const table = tableParam(req)
  const { id } = req.params
  if (!guardTable(table, res, req)) return

  try {
    await ensureTenantColumnCache()
    const scoped = tableIsTenantScoped(table)

    /* Les fichiers d'images d'un SOP sont relevés AVANT le DELETE : la
       cascade emporte les lignes sop_images et on ne saurait plus quoi
       effacer sur le volume. Sans ça, chaque suppression d'un SOP
       illustré laissait ses images sur le disque, définitivement. */
    let orphanFiles: string[] = []
    if (table === 'sops') {
      try {
        const imgs = await tenantQuery<{ storage_path: string }>(
          req.user!.tenantId,
          `SELECT storage_path FROM public.sop_images WHERE sop_id = $1`, [id],
        )
        orphanFiles = imgs.map(i => i.storage_path)
      } catch (e: any) { logger.error('[crud:sop-images-scan]', e.message) }
    }

    const row = await tenantQueryOne(
      req.user!.tenantId,
      `DELETE FROM ${table} WHERE id = $1${scoped ? ' AND tenant_id = $2' : ''} RETURNING id`,
      scoped ? [id, req.user!.tenantId] : [id],
      req.user!.userId,
    )
    if (!row) {
      noteNotFound(req, table)
      return res.status(404).json({ error: 'Non trouvé' })
    }
    for (const rel of orphanFiles) {
      try { await unlink(path.join(UPLOAD_DIR, rel)) } catch { /* déjà absent */ }
    }
    res.json({ success: true })
  } catch (err: any) {
    /* 23503 sur un DELETE = la ligne est encore référencée par une FK
       RESTRICT. Ce n'est pas une panne : c'est un refus métier, et
       l'utilisateur doit savoir quoi faire. Cas réel : supprimer un compte
       bancaire porteur de transferts effacerait la moitié d'un mouvement
       et fausserait le solde de l'autre compte. */
    if (err?.code === '23503') {
      logger.warn(`[DELETE /api/${table}/${id}] référencé ailleurs:`, err?.detail)
      return res.status(409).json({
        error: table === 'bank_accounts'
          ? "Ce compte est utilisé par des transferts : supprimez-les d'abord, ou désactivez le compte."
          : 'Cet enregistrement est référencé par d\'autres données et ne peut pas être supprimé.',
      })
    }
    sendDbError(res, err, `[DELETE /api/${table}/${id}]`)
  }
})

export default router
