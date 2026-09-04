/**
 * useNotificationCenter — les notifications produites par le SERVEUR
 * (alertes tâches, clients à contacter, rapports quotidien et hebdo).
 *
 * Différence avec `src/lib/notificationStore.ts` : celui-ci vit dans
 * localStorage et ne connaît que ce qui s'est passé pendant que l'onglet
 * était ouvert. Ici, les notifications sont créées par le scheduler
 * même application fermée, et suivent l'utilisateur d'un poste à l'autre.
 *
 * Le hook interroge l'API toutes les 60 s et, à l'arrivée d'une
 * notification jamais vue sur ce poste, joue le signal sonore + la
 * notification navigateur (mêmes réglages que le reste de l'app).
 */
import { useEffect, useMemo, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { notificationsApi, tokenStore, type ServerNotification } from '@/lib/api'
import { playNotificationSound } from '@/lib/notificationSound'
import { showBrowserNotification } from '@/lib/browserNotifications'

const POLL_MS  = 60_000
const SEEN_KEY = 'gestiq_server_notifications_seen'

/* Catégories dont la cloche garde la TRACE sans jamais faire de bruit.
   « message_prive » : la messagerie interne annonce déjà elle-même chaque
   message reçu (toast + son + notification navigateur, useMessagesRealtime),
   à l'instant près et en respectant les préférences DmPrefs de la personne.
   Rejouer le même message ici, jusqu'à 60 s plus tard et sans regarder aucune
   de ces préférences, donnait une seconde alerte en retard et impossible à
   couper. La ligne reste visible dans la liste et continue de compter dans les
   non-lus : c'est ce qui s'est passé pendant l'absence. */
const SILENT_KINDS = new Set(['message_prive'])

function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]') as string[]) }
  catch { return new Set() }
}
function writeSeen(ids: Set<string>) {
  /* Borné : au-delà, on garde les plus récents (l'ordre d'insertion du Set). */
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...ids].slice(-300))) } catch { /* quota */ }
}

export interface NotificationCenter {
  notifications: ServerNotification[]
  unread:        number
  isLoading:     boolean
  markRead:    (id: string) => void
  markAllRead: () => void
  remove:      (id: string) => void
  clearAll:    () => void
}

export function useNotificationCenter(enabled = true): NotificationCenter {
  const qc = useQueryClient()
  const isAuthed = !!tokenStore.get()
  const active = enabled && isAuthed

  const { data, isLoading } = useQuery({
    queryKey: ['notifications', 'center'],
    queryFn:  () => notificationsApi.list(50),
    enabled:  active,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
    /* Une base pas encore migrée renvoie une liste vide, jamais une
       erreur : la cloche ne doit pas casser l'en-tête. */
    retry: 1,
  })

  /* Référence stable : sans useMemo, `?? []` fabrique un tableau neuf à
     chaque rendu et relance l'effet de signalement en boucle. */
  const notifications = useMemo(() => data?.notifications ?? [], [data])
  const unread        = data?.unread ?? 0

  /* Signal sonore + notification navigateur sur ce qui est NOUVEAU. */
  const seenRef  = useRef<Set<string> | null>(null)
  useEffect(() => {
    if (!active || !notifications.length) return
    const first = seenRef.current === null
    const seen  = seenRef.current ?? readSeen()
    seenRef.current = seen

    const fresh = notifications.filter(n => !n.is_read && !seen.has(n.id) && !SILENT_KINDS.has(n.kind))
    for (const n of notifications) seen.add(n.id)
    writeSeen(seen)

    /* Premier chargement de la session : on amorce la mémoire sans
       rejouer les alertes des jours précédents. */
    if (first || !fresh.length) return

    playNotificationSound()
    for (const n of fresh.slice(0, 3)) {
      /* Onglet au premier plan → toast ; en arrière-plan → notification
         système (showBrowserNotification se tait de lui-même quand
         l'onglet est visible). */
      toast(`${n.icon ?? '🔔'} ${n.title}`, {
        description: n.message ?? undefined,
        duration: n.severity === 'critical' ? 12_000 : 7_000,
      })
      showBrowserNotification({
        title: `${n.icon ?? '🔔'} ${n.title}`,
        body:  n.message ?? undefined,
        url:   n.link ?? undefined,
        tag:   n.kind,
        icon:  '/icon-192.png',
      })
    }
  }, [notifications, active])

  const invalidate = () => { void qc.invalidateQueries({ queryKey: ['notifications', 'center'] }) }

  const mRead    = useMutation({ mutationFn: notificationsApi.markRead,    onSuccess: invalidate })
  const mAllRead = useMutation({ mutationFn: notificationsApi.markAllRead, onSuccess: invalidate })
  const mRemove  = useMutation({ mutationFn: notificationsApi.remove,      onSuccess: invalidate })
  const mClear   = useMutation({ mutationFn: notificationsApi.clear,       onSuccess: invalidate })

  return {
    notifications,
    unread,
    isLoading,
    markRead:    (id) => mRead.mutate(id),
    markAllRead: ()   => mAllRead.mutate(),
    remove:      (id) => mRemove.mutate(id),
    clearAll:    ()   => mClear.mutate(),
  }
}
