/**
 * API Notifications & rapports automatiques.
 *
 *   GET    /api/notifications                 cloche : mes notifications
 *   PATCH  /api/notifications/:id/read        marquer lue
 *   POST   /api/notifications/read-all        tout marquer lu
 *   DELETE /api/notifications/:id             supprimer une ligne
 *   POST   /api/notifications/clear           vider ma cloche
 *
 *   GET    /api/notifications/settings        configuration de l'espace (admin)
 *   PUT    /api/notifications/settings        modifier (admin)
 *   GET    /api/notifications/runs            historique des envois (admin)
 *   POST   /api/notifications/run/:kind       envoyer maintenant (admin)
 *   GET    /api/notifications/preview/:kind   aperçu HTML sans envoi (admin)
 *
 * Les lectures/écritures passent par `tenantQuery` (RLS active) ET
 * portent un filtre applicatif explicite sur tenant_id / user_id : une
 * notification appartient à une personne, pas à un espace.
 */
import { Router, type Request, type Response } from 'express'
import { pool, tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth, requireRole } from '../middleware/auth'
import { logger } from '../lib/logger'
import {
  REPORT_KINDS, KIND_LABELS, runReportNow, previewReport,
} from '../lib/reportScheduler'
import type { ReportKind } from '../lib/reportEmails'

const router = Router()
router.use(requireAuth)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function isKind(v: unknown): v is ReportKind {
  return typeof v === 'string' && (REPORT_KINDS as string[]).includes(v)
}

/* ═══════════════════════════════════════════════════════════════════
   CLOCHE — notifications de l'utilisateur connecté
═══════════════════════════════════════════════════════════════════ */

/* GET /api/notifications?limit=50&unread=1 */
router.get('/', async (req: Request, res: Response) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200)
  const onlyUnread = req.query.unread === '1' || req.query.unread === 'true'
  try {
    const rows = await tenantQuery(
      req.user!.tenantId,
      `SELECT id, kind, severity, title, message, link, icon, data,
              is_read, read_at, created_at
         FROM public.notifications
        WHERE tenant_id = $1 AND user_id = $2
          ${onlyUnread ? 'AND is_read = FALSE' : ''}
        ORDER BY created_at DESC
        LIMIT $3`,
      [req.user!.tenantId, req.user!.userId, limit],
    )
    const unread = await tenantQueryOne<{ n: string }>(
      req.user!.tenantId,
      `SELECT COUNT(*)::text AS n FROM public.notifications
        WHERE tenant_id = $1 AND user_id = $2 AND is_read = FALSE`,
      [req.user!.tenantId, req.user!.userId],
    )
    res.json({ notifications: rows, unread: Number(unread?.n ?? 0) })
  } catch (err: any) {
    /* Table absente = migration 086 pas encore appliquée. On répond une
       liste vide plutôt qu'une erreur : la cloche doit rester utilisable. */
    if (err?.code === '42P01') return res.json({ notifications: [], unread: 0 })
    logger.error('[GET /api/notifications]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* PATCH /api/notifications/:id/read */
router.patch('/:id/read', async (req: Request, res: Response) => {
  const { id } = req.params
  if (!UUID_RE.test(String(id))) return res.status(400).json({ error: 'ID invalide' })
  try {
    const row = await tenantQueryOne(
      req.user!.tenantId,
      `UPDATE public.notifications
          SET is_read = TRUE, read_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND user_id = $3
        RETURNING id`,
      [id, req.user!.tenantId, req.user!.userId],
    )
    if (!row) return res.status(404).json({ error: 'Non trouvé' })
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[PATCH /api/notifications/:id/read]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/notifications/read-all */
router.post('/read-all', async (req: Request, res: Response) => {
  try {
    const rows = await tenantQuery<{ id: string }>(
      req.user!.tenantId,
      `UPDATE public.notifications
          SET is_read = TRUE, read_at = NOW()
        WHERE tenant_id = $1 AND user_id = $2 AND is_read = FALSE
        RETURNING id`,
      [req.user!.tenantId, req.user!.userId],
    )
    res.json({ success: true, updated: rows.length })
  } catch (err: any) {
    logger.error('[POST /api/notifications/read-all]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* DELETE /api/notifications/:id */
router.delete('/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  if (!UUID_RE.test(String(id))) return res.status(400).json({ error: 'ID invalide' })
  try {
    await tenantQuery(
      req.user!.tenantId,
      `DELETE FROM public.notifications
        WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
      [id, req.user!.tenantId, req.user!.userId],
    )
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[DELETE /api/notifications/:id]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/notifications/clear — vide MA cloche, pas celle des autres. */
router.post('/clear', async (req: Request, res: Response) => {
  try {
    await tenantQuery(
      req.user!.tenantId,
      `DELETE FROM public.notifications WHERE tenant_id = $1 AND user_id = $2`,
      [req.user!.tenantId, req.user!.userId],
    )
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[POST /api/notifications/clear]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═══════════════════════════════════════════════════════════════════
   CONFIGURATION (admin)
═══════════════════════════════════════════════════════════════════ */

const SETTINGS_COLUMNS = `
  tenant_id, enabled, timezone, recipients, email_enabled, inapp_enabled,
  tasks_alert_enabled, tasks_alert_hour, tasks_stale_days,
  contacts_alert_enabled, contacts_alert_hour, contact_delay_days, new_lead_grace_days,
  daily_report_enabled, daily_report_hour,
  weekly_report_enabled, weekly_report_hour, weekly_report_weekday,
  created_at, updated_at`

/** Crée la ligne de configuration au premier accès (valeurs par défaut). */
async function ensureSettings(tenantId: string) {
  const existing = await tenantQueryOne(
    tenantId,
    `SELECT ${SETTINGS_COLUMNS} FROM public.notification_settings WHERE tenant_id = $1`,
    [tenantId],
  )
  if (existing) return existing
  return tenantQueryOne(
    tenantId,
    `INSERT INTO public.notification_settings (tenant_id) VALUES ($1)
     ON CONFLICT (tenant_id) DO UPDATE SET updated_at = NOW()
     RETURNING ${SETTINGS_COLUMNS}`,
    [tenantId],
  )
}

/* GET /api/notifications/settings */
router.get('/settings', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const settings = await ensureSettings(req.user!.tenantId)
    /* Heure locale courante de l'espace : l'UI affiche « prochain envoi »
       sans avoir à deviner le fuseau du serveur. */
    const clock = await tenantQueryOne<{ local_time: string; local_date: string; local_dow: number }>(
      req.user!.tenantId,
      `SELECT to_char(NOW() AT TIME ZONE $1, 'HH24:MI')     AS local_time,
              to_char(NOW() AT TIME ZONE $1, 'YYYY-MM-DD')  AS local_date,
              EXTRACT(isodow FROM NOW() AT TIME ZONE $1)::int AS local_dow`,
      [(settings as Record<string, unknown> | null)?.timezone ?? 'Africa/Casablanca'],
    )
    res.json({ settings, clock, kinds: KIND_LABELS })
  } catch (err: any) {
    if (err?.code === '42P01') {
      return res.status(503).json({ error: 'Migration 086 non appliquée sur cette base.' })
    }
    logger.error('[GET /api/notifications/settings]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* Champs modifiables + validation. Tout le reste du corps est ignoré. */
const BOOL_FIELDS = [
  'enabled', 'email_enabled', 'inapp_enabled',
  'tasks_alert_enabled', 'contacts_alert_enabled',
  'daily_report_enabled', 'weekly_report_enabled',
] as const

const INT_FIELDS: Array<[string, number, number]> = [
  ['tasks_alert_hour', 0, 23],
  ['tasks_stale_days', 1, 365],
  ['contacts_alert_hour', 0, 23],
  ['contact_delay_days', 1, 365],
  ['new_lead_grace_days', 0, 90],
  ['daily_report_hour', 0, 23],
  ['weekly_report_hour', 0, 23],
  ['weekly_report_weekday', 1, 7],
]

/* PUT /api/notifications/settings */
router.put('/settings', requireRole('admin'), async (req: Request, res: Response) => {
  const body = (req.body ?? {}) as Record<string, unknown>
  const sets: string[] = []
  const vals: unknown[] = []

  for (const f of BOOL_FIELDS) {
    if (typeof body[f] === 'boolean') {
      vals.push(body[f])
      sets.push(`${f} = $${vals.length}`)
    }
  }

  for (const [f, min, max] of INT_FIELDS) {
    if (body[f] === undefined || body[f] === null || body[f] === '') continue
    const n = Number(body[f])
    if (!Number.isInteger(n) || n < min || n > max) {
      return res.status(400).json({ error: `Valeur invalide pour ${f} (attendu ${min}–${max})` })
    }
    vals.push(n)
    sets.push(`${f} = $${vals.length}`)
  }

  if (typeof body.timezone === 'string' && body.timezone.trim()) {
    const tz = body.timezone.trim()
    /* Un fuseau inconnu ferait échouer `NOW() AT TIME ZONE tz` à chaque
       tick — donc plus AUCUN envoi. On refuse à l'écriture. */
    const known = await tenantQueryOne<{ ok: boolean }>(
      req.user!.tenantId,
      `SELECT EXISTS (SELECT 1 FROM pg_timezone_names WHERE name = $1) AS ok`,
      [tz],
    )
    if (!known?.ok) return res.status(400).json({ error: `Fuseau horaire inconnu : ${tz}` })
    vals.push(tz)
    sets.push(`timezone = $${vals.length}`)
  }

  if (Array.isArray(body.recipients)) {
    const list = (body.recipients as unknown[])
      .map(e => String(e).trim().toLowerCase())
      .filter(Boolean)
    const bad = list.find(e => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
    if (bad) return res.status(400).json({ error: `Adresse email invalide : ${bad}` })
    if (list.length > 20) return res.status(400).json({ error: 'Maximum 20 destinataires' })
    vals.push([...new Set(list)])
    sets.push(`recipients = $${vals.length}`)
  }

  if (!sets.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })

  try {
    await ensureSettings(req.user!.tenantId)
    vals.push(req.user!.tenantId)
    const row = await tenantQueryOne(
      req.user!.tenantId,
      `UPDATE public.notification_settings
          SET ${sets.join(', ')}
        WHERE tenant_id = $${vals.length}
        RETURNING ${SETTINGS_COLUMNS}`,
      vals,
    )
    res.json({ success: true, settings: row })
  } catch (err: any) {
    logger.error('[PUT /api/notifications/settings]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* GET /api/notifications/runs — historique (statut du dernier envoi de
   chaque type + 30 dernières exécutions). */
router.get('/runs', requireRole('admin'), async (req: Request, res: Response) => {
  try {
    const runs = await tenantQuery(
      req.user!.tenantId,
      `SELECT id, kind, to_char(run_date, 'YYYY-MM-DD') AS run_date, scheduled_hour,
              trigger, status, attempt, recipients, emails_sent, emails_failed,
              summary, error, started_at, finished_at
         FROM public.notification_runs
        WHERE tenant_id = $1
        ORDER BY started_at DESC
        LIMIT 30`,
      [req.user!.tenantId],
    )
    const last = await tenantQuery(
      req.user!.tenantId,
      `SELECT DISTINCT ON (kind) kind, status, emails_sent, started_at, finished_at, summary
         FROM public.notification_runs
        WHERE tenant_id = $1
        ORDER BY kind, started_at DESC`,
      [req.user!.tenantId],
    )
    res.json({ runs, last })
  } catch (err: any) {
    if (err?.code === '42P01') return res.json({ runs: [], last: [] })
    logger.error('[GET /api/notifications/runs]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* POST /api/notifications/run/:kind — envoi immédiat (test / rattrapage).
   Réservé aux admins : l'action expédie de vrais emails. */
router.post('/run/:kind', requireRole('admin'), async (req: Request, res: Response) => {
  const kind = req.params.kind
  if (!isKind(kind)) return res.status(400).json({ error: 'Type de rapport inconnu' })
  try {
    const result = await runReportNow(pool, req.user!.tenantId, kind)
    res.json(result)
  } catch (err: any) {
    logger.error(`[POST /api/notifications/run/${kind}]`, err?.message)
    res.status(500).json({ error: err?.message ?? 'Erreur serveur' })
  }
})

/* GET /api/notifications/preview/:kind — aperçu sans envoi ni journal. */
router.get('/preview/:kind', requireRole('admin'), async (req: Request, res: Response) => {
  const kind = req.params.kind
  if (!isKind(kind)) return res.status(400).json({ error: 'Type de rapport inconnu' })
  try {
    const report = await previewReport(pool, req.user!.tenantId, kind)
    if (req.query.format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.send(report.html)
    }
    res.json({
      subject: report.subject,
      empty:   report.empty,
      summary: report.summary,
      inapp:   report.inapp,
      html:    report.html,
      text:    report.text,
    })
  } catch (err: any) {
    logger.error(`[GET /api/notifications/preview/${kind}]`, err?.message)
    res.status(500).json({ error: err?.message ?? 'Erreur serveur' })
  }
})

export default router
