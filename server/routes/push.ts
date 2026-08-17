/**
 * Abonnements Web Push — /api/push
 *
 * Le navigateur crée l'abonnement lui-même (via le service worker) puis
 * le dépose ici. Le serveur n'a qu'un rôle de coffre : il range
 * l'endpoint et les deux clés, associés à la personne connectée.
 *
 * ── Pourquoi un UPSERT sur l'endpoint ──────────────────────────────
 * Le même navigateur peut renvoyer son abonnement à chaque ouverture de
 * l'app (c'est même recommandé : l'abonnement peut être renouvelé par
 * le navigateur). Sans UPSERT, on accumulerait des doublons et la
 * personne recevrait la même notification cinq fois.
 *
 * Le changement de propriétaire est explicite : si deux comptes se
 * succèdent dans le même navigateur, l'abonnement suit le dernier
 * connecté — sinon l'ancien continuerait de recevoir les rappels d'une
 * personne qui n'utilise plus ce poste.
 */
import { Router, Request, Response, NextFunction } from 'express'
import { tenantQuery, tenantQueryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { logger } from '../lib/logger'
import {
  getVapidPublicKey, isPushConfigured, sendPushToUser,
  isAllowedPushEndpoint, MAX_DEVICES_PER_USER,
} from '../lib/webPush'

const router = Router()

/* La clé publique n'est pas un secret : le navigateur en a besoin AVANT
   de pouvoir s'abonner. Elle reste derrière l'authentification, comme
   le reste de l'API. */
router.use(requireAuth)

router.use((req: Request, res: Response, next: NextFunction) => {
  if (req.user?.role === 'team_member') {
    return res.status(403).json({ error: 'Non disponible pour les comptes membres' })
  }
  next()
})

/* ── GET /api/push/public-key ─────────────────────────────────────── */
router.get('/public-key', (_req: Request, res: Response) => {
  res.json({ enabled: isPushConfigured(), publicKey: getVapidPublicKey() })
})

/* ── POST /api/push/subscribe ─────────────────────────────────────── */
router.post('/subscribe', async (req: Request, res: Response) => {
  const sub = req.body?.subscription ?? req.body
  const endpoint = typeof sub?.endpoint === 'string' ? sub.endpoint.trim() : ''
  const p256dh   = typeof sub?.keys?.p256dh === 'string' ? sub.keys.p256dh : ''
  const auth     = typeof sub?.keys?.auth   === 'string' ? sub.keys.auth   : ''

  /* L'endpoint est une URL CHOISIE PAR LE CLIENT vers laquelle le
     serveur émettra ensuite des requêtes. Seuls les hôtes des services
     de push réellement existants sont acceptés : sans cette liste
     blanche, la route est une SSRF authentifiée doublée d'un scanner de
     réseau interne (cf. server/lib/webPush.ts). */
  if (!endpoint || endpoint.length > 2000 || !isAllowedPushEndpoint(endpoint)) {
    return res.status(400).json({ error: 'Abonnement invalide' })
  }
  if (!p256dh || !auth) {
    return res.status(400).json({ error: 'Clés d\'abonnement manquantes' })
  }

  const label = typeof req.body?.label === 'string' ? req.body.label.slice(0, 80) : null
  const ua = String(req.headers['user-agent'] ?? '').slice(0, 300)

  const tenantId = req.user!.tenantId
  try {
    const row = await tenantQueryOne<{ id: string }>(tenantId,
      `INSERT INTO push_subscriptions
         (tenant_id, user_id, endpoint, p256dh, auth, user_agent, label)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (endpoint) DO UPDATE SET
         tenant_id    = EXCLUDED.tenant_id,
         user_id      = EXCLUDED.user_id,
         p256dh       = EXCLUDED.p256dh,
         auth         = EXCLUDED.auth,
         user_agent   = EXCLUDED.user_agent,
         label        = COALESCE(EXCLUDED.label, push_subscriptions.label),
         last_seen_at = NOW()
       RETURNING id`,
      [tenantId, req.user!.userId, endpoint, p256dh, auth, ua, label]
    )

    /* Plafond d'appareils : on garde les plus récemment vus. Sans lui,
       un compte pourrait accumuler des milliers d'abonnements et faire
       de chaque rappel une rafale de requêtes sortantes. */
    await tenantQuery(tenantId,
      `DELETE FROM push_subscriptions
        WHERE tenant_id = $1 AND user_id = $2
          AND id NOT IN (
            SELECT id FROM push_subscriptions
             WHERE tenant_id = $1 AND user_id = $2
             ORDER BY last_seen_at DESC
             LIMIT ${MAX_DEVICES_PER_USER}
          )`,
      [tenantId, req.user!.userId]
    ).catch(() => {})

    res.status(201).json({ success: true, id: row?.id })
  } catch (err: any) {
    logger.error('[POST /api/push/subscribe]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── POST /api/push/unsubscribe ───────────────────────────────────── */
router.post('/unsubscribe', async (req: Request, res: Response) => {
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : ''
  if (!endpoint) return res.status(400).json({ error: 'Endpoint manquant' })
  try {
    await tenantQuery(req.user!.tenantId,
      `DELETE FROM push_subscriptions
        WHERE endpoint = $1 AND tenant_id = $2 AND user_id = $3`,
      [endpoint, req.user!.tenantId, req.user!.userId]
    )
    res.json({ success: true })
  } catch (err: any) {
    logger.error('[POST /api/push/unsubscribe]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ── GET /api/push/devices ────────────────────────────────────────── */
router.get('/devices', async (req: Request, res: Response) => {
  try {
    const rows = await tenantQuery(req.user!.tenantId,
      `SELECT id, label, user_agent, created_at, last_seen_at
         FROM push_subscriptions
        WHERE tenant_id = $1 AND user_id = $2
        ORDER BY last_seen_at DESC`,
      [req.user!.tenantId, req.user!.userId]
    )
    res.json(rows)
  } catch (err: any) {
    logger.error('[GET /api/push/devices]', err?.code, err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* Un test par minute et par compte. Le test déclenche des requêtes
   sortantes ; sans cadence, il resterait un moyen commode de générer du
   trafic depuis le serveur. */
const TEST_COOLDOWN_MS = 60_000
const lastTestAt = new Map<string, number>()

/* ── POST /api/push/test ──────────────────────────────────────────────
   « Envoie-moi une notification maintenant » : c'est le seul moyen de
   vérifier toute la chaîne (autorisation navigateur → abonnement →
   VAPID → service worker) sans attendre l'échéance d'une tâche. */
router.post('/test', async (req: Request, res: Response) => {
  if (!isPushConfigured()) {
    return res.status(503).json({ error: 'Web Push non configuré sur le serveur' })
  }
  const key = `${req.user!.tenantId}:${req.user!.userId}`
  const previous = lastTestAt.get(key) ?? 0
  if (Date.now() - previous < TEST_COOLDOWN_MS) {
    return res.status(429).json({ error: 'Patiente une minute avant un nouveau test' })
  }
  lastTestAt.set(key, Date.now())

  try {
    const delivered = await sendPushToUser(req.user!.tenantId, req.user!.userId, {
      title: 'Notification de test ✅',
      body:  'Si tu lis ceci, les rappels de tâches t\'atteindront même app fermée.',
      tag:   'push-test',
    })
    if (!delivered) {
      return res.status(404).json({ error: 'Aucun appareil abonné sur ce compte' })
    }
    res.json({ success: true, delivered })
  } catch (err: any) {
    logger.error('[POST /api/push/test]', err?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
