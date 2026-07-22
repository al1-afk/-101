import { Router, Request, Response } from 'express'
import { tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { safeColumn } from '../middleware/security'
import { tableRbac } from '../middleware/rbac'
import { logger } from '../lib/logger'
import {
  notifyNewProspect, notifyTaskValidation, notifyNewPaiement, notifyDevisAccepte,
} from '../lib/notificationEmails'

const router = Router()
router.use(requireAuth)
router.use('/:table', tableRbac)

const ALLOWED_TABLES = new Set([
  'clients', 'prospects', 'devis', 'factures', 'paiements',
  'depenses', 'contrats', 'produits', 'fournisseurs', 'team_members',
  'domaines', 'hebergements', 'cheques_recus', 'cheques_emis',
  'abonnements', 'client_subscriptions', 'taches',
  'automation_rules', 'automation_logs', 'alerts',
  'calendrier_events', 'bank_accounts', 'credits_dettes',
  'bons_commande', 'conges', 'salaires_paiements', 'tache_actions',
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
])

const isProd = process.env.NODE_ENV === 'production'

const SAFE_COL = /^[a-z_][a-z0-9_]{0,63}$/

function guardTable(table: string, res: Response): boolean {
  if (!ALLOWED_TABLES.has(table)) {
    res.status(400).json({ error: `Table non autorisée` })
    return false
  }
  return true
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
  if (!guardTable(table, res)) return

  const tenantId = req.user!.tenantId
  const orderBy  = safeColumn(String(req.query.orderBy || 'created_at'))
  const order    = req.query.order === 'asc' ? 'ASC' : 'DESC'
  const limit    = Math.min(Number(req.query.limit  || 500), 1000)
  const offset   = Math.max(Number(req.query.offset || 0), 0)

  try {
    /* RLS enforced by SET LOCAL app.current_tenant in tenantQuery */
    const rows = await tenantQuery(
      tenantId,
      `SELECT * FROM ${table} ORDER BY ${orderBy} ${order} LIMIT $1 OFFSET $2`,
      [limit, offset]
    )
    res.json(rows)
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── GET /api/:table/:id ─────────────────────────────────────── */
router.get('/:table/:id', async (req: Request, res: Response) => {
  const table = tableParam(req)
  const { id } = req.params
  if (!guardTable(table, res)) return

  try {
    const row = await tenantQueryOne(
      req.user!.tenantId,
      `SELECT * FROM ${table} WHERE id = $1`,
      [id]
    )
    if (!row) return res.status(404).json({ error: 'Non trouvé' })
    res.json(row)
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* Empty string → null (Postgres rejects "" for date/numeric/uuid/enum columns).
   Arrays/plain objects → JSON string (for jsonb columns — sans cast, pg-node
   les sérialise en syntaxe array Postgres `{a,b}` qui échoue côté jsonb avec
   "Expected ':', but found ','"). */
function normalizeValues(obj: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(obj).map(([k, v]) => {
      if (v === '') return [k, null]
      if (v === null || v === undefined) return [k, v]
      if (Array.isArray(v) || (typeof v === 'object' && (v as object).constructor === Object)) {
        return [k, JSON.stringify(v)]
      }
      return [k, v]
    })
  )
}

/* ── POST /api/:table ────────────────────────────────────────── */
router.post('/:table', async (req: Request, res: Response) => {
  const table = tableParam(req)
  if (!guardTable(table, res)) return

  const raw  = { ...req.body, tenant_id: req.user!.tenantId }
  const data = normalizeValues(Object.fromEntries(Object.entries(raw).filter(([k]) => SAFE_COL.test(k))))
  const keys = Object.keys(data)
  const vals = Object.values(data)
  const ph   = keys.map((_, i) => `$${i + 1}`).join(', ')
  const cols = keys.join(', ')

  try {
    const row = await tenantQueryOne<any>(
      req.user!.tenantId,
      `INSERT INTO ${table} (${cols}) VALUES (${ph}) RETURNING *`,
      vals
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
    logger.error(`[POST /api/${table}]`, err?.code, err?.message, err?.detail, { keys })
    const code = typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) ? err.code : null
    res.status(500).json({ error: code ? `Erreur serveur (${code})` : 'Erreur serveur' })
  }
})

/* ── PATCH /api/:table/:id ───────────────────────────────────── */
router.patch('/:table/:id', async (req: Request, res: Response) => {
  const table = tableParam(req)
  const { id } = req.params
  if (!guardTable(table, res)) return

  const data = normalizeValues(Object.fromEntries(
    Object.entries(req.body as object)
      .filter(([k]) => SAFE_COL.test(k) && k !== 'tenant_id')
  ))
  const keys = Object.keys(data)
  if (!keys.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })

  const sets = keys.map((k, i) => `${k} = $${i + 1}`).join(', ')
  const vals = [...Object.values(data), id]

  try {
    const row = await tenantQueryOne<any>(
      req.user!.tenantId,
      `UPDATE ${table} SET ${sets} WHERE id = $${keys.length + 1} RETURNING *`,
      vals
    )
    if (!row) return res.status(404).json({ error: 'Non trouvé' })
    res.json(row)

    /* Fire-and-forget notifications email (post-update). */
    const tid = req.user!.tenantId
    if (table === 'team_member_tasks' && data.status === 'validation') {
      void notifyTaskValidation(tid, row)
    } else if (table === 'devis' && data.statut === 'accepte') {
      void notifyDevisAccepte(tid, row)
    }
  } catch (err: any) {
    logger.error(`[PATCH /api/${table}/${id}]`, err?.code, err?.message, err?.detail, { keys })
    const code = typeof err?.code === 'string' && /^[0-9A-Z]{5}$/.test(err.code) ? err.code : null
    res.status(500).json({ error: code ? `Erreur serveur (${code})` : 'Erreur serveur' })
  }
})

/* ── DELETE /api/:table/:id ──────────────────────────────────── */
router.delete('/:table/:id', async (req: Request, res: Response) => {
  const table = tableParam(req)
  const { id } = req.params
  if (!guardTable(table, res)) return

  try {
    const row = await tenantQueryOne(
      req.user!.tenantId,
      `DELETE FROM ${table} WHERE id = $1 RETURNING id`,
      [id]
    )
    if (!row) return res.status(404).json({ error: 'Non trouvé' })
    res.json({ success: true })
  } catch (err: any) {
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
