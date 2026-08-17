/* GestiQ Service Worker
   - Network-first for HTML navigations so deploys are picked up
     automatically on the next page load.
   - Cache-first for hashed static assets (Vite emits content hashes,
     so they are safe to serve from cache indefinitely).
   - API requests are never intercepted; the offline IndexedDB layer
     handles application data. */

const CACHE = 'gestiq-v3'
const PRECACHE = ['/', '/manifest.json']

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

const isHashedAsset = url =>
  /\/assets\/.+-[A-Za-z0-9_-]{8,}\.(js|css|woff2?|ttf|otf|svg|png|jpg|jpeg|webp|avif|ico)$/.test(url)

const isApi = url => /\/api\//.test(url)

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return
  const url = new URL(e.request.url)

  // Never cache API traffic — the offline IndexedDB layer owns it.
  if (isApi(url.pathname) || url.host !== self.location.host) return

  // Cache-first for hashed assets (immutable).
  if (isHashedAsset(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then(cached =>
        cached || fetch(e.request).then(res => {
          if (res.ok) {
            const clone = res.clone()
            caches.open(CACHE).then(c => c.put(e.request, clone))
          }
          return res
        }),
      ),
    )
    return
  }

  // Network-first for HTML / navigations and everything else.
  // Falls back to cache when offline so the shell still loads.
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.ok) {
          const clone = res.clone()
          caches.open(CACHE).then(c => c.put(e.request, clone))
        }
        return res
      })
      .catch(() => caches.match(e.request).then(cached => cached || caches.match('/'))),
  )
})

/* ══════════════════════════════════════════════════════════════════
   Web Push — notifications reçues APPLICATION FERMÉE.

   C'est ici que se joue la différence avec l'API Notification côté
   page : le service worker est réveillé par le navigateur même si
   aucun onglet n'est ouvert. Sur Mac, la PWA installée fait passer
   ces notifications par le centre de notifications du système.

   Le serveur envoie un JSON { title, body, url, tag, icon } chiffré
   pour cet abonnement (cf. server/lib/webPush.ts).
   ══════════════════════════════════════════════════════════════════ */

self.addEventListener('push', e => {
  /* Un push sans données reste possible (test d'un service tiers) :
     on affiche quelque chose de correct plutôt que de planter. */
  let data = {}
  try { data = e.data ? e.data.json() : {} } catch { data = {} }

  const title = data.title || 'NEXT GITAL'
  const options = {
    body: data.body || '',
    icon: data.icon || '/icon-192.png',
    badge: '/icon-192.png',
    /* `tag` fait qu'un nouveau rappel REMPLACE le précédent de la même
       tâche, au lieu d'empiler « demain » puis « dans 30 min ». */
    tag: data.tag || 'gestiq',
    renotify: true,
    data: { url: data.url || '/' },
  }
  e.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', e => {
  e.notification.close()
  const target = (e.notification.data && e.notification.data.url) || '/'

  /* Réutiliser un onglet déjà ouvert plutôt qu'en empiler un nouveau à
     chaque rappel — et le mettre au premier plan. */
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      for (const client of list) {
        if ('focus' in client) {
          /* `navigate()` REJETTE quand le client n'est pas contrôlé par
             ce service worker (spec) — et `matchAll` est justement
             appelé avec includeUncontrolled. Sans ce rattrapage, le
             rejet non géré empêchait la mise au premier plan. */
          const navigated = client.navigate
            ? Promise.resolve(client.navigate(target)).catch(() => null)
            : Promise.resolve(null)
          return navigated.then(c => (c || client).focus())
        }
      }
      return self.clients.openWindow(target)
    }),
  )
})
