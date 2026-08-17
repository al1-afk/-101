/**
 * Abonnement Web Push côté navigateur.
 *
 * Différence essentielle avec `src/lib/browserNotifications.ts` : celui-ci
 * affiche une notification quand un ONGLET est ouvert. Le Web Push, lui,
 * passe par le service worker et atteint la personne **application
 * fermée** — c'est ce qui rend un rappel « dans 5 minutes » utile.
 *
 * ── Trois conditions, dans cet ordre ───────────────────────────────
 *   1. le serveur a des clés VAPID (sinon rien n'est possible) ;
 *   2. le navigateur expose Push + un service worker enregistré ;
 *   3. la personne accorde l'autorisation.
 *
 * En développement, le service worker est volontairement désenregistré
 * (cf. src/main.tsx : les ports localhost sont recyclés entre projets
 * Vite). Le push n'est donc testable que sur l'application déployée —
 * `pushSupport()` le dit explicitement plutôt que d'échouer sans raison.
 */
import { api } from './api'

export type PushState =
  | 'ready'          // abonné et opérationnel
  | 'available'      // possible, pas encore autorisé/abonné
  | 'denied'         // refusé par la personne
  | 'unsupported'    // navigateur sans Push API
  | 'no-sw'          // service worker absent (cas du mode développement)
  | 'server-off'     // pas de clés VAPID côté serveur

export interface PushStatus {
  state: PushState
  /** Message prêt à afficher, qui explique le blocage éventuel. */
  reason: string
  endpoint: string | null
}

const REASONS: Record<PushState, string> = {
  ready:       'Les rappels arrivent même application fermée.',
  available:   'Autorise les notifications pour être prévenu même app fermée.',
  denied:      'Notifications bloquées dans le navigateur — à réautoriser dans les réglages du site.',
  unsupported: 'Ce navigateur ne gère pas les notifications push.',
  'no-sw':     'Indisponible en développement (le service worker n\'est actif que sur l\'app déployée).',
  'server-off':'Le serveur n\'a pas de clés VAPID configurées.',
}

function status(state: PushState, endpoint: string | null = null): PushStatus {
  return { state, reason: REASONS[state], endpoint }
}

/** Clé publique VAPID (base64url) → Uint8Array, format attendu par l'API. */
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(normalized)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!('serviceWorker' in navigator)) return null
  try {
    return (await navigator.serviceWorker.getRegistration()) ?? null
  } catch {
    return null
  }
}

/** État courant, sans rien demander ni modifier. */
export async function pushStatus(): Promise<PushStatus> {
  if (!('PushManager' in window) || !('Notification' in window)) return status('unsupported')

  const reg = await registration()
  if (!reg) return status('no-sw')

  let serverKey = ''
  try {
    const info = await api.get<{ enabled: boolean; publicKey: string }>('/api/push/public-key')
    if (!info.enabled || !info.publicKey) return status('server-off')
    serverKey = info.publicKey
  } catch {
    return status('server-off')
  }

  if (Notification.permission === 'denied') return status('denied')

  const existing = await reg.pushManager.getSubscription()
  if (existing) {
    /* Un abonnement navigateur ne prouve pas que le SERVEUR le connaît :
       la base a pu être restaurée, l'abonnement enregistré sous un autre
       compte, ou les clés VAPID changées. On ne se déclare « prêt » que
       si l'abonnement correspond à la clé du serveur ET qu'il y figure. */
    if (!matchesServerKey(existing, serverKey)) return status('available')
    return status('ready', existing.endpoint)
  }

  return status('available')
}

/** L'abonnement a-t-il été créé avec la clé publique actuelle du serveur ? */
function matchesServerKey(sub: PushSubscription, serverKey: string): boolean {
  const raw = sub.options?.applicationServerKey
  if (!raw || !serverKey) return false
  const encoded = btoa(String.fromCharCode(...new Uint8Array(raw)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return encoded === serverKey
}

/**
 * Redépose l'abonnement de ce navigateur auprès du serveur.
 *
 * À appeler à chaque ouverture de l'application : l'abonnement peut
 * avoir été renouvelé par le navigateur, ou avoir disparu côté serveur
 * (restauration, changement de compte). L'UPSERT est sans effet quand
 * tout est déjà en ordre — mais sans lui, un abonnement orphelin ne
 * reçoit plus jamais rien, en silence.
 */
export async function syncPushSubscription(): Promise<boolean> {
  try {
    if (!('PushManager' in window) || Notification.permission !== 'granted') return false
    const reg = await registration()
    const sub = await reg?.pushManager.getSubscription()
    if (!sub) return false
    await api.post('/api/push/subscribe', { subscription: sub.toJSON(), label: deviceLabel() })
    return true
  } catch {
    return false
  }
}

/**
 * Demande l'autorisation, crée l'abonnement et le dépose sur le serveur.
 * Renvoie l'état atteint — jamais d'exception pour un refus, qui est une
 * réponse légitime de la personne et non une panne.
 */
export async function enablePush(label?: string): Promise<PushStatus> {
  if (!('PushManager' in window) || !('Notification' in window)) return status('unsupported')

  const reg = await registration()
  if (!reg) return status('no-sw')

  let publicKey = ''
  try {
    const info = await api.get<{ enabled: boolean; publicKey: string }>('/api/push/public-key')
    if (!info.enabled || !info.publicKey) return status('server-off')
    publicKey = info.publicKey
  } catch {
    return status('server-off')
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission()
  if (permission !== 'granted') return status('denied')

  /* Un abonnement existant peut avoir été créé avec une AUTRE clé
     publique (serveur redéployé, clés régénérées) : il ne recevrait
     plus rien. On le remplace au lieu de le réutiliser aveuglément. */
  const existing = await reg.pushManager.getSubscription()
  if (existing && !matchesServerKey(existing, publicKey)) {
    await existing.unsubscribe().catch(() => {})
  }

  const sub = (await reg.pushManager.getSubscription())
    ?? await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    })

  await api.post('/api/push/subscribe', {
    subscription: sub.toJSON(),
    label: label ?? deviceLabel(),
  })

  return status('ready', sub.endpoint)
}

/** Se désabonne côté navigateur ET côté serveur. */
export async function disablePush(): Promise<void> {
  const reg = await registration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  await api.post('/api/push/unsubscribe', { endpoint }).catch(() => {})
}

/** Envoi de test — vérifie toute la chaîne sans attendre une échéance. */
export function sendTestPush() {
  return api.post<{ success: boolean; delivered: number }>('/api/push/test', {})
}

/** « Chrome sur Mac », « Safari sur iPhone » — pour reconnaître l'appareil. */
export function deviceLabel(): string {
  const ua = navigator.userAgent
  const browser =
    /Edg\//.test(ua)    ? 'Edge'
    : /OPR\//.test(ua)  ? 'Opera'
    : /Chrome\//.test(ua) ? 'Chrome'
    : /Firefox\//.test(ua) ? 'Firefox'
    : /Safari\//.test(ua) ? 'Safari'
    : 'Navigateur'
  const os =
    /iPhone|iPad/.test(ua) ? 'iOS'
    : /Android/.test(ua)   ? 'Android'
    : /Mac OS X/.test(ua)  ? 'Mac'
    : /Windows/.test(ua)   ? 'Windows'
    : /Linux/.test(ua)     ? 'Linux'
    : ''
  return os ? `${browser} sur ${os}` : browser
}
