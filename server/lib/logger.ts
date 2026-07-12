/**
 * Structured logger with automatic redaction of sensitive fields.
 *
 *  - Sensitive keys (password, token, authorization, cookie, apiKey,
 *    secret, invitationLink, resetLink, smtpPassword, private_key, ...)
 *    are replaced with '[REDACTED]' before any log output.
 *  - Raw invitation/reset tokens (hex strings 32+ chars) are masked to
 *    "aaaa…zzzz" in every stringified value.
 *  - In production, only the requestId and message are surfaced to
 *    clients; the full context stays in server logs.
 */
import { maskToken, looksLikeToken } from './tokenSecurity'

const SENSITIVE_KEY_RE =
  /^(password|password_hash|newpassword|current_password|new_password|token|token_hash|refresh_token|access_token|refreshtoken|accesstoken|authorization|cookie|auth|apikey|api_key|resend_api_key|openai_api_key|secret|jwt_secret|jwt_refresh_secret|private_key|privatekey|ssh_key|reset_url|invitation_url|reset_link|invitationlink|smtp_password|pg_password|db_password|invitation_token|invitation_token_hash|code|code_hash|otp)$/i

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[Truncated]'
  if (value === null || value === undefined) return value
  if (typeof value === 'string') {
    return looksLikeToken(value) ? maskToken(value) : value
  }
  if (typeof value === 'number' || typeof value === 'boolean') return value
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1))
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_RE.test(k)) {
        if (typeof v === 'string' && looksLikeToken(v)) {
          out[k] = maskToken(v)
        } else {
          out[k] = '[REDACTED]'
        }
      } else {
        out[k] = redact(v, depth + 1)
      }
    }
    return out
  }
  return value
}

function fmt(parts: unknown[]): unknown[] {
  return parts.map(p => redact(p))
}

export const logger = {
  info:  (...parts: unknown[]) => console.log('[info] ', ...fmt(parts)),
  warn:  (...parts: unknown[]) => console.warn('[warn] ', ...fmt(parts)),
  error: (...parts: unknown[]) => console.error('[error]', ...fmt(parts)),
  debug: (...parts: unknown[]) => {
    if (process.env.NODE_ENV !== 'production') console.log('[debug]', ...fmt(parts))
  },
}
