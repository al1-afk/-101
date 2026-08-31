/**
 * ═══════════════════════════════════════════════════════════════════
 *  CENTRE DE SÉCURITÉ — API  (/api/security)
 * ═══════════════════════════════════════════════════════════════════
 *
 * Répond à : combien d'utilisateurs sont en ligne, qui est connecté, qui
 * a tenté de se connecter, quelles activités suspectes ont été
 * détectées, quelles requêtes ont été bloquées, et quelle IP / quel
 * compte est concerné.
 *
 * ── Contrôle d'accès ───────────────────────────────────────────────
 * Toutes les routes de lecture passent par `requireAuth` +
 * `requireSecurityMonitoring` (admin OU SECURITY_MONITORING_READ,
 * vérifié en base à chaque appel). Seul `/heartbeat` est ouvert à tout
 * utilisateur authentifié : il n'écrit que SA propre présence.
 *
 * ── Cloisonnement des données ──────────────────────────────────────
 * Ces tables n'ont volontairement pas de RLS (voir migration 080) :
 * l'isolation est donc appliquée ICI, dans chaque requête, à partir du
 * `tenantId` du JWT — jamais d'un paramètre client.
 *
 * Règle pour les lignes sans tenant (`tenant_id IS NULL`) : elles sont
 * visibles par tout administrateur, et c'est volontaire — ce sont les
 * événements NON attribuables (échec de connexion sur un email
 * inexistant, rate-limit sur une IP anonyme). Elles ne peuvent pas
 * contenir de donnée d'un autre espace : dès qu'un email correspond à un
 * compte réel, l'événement est attribué au tenant de ce compte
 * (routes/auth.ts) et retombe donc sous le filtre `tenant_id = $1`.
 *
 * ── Confidentialité ────────────────────────────────────────────────
 * Aucune de ces routes ne renvoie de mot de passe, de token, de hash de
 * token ni d'en-tête Authorization : ces colonnes n'existent pas dans
 * les tables lues, et les `SELECT` sont explicites (jamais `SELECT *`).
 */
import { Router, Request, Response } from 'express'
import { query, queryOne } from '../db/pool'
import { requireAuth } from '../middleware/auth'
import { requireSecurityMonitoring } from '../middleware/securityMonitor'
import { logger } from '../lib/logger'
import { getClientIp, proxyDiagnostics } from '../lib/clientIp'
import {
  touchPresence, endPresence, trackSecurityEvent,
} from '../lib/securityEvents'
import {
  clampLimit, clampOffset, periodToHours, normalizeIp, sanitizeUserAgent,
  presenceState, isSecurityEventType, SECURITY_EVENT_TYPES, SEVERITIES,
  EVENT_STATUSES, PRESENCE_ONLINE_SECONDS, PRESENCE_IDLE_SECONDS,
} from '../lib/securityCore'

const router = Router()

/* ═════════════════════════════════════════════════════════════════
   PRÉSENCE — heartbeat (tout utilisateur authentifié)

   Pourquoi un heartbeat plutôt que « JWT valide = en ligne » : un access
   token vit 1 h. Sans battement, un utilisateur parti déjeuner, un
   onglet fermé ou un poste éteint resteraient « en ligne » pendant une
   heure — la réponse à « qui utilise la plateforme ? » serait fausse.
   ═════════════════════════════════════════════════════════════════ */

router.post('/heartbeat', requireAuth, async (req: Request, res: Response) => {
  const { userId, tenantId } = req.user!
  const sessionKey = String(req.body?.sessionKey ?? '')
  const ok = await touchPresence({
    userId, tenantId, sessionKey,
    ip:        getClientIp(req),
    userAgent: sanitizeUserAgent(req.headers['user-agent']),
  })
  if (!ok) return res.status(400).json({ error: 'Session invalide' })
  res.json({ ok: true, intervalMs: 60_000 })
})

router.post('/heartbeat/end', requireAuth, async (req: Request, res: Response) => {
  await endPresence(req.user!.userId, String(req.body?.sessionKey ?? '') || null)
  res.json({ ok: true })
})

/* ═════════════════════════════════════════════════════════════════
   À PARTIR D'ICI : réservé admin / SECURITY_MONITORING_READ
   ═════════════════════════════════════════════════════════════════ */
router.use(requireAuth, requireSecurityMonitoring)

/* Fenêtre de visibilité : le tenant + les événements non attribuables. */
const TENANT_SCOPE = `(se.tenant_id = $1 OR se.tenant_id IS NULL)`

/* ─────────────────────────────────────────────────────────────────
   1. UTILISATEURS EN LIGNE
   ───────────────────────────────────────────────────────────────── */
router.get('/online', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const rows = await query<{
      user_id: string; name: string; email: string; role: string
      login_at: string; last_seen_at: string; sessions: number
      ip_address: string | null; user_agent: string | null
      active_tokens: number
    }>(
      `SELECT p.user_id,
              COALESCE(u.name, u.email)                         AS name,
              u.email,
              COALESCE(tu.role, 'inconnu')                      AS role,
              MIN(p.login_at)                                   AS login_at,
              MAX(p.last_seen_at)                               AS last_seen_at,
              COUNT(*)::int                                     AS sessions,
              (array_agg(p.ip_address::text ORDER BY p.last_seen_at DESC))[1] AS ip_address,
              (array_agg(p.user_agent      ORDER BY p.last_seen_at DESC))[1] AS user_agent,
              (SELECT COUNT(*)::int FROM refresh_tokens rt
                WHERE rt.user_id = p.user_id AND rt.tenant_id = $1
                  AND rt.revoked = false AND rt.expires_at > NOW())          AS active_tokens
         FROM user_presence p
         JOIN users u        ON u.id = p.user_id
         LEFT JOIN tenant_users tu
                ON tu.user_id = p.user_id AND tu.tenant_id = p.tenant_id
        WHERE p.tenant_id = $1
          AND p.ended_at IS NULL
          AND p.last_seen_at > NOW() - ($2 || ' seconds')::interval
        GROUP BY p.user_id, u.name, u.email, tu.role
        ORDER BY MAX(p.last_seen_at) DESC
        LIMIT 200`,
      [tenantId, String(PRESENCE_IDLE_SECONDS)]
    )

    const now = new Date()
    const users = rows.map(r => ({
      ...r,
      /* L'état est recalculé côté serveur : le client n'a pas à décider
         qui est « en ligne ». */
      state: presenceState(r.last_seen_at, now),
    }))

    res.json({
      onlineCount: users.filter(u => u.state === 'online').length,
      idleCount:   users.filter(u => u.state === 'idle').length,
      thresholds:  { onlineSeconds: PRESENCE_ONLINE_SECONDS, idleSeconds: PRESENCE_IDLE_SECONDS },
      users,
    })
  } catch (err: unknown) {
    logger.error('[security/online]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ─────────────────────────────────────────────────────────────────
   2. DASHBOARD — cartes + graphiques
   ───────────────────────────────────────────────────────────────── */
router.get('/overview', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const hours    = periodToHours(req.query.period ?? '24h')

  try {
    /* Les tentatives de connexion sont rattachées au tenant par l'email :
       login_attempts est une table technique historique sans tenant_id.
       On retient les tentatives visant un compte DE CE TENANT, plus
       celles visant un email inexistant (non attribuables). */
    const loginScope = `
      LEFT JOIN users u        ON u.email = la.email
      LEFT JOIN tenant_users tu ON tu.user_id = u.id AND tu.tenant_id = $1
      WHERE la.attempted_at > NOW() - ($2 || ' hours')::interval
        AND (tu.user_id IS NOT NULL OR u.id IS NULL)`

    const [cards, loginSeries, eventSeries, topIps, topEvents] = await Promise.all([
      queryOne<{
        online_users: number; failed_logins: number; suspicious: number
        blocked: number; severe: number; open_alerts: number
      }>(
        `SELECT
           (SELECT COUNT(DISTINCT user_id)::int FROM user_presence
             WHERE tenant_id = $1 AND ended_at IS NULL
               AND last_seen_at > NOW() - ($3 || ' seconds')::interval)      AS online_users,
           (SELECT COUNT(*)::int FROM login_attempts la ${loginScope}
              AND la.success = false)                                        AS failed_logins,
           (SELECT COUNT(*)::int FROM security_events se
             WHERE ${TENANT_SCOPE} AND se.status IN ('suspicious','confirmed')
               AND se.created_at > NOW() - ($2 || ' hours')::interval)       AS suspicious,
           (SELECT COUNT(*)::int FROM security_events se
             WHERE ${TENANT_SCOPE} AND se.status = 'blocked'
               AND se.created_at > NOW() - ($2 || ' hours')::interval)       AS blocked,
           (SELECT COUNT(*)::int FROM security_events se
             WHERE ${TENANT_SCOPE} AND se.severity IN ('high','critical')
               AND se.created_at > NOW() - ($2 || ' hours')::interval)       AS severe,
           (SELECT COUNT(*)::int FROM security_alerts
             WHERE (tenant_id = $1 OR tenant_id IS NULL) AND status = 'open') AS open_alerts`,
        [tenantId, String(hours), String(PRESENCE_ONLINE_SECONDS)]
      ),

      /* Connexions réussies / échouées par heure */
      query<{ bucket: string; success: number; failed: number }>(
        `WITH slots AS (
           SELECT generate_series(
             date_trunc('hour', NOW()) - ($2 || ' hours')::interval + INTERVAL '1 hour',
             date_trunc('hour', NOW()),
             INTERVAL '1 hour') AS bucket
         ),
         data AS (
           SELECT date_trunc('hour', la.attempted_at) AS bucket,
                  COUNT(*) FILTER (WHERE la.success)      ::int AS success,
                  COUNT(*) FILTER (WHERE NOT la.success)  ::int AS failed
             FROM login_attempts la ${loginScope}
            GROUP BY 1
         )
         SELECT s.bucket,
                COALESCE(d.success, 0) AS success,
                COALESCE(d.failed,  0) AS failed
           FROM slots s LEFT JOIN data d ON d.bucket = s.bucket
          ORDER BY s.bucket`,
        [tenantId, String(hours)]
      ),

      /* Événements de sécurité par heure, séparés par gravité */
      query<{ bucket: string; total: number; severe: number }>(
        `WITH slots AS (
           SELECT generate_series(
             date_trunc('hour', NOW()) - ($2 || ' hours')::interval + INTERVAL '1 hour',
             date_trunc('hour', NOW()),
             INTERVAL '1 hour') AS bucket
         ),
         data AS (
           SELECT date_trunc('hour', se.created_at) AS bucket,
                  COUNT(*)::int AS total,
                  COUNT(*) FILTER (WHERE se.severity IN ('high','critical'))::int AS severe
             FROM security_events se
            WHERE ${TENANT_SCOPE}
              AND se.created_at > NOW() - ($2 || ' hours')::interval
            GROUP BY 1
         )
         SELECT s.bucket,
                COALESCE(d.total, 0)  AS total,
                COALESCE(d.severe, 0) AS severe
           FROM slots s LEFT JOIN data d ON d.bucket = s.bucket
          ORDER BY s.bucket`,
        [tenantId, String(hours)]
      ),

      /* Top IP générant des événements non normaux */
      query<{ ip_address: string; events: number; severe: number; last_seen: string }>(
        `SELECT se.ip_address::text AS ip_address,
                COUNT(*)::int       AS events,
                COUNT(*) FILTER (WHERE se.severity IN ('high','critical'))::int AS severe,
                MAX(se.created_at)  AS last_seen
           FROM security_events se
          WHERE ${TENANT_SCOPE}
            AND se.ip_address IS NOT NULL
            AND se.status <> 'normal'
            AND se.created_at > NOW() - ($2 || ' hours')::interval
          GROUP BY se.ip_address
          ORDER BY events DESC
          LIMIT 10`,
        [tenantId, String(hours)]
      ),

      /* Répartition par type d'événement */
      query<{ event_type: string; count: number }>(
        `SELECT se.event_type, COUNT(*)::int AS count
           FROM security_events se
          WHERE ${TENANT_SCOPE}
            AND se.created_at > NOW() - ($2 || ' hours')::interval
          GROUP BY se.event_type
          ORDER BY count DESC
          LIMIT 12`,
        [tenantId, String(hours)]
      ),
    ])

    res.json({
      periodHours: hours,
      cards: cards ?? {
        online_users: 0, failed_logins: 0, suspicious: 0,
        blocked: 0, severe: 0, open_alerts: 0,
      },
      loginSeries,
      eventSeries,
      topIps,
      topEvents,
      /* Diagnostic proxy : permet de vérifier d'un coup d'œil que les IP
         affichées sont fiables derrière Traefik (§5). */
      proxy: proxyDiagnostics(req),
    })
  } catch (err: unknown) {
    logger.error('[security/overview]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ─────────────────────────────────────────────────────────────────
   3. HISTORIQUE DES CONNEXIONS

   Vue unifiée de trois sources déjà existantes (aucune duplication) :
     - login_attempts : succès / échec mot de passe
     - login_history  : parcours 2FA, appareil de confiance
     - security_events: déconnexion, refresh refusé, changement de mot
       de passe, compte désactivé, verrouillage…
   ───────────────────────────────────────────────────────────────── */
router.get('/logins', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const hours    = periodToHours(req.query.period ?? '7d')
  const limit    = clampLimit(req.query.limit, 50)
  const offset   = clampOffset(req.query.offset)
  const email    = typeof req.query.email === 'string' ? req.query.email.toLowerCase().slice(0, 160) : null
  const ip       = normalizeIp(req.query.ip)
  const outcome  = req.query.outcome === 'success' ? true
                 : req.query.outcome === 'failed'  ? false
                 : null

  try {
    const rows = await query(
      `WITH unified AS (
         /* 1. Tentatives mot de passe */
         SELECT la.attempted_at                                   AS created_at,
                CASE WHEN la.success THEN 'login_success' ELSE 'login_failed' END AS event,
                la.success                                        AS success,
                la.email                                          AS email,
                u.id                                              AS user_id,
                COALESCE(u.name, u.email)                         AS user_name,
                la.ip_address::text                               AS ip_address,
                NULL::text                                        AS user_agent,
                'password'                                        AS method,
                NULL::text                                        AS reason
           FROM login_attempts la
           LEFT JOIN users u         ON u.email  = la.email
           LEFT JOIN tenant_users tu ON tu.user_id = u.id AND tu.tenant_id = $1
          WHERE la.attempted_at > NOW() - ($2 || ' hours')::interval
            AND (tu.user_id IS NOT NULL OR u.id IS NULL)

         UNION ALL

         /* 2. Parcours 2FA / appareil de confiance */
         SELECT lh.created_at, lh.event, lh.success, lh.email, lh.user_id,
                COALESCE(u.name, u.email), lh.ip_address::text, lh.user_agent,
                lh.method, NULL::text
           FROM login_history lh
           LEFT JOIN users u ON u.id = lh.user_id
          WHERE lh.tenant_id = $1
            AND lh.created_at > NOW() - ($2 || ' hours')::interval

         UNION ALL

         /* 3. Événements de session / mot de passe */
         SELECT se.created_at, se.event_type,
                (se.status = 'normal'), se.email, se.user_id,
                COALESCE(u.name, u.email), se.ip_address::text, se.user_agent,
                'session', se.reason
           FROM security_events se
           LEFT JOIN users u ON u.id = se.user_id
          WHERE ${TENANT_SCOPE}
            AND se.created_at > NOW() - ($2 || ' hours')::interval
            AND se.event_type IN ('logout','refresh_rejected','token_reuse_detected',
                                  'password_changed','password_reset_completed',
                                  'account_disabled_login','login_blocked_lockout')
       )
       SELECT * FROM unified
        WHERE ($3::text IS NULL OR email = $3)
          AND ($4::inet IS NULL OR ip_address::inet = $4::inet)
          AND ($5::boolean IS NULL OR success = $5::boolean)
        ORDER BY created_at DESC
        LIMIT $6 OFFSET $7`,
      [tenantId, String(hours), email, ip, outcome, limit, offset]
    )
    res.json({ rows, limit, offset, hasMore: rows.length === limit })
  } catch (err: unknown) {
    logger.error('[security/logins]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ─────────────────────────────────────────────────────────────────
   4. ÉVÉNEMENTS DE SÉCURITÉ (table « activité récente » + filtres)
   ───────────────────────────────────────────────────────────────── */
router.get('/events', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const hours    = periodToHours(req.query.period ?? '24h')
  const limit    = clampLimit(req.query.limit, 50)
  const offset   = clampOffset(req.query.offset)
  const ip       = normalizeIp(req.query.ip)
  const userId   = typeof req.query.userId === 'string'
    && /^[0-9a-f-]{36}$/i.test(req.query.userId) ? req.query.userId : null
  /* Listes blanches : toute valeur hors catalogue est ignorée, jamais
     interpolée dans le SQL. */
  const severity = SEVERITIES.includes(req.query.severity as never)
    ? String(req.query.severity) : null
  const status   = EVENT_STATUSES.includes(req.query.status as never)
    ? String(req.query.status) : null
  const type     = isSecurityEventType(req.query.type) ? req.query.type : null

  try {
    const rows = await query(
      `SELECT se.id, se.created_at, se.event_type, se.severity, se.status,
              se.ip_address::text AS ip_address, se.user_agent,
              se.http_method, se.endpoint, se.http_status, se.reason,
              se.email, se.user_id, COALESCE(u.name, u.email) AS user_name,
              se.metadata
         FROM security_events se
         LEFT JOIN users u ON u.id = se.user_id
        WHERE ${TENANT_SCOPE}
          AND se.created_at > NOW() - ($2 || ' hours')::interval
          AND ($3::inet IS NULL OR se.ip_address = $3::inet)
          AND ($4::uuid IS NULL OR se.user_id    = $4::uuid)
          AND ($5::text IS NULL OR se.severity   = $5)
          AND ($6::text IS NULL OR se.status     = $6)
          AND ($7::text IS NULL OR se.event_type = $7)
        ORDER BY se.created_at DESC
        LIMIT $8 OFFSET $9`,
      [tenantId, String(hours), ip, userId, severity, status, type, limit, offset]
    )
    res.json({
      rows, limit, offset, hasMore: rows.length === limit,
      filters: { types: SECURITY_EVENT_TYPES, severities: SEVERITIES, statuses: EVENT_STATUSES },
    })
  } catch (err: unknown) {
    logger.error('[security/events]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ─────────────────────────────────────────────────────────────────
   5. DÉTAIL D'UNE IP
   ───────────────────────────────────────────────────────────────── */
router.get('/ip/:ip', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const ip = normalizeIp(req.params.ip)
  /* IP invalide → 400 : on ne laisse jamais une chaîne arbitraire
     atteindre un cast ::inet. */
  if (!ip) return res.status(400).json({ error: 'Adresse IP invalide' })
  const hours = periodToHours(req.query.period ?? '30d')

  try {
    const [summary, logins, users, endpoints, events] = await Promise.all([
      queryOne<{
        events: number; suspicious: number; blocked: number; severe: number
        first_seen: string | null; last_seen: string | null
      }>(
        `SELECT COUNT(*)::int                                                    AS events,
                COUNT(*) FILTER (WHERE se.status IN ('suspicious','confirmed'))::int AS suspicious,
                COUNT(*) FILTER (WHERE se.status = 'blocked')::int               AS blocked,
                COUNT(*) FILTER (WHERE se.severity IN ('high','critical'))::int  AS severe,
                MIN(se.created_at)                                               AS first_seen,
                MAX(se.created_at)                                               AS last_seen
           FROM security_events se
          WHERE ${TENANT_SCOPE}
            AND se.ip_address = $2::inet
            AND se.created_at > NOW() - ($3 || ' hours')::interval`,
        [tenantId, ip, String(hours)]
      ),
      queryOne<{ success: number; failed: number; first_seen: string | null; last_seen: string | null }>(
        `SELECT COUNT(*) FILTER (WHERE la.success)::int     AS success,
                COUNT(*) FILTER (WHERE NOT la.success)::int AS failed,
                MIN(la.attempted_at)                        AS first_seen,
                MAX(la.attempted_at)                        AS last_seen
           FROM login_attempts la
           LEFT JOIN users u         ON u.email = la.email
           LEFT JOIN tenant_users tu ON tu.user_id = u.id AND tu.tenant_id = $1
          WHERE la.ip_address = $2::inet
            AND la.attempted_at > NOW() - ($3 || ' hours')::interval
            AND (tu.user_id IS NOT NULL OR u.id IS NULL)`,
        [tenantId, ip, String(hours)]
      ),
      query<{ user_id: string; name: string; email: string; events: number; last_seen: string }>(
        `SELECT se.user_id,
                COALESCE(u.name, u.email) AS name,
                u.email,
                COUNT(*)::int             AS events,
                MAX(se.created_at)        AS last_seen
           FROM security_events se
           JOIN users u ON u.id = se.user_id
          WHERE ${TENANT_SCOPE}
            AND se.ip_address = $2::inet
            AND se.created_at > NOW() - ($3 || ' hours')::interval
          GROUP BY se.user_id, u.name, u.email
          ORDER BY events DESC
          LIMIT 20`,
        [tenantId, ip, String(hours)]
      ),
      query<{ endpoint: string; http_method: string; count: number }>(
        `SELECT COALESCE(se.endpoint, '—') AS endpoint,
                COALESCE(se.http_method, '—') AS http_method,
                COUNT(*)::int AS count
           FROM security_events se
          WHERE ${TENANT_SCOPE}
            AND se.ip_address = $2::inet
            AND se.created_at > NOW() - ($3 || ' hours')::interval
          GROUP BY se.endpoint, se.http_method
          ORDER BY count DESC
          LIMIT 20`,
        [tenantId, ip, String(hours)]
      ),
      query(
        `SELECT se.id, se.created_at, se.event_type, se.severity, se.status,
                se.endpoint, se.http_status, se.reason, se.email,
                COALESCE(u.name, u.email) AS user_name
           FROM security_events se
           LEFT JOIN users u ON u.id = se.user_id
          WHERE ${TENANT_SCOPE}
            AND se.ip_address = $2::inet
            AND se.created_at > NOW() - ($3 || ' hours')::interval
          ORDER BY se.created_at DESC
          LIMIT 50`,
        [tenantId, ip, String(hours)]
      ),
    ])

    res.json({ ip, periodHours: hours, summary, logins, users, endpoints, events })
  } catch (err: unknown) {
    logger.error('[security/ip]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ─────────────────────────────────────────────────────────────────
   6. ALERTES
   ───────────────────────────────────────────────────────────────── */
router.get('/alerts', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const limit  = clampLimit(req.query.limit, 50)
  const offset = clampOffset(req.query.offset)
  const status = ['open', 'acknowledged', 'resolved'].includes(String(req.query.status))
    ? String(req.query.status) : null

  try {
    const rows = await query(
      `SELECT a.id, a.alert_type, a.title, a.severity, a.status,
              a.ip_address::text AS ip_address, a.user_id,
              COALESCE(u.name, u.email) AS user_name,
              a.occurrences, a.first_seen_at, a.last_seen_at,
              a.cooldown_until, a.channel_state, a.metadata,
              a.acknowledged_at, COALESCE(ack.name, ack.email) AS acknowledged_by_name
         FROM security_alerts a
         LEFT JOIN users u   ON u.id   = a.user_id
         LEFT JOIN users ack ON ack.id = a.acknowledged_by
        WHERE (a.tenant_id = $1 OR a.tenant_id IS NULL)
          AND ($2::text IS NULL OR a.status = $2)
        ORDER BY
          array_position(ARRAY['critical','high','medium','low','info'], a.severity),
          a.last_seen_at DESC
        LIMIT $3 OFFSET $4`,
      [tenantId, status, limit, offset]
    )
    res.json({ rows, limit, offset, hasMore: rows.length === limit })
  } catch (err: unknown) {
    logger.error('[security/alerts]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* Acquittement — action administrative, elle-même journalisée. */
router.post('/alerts/:id/acknowledge', async (req: Request, res: Response) => {
  const { userId, tenantId } = req.user!
  const id = String(req.params.id)
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Identifiant invalide' })

  try {
    /* Le filtre tenant est DANS le UPDATE : sans lui, un admin pourrait
       acquitter l'alerte d'un autre espace en devinant un UUID (IDOR). */
    const row = await queryOne<{ id: string; alert_type: string }>(
      `UPDATE security_alerts
          SET status = 'acknowledged', acknowledged_by = $1, acknowledged_at = NOW()
        WHERE id = $2
          AND (tenant_id = $3 OR tenant_id IS NULL)
          AND status = 'open'
        RETURNING id, alert_type`,
      [userId, id, tenantId]
    )
    if (!row) return res.status(404).json({ error: 'Alerte introuvable' })

    trackSecurityEvent({
      type: 'admin_sensitive_action', req,
      reason: 'alert_acknowledged',
      metadata: { alert_id: row.id, alert_type: row.alert_type },
    })
    res.json({ ok: true })
  } catch (err: unknown) {
    logger.error('[security/alerts/ack]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═════════════════════════════════════════════════════════════════
   7. SESSIONS & APPAREILS

   Les sessions sont les lignes de `refresh_tokens` : une par connexion,
   avec son IP et son navigateur. Révoquer une ligne coupe réellement la
   session — le jeton d'accès porte son identifiant et chaque requête le
   vérifie (cf. lib/sessionRevocation). Sans ce lien, « déconnecter »
   n'aurait retiré qu'une ligne d'un tableau.

   NB : `refresh_tokens.token_hash` n'est JAMAIS renvoyé. Les SELECT sont
   explicites, précisément pour que l'ajout d'une colonne sensible ne
   fuite pas par mégarde.
   ═════════════════════════════════════════════════════════════════ */

const UUID_RE = /^[0-9a-f-]{36}$/i

router.get('/sessions', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const limit  = clampLimit(req.query.limit, 50)
  const offset = clampOffset(req.query.offset)
  const userId = UUID_RE.test(String(req.query.user_id ?? '')) ? String(req.query.user_id) : null
  /* Par défaut on ne montre que le vivant : l'écran sert à décider qui
     déconnecter, pas à contempler des sessions déjà mortes. */
  const inclureMortes = String(req.query.all ?? '') === '1'

  try {
    const rows = await query(
      `SELECT rt.id,
              rt.user_id,
              COALESCE(u.name, u.email) AS user_name,
              u.email                   AS user_email,
              rt.ip_address::text       AS ip_address,
              rt.user_agent,
              rt.created_at,
              rt.expires_at,
              rt.revoked,
              CASE WHEN rt.revoked            THEN 'revoquee'
                   WHEN rt.expires_at <= NOW() THEN 'expiree'
                   ELSE 'active' END    AS statut,
              (SELECT COUNT(*)::int FROM trusted_devices td
                WHERE td.user_id = rt.user_id
                  AND td.revoked_at IS NULL
                  AND td.expires_at > NOW()) AS appareils_confiance
         FROM refresh_tokens rt
         JOIN users u ON u.id = rt.user_id
        WHERE rt.tenant_id = $1
          AND ($2::uuid IS NULL OR rt.user_id = $2)
          AND ($3::boolean OR (rt.revoked = false AND rt.expires_at > NOW()))
        ORDER BY rt.created_at DESC
        LIMIT $4 OFFSET $5`,
      [tenantId, userId, inclureMortes, limit, offset]
    )
    res.json({ rows, limit, offset, hasMore: rows.length === limit })
  } catch (err: unknown) {
    logger.error('[security/sessions]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/sessions/:id/revoke', async (req: Request, res: Response) => {
  const { tenantId } = req.user!
  const id = String(req.params.id)
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Identifiant invalide' })

  try {
    /* Le filtre tenant est DANS le UPDATE : sans lui, un admin pourrait
       couper la session d'un autre espace en devinant un UUID. */
    const row = await queryOne<{ id: string; user_id: string }>(
      `UPDATE refresh_tokens
          SET revoked = true
        WHERE id = $1 AND tenant_id = $2 AND revoked = false
        RETURNING id, user_id`,
      [id, tenantId]
    )
    if (!row) return res.status(404).json({ error: 'Session introuvable ou déjà révoquée' })

    /* Coupure immédiate : sans cette invalidation, le cache laisserait
       la session vivre jusqu'à 30 secondes de plus. */
    const { invalidateSession } = await import('../lib/sessionRevocation')
    invalidateSession(row.id)

    trackSecurityEvent({
      type: 'admin_sensitive_action', req,
      reason: 'session_revoked',
      metadata: { session_id: row.id, target_user_id: row.user_id },
    })
    res.json({ ok: true })
  } catch (err: unknown) {
    logger.error('[security/sessions/revoke]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/users/:userId/sessions/revoke-all', async (req: Request, res: Response) => {
  const { tenantId } = req.user!
  const userId = String(req.params.userId)
  if (!UUID_RE.test(userId)) return res.status(400).json({ error: 'Identifiant invalide' })

  try {
    const rows = await query<{ id: string }>(
      `UPDATE refresh_tokens
          SET revoked = true
        WHERE user_id = $1 AND tenant_id = $2 AND revoked = false
        RETURNING id`,
      [userId, tenantId]
    )

    const { invalidateAllSessions } = await import('../lib/sessionRevocation')
    invalidateAllSessions()

    trackSecurityEvent({
      type: 'admin_sensitive_action', req,
      reason: 'all_sessions_revoked',
      metadata: { target_user_id: userId, revoked: rows.length },
    })
    res.json({ ok: true, revoked: rows.length })
  } catch (err: unknown) {
    logger.error('[security/sessions/revoke-all]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.get('/devices', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const limit  = clampLimit(req.query.limit, 50)
  const offset = clampOffset(req.query.offset)

  try {
    /* `device_hash` n'est pas renvoyé : c'est le secret qui identifie
       l'appareil, il n'a rien à faire dans une réponse d'API. */
    const rows = await query(
      `SELECT td.id, td.user_id,
              COALESCE(u.name, u.email) AS user_name,
              u.email                   AS user_email,
              td.label, td.user_agent,
              td.ip_address::text       AS ip_address,
              td.last_used_at, td.created_at, td.expires_at, td.revoked_at,
              CASE WHEN td.revoked_at IS NOT NULL THEN 'revoque'
                   WHEN td.expires_at <= NOW()     THEN 'expire'
                   ELSE 'actif' END     AS statut
         FROM trusted_devices td
         JOIN users u ON u.id = td.user_id
        WHERE td.tenant_id = $1
        ORDER BY (td.revoked_at IS NULL) DESC, td.last_used_at DESC NULLS LAST
        LIMIT $2 OFFSET $3`,
      [tenantId, limit, offset]
    )
    res.json({ rows, limit, offset, hasMore: rows.length === limit })
  } catch (err: unknown) {
    logger.error('[security/devices]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.post('/devices/:id/revoke', async (req: Request, res: Response) => {
  const { tenantId } = req.user!
  const id = String(req.params.id)
  if (!UUID_RE.test(id)) return res.status(400).json({ error: 'Identifiant invalide' })

  try {
    const row = await queryOne<{ id: string; user_id: string }>(
      `UPDATE trusted_devices
          SET revoked_at = NOW()
        WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL
        RETURNING id, user_id`,
      [id, tenantId]
    )
    if (!row) return res.status(404).json({ error: 'Appareil introuvable ou déjà révoqué' })

    trackSecurityEvent({
      type: 'admin_sensitive_action', req,
      reason: 'trusted_device_revoked',
      metadata: { device_id: row.id, target_user_id: row.user_id },
    })
    res.json({ ok: true })
  } catch (err: unknown) {
    logger.error('[security/devices/revoke]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═════════════════════════════════════════════════════════════════
   8. JOURNAL D'AUDIT

   `audit_logs` enregistre les changements de données (action, table,
   enregistrement, ancienne et nouvelle valeur). Il est PAGINÉ et FILTRÉ
   côté serveur : la table grossit sans fin, la charger entière dans le
   navigateur serait intenable et exposerait tout l'historique d'un coup.
   ═════════════════════════════════════════════════════════════════ */
router.get('/audit', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const limit  = clampLimit(req.query.limit, 50)
  const offset = clampOffset(req.query.offset)
  const userId = UUID_RE.test(String(req.query.user_id ?? '')) ? String(req.query.user_id) : null
  const table  = String(req.query.table ?? '').trim().slice(0, 64) || null
  const action = String(req.query.action ?? '').trim().slice(0, 64) || null
  const ip     = normalizeIp(req.query.ip)
  const heures = periodToHours(req.query.period)
  /* Recherche libre : bornée, et appliquée à des colonnes non sensibles
     seulement. On ne cherche PAS dans old_data/new_data, qui peuvent
     contenir des valeurs confidentielles. */
  const recherche = String(req.query.q ?? '').trim().slice(0, 100) || null

  try {
    const rows = await query(
      `SELECT a.id, a.user_id,
              COALESCE(u.name, u.email) AS user_name,
              a.action, a.table_name, a.record_id,
              a.ip_address::text AS ip_address,
              a.user_agent, a.created_at,
              a.old_data, a.new_data
         FROM audit_logs a
         LEFT JOIN users u ON u.id = a.user_id
        WHERE a.tenant_id = $1
          AND ($2::uuid IS NULL OR a.user_id    = $2)
          AND ($3::text IS NULL OR a.table_name = $3)
          AND ($4::text IS NULL OR a.action     = $4)
          AND ($5::text IS NULL OR host(a.ip_address) = $5)
          AND ($6::int  IS NULL OR a.created_at >= NOW() - ($6 || ' hours')::interval)
          AND ($7::text IS NULL OR a.action ILIKE '%' || $7 || '%'
                                OR a.table_name ILIKE '%' || $7 || '%'
                                OR COALESCE(u.name, u.email) ILIKE '%' || $7 || '%')
        ORDER BY a.created_at DESC
        LIMIT $8 OFFSET $9`,
      [tenantId, userId, table, action, ip, heures, recherche, limit, offset]
    )
    res.json({ rows, limit, offset, hasMore: rows.length === limit })
  } catch (err: unknown) {
    logger.error('[security/audit]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/** Valeurs disponibles pour alimenter les filtres, sans les deviner. */
router.get('/audit/facets', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const [tables, actions, utilisateurs] = await Promise.all([
      query<{ v: string }>(
        `SELECT DISTINCT table_name AS v FROM audit_logs
          WHERE tenant_id = $1 AND table_name IS NOT NULL ORDER BY 1 LIMIT 100`, [tenantId]),
      query<{ v: string }>(
        `SELECT DISTINCT action AS v FROM audit_logs
          WHERE tenant_id = $1 AND action IS NOT NULL ORDER BY 1 LIMIT 100`, [tenantId]),
      query<{ id: string; nom: string }>(
        `SELECT DISTINCT a.user_id AS id, COALESCE(u.name, u.email) AS nom
           FROM audit_logs a JOIN users u ON u.id = a.user_id
          WHERE a.tenant_id = $1 ORDER BY 2 LIMIT 100`, [tenantId]),
    ])
    res.json({
      tables:       tables.map(r => r.v),
      actions:      actions.map(r => r.v),
      utilisateurs,
    })
  } catch (err: unknown) {
    logger.error('[security/audit/facets]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═════════════════════════════════════════════════════════════════
   9. RÔLES & PERMISSIONS

   La matrice renvoyée ici est celle que le serveur APPLIQUE réellement
   (middleware/rbac.ts). Elle n'est pas recopiée dans le front : une
   matrice affichée qui diverge de la matrice appliquée rassure à tort,
   ce qui est pire que de ne rien afficher.
   ═════════════════════════════════════════════════════════════════ */
router.get('/roles', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const { TABLE_ACL } = await import('../middleware/rbac')

    const effectifs = await query<{ role: string; n: number }>(
      `SELECT tu.role, COUNT(*)::int AS n
         FROM tenant_users tu
         JOIN users u ON u.id = tu.user_id
        WHERE tu.tenant_id = $1 AND tu.status = 'active' AND u.is_active = true
        GROUP BY tu.role`,
      [tenantId]
    )

    res.json({
      effectifs,
      /* Une entrée par table exposée, avec les rôles autorisés pour
         chaque action. Le regroupement par module est un travail
         d'affichage, fait côté écran. */
      matrice: TABLE_ACL,
    })
  } catch (err: unknown) {
    logger.error('[security/roles]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

/* ═════════════════════════════════════════════════════════════════
   10. PARAMÈTRES DE SÉCURITÉ

   Ces réglages sont APPLIQUÉS CÔTÉ SERVEUR. L'écran ne fait que les
   lire et les écrire ; il ne décide de rien. Les bornes sont vérifiées
   ici ET par une contrainte de la base (migration 092) — un appel
   direct à l'API ne peut donc pas désarmer la sécurité en envoyant
   « 0 tentative maximum ».
   ═════════════════════════════════════════════════════════════════ */

const CHAMPS_REGLAGES = {
  session_max_days:        { min: 1, max: 365 },
  idle_timeout_minutes:    { min: 0, max: 1440 },
  max_login_attempts:      { min: 3, max: 20 },
  lockout_minutes:         { min: 1, max: 1440 },
  trusted_device_days:     { min: 1, max: 365 },
  password_min_length:     { min: 8, max: 64 },
} as const

const CHAMPS_BOOLEENS = [
  'require_2fa_admins', 'require_2fa_all', 'trusted_devices_enabled',
  'password_require_upper', 'password_require_digit', 'password_require_symbol',
] as const

router.get('/settings', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  try {
    const row = await queryOne(
      `SELECT * FROM security_settings WHERE tenant_id = $1`, [tenantId])
    /* Aucune ligne : l'espace n'a jamais rien réglé. On renvoie les
       valeurs par défaut de la base plutôt que d'inventer une ligne à
       la lecture — écrire lors d'un GET est un effet de bord. */
    if (row) return res.json({ settings: row, defini: true })
    res.json({
      settings: {
        tenant_id: tenantId,
        session_max_days: 90, idle_timeout_minutes: 0,
        max_login_attempts: 5, lockout_minutes: 15,
        require_2fa_admins: false, require_2fa_all: false,
        trusted_devices_enabled: true, trusted_device_days: 30,
        password_min_length: 8, password_require_upper: false,
        password_require_digit: false, password_require_symbol: false,
      },
      defini: false,
    })
  } catch (err: unknown) {
    logger.error('[security/settings]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

router.patch('/settings', async (req: Request, res: Response) => {
  const tenantId = req.user!.tenantId
  const body = (req.body ?? {}) as Record<string, unknown>

  const colonnes: string[] = []
  const valeurs: unknown[] = []
  const modifs: Record<string, unknown> = {}

  for (const [champ, bornes] of Object.entries(CHAMPS_REGLAGES)) {
    if (!(champ in body)) continue
    const n = Number(body[champ])
    if (!Number.isInteger(n) || n < bornes.min || n > bornes.max) {
      return res.status(400).json({
        error: `« ${champ} » doit être un entier entre ${bornes.min} et ${bornes.max}.`,
      })
    }
    colonnes.push(champ); valeurs.push(n); modifs[champ] = n
  }
  for (const champ of CHAMPS_BOOLEENS) {
    if (!(champ in body)) continue
    if (typeof body[champ] !== 'boolean') {
      return res.status(400).json({ error: `« ${champ} » doit être vrai ou faux.` })
    }
    colonnes.push(champ); valeurs.push(body[champ]); modifs[champ] = body[champ]
  }

  if (colonnes.length === 0) return res.status(400).json({ error: 'Aucun réglage fourni.' })

  try {
    /* UPSERT : la ligne n'existe qu'à partir de la première écriture. */
    const set = colonnes.map((c, i) => `${c} = $${i + 2}`).join(', ')
    const cols = colonnes.join(', ')
    const params = colonnes.map((_, i) => `$${i + 2}`).join(', ')
    const row = await queryOne(
      `INSERT INTO security_settings (tenant_id, ${cols})
       VALUES ($1, ${params})
       ON CONFLICT (tenant_id) DO UPDATE SET ${set}, updated_at = NOW()
       RETURNING *`,
      [tenantId, ...valeurs]
    )

    /* Journalisé : changer la politique de sécurité est exactement le
       genre d'action qu'un audit doit pouvoir retrouver. */
    trackSecurityEvent({
      type: 'admin_sensitive_action', req,
      reason: 'security_settings_updated',
      metadata: { champs: Object.keys(modifs), valeurs: modifs },
    })
    res.json({ settings: row, defini: true })
  } catch (err: unknown) {
    logger.error('[security/settings/patch]', (err as Error)?.message)
    res.status(500).json({ error: 'Erreur serveur' })
  }
})

export default router
