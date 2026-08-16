/**
 * Préférences de rappel de tâches — /api/task-reminders
 *
 * Réglages PERSONNELS : à quel moment être prévenu avant l'échéance, à
 * quelle heure est due une tâche datée sans heure, et par quels canaux.
 * Comme pour 7aty, chaque requête est scopée à `req.user.userId` — un
 * collègue ne règle pas mes rappels, et ne les lit pas non plus.
 *
 * La route sert aussi les DÉFAUTS quand rien n'a jamais été enregistré :
 * le front n'a donc jamais à gérer le cas « pas de ligne en base ».
 */
import { Router, Request, Response, NextFunction } from 'express'
import { tenantQueryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { logger } from '../lib/logger'

const router = Router()
router.use(requireAuth)

router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role === 'team_member') {
    return res.status(403).json({ error: 'Non disponible pour les comptes membres' })
  }
  next()
})

/* Mêmes valeurs que les DEFAULT de la migration 088 : 30 min et 1 jour.
   Le rappel à 5 min reste un choix — il n'a de sens que sur une tâche
   dont l'heure est réellement fixée. */
const DEFAULTS = {
  default_offsets:  [30, 1440],
  default_due_time: '09:00',
  email_enabled: true,
  push_enabled:  true,
  inapp_enabled: true,
}

/** Plafond aligné sur la contrainte SQL (30 jours), 5 rappels maximum. */
const MAX_OFFSET_MIN = 43200
const MAX_OFFSETS = 5

/**
 * Normalise une liste d'offsets : entiers, bornés, dédoublonnés, triés
 * du plus lointain au plus proche. Renvoie null si la valeur envoyée
 * n'est pas exploitable.
 */
export function normalizeOffsets(raw: unknown): number[] | null {
  if (!Array.isArray(raw)) return null
  const out: number[] = []
  for (const v of raw) {
    const n = Math.round(Number(v))
    if (!Number.isFinite(n) || n < 0 || n > MAX_OFFSET_MIN) return null
    if (!out.includes(n)) out.push(n)
  }
  if (out.length > MAX_OFFSETS) return null
  return out.sort((a, b) => b - a)
}

/** « 09:00 » / « 09:00:00 » → « 09:00:00 », sinon null. */
export function normalizeTime(raw: unknown): string | null {
  if (typeof raw !== 'string') return null
  const m = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/.exec(raw.trim())
  if (!m) return null
  return `${m[1]}:${m[2]}:${m[3] ?? '00'}`
}

/* ── GET /api/task-reminders/prefs ────────────────────────────────── */
router.get('/prefs', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const row = await tenantQueryOne(
      tenantId,
      `SELECT default_offsets, default_due_time, email_enabled, push_enabled, inapp_enabled
         FROM task_reminder_prefs
        WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, req.user!.userId]
    )
    res.json(row ?? DEFAULTS)
  } catch (err: any) {
    logger.error('[GET /api/task-reminders/prefs]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── PUT /api/task-reminders/prefs ────────────────────────────────── */
router.put('/prefs', async (req: Request, res: Response) => {
  const b = req.body ?? {}

  const offsets = b.default_offsets === undefined
    ? DEFAULTS.default_offsets
    : normalizeOffsets(b.default_offsets)
  if (offsets === null) {
    return res.status(400).json({
      error: `Rappels invalides (5 maximum, entre 0 et ${MAX_OFFSET_MIN} minutes)`,
    })
  }

  const dueTime = b.default_due_time === undefined
    ? `${DEFAULTS.default_due_time}:00`
    : normalizeTime(b.default_due_time)
  if (dueTime === null) return res.status(400).json({ error: 'Heure par défaut invalide' })

  const bool = (v: unknown, fallback: boolean) => v === undefined ? fallback : Boolean(v)

  const tenantId = req.user!.tenantId
  try {
    const row = await tenantQueryOne(
      tenantId,
      `INSERT INTO task_reminder_prefs
         (tenant_id, user_id, default_offsets, default_due_time,
          email_enabled, push_enabled, inapp_enabled)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         default_offsets  = EXCLUDED.default_offsets,
         default_due_time = EXCLUDED.default_due_time,
         email_enabled    = EXCLUDED.email_enabled,
         push_enabled     = EXCLUDED.push_enabled,
         inapp_enabled    = EXCLUDED.inapp_enabled
       RETURNING default_offsets, default_due_time, email_enabled, push_enabled, inapp_enabled`,
      [
        tenantId, req.user!.userId, offsets, dueTime,
        bool(b.email_enabled, true), bool(b.push_enabled, true), bool(b.inapp_enabled, true),
      ]
    )
    res.json(row)
  } catch (err: any) {
    logger.error('[PUT /api/task-reminders/prefs]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
