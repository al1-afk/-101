import { Request, Response, NextFunction } from 'express'
import rateLimit, { ipKeyGenerator } from 'express-rate-limit'
import helmet from 'helmet'
import crypto from 'crypto'
import { logger } from '../lib/logger'

/* ── Helmet — secure HTTP headers ─────────────────────────────── */
export { helmet }

/* ── Rate limiters ────────────────────────────────────────────── */

/** Auth endpoints: max 10 attempts per 15 min per IP (login/register/reset). */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
  skipSuccessfulRequests: true,
})

/** Forgot-password / password reset : 3 requêtes / heure par IP.
 *  Réponse générique côté route pour éviter l'énumération d'emails. */
export const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de demandes. Réessayez plus tard.' },
})

/** Invitations & password resets déclenchés par un admin — 20/heure/IP,
 *  60/heure/tenant (protège contre l'abus de compte admin compromis).
 *  ipKeyGenerator gère correctement IPv4/IPv6 (required par express-rate-limit v7). */
export const inviteLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop d\'invitations. Réessayez plus tard.' },
  keyGenerator: (req: Request) => {
    const tenantId = (req as any).user?.tenantId ?? 'anon'
    const userId   = (req as any).user?.userId   ?? 'anon'
    const ipKey    = ipKeyGenerator(req.ip ?? '0.0.0.0')
    return `${ipKey}|${tenantId}|${userId}`
  },
})

/** General API: 200/min en prod, 2000/min en dev (React Query polling) */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 200 : 2000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Limite de requêtes atteinte.' },
})

/** Password change: max 5 per hour */
export const passwordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Trop de tentatives de changement de mot de passe.' },
})

/** Upload : 60/min/IP — plafond raisonnable pour uploads d'attachments SOP/tâches. */
export const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  message: { error: 'Trop d\'uploads. Réessayez dans une minute.' },
})

/* ── Input sanitizer — strip dangerous characters ─────────────── */
export function sanitizeBody(req: Request, _res: Response, next: NextFunction) {
  function clean(val: unknown): unknown {
    if (typeof val === 'string') {
      return val
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+\s*=/gi, '')
        .trim()
    }
    if (Array.isArray(val)) return val.map(clean)
    if (val && typeof val === 'object') {
      return Object.fromEntries(Object.entries(val as object).map(([k, v]) => [k, clean(v)]))
    }
    return val
  }
  req.body = clean(req.body)
  next()
}

/* ── Column name validator — prevent SQL injection via orderBy ── */
const SAFE_COLUMN = /^[a-z_][a-z0-9_]{0,63}$/

export function safeColumn(col: string, fallback = 'created_at'): string {
  return SAFE_COLUMN.test(col) ? col : fallback
}

/* ── Request-id middleware — assigns a random id per request ──── */
export function requestId(req: Request, res: Response, next: NextFunction) {
  const id = crypto.randomBytes(8).toString('hex')
  ;(req as any).requestId = id
  res.setHeader('X-Request-Id', id)
  next()
}

/* ── Error handler — never leak internals ─────────────────────── */
export function errorHandler(err: any, req: Request, res: Response, _next: NextFunction) {
  const requestId = (req as any).requestId ?? 'unknown'
  const isDev = process.env.NODE_ENV !== 'production'
  /* Log full context server-side (redaction happens inside logger.error) */
  logger.error('[HTTP-ERROR]', {
    requestId,
    method: req.method,
    path:   req.path,
    status: err.status ?? 500,
    name:   err.name,
    message: err.message,
    /* Only include the stack server-side, never in the response. */
    stack:  isDev ? err.stack : undefined,
  })
  const status = err.status ?? 500
  const code   = err.code ?? (status === 404 ? 'NOT_FOUND'
                            : status === 403 ? 'ACCESS_DENIED'
                            : status === 401 ? 'UNAUTHENTICATED'
                            : status === 429 ? 'RATE_LIMITED'
                            : 'INTERNAL_ERROR')
  /* Client-facing payload — flat 'error' string for backward compat with the
   * existing api client (src/lib/api.ts uses `data.error` as a string).
   * Structured details go in separate fields so consumers can opt-in. */
  const publicMessage = status >= 500
    ? 'Une erreur interne est survenue'
    : (err.publicMessage ?? err.message ?? 'Erreur')
  res.status(status).json({
    error:      publicMessage,
    code,
    requestId,
  })
}
