/**
 * /my-space/notifications — historique complet des notifications.
 */
import { useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, CheckCheck, Trash2, Inbox } from 'lucide-react'
import {
  readNotifications, subscribe, markAllRead, markRead, clearAll,
  type Notification,
} from '@/lib/notificationStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

function timeAgo(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000)
  if (diff < 60)     return `il y a ${diff}s`
  if (diff < 3600)   return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400)  return `il y a ${Math.floor(diff / 3600)} h`
  if (diff < 604800) return `il y a ${Math.floor(diff / 86400)} j`
  return new Date(iso).toLocaleDateString('fr-FR')
}

export default function MyNotifications() {
  const navigate = useNavigate()
  const json = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(readNotifications('member')),
  )
  const list: Notification[] = JSON.parse(json)
  const unread = list.filter(n => !n.is_read).length

  /* Group by day */
  const groups = (() => {
    const m = new Map<string, Notification[]>()
    for (const n of list) {
      const d = new Date(n.created_at)
      const today = new Date(); today.setHours(0,0,0,0)
      const yest  = new Date(today); yest.setDate(yest.getDate() - 1)
      const key = d >= today ? 'Aujourd\'hui'
                : d >= yest  ? 'Hier'
                : d.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })
      const arr = m.get(key) ?? []; arr.push(n); m.set(key, arr)
    }
    return [...m.entries()]
  })()

  const onClick = (n: Notification) => {
    markRead('member', n.id)
    if (n.link) navigate(n.link)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Bell className="w-6 h-6 text-blue-500" /> Notifications
            {unread > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white bg-red-500">{unread} non lues</span>
            )}
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Toutes les alertes liées à tes tâches et projets.</p>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <Button variant="secondary" size="sm" onClick={() => markAllRead('member')}>
              <CheckCheck className="w-3.5 h-3.5" /> Tout marquer lu
            </Button>
          )}
          {list.length > 0 && (
            <Button variant="ghost" size="sm" className="text-red-500" onClick={() => { if (confirm('Effacer toutes les notifications ?')) clearAll('member') }}>
              <Trash2 className="w-3.5 h-3.5" /> Effacer
            </Button>
          )}
        </div>
      </div>

      {list.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
          <Inbox className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">Aucune notification pour l'instant.</p>
          <p className="text-xs text-slate-400 mt-1">Tu seras notifié des nouvelles tâches, commentaires et changements.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => (
            <div key={day}>
              <h2 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-2 capitalize">{day}</h2>
              <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                {items.map(n => (
                  <button
                    key={n.id}
                    onClick={() => onClick(n)}
                    className={cn(
                      'w-full text-left p-3.5 flex items-start gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors relative',
                      !n.is_read && 'bg-blue-50/40 dark:bg-blue-950/20',
                    )}
                  >
                    {!n.is_read && (
                      <span className="absolute left-1 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-blue-500" />
                    )}
                    <span className="text-lg flex-shrink-0">{n.icon ?? '🔔'}</span>
                    <div className="flex-1 min-w-0">
                      <p className={cn('text-sm', n.is_read ? 'text-slate-700 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-slate-100')}>
                        {n.title}
                      </p>
                      {n.message && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{n.message}</p>}
                    </div>
                    <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
