/**
 * Module 7aty — « Où va mon temps ? »  —  /api/time
 *
 * ── Pourquoi une route dédiée plutôt que le CRUD générique ─────────
 * Le CRUD générique (`/api/:table`) scope au TENANT, pas à la PERSONNE :
 * n'importe quel utilisateur de l'espace pourrait lire — et surtout
 * écrire — les blocs de temps d'un autre en passant `?user_id=…`. Or ce
 * module est un journal intime : combien d'heures sur Instagram, à quelle
 * heure, avec quel aveu de perte de contrôle. Chaque requête ici est donc
 * filtrée sur `req.user.userId`, sans exception et sans paramètre client.
 *
 * Trois autres raisons rendent la route nécessaire :
 *
 *   1. Chronomètre — « Start » alors qu'un autre tourne doit FERMER le
 *      précédent puis ouvrir le nouveau. Deux écritures indivisibles :
 *      sans transaction, un échec au milieu laisserait deux chronomètres
 *      en cours (que l'index unique partiel refuserait de toute façon,
 *      avec une erreur illisible).
 *   2. Durées — `duration_min` est posé par un trigger, jamais par le
 *      client (migration 087). Le serveur ne fait que refuser les bornes
 *      absurdes (fin avant début, bloc de plus de 24 h).
 *   3. Objectifs — l'écran envoie la liste complète des plafonds ; le
 *      serveur remplace l'ensemble en une transaction (UPSERT + DELETE
 *      des retirés), sinon une suppression perdue laisserait un objectif
 *      fantôme qui pénalise le Distraction Score.
 *
 * Les calculs d'analyse (totaux, score, schémas, rapport CEO) vivent
 * côté client dans src/lib/timeAnalytics.ts — fonctions pures, testées
 * par `npm run test:time`. Cette route ne sert que la donnée brute.
 */
import { Router, Request, Response, NextFunction } from 'express'
import { tenantQuery, tenantQueryOne, tenantTransaction } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { logger } from '../lib/logger'

const router = Router()
router.use(requireAuth)

/* Les membres d'équipe ont leur propre espace (/api/my-space) et n'ont
   pas de ligne dans `users` : leur `userId` ferait échouer la clé
   étrangère de time_entries avec une 500 incompréhensible. Refus net. */
router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role === 'team_member') {
    return res.status(403).json({ error: 'Module réservé aux comptes de l\'espace' })
  }
  next()
})

/* ── Vocabulaire (miroir des CHECK de la migration 087) ──────────── */
const KINDS          = new Set(['valeur', 'neutre', 'repos', 'perdu'])
const CONTROL_LEVELS = new Set(['controle', 'necessaire', 'non_planifie', 'perte_controle'])
const SOURCES        = new Set(['manual', 'timer', 'quick'])

/* Un bloc de plus de 24 h est une faute de saisie (mauvaise date, oubli
   d'arrêter le chronomètre pendant trois jours). On le refuse à
   l'écriture plutôt que de laisser 4 300 minutes fausser la semaine. */
const MAX_ENTRY_MINUTES = 24 * 60

const MAX_LABEL   = 120
const MAX_NOTES   = 2000
const MAX_CAT_KEY = 60

type Ok<T>  = { ok: true;  value: T }
type Err    = { ok: false; error: string }

function fail(error: string): Err { return { ok: false, error } }

function cleanText(v: unknown, max: number): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t ? t.slice(0, max) : null
}

/** ISO 8601 → Date, en refusant tout ce qui n'est pas une date réelle. */
function parseDate(v: unknown): Date | null {
  if (typeof v !== 'string' || !v.trim()) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

interface EntryInput {
  label:         string
  category_key:  string
  kind:          string
  control_level: string | null
  started_at:    Date
  ended_at:      Date | null
  notes:         string | null
  source:        string
}

/**
 * Valide un bloc complet (création manuelle ou correction).
 * `partial` : en PATCH, seuls les champs présents sont validés — mais
 * les bornes temporelles sont revérifiées ensemble par le caller, car
 * modifier une seule des deux dates peut inverser l'intervalle.
 */
function validateEntry(body: any): Ok<EntryInput> | Err {
  const label = cleanText(body?.label, MAX_LABEL)
  if (!label) return fail('Le nom de l\'activité est obligatoire')

  const category_key = cleanText(body?.category_key, MAX_CAT_KEY)
  if (!category_key) return fail('La catégorie est obligatoire')

  const kind = typeof body?.kind === 'string' ? body.kind : ''
  if (!KINDS.has(kind)) return fail('Nature de temps invalide')

  const control_level =
    body?.control_level == null || body.control_level === ''
      ? null
      : String(body.control_level)
  if (control_level !== null && !CONTROL_LEVELS.has(control_level)) {
    return fail('Niveau de contrôle invalide')
  }

  const started_at = parseDate(body?.started_at)
  if (!started_at) return fail('Heure de début invalide')

  const ended_at = body?.ended_at == null || body.ended_at === '' ? null : parseDate(body.ended_at)
  if (body?.ended_at != null && body.ended_at !== '' && !ended_at) {
    return fail('Heure de fin invalide')
  }

  const span = checkSpan(started_at, ended_at)
  if (span) return fail(span)

  const source = typeof body?.source === 'string' && SOURCES.has(body.source) ? body.source : 'manual'

  return {
    ok: true,
    value: {
      label, category_key, kind, control_level,
      started_at, ended_at,
      notes: cleanText(body?.notes, MAX_NOTES),
      source,
    },
  }
}

/** Message d'erreur si l'intervalle est inversé ou déraisonnable, sinon null. */
function checkSpan(start: Date, end: Date | null): string | null {
  if (!end) return null
  const minutes = (end.getTime() - start.getTime()) / 60000
  if (minutes <= 0)  return 'La fin doit être après le début'
  if (minutes > MAX_ENTRY_MINUTES) return 'Un bloc ne peut pas dépasser 24 heures'
  return null
}

/* ════════════════════════════════════════════════════════════════════
   BLOCS DE TEMPS
   ════════════════════════════════════════════════════════════════════ */

/* ── GET /api/time/entries?from=&to=&limit= ──────────────────────────
   Fenêtre par défaut : 60 jours glissants — de quoi calculer la semaine
   en cours, la comparer à la précédente et faire tourner la détection
   de schémas, sans rapatrier des années d'historique. */
router.get('/entries', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const userId   = req.user!.userId

  const to   = parseDate(req.query.to)   ?? new Date()
  const from = parseDate(req.query.from) ?? new Date(to.getTime() - 60 * 24 * 3600 * 1000)
  const limit = Math.min(Math.max(Number(req.query.limit) || 2000, 1), 5000)

  try {
    /* `ended_at IS NULL` (chronomètre en cours) est renvoyé aussi : le
       front affiche le temps qui court. D'où le OR sur les bornes. */
    const rows = await tenantQuery(
      tenantId,
      `SELECT * FROM time_entries
        WHERE tenant_id = $1 AND user_id = $2
          AND (ended_at IS NULL OR (started_at >= $3 AND started_at <= $4))
        ORDER BY started_at DESC
        LIMIT $5`,
      [tenantId, userId, from.toISOString(), to.toISOString(), limit]
    )
    res.json(rows)
  } catch (err: any) {
    logger.error('[GET /api/time/entries]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/time/entries ──────────────────────────────────────────
   Saisie complète (« Enregistrer une distraction ») ou bloc déjà terminé
   posé après coup. Pour démarrer un chronomètre, voir POST /start. */
router.post('/entries', async (req: Request, res: Response) => {
  const parsed = validateEntry(req.body)
  if (!parsed.ok) return res.status(400).json({ error: parsed.error })
  const e = parsed.value

  const tenantId = req.user!.tenantId
  const userId   = req.user!.userId

  try {
    /* Un bloc sans fin créé par cette route serait un second chronomètre
       silencieux. Le refus est explicite plutôt que de laisser l'index
       unique renvoyer une 23505 illisible. */
    if (!e.ended_at) {
      const running = await tenantQueryOne(
        tenantId,
        `SELECT id FROM time_entries WHERE tenant_id = $1 AND user_id = $2 AND ended_at IS NULL`,
        [tenantId, userId]
      )
      if (running) {
        return res.status(409).json({ error: 'Un chronomètre est déjà en cours' })
      }
    }

    const row = await tenantQueryOne(
      tenantId,
      `INSERT INTO time_entries
         (tenant_id, user_id, label, category_key, kind, control_level,
          started_at, ended_at, notes, source)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING *`,
      [
        tenantId, userId, e.label, e.category_key, e.kind, e.control_level,
        e.started_at.toISOString(), e.ended_at?.toISOString() ?? null,
        e.notes, e.source,
      ]
    )
    res.status(201).json(row)
  } catch (err: any) {
    logger.error('[POST /api/time/entries]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── PATCH /api/time/entries/:id ─────────────────────────────────────
   Correction a posteriori — c'est le geste le plus fréquent du module :
   « en fait ce film était planifié, ce n'est pas du temps perdu ». */
router.patch('/entries/:id', async (req: Request, res: Response) => {
  const { id } = req.params
  const tenantId = req.user!.tenantId
  const userId   = req.user!.userId

  try {
    const current = await tenantQueryOne<any>(
      tenantId,
      `SELECT * FROM time_entries WHERE id = $1 AND tenant_id = $2 AND user_id = $3`,
      [id, tenantId, userId]
    )
    if (!current) return res.status(404).json({ error: 'Bloc introuvable' })

    const sets: string[] = []
    const vals: unknown[] = []
    const push = (col: string, val: unknown) => { vals.push(val); sets.push(`${col} = $${vals.length}`) }

    if (req.body.label !== undefined) {
      const label = cleanText(req.body.label, MAX_LABEL)
      if (!label) return res.status(400).json({ error: 'Le nom de l\'activité est obligatoire' })
      push('label', label)
    }
    if (req.body.category_key !== undefined) {
      const cat = cleanText(req.body.category_key, MAX_CAT_KEY)
      if (!cat) return res.status(400).json({ error: 'La catégorie est obligatoire' })
      push('category_key', cat)
    }
    if (req.body.kind !== undefined) {
      if (!KINDS.has(req.body.kind)) return res.status(400).json({ error: 'Nature de temps invalide' })
      push('kind', req.body.kind)
    }
    if (req.body.control_level !== undefined) {
      const cl = req.body.control_level == null || req.body.control_level === '' ? null : String(req.body.control_level)
      if (cl !== null && !CONTROL_LEVELS.has(cl)) return res.status(400).json({ error: 'Niveau de contrôle invalide' })
      push('control_level', cl)
    }
    if (req.body.notes !== undefined) push('notes', cleanText(req.body.notes, MAX_NOTES))

    /* Les deux bornes sont vérifiées ENSEMBLE, en mélangeant la valeur
       envoyée et celle déjà en base : ne valider que le champ modifié
       laisserait passer une fin antérieure au début existant. */
    let nextStart = new Date(current.started_at)
    let nextEnd   = current.ended_at ? new Date(current.ended_at) : null

    if (req.body.started_at !== undefined) {
      const d = parseDate(req.body.started_at)
      if (!d) return res.status(400).json({ error: 'Heure de début invalide' })
      nextStart = d
      push('started_at', d.toISOString())
    }
    if (req.body.ended_at !== undefined) {
      if (req.body.ended_at == null || req.body.ended_at === '') {
        nextEnd = null
        push('ended_at', null)
      } else {
        const d = parseDate(req.body.ended_at)
        if (!d) return res.status(400).json({ error: 'Heure de fin invalide' })
        nextEnd = d
        push('ended_at', d.toISOString())
      }
    }
    const span = checkSpan(nextStart, nextEnd)
    if (span) return res.status(400).json({ error: span })

    /* Rouvrir un bloc terminé (ended_at → null) recréerait un second
       chronomètre si un autre tourne déjà. */
    if (current.ended_at && nextEnd === null) {
      const running = await tenantQueryOne(
        tenantId,
        `SELECT id FROM time_entries
          WHERE tenant_id = $1 AND user_id = $2 AND ended_at IS NULL AND id <> $3`,
        [tenantId, userId, id]
      )
      if (running) return res.status(409).json({ error: 'Un chronomètre est déjà en cours' })
    }

    if (!sets.length) return res.status(400).json({ error: 'Aucun champ à mettre à jour' })

    vals.push(id, tenantId, userId)
    const row = await tenantQueryOne(
      tenantId,
      `UPDATE time_entries SET ${sets.join(', ')}
        WHERE id = $${vals.length - 2} AND tenant_id = $${vals.length - 1} AND user_id = $${vals.length}
        RETURNING *`,
      vals
    )
    res.json(row)
  } catch (err: any) {
    logger.error('[PATCH /api/time/entries]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── DELETE /api/time/entries/:id ────────────────────────────────── */
router.delete('/entries/:id', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const row = await tenantQueryOne(
      tenantId,
      `DELETE FROM time_entries WHERE id = $1 AND tenant_id = $2 AND user_id = $3 RETURNING id`,
      [req.params.id, tenantId, req.user!.userId]
    )
    if (!row) return res.status(404).json({ error: 'Bloc introuvable' })
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[DELETE /api/time/entries]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ════════════════════════════════════════════════════════════════════
   CHRONOMÈTRE
   ════════════════════════════════════════════════════════════════════ */

/* ── GET /api/time/running ───────────────────────────────────────── */
router.get('/running', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const row = await tenantQueryOne(
      tenantId,
      `SELECT * FROM time_entries
        WHERE tenant_id = $1 AND user_id = $2 AND ended_at IS NULL
        LIMIT 1`,
      [tenantId, req.user!.userId]
    )
    res.json(row)
  } catch (err: any) {
    logger.error('[GET /api/time/running]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/time/start ────────────────────────────────────────────
   Démarre un chronomètre. S'il en existe déjà un, il est ARRÊTÉ à
   l'instant présent puis le nouveau démarre — les deux dans la même
   transaction. Autrement dit : passer d'une activité à l'autre est un
   seul geste, et on ne peut jamais perdre le bloc précédent.

   Un chronomètre resté ouvert plus de 24 h est fermé à started_at + 24 h
   (le maximum accepté par checkSpan) : sans ce plafond, un « Start »
   oublié le vendredi soir écraserait tout le bilan de la semaine. */
router.post('/start', async (req: Request, res: Response) => {
  const label = cleanText(req.body?.label, MAX_LABEL)
  if (!label) return res.status(400).json({ error: 'Le nom de l\'activité est obligatoire' })
  const category_key = cleanText(req.body?.category_key, MAX_CAT_KEY)
  if (!category_key) return res.status(400).json({ error: 'La catégorie est obligatoire' })
  const kind = typeof req.body?.kind === 'string' ? req.body.kind : ''
  if (!KINDS.has(kind)) return res.status(400).json({ error: 'Nature de temps invalide' })

  const control_level =
    req.body?.control_level == null || req.body.control_level === '' ? null : String(req.body.control_level)
  if (control_level !== null && !CONTROL_LEVELS.has(control_level)) {
    return res.status(400).json({ error: 'Niveau de contrôle invalide' })
  }
  const notes = cleanText(req.body?.notes, MAX_NOTES)

  const tenantId = req.user!.tenantId
  const userId   = req.user!.userId

  try {
    const result = await tenantTransaction(tenantId, async (client) => {
      const prev = await client.query(
        `SELECT id, started_at FROM time_entries
          WHERE tenant_id = $1 AND user_id = $2 AND ended_at IS NULL
          FOR UPDATE`,
        [tenantId, userId]
      )

      const now = new Date()
      let stopped = null
      if (prev.rows[0]) {
        const startedAt = new Date(prev.rows[0].started_at)
        const capped = new Date(startedAt.getTime() + MAX_ENTRY_MINUTES * 60000)
        const endAt = now.getTime() > capped.getTime() ? capped : now
        const upd = await client.query(
          `UPDATE time_entries SET ended_at = $1 WHERE id = $2 RETURNING *`,
          [endAt.toISOString(), prev.rows[0].id]
        )
        stopped = upd.rows[0] ?? null
      }

      const ins = await client.query(
        `INSERT INTO time_entries
           (tenant_id, user_id, label, category_key, kind, control_level, started_at, notes, source)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'timer')
         RETURNING *`,
        [tenantId, userId, label, category_key, kind, control_level, now.toISOString(), notes]
      )
      return { running: ins.rows[0], stopped }
    })

    res.status(201).json(result)
  } catch (err: any) {
    logger.error('[POST /api/time/start]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/time/stop ─────────────────────────────────────────────
   Arrête le chronomètre en cours. Le niveau de contrôle et la nature
   peuvent être précisés à ce moment-là : c'est en arrêtant qu'on sait
   honnêtement si c'était choisi ou subi. */
router.post('/stop', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const userId   = req.user!.userId

  const kind = req.body?.kind
  if (kind !== undefined && !KINDS.has(kind)) {
    return res.status(400).json({ error: 'Nature de temps invalide' })
  }
  const control_level = req.body?.control_level
  if (control_level !== undefined && control_level !== null && control_level !== ''
      && !CONTROL_LEVELS.has(control_level)) {
    return res.status(400).json({ error: 'Niveau de contrôle invalide' })
  }

  try {
    const running = await tenantQueryOne<any>(
      tenantId,
      `SELECT * FROM time_entries
        WHERE tenant_id = $1 AND user_id = $2 AND ended_at IS NULL LIMIT 1`,
      [tenantId, userId]
    )
    if (!running) return res.status(404).json({ error: 'Aucun chronomètre en cours' })

    const startedAt = new Date(running.started_at)
    const capped = new Date(startedAt.getTime() + MAX_ENTRY_MINUTES * 60000)
    const now = new Date()
    const endAt = now.getTime() > capped.getTime() ? capped : now

    const sets = ['ended_at = $1']
    const vals: unknown[] = [endAt.toISOString()]
    if (kind !== undefined) { vals.push(kind); sets.push(`kind = $${vals.length}`) }
    if (control_level !== undefined) {
      vals.push(control_level === '' ? null : control_level)
      sets.push(`control_level = $${vals.length}`)
    }
    if (req.body?.notes !== undefined) {
      vals.push(cleanText(req.body.notes, MAX_NOTES))
      sets.push(`notes = $${vals.length}`)
    }
    vals.push(running.id)

    const row = await tenantQueryOne(
      tenantId,
      `UPDATE time_entries SET ${sets.join(', ')} WHERE id = $${vals.length} RETURNING *`,
      vals
    )
    res.json(row)
  } catch (err: any) {
    logger.error('[POST /api/time/stop]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── DELETE /api/time/running ────────────────────────────────────────
   Annule le chronomètre en cours sans rien enregistrer (démarré par
   erreur). Distinct de /stop, qui lui conserve le bloc. */
router.delete('/running', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const row = await tenantQueryOne(
      tenantId,
      `DELETE FROM time_entries
        WHERE tenant_id = $1 AND user_id = $2 AND ended_at IS NULL
        RETURNING id`,
      [tenantId, req.user!.userId]
    )
    if (!row) return res.status(404).json({ error: 'Aucun chronomètre en cours' })
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[DELETE /api/time/running]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ════════════════════════════════════════════════════════════════════
   OBJECTIFS HEBDOMADAIRES
   ════════════════════════════════════════════════════════════════════ */

router.get('/goals', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const rows = await tenantQuery(
      tenantId,
      `SELECT * FROM time_goals WHERE tenant_id = $1 AND user_id = $2 ORDER BY category_key`,
      [tenantId, req.user!.userId]
    )
    res.json(rows)
  } catch (err: any) {
    logger.error('[GET /api/time/goals]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── PUT /api/time/goals ─────────────────────────────────────────────
   Remplace l'ensemble des plafonds. L'écran envoie la liste complète ;
   ce qui n'y figure plus est supprimé. Tout dans une transaction, sinon
   un objectif supprimé côté écran mais resté en base continuerait de
   pénaliser le score. */
router.put('/goals', async (req: Request, res: Response) => {
  const raw = Array.isArray(req.body?.goals) ? req.body.goals : null
  if (!raw) return res.status(400).json({ error: 'Liste d\'objectifs attendue' })
  if (raw.length > 60) return res.status(400).json({ error: 'Trop d\'objectifs' })

  const goals: { category_key: string; max_minutes_week: number }[] = []
  for (const g of raw) {
    const key = cleanText(g?.category_key, MAX_CAT_KEY)
    if (!key) return res.status(400).json({ error: 'Catégorie manquante dans un objectif' })
    const minutes = Math.round(Number(g?.max_minutes_week))
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 10080) {
      return res.status(400).json({ error: `Plafond invalide pour « ${key} »` })
    }
    goals.push({ category_key: key, max_minutes_week: minutes })
  }

  const tenantId = req.user!.tenantId
  const userId   = req.user!.userId

  try {
    const rows = await tenantTransaction(tenantId, async (client) => {
      const keys = goals.map(g => g.category_key)
      await client.query(
        `DELETE FROM time_goals
          WHERE tenant_id = $1 AND user_id = $2
            AND NOT (category_key = ANY($3::text[]))`,
        [tenantId, userId, keys]
      )
      for (const g of goals) {
        await client.query(
          `INSERT INTO time_goals (tenant_id, user_id, category_key, max_minutes_week)
           VALUES ($1,$2,$3,$4)
           ON CONFLICT (tenant_id, user_id, category_key)
           DO UPDATE SET max_minutes_week = EXCLUDED.max_minutes_week`,
          [tenantId, userId, g.category_key, g.max_minutes_week]
        )
      }
      const out = await client.query(
        `SELECT * FROM time_goals WHERE tenant_id = $1 AND user_id = $2 ORDER BY category_key`,
        [tenantId, userId]
      )
      return out.rows
    })
    res.json(rows)
  } catch (err: any) {
    logger.error('[PUT /api/time/goals]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ════════════════════════════════════════════════════════════════════
   RÉGLAGES PERSONNELS
   ════════════════════════════════════════════════════════════════════ */

const DEFAULT_SETTINGS = {
  work_start_hour: 9,
  work_end_hour: 18,
  work_days: [1, 2, 3, 4, 5, 6],
  alert_threshold_min: 45,
  alerts_enabled: true,
  weekly_high_value_hours: 30,
  reminder_enabled: true,
  reminder_hour: 22,
}

/* Renvoie les réglages, ou les valeurs par défaut si la personne n'a
   jamais ouvert l'écran — le front n'a donc jamais à gérer le cas null. */
router.get('/settings', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const row = await tenantQueryOne(
      tenantId,
      `SELECT * FROM time_settings WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, req.user!.userId]
    )
    res.json(row ?? { ...DEFAULT_SETTINGS, tenant_id: tenantId, user_id: req.user!.userId })
  } catch (err: any) {
    logger.error('[GET /api/time/settings]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.put('/settings', async (req: Request, res: Response) => {
  const b = req.body ?? {}

  const intIn = (v: unknown, min: number, max: number, fallback: number): number | null => {
    if (v === undefined || v === null || v === '') return fallback
    const n = Math.round(Number(v))
    if (!Number.isFinite(n) || n < min || n > max) return null
    return n
  }

  const work_start_hour = intIn(b.work_start_hour, 0, 23, DEFAULT_SETTINGS.work_start_hour)
  const work_end_hour   = intIn(b.work_end_hour,   1, 24, DEFAULT_SETTINGS.work_end_hour)
  const alert_threshold_min = intIn(b.alert_threshold_min, 5, 240, DEFAULT_SETTINGS.alert_threshold_min)
  const weekly_high_value_hours = intIn(b.weekly_high_value_hours, 1, 168, DEFAULT_SETTINGS.weekly_high_value_hours)
  const reminder_hour = intIn(b.reminder_hour, 0, 23, DEFAULT_SETTINGS.reminder_hour)

  if (work_start_hour === null || work_end_hour === null || reminder_hour === null
      || alert_threshold_min === null || weekly_high_value_hours === null) {
    return res.status(400).json({ error: 'Valeur de réglage hors limites' })
  }
  if (work_end_hour <= work_start_hour) {
    return res.status(400).json({ error: 'La fin de journée doit être après le début' })
  }

  const rawDays: unknown[] = Array.isArray(b.work_days) ? b.work_days : DEFAULT_SETTINGS.work_days
  const parsedDays = rawDays
    .map(d => Math.round(Number(d)))
    .filter(d => Number.isInteger(d) && d >= 1 && d <= 7)
  const work_days = [...new Set(parsedDays)].sort((x, y) => x - y)
  if (!work_days.length) return res.status(400).json({ error: 'Au moins un jour travaillé est requis' })

  const alerts_enabled   = b.alerts_enabled   === undefined ? true : Boolean(b.alerts_enabled)
  const reminder_enabled = b.reminder_enabled === undefined ? true : Boolean(b.reminder_enabled)

  const tenantId = req.user!.tenantId
  try {
    const row = await tenantQueryOne(
      tenantId,
      `INSERT INTO time_settings
         (tenant_id, user_id, work_start_hour, work_end_hour, work_days,
          alert_threshold_min, alerts_enabled, weekly_high_value_hours,
          reminder_enabled, reminder_hour)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (tenant_id, user_id) DO UPDATE SET
         work_start_hour = EXCLUDED.work_start_hour,
         work_end_hour   = EXCLUDED.work_end_hour,
         work_days       = EXCLUDED.work_days,
         alert_threshold_min = EXCLUDED.alert_threshold_min,
         alerts_enabled      = EXCLUDED.alerts_enabled,
         weekly_high_value_hours = EXCLUDED.weekly_high_value_hours,
         reminder_enabled = EXCLUDED.reminder_enabled,
         reminder_hour    = EXCLUDED.reminder_hour
       RETURNING *`,
      [
        tenantId, req.user!.userId, work_start_hour, work_end_hour, work_days,
        alert_threshold_min, alerts_enabled, weekly_high_value_hours,
        reminder_enabled, reminder_hour,
      ]
    )
    res.json(row)
  } catch (err: any) {
    logger.error('[PUT /api/time/settings]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
