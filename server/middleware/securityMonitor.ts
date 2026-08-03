/**
 * Security Center — middlewares.
 *
 *  1. `requireSecurityMonitoring` : le contrôle d'accès du module. Le
 *     Centre de sécurité expose des IP, des emails et des comportements
 *     d'utilisateurs : il est réservé aux administrateurs et aux porteurs
 *     explicites de SECURITY_MONITORING_READ. Aucun autre rôle
 *     (manager / commercial / comptable / viewer) n'y accède, ni par
 *     défaut ni par héritage de hiérarchie.
 *
 *  2. `securityResponseMonitor` : observateur global des refus HTTP
 *     (401 / 403 / 429). Il ne journalise QUE les refus — une requête
 *     normale ne produit aucune écriture (§10).
 */
import type { Request, Response, NextFunction } from 'express'
import { queryOne } from '../db/pool'
import { logger } from '../lib/logger'
import { trackSecurityEvent } from '../lib/securityEvents'
import type { SecurityEventType } from '../lib/securityCore'

export const SECURITY_MONITORING_PERMISSION = 'SECURITY_MONITORING_READ'

/* Marqueur : une route a déjà journalisé un événement précis pour cette
   requête → l'observateur global ne doit pas en ajouter un générique. */
const LOGGED = Symbol('securityLogged')

export function markSecurityLogged(req: Request): void {
  (req as Request & { [LOGGED]?: boolean })[LOGGED] = true
}

function alreadyLogged(req: Request): boolean {
  return (req as Request & { [LOGGED]?: boolean })[LOGGED] === true
}

/**
 * Vérifie le droit d'accès au Centre de sécurité — CÔTÉ SERVEUR, sur la
 * base de l'état RÉEL en base, pas du rôle inscrit dans le JWT.
 *
 * Pourquoi ne pas se fier au JWT : l'access token vit 1 h. Un
 * administrateur rétrogradé ou un compte désactivé garderait sinon
 * l'accès au module le plus sensible de la plateforme pendant une heure.
 * Une requête indexée par appel est un prix acceptable pour ce module —
 * il n'est pas dans un chemin chaud.
 */
export async function requireSecurityMonitoring(
  req: Request, res: Response, next: NextFunction,
): Promise<void> {
  const user = req.user
  if (!user?.userId || !user?.tenantId) {
    res.status(401).json({ error: 'Non authentifié' })
    return
  }

  try {
    const row = await queryOne<{ role: string; has_permission: boolean }>(
      `SELECT tu.role,
              EXISTS (
                SELECT 1 FROM user_permissions up
                 WHERE up.user_id    = tu.user_id
                   AND up.tenant_id  = tu.tenant_id
                   AND up.permission = $3
                   AND up.revoked_at IS NULL
              ) AS has_permission
         FROM tenant_users tu
         JOIN users u ON u.id = tu.user_id
        WHERE tu.user_id = $1
          AND tu.tenant_id = $2
          AND tu.status = 'active'
          AND u.is_active = true`,
      [user.userId, user.tenantId, SECURITY_MONITORING_PERMISSION]
    )

    if (row && (row.role === 'admin' || row.has_permission)) {
      next()
      return
    }

    /* Refus tracé : savoir qui essaie d'ouvrir le Centre de sécurité fait
       partie du monitoring. Le rôle est journalisé, jamais le JWT. */
    markSecurityLogged(req)
    trackSecurityEvent({
      type: 'security_center_access_denied',
      req,
      httpStatus: 403,
      reason: row ? 'missing_security_monitoring_permission' : 'inactive_membership',
      metadata: { role: row?.role ?? 'unknown' },
    })
    res.status(403).json({ error: 'Accès refusé' })
  } catch (err: unknown) {
    logger.error('[requireSecurityMonitoring]', (err as Error)?.message)
    /* Fail-closed : en cas de doute sur le droit d'accès, on refuse. */
    res.status(403).json({ error: 'Accès refusé' })
  }
}

/**
 * Observateur global des refus. Branché une seule fois dans index.ts,
 * après le parsing et avant les routes.
 *
 * Choix délibérés :
 *   - on n'écoute que 401 / 403 / 429 : les 404 et 5xx sont du bruit
 *     opérationnel, pas des signaux de sécurité (§3) ;
 *   - la classification par défaut reste INFO/LOW/MEDIUM : un 401 isolé
 *     n'est jamais une « tentative de piratage » ; c'est l'accumulation,
 *     traitée par les alertes, qui qualifie ;
 *   - `res.on('finish')` : la journalisation se fait APRÈS l'envoi de la
 *     réponse, elle n'ajoute pas de latence perçue.
 */
export function securityResponseMonitor(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    const status = res.statusCode
    if (status !== 401 && status !== 403 && status !== 429) return
    if (alreadyLogged(req)) return

    const type: SecurityEventType =
      status === 429 ? 'rate_limit'
      : status === 403 ? 'permission_denied'
      : 'unauthorized'

    trackSecurityEvent({
      type,
      req,
      httpStatus: status,
      reason: status === 429 ? 'rate_limited'
            : status === 403 ? 'access_denied'
            : 'unauthenticated',
    })
  })
  next()
}
