/**
 * Rôle EFFECTIF d'un utilisateur — lu en base, pas dans le JWT.
 *
 * ── Le problème corrigé ─────────────────────────────────────────────
 * L'access token porte `role` et vit 1 heure. Le contrôle d'accès aux
 * tables (`tableRbac`) et `requireRole` lisaient ce champ. Conséquence :
 * un utilisateur rétrogradé — ou dont l'accès vient d'être révoqué, ou
 * dont le compte vient d'être désactivé — conservait ses droits
 * d'origine jusqu'à l'expiration de son token. Une révocation d'urgence
 * n'avait aucun effet immédiat.
 *
 * Ici, le rôle vient de `tenant_users`, avec vérification que
 * l'appartenance est active ET que le compte est actif.
 *
 * ── Le coût ─────────────────────────────────────────────────────────
 * Une requête indexée par appel serait payée sur le chemin chaud du
 * CRUD. On met donc en cache pour une durée COURTE (30 s) : la fenêtre
 * de rétrogradation passe de 1 heure à 30 secondes au pire, et à zéro
 * quand le code qui modifie un rôle invalide explicitement le cache
 * (`invalidateRole`). Le cache est en mémoire du process : en
 * multi-instance, chaque instance a la sienne — d'où la TTL courte.
 */
import { queryOne } from '../db/pool'
import type { Role } from '../middleware/auth'

const TTL_MS = 30_000
const MAX_ENTRIES = 10_000

interface Entry { role: Role | null; exp: number }
const cache = new Map<string, Entry>()

const keyOf = (userId: string, tenantId: string) => `${userId}|${tenantId}`

/**
 * Renvoie le rôle effectif, ou `null` si l'utilisateur n'a plus d'accès
 * actif à cet espace (appartenance révoquée, compte désactivé, ligne
 * supprimée). `null` doit toujours être traité comme un refus.
 */
export async function getEffectiveRole(
  userId: string, tenantId: string,
): Promise<Role | null> {
  const key = keyOf(userId, tenantId)
  const hit = cache.get(key)
  const now = Date.now()
  if (hit && hit.exp > now) return hit.role

  const row = await queryOne<{ role: string }>(
    `SELECT tu.role
       FROM tenant_users tu
       JOIN users u ON u.id = tu.user_id
      WHERE tu.user_id = $1
        AND tu.tenant_id = $2
        AND tu.status = 'active'
        AND u.is_active = true`,
    [userId, tenantId]
  )

  const role = (row?.role ?? null) as Role | null
  if (cache.size >= MAX_ENTRIES) cache.clear()
  cache.set(key, { role, exp: now + TTL_MS })
  return role
}

/** À appeler dès qu'un rôle, un statut d'appartenance ou l'activation
 *  d'un compte change — la révocation devient alors immédiate. */
export function invalidateRole(userId: string, tenantId?: string): void {
  if (tenantId) { cache.delete(keyOf(userId, tenantId)); return }
  for (const k of cache.keys()) {
    if (k.startsWith(`${userId}|`)) cache.delete(k)
  }
}

/** Vide tout le cache (tests, ou changement massif de droits). */
export function resetRoleCache(): void {
  cache.clear()
}

export const ROLE_CACHE_TTL_MS = TTL_MS
