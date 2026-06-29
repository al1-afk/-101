/**
 * /my-space — root layout for team_member space.
 * Sidebar : Dashboard · Mes SOPs · Mes tâches · Mon profil
 */
import { NavLink, Outlet, Navigate, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  LayoutDashboard, BookOpen, CheckSquare, User, LogOut, Loader2, Menu, X, Briefcase, Bell, MessageSquare,
} from 'lucide-react'
import { useState } from 'react'
import { useMember } from '@/hooks/useMember'
import ThemeToggle from '@/components/ui/ThemeToggle'
import NotificationBell from '@/components/NotificationBell'
import { useTaskNotifier } from '@/hooks/useTaskNotifier'
import { readNotifications, subscribe } from '@/lib/notificationStore'
import { useSyncExternalStore } from 'react'
import { cn } from '@/lib/utils'

const NAV = [
  { to: '/my-space',              label: 'Tableau de bord', icon: LayoutDashboard, end: true },
  { to: '/my-space/projets',      label: 'Mes projets',      icon: Briefcase },
  { to: '/my-space/tasks',        label: 'Mes tâches',       icon: CheckSquare },
  { to: '/my-space/messages',     label: 'Messages',         icon: MessageSquare },
  { to: '/my-space/notifications', label: 'Notifications',   icon: Bell },
  { to: '/my-space/sops',         label: 'Mes SOPs',         icon: BookOpen },
  { to: '/my-space/profile',      label: 'Mon profil',       icon: User },
]

export default function MySpaceLayout() {
  const { loading, isAuth, member, signOut } = useMember()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  /* Poll new tasks + toast on assignment + badge counter */
  const { unreadCount } = useTaskNotifier()
  /* Count unread notifications in store (live) */
  const notifJson = useSyncExternalStore(subscribe, () => JSON.stringify(readNotifications('member')))
  const notifUnread = (JSON.parse(notifJson) as any[]).filter(n => !n.is_read).length

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }
  if (!isAuth || !member) return <Navigate to="/team-login" replace />

  const initials = `${member.first_name?.[0] ?? ''}${member.last_name?.[0] ?? ''}`.toUpperCase()

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Mobile top bar */}
      <header className="lg:hidden sticky top-0 z-30 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 h-14 flex items-center justify-between">
        <button onClick={() => setOpen(true)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800">
          <Menu className="w-5 h-5" />
        </button>
        <span className="font-semibold text-sm text-slate-700 dark:text-slate-200">Mon espace</span>
        <div className="flex items-center gap-1">
          <NotificationBell scope="member" />
          <ThemeToggle />
        </div>
      </header>

      {/* Sidebar (desktop persistent, mobile drawer) */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col transition-transform',
          open ? 'translate-x-0' : '-translate-x-full',
          'lg:translate-x-0',
        )}
      >
        <div className="h-16 px-5 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-600 to-blue-600 flex items-center justify-center text-white font-extrabold text-sm shadow-sm">
              G
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-tight">Mon espace</div>
              <div className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight">{member.tenant_name}</div>
            </div>
          </div>
          <button onClick={() => setOpen(false)} className="lg:hidden p-1.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Profile card */}
        <div className="px-4 py-4 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center text-white font-bold">
              {initials}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">
                {member.first_name} {member.last_name}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                {member.job_title || 'Membre'}
              </div>
            </div>
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-2 py-3 space-y-0.5">
          {NAV.map(item => {
            const Icon = item.icon
            const isTasksLink = item.to === '/my-space/tasks'
            const isNotifLink = item.to === '/my-space/notifications'
            const badge = isTasksLink ? unreadCount : isNotifLink ? notifUnread : 0
            return (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setOpen(false)}
                className={({ isActive }) => cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors relative',
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800',
                )}
              >
                <Icon className="w-4 h-4" />
                <span className="flex-1">{item.label}</span>
                {badge > 0 && (
                  <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold animate-pulse">
                    {badge > 9 ? '9+' : badge}
                  </span>
                )}
              </NavLink>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 dark:border-slate-800 p-3 flex items-center gap-2">
          <NotificationBell scope="member" direction="up" align="left" />
          <ThemeToggle />
          <button
            onClick={async () => { await signOut() }}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 dark:text-slate-300 hover:bg-red-50 dark:hover:bg-red-950/30 hover:text-red-700 dark:hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Backdrop mobile */}
      {open && (
        <div onClick={() => setOpen(false)} className="lg:hidden fixed inset-0 z-30 bg-black/40" />
      )}

      {/* Main content */}
      <main className="lg:pl-72">
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6"
        >
          <Outlet />
        </motion.div>
      </main>
    </div>
  )
}
