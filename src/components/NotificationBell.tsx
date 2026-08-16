/**
 * NotificationBell — petit composant cloche + dropdown réutilisable
 * (admin et membre).
 *
 * Deux sources fusionnées, triées par date :
 *   • le notificationStore (localStorage) — événements temps réel captés
 *     pendant que l'onglet est ouvert ;
 *   • l'API /api/notifications (côté admin) — ce que le serveur a produit
 *     tout seul : alertes tâches / clients, rapports quotidien et hebdo.
 *     Elles survivent à la déconnexion et suivent l'utilisateur de poste
 *     en poste, contrairement au store local.
 */
import { useEffect, useState, useSyncExternalStore } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Bell, CheckCheck, X, Inbox } from 'lucide-react'
import {
  readNotifications, subscribe, markAllRead, markRead, clearAll,
  type Notification,
} from '@/lib/notificationStore'
import { useNotificationCenter } from '@/hooks/useNotificationCenter'
import { cn } from '@/lib/utils'

interface Props {
  scope:       'admin' | 'member'
  className?:  string
  direction?:  'up' | 'down'   // where the dropdown opens (default 'down')
  align?:      'left' | 'right' // dropdown side (default 'right')
}

/* Élément affiché, quelle que soit sa provenance. */
interface Item {
  id:        string
  source:    'local' | 'server'
  title:     string
  message?:  string
  link?:     string
  icon?:     string
  is_read:   boolean
  created_at:string
  severity?: 'info' | 'success' | 'warning' | 'critical'
}

export default function NotificationBell({ scope, className, direction = 'down', align = 'right' }: Props) {
  const notifications = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(readNotifications(scope)),
  )
  const localList: Notification[] = JSON.parse(notifications)

  /* Les notifications serveur sont adressées à un compte `users` : elles
     n'existent que pour l'espace admin, pas pour la session membre. */
  const center = useNotificationCenter(scope === 'admin')

  const list: Item[] = [
    ...center.notifications.map(n => ({
      id: n.id, source: 'server' as const,
      title: n.title, message: n.message ?? undefined, link: n.link ?? undefined,
      icon: n.icon ?? undefined, is_read: n.is_read, created_at: n.created_at,
      severity: n.severity,
    })),
    ...localList.map(n => ({
      id: n.id, source: 'local' as const,
      title: n.title, message: n.message, link: n.link, icon: n.icon,
      is_read: n.is_read, created_at: n.created_at,
    })),
  ].sort((a, b) => b.created_at.localeCompare(a.created_at))

  const unread = list.filter(n => !n.is_read).length

  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  /* Close on Escape */
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const onItemClick = (n: Item) => {
    if (n.source === 'server') center.markRead(n.id)
    else markRead(scope, n.id)
    if (n.link) {
      navigate(n.link)
      setOpen(false)
    }
  }

  const onMarkAllRead = () => {
    markAllRead(scope)
    if (scope === 'admin') center.markAllRead()
  }

  const onClearAll = () => {
    clearAll(scope)
    if (scope === 'admin') center.clearAll()
  }

  return (
    <div className={cn('relative', className)}>
      <button
        onClick={() => setOpen(o => !o)}
        className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-colors"
        aria-label="Notifications"
        title="Notifications"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white dark:ring-slate-900 animate-pulse">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0,  scale: 1    }}
              exit={{    opacity: 0, y: -8, scale: 0.95 }}
              transition={{ duration: 0.15 }}
              className={cn(
                'absolute z-50 rounded-2xl shadow-xl border w-[calc(100vw-1rem)] max-w-[380px] sm:w-[380px] bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/80 overflow-hidden',
                direction === 'up' ? 'bottom-11' : 'top-11',
                align === 'left' ? 'left-0' : 'right-0',
              )}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-slate-500" />
                  <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">Notifications</span>
                  {unread > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white bg-red-500">{unread}</span>
                  )}
                </div>
                {list.length > 0 && (
                  <div className="flex items-center gap-2">
                    {unread > 0 && (
                      <button onClick={onMarkAllRead} className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
                        <CheckCheck className="w-3.5 h-3.5" /> Tout lire
                      </button>
                    )}
                    <button onClick={onClearAll} className="text-xs text-slate-400 hover:text-red-500" title="Effacer tout">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>

              {/* List */}
              <div className="max-h-[420px] overflow-y-auto">
                {list.length === 0 ? (
                  <div className="py-10 text-center">
                    <Inbox className="w-8 h-8 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 dark:text-slate-400">Aucune notification</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                    {list.slice(0, 30).map(n => (
                      <li key={n.id}>
                        <button
                          onClick={() => onItemClick(n)}
                          className={cn(
                            'w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors flex items-start gap-3 relative',
                            !n.is_read && 'bg-blue-50/40 dark:bg-blue-950/20',
                          )}
                        >
                          {!n.is_read && (
                            <span className={cn(
                              'absolute left-1.5 top-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full',
                              n.severity === 'critical' ? 'bg-red-500'
                                : n.severity === 'warning' ? 'bg-amber-500'
                                : 'bg-blue-500',
                            )} />
                          )}
                          <span className="text-base flex-shrink-0">{n.icon ?? '🔔'}</span>
                          <div className="flex-1 min-w-0">
                            <p className={cn('text-sm', n.is_read ? 'text-slate-600 dark:text-slate-300' : 'font-semibold text-slate-900 dark:text-slate-100')}>
                              {n.title}
                            </p>
                            {n.message && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-2">{n.message}</p>}
                            <p className="text-[10px] text-slate-400 mt-1">
                              {timeAgo(n.created_at)}
                            </p>
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime()
  const diff = Math.floor((Date.now() - d) / 1000)
  if (diff < 60)      return `il y a ${diff}s`
  if (diff < 3600)    return `il y a ${Math.floor(diff / 60)} min`
  if (diff < 86400)   return `il y a ${Math.floor(diff / 3600)} h`
  if (diff < 604800)  return `il y a ${Math.floor(diff / 86400)} j`
  return new Date(iso).toLocaleDateString('fr-FR')
}
