/**
 * Révocation RÉELLE d'une session.
 *
 * ── Le problème corrigé ─────────────────────────────────────────────
 * Le jeton d'accès vit 1 heure et ne portait rien qui l'attache à une
 * session précise : il contenait `userId, email, tenantId, role`, et
 * rien d'autre. Révoquer une ligne de `refresh_tokens` empêchait donc
 * de PROLONGER la session, mais laissait le jeton déjà émis fonctionner
 * jusqu'à son expiration. Un administrateur qui cliquait « Déconnecter
 * cette session » voyait la ligne disparaître de l'écran pendant que
 * l'appareil visé continuait tranquillement à travailler, jusqu'à une
 * heure durant. C'est précisément ce que le cahier des charges refuse :
 * « la révocation doit réellement invalider la session côté backend ».
 *
 * Le jeton d'accès porte désormais `sid` — l'identifiant de la ligne
 * `refresh_tokens` qui l'a fait naître — et chaque requête vérifie que
 * cette session vit encore.
 *
 * ── Le coût ─────────────────────────────────────────────────────────
 * Une requête indexée par appel serait payée sur le chemin chaud. Même
 * traitement que le rôle effectif (cf. lib/effectiveRole) : cache
 * mémoire à TTL courte (30 s), et invalidation explicite au moment où
 * l'on révoque — la déconnexion est alors immédiate, pas « dans 30 s ».
 *
 * ── Compatibilité ───────────────────────────────────────────────────
 * Les jetons émis AVANT ce changement n'ont pas de `sid`. Les refuser
 * aurait déconnecté tout le monde au déploiement. Ils restent donc
 * acceptés — au pire une heure, le temps qu'ils expirent d'eux-mêmes et
 * que la rotation en émette de nouveaux, porteurs du `sid`.
 */
import { queryOne } from '../db/pool'

const TTL_MS = 30_000
const MAX_ENTRIES = 10_000

interface Entry { vivante: boolean; exp: number }
const cache = new Map<string, Entry>()

/**
 * La session existe-t-elle encore et est-elle utilisable ?
 *
 * `false` dès que la ligne est révoquée, expirée, ou a disparu — les
 * trois doivent fermer la porte de la même façon.
 */
export async function isSessionActive(sid: string): Promise<boolean> {
  if (!sid) return true          // jeton d'avant le changement : cf. Compatibilité

  const now = Date.now()
  const hit = cache.get(sid)
  if (hit && hit.exp > now) return hit.vivante

  const row = await queryOne<{ vivante: boolean }>(
    `SELECT (revoked = false AND expires_at > NOW()) AS vivante
       FROM refresh_tokens
      WHERE id = $1`,
    [sid]
  )

  /* Ligne absente : la session a été purgée. On refuse — mais on ne met
     PAS ce refus en cache sous la même clé sans expiration, sinon une
     purge de maintenance bloquerait des jetons encore légitimes plus
     longtemps que la TTL. La TTL courte suffit. */
  const vivante = row?.vivante === true

  if (cache.size >= MAX_ENTRIES) cache.clear()
  cache.set(sid, { vivante, exp: now + TTL_MS })
  return vivante
}

/** À appeler dès qu'une session est révoquée : la coupure devient
 *  immédiate au lieu d'attendre l'expiration du cache. */
export function invalidateSession(sid: string): void {
  if (sid) cache.delete(sid)
}

/** Toutes les sessions d'un utilisateur viennent d'être coupées : on ne
 *  connaît pas leurs identifiants ici, on vide donc tout. Rare, et le
 *  coût est une poignée de requêtes indexées le temps que le cache se
 *  reconstitue. */
export function invalidateAllSessions(): void {
  cache.clear()
}

/** Tests. */
export const resetSessionCache = invalidateAllSessions
export const SESSION_CACHE_TTL_MS = TTL_MS
