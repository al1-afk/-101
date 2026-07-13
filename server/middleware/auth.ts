import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'

/* ── Secret loader: fails hard in production if env is missing ──── */
function loadSecret(name: 'JWT_SECRET' | 'JWT_REFRESH_SECRET'): string {
  const v = process.env[name]
  if (v && v.length >= 32) return v
  if (process.env.NODE_ENV === 'production') {
    throw new Error(`FATAL: ${name} must be set to a value of at least 32 characters in production`)
  }
  /* Dev-only stable fallback — not used in prod */
  return `dev-${name}-fallback-${'x'.repeat(40)}`
}

const ACCESS_SECRET  = loadSecret('JWT_SECRET')
const REFRESH_SECRET = loadSecret('JWT_REFRESH_SECRET')

export interface JwtPayload {
  userId:   string
  email:    string
  tenantId: string
  role:     string
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Non authentifié' })
  }
  try {
    const token = header.slice(7)
    const payload = jwt.verify(token, ACCESS_SECRET) as JwtPayload & { type?: string }
    // Refuse refresh tokens used as access tokens
    if (payload.type === 'refresh') {
      return res.status(401).json({ error: 'Token invalide' })
    }
    req.user = payload
    next()
  } catch (err: any) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expiré', code: 'TOKEN_EXPIRED' })
    }
    return res.status(401).json({ error: 'Token invalide' })
  }
}

/* Access token — 1 heure.
   Historique : 15 min forçait un /refresh très fréquent, et chaque échec
   transient (5xx, réseau) provoquait à tort une déconnexion.
   1h réduit d'un facteur 4 les fenêtres de refresh sans compromettre
   significativement la sécurité (le refresh reste vérifié en DB). */
export function signAccessToken(payload: JwtPayload): string {
  return jwt.sign({ ...payload, type: 'access' }, ACCESS_SECRET, { expiresIn: '1h' })
}

/* Refresh token — 90 jours, stocké en httpOnly cookie + hashé en DB.
   Historique : 7 jours obligeait les utilisateurs à se reconnecter chaque
   semaine. 90 jours permet une session vraiment persistante entre les
   fermetures/réouvertures du navigateur. La révocation reste possible
   individuellement ou globalement depuis l'admin. */
export function signRefreshToken(payload: Pick<JwtPayload, 'userId' | 'tenantId'>): string {
  return jwt.sign({ ...payload, type: 'refresh' }, REFRESH_SECRET, { expiresIn: '90d' })
}

export function verifyRefreshToken(token: string): (Pick<JwtPayload, 'userId' | 'tenantId'> & { type: string }) | null {
  try {
    return jwt.verify(token, REFRESH_SECRET) as any
  } catch {
    return null
  }
}

/* Legacy alias — used during migration */
export const signToken = signAccessToken

/* ── RBAC role hierarchy — aligned with frontend `Role` type ───── */
export type Role = 'admin' | 'manager' | 'commercial' | 'comptable' | 'viewer'

const ROLE_RANK: Record<Role, number> = {
  admin:      4,
  manager:    3,
  commercial: 2,
  comptable:  2,
  viewer:     1,
}

export function requireRole(minRole: Role) {
  return (req: Request, res: Response, next: NextFunction) => {
    const role = (req.user?.role ?? '') as Role
    const rank = ROLE_RANK[role] ?? 0
    if (rank < ROLE_RANK[minRole]) {
      return res.status(403).json({ error: 'Permissions insuffisantes' })
    }
    next()
  }
}
