/**
 * Bus d'événements temps réel — le tuyau derrière le flux SSE.
 *
 * ── Pourquoi pas Supabase Realtime ────────────────────────────────
 * Le dépôt garde le vocabulaire Supabase (dossier `supabase/migrations`,
 * client dans `src/lib/supabase.ts`), mais l'application NE tourne PAS
 * sur Supabase : c'est Express + PostgreSQL auto-hébergé, et
 * `VITE_SUPABASE_URL` n'est pas configurée — `useRealtime()` ne se
 * connecte donc à rien. Le « temps réel » attendu par la messagerie doit
 * venir de notre propre serveur.
 *
 * ── Pourquoi un bus en mémoire ────────────────────────────────────
 * Un message concerne exactement deux personnes. Prévenir un
 * destinataire, c'est retrouver ses connexions ouvertes et leur écrire :
 * une Map suffit, sans dépendance ni service à exploiter. Ce qui
 * DISPARAÎT avec le processus, ce sont les connexions — pas les
 * messages, qui sont en base. Un redémarrage se traduit par une
 * reconnexion du navigateur et un rechargement de la liste : aucun
 * message perdu.
 *
 * ── Plusieurs instances de serveur ────────────────────────────────
 * Ce bus ne franchit pas la frontière du processus. Le déploiement
 * actuel (un conteneur) n'en a pas besoin. Le jour où l'API tournera en
 * plusieurs répliques, le point d'extension est ici et nulle part
 * ailleurs : relier `publish()` à un LISTEN/NOTIFY PostgreSQL suffirait
 * — les routes n'auraient pas à changer. Et même sans ce relais, le
 * client continue de sonder périodiquement : le pire cas dégrade la
 * latence, il ne casse pas la fonctionnalité.
 */

export type RealtimeEvent =
  | 'message'      // nouveau message reçu (ou envoyé depuis un autre appareil)
  | 'read'         // le correspondant a ouvert la conversation
  | 'delivered'    // le message est arrivé chez le correspondant
  | 'unread'       // le compteur global a changé (synchronisation multi-appareils)

type Listener = (event: RealtimeEvent, data: unknown) => void

/** Clé de canal : une personne DANS un espace. */
const channelKey = (tenantId: string, userId: string) => `${tenantId}:${userId}`

const channels = new Map<string, Set<Listener>>()

/**
 * Plafond de connexions simultanées par personne. Un onglet = une
 * connexion ; téléphone + ordinateur + quelques onglets restent
 * largement sous la limite. Au-delà, c'est un client qui boucle : on
 * refuse plutôt que de laisser filer la mémoire du serveur.
 */
export const MAX_STREAMS_PER_USER = 8

export function streamCount(tenantId: string, userId: string): number {
  return channels.get(channelKey(tenantId, userId))?.size ?? 0
}

/** Y a-t-il au moins une connexion ouverte ? Sert au « ✓✓ Reçu ». */
export function isUserConnected(tenantId: string, userId: string): boolean {
  return streamCount(tenantId, userId) > 0
}

/** Abonne une connexion. Renvoie la fonction de désabonnement. */
export function subscribeUser(tenantId: string, userId: string, fn: Listener): () => void {
  const key = channelKey(tenantId, userId)
  let set = channels.get(key)
  if (!set) { set = new Set(); channels.set(key, set) }
  set.add(fn)
  return () => {
    const s = channels.get(key)
    if (!s) return
    s.delete(fn)
    /* Ne jamais laisser des Set vides s'accumuler : la Map grandirait
       d'une entrée par personne ayant ouvert l'application une fois. */
    if (s.size === 0) channels.delete(key)
  }
}

/**
 * Pousse un événement vers toutes les connexions d'une personne.
 * Renvoie le nombre de connexions servies (0 = personne à l'écoute).
 *
 * Un écouteur qui lève ne doit pas empêcher les autres d'être servis :
 * une socket refermée entre-temps est un cas normal, pas une erreur.
 */
export function publishToUser(
  tenantId: string,
  userId: string,
  event: RealtimeEvent,
  data: unknown,
): number {
  const set = channels.get(channelKey(tenantId, userId))
  if (!set?.size) return 0
  let served = 0
  for (const fn of [...set]) {
    try { fn(event, data); served++ } catch { /* connexion morte */ }
  }
  return served
}

/** Diagnostic (santé du serveur) — jamais de contenu de message ici. */
export function realtimeStats(): { channels: number; connections: number } {
  let connections = 0
  for (const s of channels.values()) connections += s.size
  return { channels: channels.size, connections }
}
