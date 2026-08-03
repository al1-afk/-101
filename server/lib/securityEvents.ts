/**
 * Security Center — couche d'écriture (base de données).
 *
 * Contrat de cette couche :
 *   1. Elle n'échoue JAMAIS bruyamment. Le monitoring est une couche
 *      d'observation : s'il tombe, l'ERP continue de fonctionner. Toute
 *      erreur est avalée et loguée, jamais propagée à la requête HTTP.
 *   2. Elle n'écrit que des événements PERTINENTS (§10). Une requête
 *      normale ne produit aucune ligne. Un même événement répété est
 *      étouffé par une fenêtre anti-rafale en mémoire.
 *   3. Elle n'écrit jamais de secret (§9) — tout passe par
 *      sanitizeMetadata / normalize* de securityCore.
 */
import type { Request } from 'express'
import { query, queryOne } from '../db/pool'
import { logger } from './logger'
import { getClientIp } from './clientIp'
import {
  classifyEvent, isSecurityEventType, sanitizeMetadata, sanitizeUserAgent,
  normalizeEndpoint, normalizeEmail, normalizeReason, alertKey, cooldownMinutes,
  severityRank, THRESHOLDS, PRESENCE_MAX_SESSIONS_PER_USER, isValidSessionKey,
  type SecurityEventType, type Severity, type EventStatus,
} from './securityCore'

/* ── Anti-rafale en mémoire ───────────────────────────────────────
   Sans ça, un client qui boucle sur une route protégée génère des
   milliers de lignes identiques : la table gonfle, le dashboard devient
   illisible et l'ERP ralentit. On étouffe les doublons stricts sur une
   courte fenêtre — l'information « ça se répète » n'est pas perdue,
   elle est portée par les compteurs d'alerte, pas par N lignes.       */
const BURST_WINDOW_MS = 5_000
const BURST_MAX_KEYS  = 5_000
/* Types à fort volume potentiel. Les événements rares (token_reuse,
   path_traversal, password_changed…) ne sont jamais étouffés. */
const THROTTLED_TYPES = new Set<SecurityEventType>([
  'unauthorized', 'rate_limit', 'invalid_input', 'permission_denied', 'login_failed',
])
const lastSeen = new Map<string, number>()

function throttled(type: SecurityEventType, key: string, now = Date.now()): boolean {
  if (!THROTTLED_TYPES.has(type)) return false
  const k = `${type}|${key}`
  const prev = lastSeen.get(k)
  if (prev !== undefined && now - prev < BURST_WINDOW_MS) return true
  if (lastSeen.size >= BURST_MAX_KEYS) lastSeen.clear()   // garde-fou mémoire
  lastSeen.set(k, now)
  return false
}

/** Réinitialise la fenêtre anti-rafale (tests). */
export function resetBurstWindow(): void {
  lastSeen.clear()
  probes.clear()
}

/* ── Détection de balayage d'identifiants (IDOR/BOLA) ──────────────
   Un 404 sur `/api/clients/<uuid>` est banal : ligne supprimée, lien
   périmé, onglet resté ouvert. En faire un événement de sécurité
   noierait le journal de faux positifs (§3).
   Ce qui est anormal, c'est le VOLUME : énumérer des identifiants
   produit des dizaines de 404 en quelques minutes. On compte donc en
   mémoire et on ne journalise qu'au franchissement du seuil, une seule
   fois par fenêtre — zéro écriture pour un usage normal (§10).       */
const PROBE_WINDOW_MS = 10 * 60 * 1000
const PROBE_THRESHOLD = 20
const PROBE_MAX_KEYS  = 5_000
const probes = new Map<string, { count: number; since: number }>()

/** Incrémente le compteur et renvoie le total sur la fenêtre courante. */
export function noteResourceProbe(key: string, now = Date.now()): number {
  const cur = probes.get(key)
  if (!cur || now - cur.since > PROBE_WINDOW_MS) {
    if (probes.size >= PROBE_MAX_KEYS) probes.clear()
    probes.set(key, { count: 1, since: now })
    return 1
  }
  cur.count += 1
  return cur.count
}

/** Vrai exactement au franchissement du seuil → une alerte, pas cent. */
export function isProbeThresholdCrossed(count: number): boolean {
  return count === PROBE_THRESHOLD
}

export const PROBE_LIMITS = { windowMs: PROBE_WINDOW_MS, threshold: PROBE_THRESHOLD } as const

/* ── Écriture d'un événement ─────────────────────────────────────── */

export interface SecurityEventInput {
  type:       SecurityEventType
  req?:       Request
  tenantId?:  string | null
  userId?:    string | null
  email?:     string | null
  /** Surcharge la classification par défaut — à n'utiliser qu'avec une
      justification technique (voir classifyEvent). */
  severity?:  Severity
  status?:    EventStatus
  reason?:    string | null
  httpStatus?: number | null
  metadata?:  Record<string, unknown>
}

/**
 * Journalise un événement de sécurité. Fire-and-forget : l'appelant ne
 * doit PAS attendre le résultat dans le chemin critique d'une requête.
 */
export async function recordSecurityEvent(input: SecurityEventInput): Promise<void> {
  try {
    if (!isSecurityEventType(input.type)) {
      logger.warn('[security-event] type inconnu ignoré', { type: String(input.type) })
      return
    }
    const base = classifyEvent(input.type)
    const severity = input.severity ?? base.severity
    const status   = input.status   ?? base.status

    const req = input.req
    const ip  = req ? getClientIp(req) : null
    const ua  = req ? sanitizeUserAgent(req.headers['user-agent']) : null
    /* req.path (pas req.originalUrl) : pas de query string par construction,
       et on repasse quand même par normalizeEndpoint. */
    const endpoint  = req ? normalizeEndpoint(req.path) : null
    const method    = req ? String(req.method).slice(0, 10) : null
    const requestId = req ? (req as Request & { requestId?: string }).requestId ?? null : null

    const tenantId = input.tenantId ?? req?.user?.tenantId ?? null
    const userId   = input.userId   ?? req?.user?.userId   ?? null
    const email    = normalizeEmail(input.email ?? req?.user?.email ?? null)

    if (throttled(input.type, `${ip ?? '-'}|${userId ?? '-'}|${endpoint ?? '-'}`)) return

    const row = await queryOne<{ id: string }>(
      `INSERT INTO security_events
         (tenant_id, user_id, email, event_type, severity, status,
          ip_address, user_agent, http_method, endpoint, http_status,
          reason, request_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7::inet, $8, $9, $10, $11, $12, $13, $14::jsonb)
       RETURNING id`,
      [
        tenantId, userId, email, input.type, severity, status,
        ip, ua, method, endpoint, input.httpStatus ?? null,
        normalizeReason(input.reason), requestId,
        JSON.stringify(sanitizeMetadata(input.metadata)),
      ]
    )

    /* Évaluation des alertes hors du chemin de réponse. */
    void evaluateAlerts({
      type: input.type, severity, tenantId, userId, email, ip,
      eventId: row?.id ?? null,
    }).catch(e => logger.error('[security-alert]', e?.message))
  } catch (err: unknown) {
    /* Un incident de journalisation ne doit jamais casser une requête. */
    logger.error('[security-event]', (err as Error)?.message)
  }
}

/** Variante synchrone « tire et oublie » pour les chemins critiques. */
export function trackSecurityEvent(input: SecurityEventInput): void {
  void recordSecurityEvent(input)
}

/* ── Alertes : déduplication + cooldown ──────────────────────────── */

interface AlertContext {
  type:     SecurityEventType
  severity: Severity
  tenantId: string | null
  userId:   string | null
  email:    string | null
  ip:       string | null
  eventId:  string | null
}

/**
 * Décide si un événement mérite une alerte, puis la crée ou l'agrège.
 *
 * Deux familles :
 *   - accumulation : login_failed / permission_denied / rate_limit ne
 *     déclenchent une alerte qu'AU-DESSUS d'un seuil sur une fenêtre
 *     glissante. En dessous, c'est du bruit normal (§3 : ne jamais
 *     qualifier une simple erreur de tentative d'intrusion).
 *   - gravité intrinsèque : HIGH/CRITICAL alertent immédiatement.
 */
async function evaluateAlerts(ctx: AlertContext): Promise<void> {
  if (ctx.type === 'login_failed') return void await evaluateLoginFailures(ctx)

  if (ctx.type === 'permission_denied' || ctx.type === 'tenant_scope_denied') {
    const count = await countRecentEvents(
      ['permission_denied', 'tenant_scope_denied'], ctx, THRESHOLDS.windowMinutes
    )
    if (count >= THRESHOLDS.deniedAccessPerUser) {
      await upsertAlert({
        ...ctx,
        alertType: 'repeated_access_denied',
        title: `Accès refusés répétés (${count} en ${THRESHOLDS.windowMinutes} min)`,
        severity: 'high',
        metadata: { count, window_minutes: THRESHOLDS.windowMinutes },
      })
    }
    return
  }

  if (ctx.type === 'rate_limit') {
    const count = await countRecentEvents(['rate_limit'], ctx, THRESHOLDS.windowMinutes)
    if (count >= THRESHOLDS.rateLimitPerIp) {
      await upsertAlert({
        ...ctx,
        alertType: 'rate_limit_abuse',
        title: `Limite de requêtes déclenchée ${count} fois en ${THRESHOLDS.windowMinutes} min`,
        severity: 'medium',
        metadata: { count, window_minutes: THRESHOLDS.windowMinutes },
      })
    }
    return
  }

  /* Gravité intrinsèque : on alerte sans attendre l'accumulation. */
  if (severityRank(ctx.severity) >= severityRank('high')) {
    await upsertAlert({
      ...ctx,
      alertType: ctx.type,
      title: ALERT_TITLES[ctx.type] ?? `Événement de sécurité ${ctx.type}`,
      severity: ctx.severity,
      metadata: { event_id: ctx.eventId },
    })
  }
}

const ALERT_TITLES: Partial<Record<SecurityEventType, string>> = {
  token_reuse_detected:          'Réutilisation d\'un refresh token révoqué',
  path_traversal_blocked:        'Tentative de traversée de répertoire bloquée',
  tenant_scope_denied:           'Accès à des données d\'un autre espace bloqué',
  security_center_access_denied: 'Accès refusé au Centre de sécurité',
  login_failed_burst:            'Rafale d\'échecs de connexion',
  login_blocked_lockout:         'Compte temporairement verrouillé',
}

/**
 * Brute-force : on compte les échecs RÉELS depuis login_attempts (source
 * de vérité déjà utilisée par le verrouillage de /login) plutôt que de
 * recompter nos propres événements — pas de duplication (§7).
 */
async function evaluateLoginFailures(ctx: AlertContext): Promise<void> {
  const window = THRESHOLDS.windowMinutes
  const row = await queryOne<{ by_ip: number; by_email: number }>(
    `SELECT
       COUNT(*) FILTER (WHERE ip_address = $1::inet)::int AS by_ip,
       COUNT(*) FILTER (WHERE email = $2)::int            AS by_email
     FROM login_attempts
     WHERE success = false
       AND attempted_at > NOW() - ($3 || ' minutes')::interval
       AND ($1::inet IS NOT NULL OR $2 IS NOT NULL)`,
    [ctx.ip, ctx.email, String(window)]
  )
  const byIp    = Number(row?.by_ip ?? 0)
  const byEmail = Number(row?.by_email ?? 0)

  if (ctx.ip && byIp >= THRESHOLDS.loginFailuresPerIp) {
    await upsertAlert({
      ...ctx,
      alertType: 'brute_force_suspected',
      title: `Brute-force probable : ${byIp} échecs depuis ${ctx.ip} en ${window} min`,
      severity: 'high',
      /* SUSPICIOUS et non CONFIRMED : un utilisateur légitime derrière un
         NAT d'entreprise peut atteindre ce seuil. */
      metadata: { failures: byIp, window_minutes: window, scope: 'ip' },
    })
  }
  if (ctx.email && byEmail >= THRESHOLDS.loginFailuresPerEmail) {
    await upsertAlert({
      ...ctx,
      alertType: 'account_targeted',
      title: `Compte ciblé : ${byEmail} échecs en ${window} min`,
      severity: 'high',
      metadata: { failures: byEmail, window_minutes: window, scope: 'email' },
    })
  }
}

async function countRecentEvents(
  types: SecurityEventType[], ctx: AlertContext, windowMinutes: number,
): Promise<number> {
  const row = await queryOne<{ count: number }>(
    `SELECT COUNT(*)::int AS count FROM security_events
      WHERE event_type = ANY($1::text[])
        AND created_at > NOW() - ($2 || ' minutes')::interval
        AND ( ($3::uuid IS NOT NULL AND user_id = $3::uuid)
           OR ($3::uuid IS NULL AND $4::inet IS NOT NULL AND ip_address = $4::inet) )`,
    [types, String(windowMinutes), ctx.userId, ctx.ip]
  )
  return Number(row?.count ?? 0)
}

interface UpsertAlertInput extends AlertContext {
  alertType: string
  title:     string
  metadata?: Record<string, unknown>
}

/**
 * Crée l'alerte ou incrémente celle déjà ouverte pour le même motif.
 *
 * L'index unique partiel `(alert_key) WHERE status = 'open'` garantit
 * qu'il n'existe jamais deux alertes ouvertes identiques, même sous
 * concurrence. Le cooldown n'est repoussé que s'il est écoulé : tant
 * qu'il court, on compte sans re-notifier (§6).
 */
async function upsertAlert(input: UpsertAlertInput): Promise<void> {
  const key = alertKey({
    tenantId: input.tenantId, type: input.alertType,
    ip: input.ip, userId: input.userId, email: input.email,
  })
  const cooldown = String(cooldownMinutes(input.severity))

  await query(
    `INSERT INTO security_alerts
       (tenant_id, alert_key, alert_type, title, severity, ip_address, user_id,
        cooldown_until, notified_at, channel_state, metadata)
     VALUES ($1, $2, $3, $4, $5, $6::inet, $7,
             NOW() + ($8 || ' minutes')::interval, NULL, 'pending', $9::jsonb)
     ON CONFLICT (alert_key) WHERE status = 'open'
     DO UPDATE SET
       occurrences  = security_alerts.occurrences + 1,
       last_seen_at = NOW(),
       title        = EXCLUDED.title,
       /* La sévérité ne redescend jamais tant que l'alerte est ouverte. */
       severity     = CASE
                        WHEN array_position(ARRAY['info','low','medium','high','critical'], EXCLUDED.severity)
                           > array_position(ARRAY['info','low','medium','high','critical'], security_alerts.severity)
                        THEN EXCLUDED.severity ELSE security_alerts.severity END,
       /* Cooldown écoulé → nouvelle fenêtre + à re-notifier. Sinon on
          n'y touche pas : pas de flood de notifications identiques. */
       cooldown_until = CASE
                          WHEN security_alerts.cooldown_until IS NULL
                            OR security_alerts.cooldown_until <= NOW()
                          THEN NOW() + ($8 || ' minutes')::interval
                          ELSE security_alerts.cooldown_until END,
       channel_state  = CASE
                          WHEN security_alerts.cooldown_until IS NULL
                            OR security_alerts.cooldown_until <= NOW()
                          THEN 'pending' ELSE security_alerts.channel_state END`,
    [
      input.tenantId, key, input.alertType, input.title.slice(0, 200), input.severity,
      input.ip, input.userId, cooldown,
      JSON.stringify(sanitizeMetadata(input.metadata ?? {})),
    ]
  )
}

/* ── Présence (heartbeat) ────────────────────────────────────────── */

export interface PresenceInput {
  userId:     string
  tenantId:   string
  sessionKey: string
  ip:         string | null
  userAgent:  string | null
}

/**
 * Rafraîchit la présence d'une session. Renvoie false si la clé de
 * session est mal formée (le client ne peut pas créer de lignes
 * arbitraires : la clé est validée, et le user/tenant vient du JWT).
 */
export async function touchPresence(input: PresenceInput): Promise<boolean> {
  if (!isValidSessionKey(input.sessionKey)) return false
  try {
    await query(
      `INSERT INTO user_presence
         (user_id, tenant_id, session_key, ip_address, user_agent)
       VALUES ($1, $2, $3, $4::inet, $5)
       ON CONFLICT (user_id, session_key)
       DO UPDATE SET last_seen_at = NOW(),
                     ended_at     = NULL,
                     ip_address   = COALESCE(EXCLUDED.ip_address, user_presence.ip_address),
                     user_agent   = COALESCE(EXCLUDED.user_agent, user_presence.user_agent)`,
      [input.userId, input.tenantId, input.sessionKey.toLowerCase(), input.ip, input.userAgent]
    )
    /* Plafond de sessions : empêche un client bavard de créer des
       milliers de lignes en changeant de session_key. */
    await query(
      `DELETE FROM user_presence
        WHERE user_id = $1
          AND id NOT IN (
            SELECT id FROM user_presence
             WHERE user_id = $1
             ORDER BY last_seen_at DESC
             LIMIT $2
          )`,
      [input.userId, PRESENCE_MAX_SESSIONS_PER_USER]
    )
    return true
  } catch (err: unknown) {
    logger.error('[presence:touch]', (err as Error)?.message)
    return false
  }
}

/** Fin de session explicite (déconnexion) — la ligne disparaît du « en ligne ». */
export async function endPresence(userId: string, sessionKey?: string | null): Promise<void> {
  try {
    if (sessionKey && isValidSessionKey(sessionKey)) {
      await query(
        `UPDATE user_presence SET ended_at = NOW(), last_seen_at = NOW() - INTERVAL '1 hour'
          WHERE user_id = $1 AND session_key = $2`,
        [userId, sessionKey.toLowerCase()]
      )
    } else {
      await query(
        `UPDATE user_presence SET ended_at = NOW(), last_seen_at = NOW() - INTERVAL '1 hour'
          WHERE user_id = $1 AND ended_at IS NULL`,
        [userId]
      )
    }
  } catch (err: unknown) {
    logger.error('[presence:end]', (err as Error)?.message)
  }
}

/* ── Rétention ───────────────────────────────────────────────────── */

export interface RetentionResult {
  events_deleted:   number
  presence_deleted: number
  alerts_deleted:   number
  attempts_deleted: number
  history_deleted:  number
}

/** Applique la politique de rétention (fonction SQL purge_security_center). */
export async function runSecurityRetention(): Promise<RetentionResult | null> {
  try {
    const row = await queryOne<RetentionResult>('SELECT * FROM purge_security_center()')
    if (row) logger.info('[security-retention]', row)
    return row
  } catch (err: unknown) {
    logger.error('[security-retention]', (err as Error)?.message)
    return null
  }
}

const RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000

/**
 * Purge quotidienne. Premier passage 5 min après le démarrage pour ne pas
 * concurrencer le boot, puis toutes les 24 h. Timer `unref` : ne retient
 * pas le process à l'arrêt.
 */
export function startSecurityRetentionScheduler(): NodeJS.Timeout {
  setTimeout(() => { void runSecurityRetention() }, 5 * 60 * 1000).unref?.()
  const timer = setInterval(() => { void runSecurityRetention() }, RETENTION_INTERVAL_MS)
  timer.unref?.()
  return timer
}
