/**
 * Email tracking — open + click + bounce.
 *
 * Génère et valide des tokens HMAC courts qu'on incruste dans les URLs
 * de tracking (pixel + wrap de liens). Sans HMAC, n'importe qui pourrait
 * forger une ouverture / un clic pour un prospect concurrent.
 *
 * Format token : {prospect_id_b64url}.{signature_b64url_16bytes}
 *   → total ~ 40 caractères, URL-safe, aucune dépendance externe.
 *
 * Cycle de vie :
 *   1. Autopilot envoie l'email  → emailTracking.recordSent()
 *   2. Prospect ouvre           → pixel 1×1 GET  → recordOpen()
 *   3. Prospect clique un lien  → redirect       → recordClick()
 *   4. Bounce revient           → cron IMAP      → recordBounce()  (Phase 2)
 *   5. Reply                    → cron IMAP      → recordReply()   (Phase 2)
 */
import crypto from 'node:crypto'
import type { Pool } from 'pg'

/* Secret dédié — si absent, on retombe sur JWT_SECRET (déjà 32+ chars en prod). */
function getSecret(): string {
  const s = process.env.EMAIL_TRACKING_SECRET ?? process.env.JWT_SECRET
  if (!s || s.length < 16) {
    throw new Error('EMAIL_TRACKING_SECRET (ou JWT_SECRET) manquant / trop court')
  }
  return s
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
function b64urlDecode(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')
}

/** Signe un prospect_id → token URL-safe court. */
export function signToken(prospectId: string): string {
  const idBuf = Buffer.from(prospectId.replace(/-/g, ''), 'hex') /* UUID → 16 bytes */
  const sig = crypto.createHmac('sha256', getSecret())
    .update(idBuf).digest().slice(0, 12)   /* 12 bytes suffisent, ~19 chars b64 */
  return `${b64url(idBuf)}.${b64url(sig)}`
}

/** Vérifie et extrait le prospect_id ; retourne null si invalide. */
export function verifyToken(token: string): string | null {
  if (!token || typeof token !== 'string') return null
  const [idPart, sigPart] = token.split('.')
  if (!idPart || !sigPart) return null
  let idBuf: Buffer
  try { idBuf = b64urlDecode(idPart) } catch { return null }
  if (idBuf.length !== 16) return null
  const expected = crypto.createHmac('sha256', getSecret())
    .update(idBuf).digest().slice(0, 12)
  let given: Buffer
  try { given = b64urlDecode(sigPart) } catch { return null }
  if (given.length !== 12) return null
  if (!crypto.timingSafeEqual(expected, given)) return null
  /* Reconstruit l'UUID canonique. */
  const hex = idBuf.toString('hex')
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`
}

/* ─────────────────────────────────────────────────────────────────
   Événements — écriture DB
───────────────────────────────────────────────────────────────── */

interface RecordCtx {
  pool:              Pool
  tenantId:          string
  prospectId:        string
  autopilotRunId?:   string | null
  userAgent?:        string | null
  ip?:               string | null
}

/** SHA-256 tronqué pour ne pas stocker d'IP brute (privacy). */
function hashIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  return crypto.createHash('sha256').update(ip).digest('hex').slice(0, 16)
}

/** Enregistre l'envoi (appelé après SMTP OK). */
export async function recordSent(ctx: RecordCtx & { subject: string }): Promise<void> {
  await ctx.pool.query(`
    INSERT INTO outbound_email_events
      (tenant_id, prospect_id, autopilot_run_id, event_type, subject)
    VALUES ($1,$2,$3,'sent',$4)
  `, [ctx.tenantId, ctx.prospectId, ctx.autopilotRunId ?? null, ctx.subject])
}

/** Enregistre une ouverture — appelée par la route publique du pixel. */
export async function recordOpen(ctx: RecordCtx): Promise<void> {
  /* On met à jour l'agrégat + on log l'event. Le trigger d'update sur run est
     géré ailleurs (batch KPI) — inutile de touch outbound_autopilot_runs à chaque open. */
  const isFirst = await ctx.pool.query(
    `SELECT email_opened_at IS NULL AS first FROM outbound_prospects WHERE id = $1`,
    [ctx.prospectId])
  const first = !!isFirst.rows[0]?.first
  await ctx.pool.query(`
    UPDATE outbound_prospects
       SET email_opened_at    = COALESCE(email_opened_at, NOW()),
           email_opened_count = email_opened_count + 1
     WHERE id = $1
  `, [ctx.prospectId])
  await ctx.pool.query(`
    INSERT INTO outbound_email_events
      (tenant_id, prospect_id, event_type, user_agent, ip_hash)
    VALUES ($1,$2,'opened',$3,$4)
  `, [ctx.tenantId, ctx.prospectId, ctx.userAgent?.slice(0, 300) ?? null, hashIp(ctx.ip)])
  if (first) await incrementRunCounter(ctx.pool, ctx.prospectId, 'emails_opened')
}

export async function recordClick(ctx: RecordCtx & { targetUrl: string }): Promise<void> {
  const isFirst = await ctx.pool.query(
    `SELECT email_clicked_at IS NULL AS first FROM outbound_prospects WHERE id = $1`,
    [ctx.prospectId])
  const first = !!isFirst.rows[0]?.first
  await ctx.pool.query(`
    UPDATE outbound_prospects
       SET email_clicked_at    = COALESCE(email_clicked_at, NOW()),
           email_clicked_count = email_clicked_count + 1
     WHERE id = $1
  `, [ctx.prospectId])
  await ctx.pool.query(`
    INSERT INTO outbound_email_events
      (tenant_id, prospect_id, event_type, target_url, user_agent, ip_hash)
    VALUES ($1,$2,'clicked',$3,$4,$5)
  `, [ctx.tenantId, ctx.prospectId, ctx.targetUrl.slice(0, 2000),
      ctx.userAgent?.slice(0, 300) ?? null, hashIp(ctx.ip)])
  if (first) await incrementRunCounter(ctx.pool, ctx.prospectId, 'emails_clicked')
}

export async function recordBounce(ctx: RecordCtx & { reason: string }): Promise<void> {
  const wasNotBounced = await ctx.pool.query(
    `SELECT email_bounced = FALSE AS first FROM outbound_prospects WHERE id = $1`,
    [ctx.prospectId])
  const first = !!wasNotBounced.rows[0]?.first
  await ctx.pool.query(`
    UPDATE outbound_prospects
       SET email_bounced        = TRUE,
           email_bounced_at     = COALESCE(email_bounced_at, NOW()),
           email_bounced_reason = COALESCE(email_bounced_reason, $2)
     WHERE id = $1
  `, [ctx.prospectId, ctx.reason])
  await ctx.pool.query(`
    INSERT INTO outbound_email_events
      (tenant_id, prospect_id, event_type, bounce_reason)
    VALUES ($1,$2,'bounced',$3)
  `, [ctx.tenantId, ctx.prospectId, ctx.reason.slice(0, 500)])
  if (first) await incrementRunCounter(ctx.pool, ctx.prospectId, 'emails_bounced')
}

export async function recordReply(ctx: RecordCtx & { snippet?: string }): Promise<void> {
  const wasNotReplied = await ctx.pool.query(
    `SELECT email_replied_at IS NULL AS first FROM outbound_prospects WHERE id = $1`,
    [ctx.prospectId])
  const first = !!wasNotReplied.rows[0]?.first
  await ctx.pool.query(`
    UPDATE outbound_prospects
       SET email_replied_at = COALESCE(email_replied_at, NOW())
     WHERE id = $1
  `, [ctx.prospectId])
  await ctx.pool.query(`
    INSERT INTO outbound_email_events
      (tenant_id, prospect_id, event_type, metadata)
    VALUES ($1,$2,'replied',$3::jsonb)
  `, [ctx.tenantId, ctx.prospectId, JSON.stringify({ snippet: ctx.snippet?.slice(0, 500) ?? null })])
  if (first) await incrementRunCounter(ctx.pool, ctx.prospectId, 'emails_replied')
}

/* Incrémente le compteur agrégé du run le plus récent qui a envoyé un email
   à ce prospect (sinon rien). */
async function incrementRunCounter(pool: Pool, prospectId: string, column:
  'emails_opened' | 'emails_clicked' | 'emails_bounced' | 'emails_replied'): Promise<void> {
  try {
    const { rows } = await pool.query(`
      SELECT autopilot_run_id FROM outbound_email_events
       WHERE prospect_id = $1 AND event_type = 'sent'
       ORDER BY created_at DESC LIMIT 1
    `, [prospectId])
    const runId = rows[0]?.autopilot_run_id
    if (!runId) return
    /* Assignation dynamique OK car whitelistée par le type. */
    await pool.query(`UPDATE outbound_autopilot_runs SET ${column} = ${column} + 1 WHERE id = $1`, [runId])
  } catch { /* pas critique */ }
}

/* ─────────────────────────────────────────────────────────────────
   URLs de tracking — utilisées dans le template
───────────────────────────────────────────────────────────────── */

/** Base publique où sont hébergés les endpoints /api/public/track/*.
 *  Priorité : PUBLIC_APP_URL > premier CORS_ORIGINS > localhost:4000. */
export function trackingBaseUrl(): string {
  const explicit = process.env.PUBLIC_APP_URL || process.env.PUBLIC_API_URL
  if (explicit) return explicit.replace(/\/$/, '')
  const cors = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)
  if (cors[0]) return cors[0].replace(/\/$/, '').replace(/^https?:\/\/localhost:\d+/, m => m.replace(/:\d+/, ':' + (process.env.SERVER_PORT ?? '4000')))
  return `http://localhost:${process.env.SERVER_PORT ?? '4000'}`
}

export function openPixelUrl(prospectId: string): string {
  return `${trackingBaseUrl()}/api/public/track/open/${signToken(prospectId)}.gif`
}

export function clickWrapUrl(prospectId: string, originalUrl: string): string {
  const enc = encodeURIComponent(originalUrl)
  return `${trackingBaseUrl()}/api/public/track/click/${signToken(prospectId)}?u=${enc}`
}
