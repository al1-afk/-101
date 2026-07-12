/**
 * Token security utilities.
 *
 *   - hashToken(raw)  : SHA-256 hex — used to store or lookup a token
 *                       without ever holding the raw value.
 *   - maskToken(raw)  : "aaaa…zzzz" — safe display in admin UI / logs.
 *   - randomToken()   : 32-byte crypto-random hex string (64 chars).
 *
 *  Rules:
 *   - Raw tokens are sent by email ONCE and never returned by an API.
 *   - Raw tokens are never logged. If a token id must appear in an
 *     admin UI (audit view), use maskToken().
 *   - The prefix (first 8 chars) is safe to store in the audit log so
 *     the admin can correlate a suspicious event with a specific token.
 */
import crypto from 'crypto'

const HEX_TOKEN_RE = /^[a-f0-9]{32,128}$/i

export function randomToken(): string {
  return crypto.randomBytes(32).toString('hex')  // 64 hex chars
}

export function hashToken(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex')
}

/** "aaaabbccddeeff…zzzz" for admin display and audit logs. */
export function maskToken(raw: string): string {
  if (typeof raw !== 'string' || raw.length < 12) return '****'
  const first = raw.slice(0, 4)
  const last  = raw.slice(-4)
  return `${first}…${last}`
}

/** First 8 chars — safe to store in security_audit_log.token_prefix. */
export function tokenPrefix(raw: string): string {
  if (typeof raw !== 'string' || raw.length < 8) return ''
  return raw.slice(0, 8)
}

/** Constant-time comparison for hex strings. */
export function safeCompareHex(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  if (a.length !== b.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex'))
  } catch { return false }
}

/** Returns true if the input looks like a raw invitation/reset token
 *  (used by log redaction to avoid ever writing one to stdout). */
export function looksLikeToken(v: unknown): boolean {
  return typeof v === 'string' && HEX_TOKEN_RE.test(v)
}
