/**
 * Notifications navigateur (Notification API).
 * Affiche une notification système même si l'app est en arrière-plan.
 * Respecte la préférence utilisateur stockée dans localStorage.
 */

const PREF_KEY = 'gestiq_browser_notifs'

export type BrowserNotifPref = 'on' | 'off'

export function getBrowserNotifPref(): BrowserNotifPref {
  try {
    return (localStorage.getItem(PREF_KEY) as BrowserNotifPref) ?? 'on'
  } catch { return 'on' }
}

export function setBrowserNotifPref(v: BrowserNotifPref) {
  try { localStorage.setItem(PREF_KEY, v) } catch { /* ignore */ }
}

/** État actuel de la permission. */
export function getPermission(): NotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) return 'denied'
  return Notification.permission
}

/** Demande la permission si pas déjà accordée/refusée. Retourne le statut final. */
export async function requestPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) return 'denied'
  if (Notification.permission !== 'default') return Notification.permission
  try {
    return await Notification.requestPermission()
  } catch { return 'denied' }
}

interface ShowOpts {
  title: string
  body?: string
  icon?: string
  /** Optionnel : URL à ouvrir quand l'utilisateur clique sur la notif. */
  url?: string
  /** Tag pour dédupliquer (une seule notif visible par tag à la fois). */
  tag?: string
}

/** Affiche une notification navigateur si la permission est accordée et que
 *  l'utilisateur n'a pas désactivé la préférence. Silencieux sinon. */
export function showBrowserNotification(opts: ShowOpts) {
  if (getBrowserNotifPref() !== 'on') return
  if (!('Notification' in window) || Notification.permission !== 'granted') return
  /* Évite de spammer si l'onglet est déjà visible (l'utilisateur va voir
     le toast in-app, pas besoin d'une notif système en plus). */
  if (document.visibilityState === 'visible') return
  try {
    const n = new Notification(opts.title, {
      body: opts.body,
      icon: opts.icon ?? '/favicon.ico',
      tag:  opts.tag,
      badge: '/favicon.ico',
    })
    if (opts.url) {
      n.onclick = () => {
        window.focus()
        if (opts.url) window.location.href = opts.url
        n.close()
      }
    }
  } catch { /* silently ignore */ }
}

/** Demande la permission après un petit délai si jamais demandée. */
export function maybeRequestPermissionOnce() {
  if (!('Notification' in window)) return
  if (Notification.permission !== 'default') return
  /* Délai de 8 secondes pour ne pas surprendre l'utilisateur dès l'arrivée */
  setTimeout(() => {
    requestPermission().catch(() => {})
  }, 8000)
}
