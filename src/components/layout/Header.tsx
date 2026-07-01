import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu, Search, Bell, ChevronRight, User, LogOut, Settings,
  AlertTriangle, AlertCircle, Info, X, CheckCheck,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import ThemeToggle from '@/components/ui/ThemeToggle'
import NotificationBell from '@/components/NotificationBell'
import { cn } from '@/lib/utils'
import { useAlerts, type Alert, type AlertPriority } from '@/hooks/useAlerts'
import { openGlobalSearch } from '@/components/GlobalSearch'

const BREADCRUMB_MAP: Record<string, string> = {
  '/':               'Tableau de bord',
  '/prospects':      'CRM / Prospects',
  '/clients':        'Clients',
  '/taches':         'Tâches',
  '/calendrier':     'Calendrier',
  '/devis':          'Devis',
  '/factures':       'Factures',
  '/contrats':       'Contrats',
  '/bons-commande':  'Bons de commande',
  '/produits':       'Produits & Services',
  '/paiements':      'Paiements',
  '/cheques-recus':  'Chèques reçus',
  '/cheques-emis':   'Chèques émis',
  '/depenses':       'Dépenses',
  '/finances':       'Finances',
  '/abonnements':    'Abonnements',
  '/equipe':         'Équipe',
  '/fournisseurs':   'Fournisseurs',
  '/contacts':       'Contacts',
  '/domaines':       'Domaines',
  '/hebergements':   'Hébergements',
  '/statistiques':   'Statistiques',
  '/activite':       "Journal d'activité",
  '/conseiller-ia':  'Conseiller IA',
  '/parametres':     'Paramètres',
  '/automatisations':'Automatisations',
}

const PRIORITY_CONFIG: Record<AlertPriority, {
  icon:    React.ElementType
  color:   string
  bg:      string
  dot:     string
  badge:   string
}> = {
  critical: {
    icon:  AlertTriangle,
    color: 'text-red-600 dark:text-red-400',
    bg:    'bg-red-50 dark:bg-red-950/30',
    dot:   'bg-red-500',
    badge: 'bg-red-500',
  },
  medium: {
    icon:  AlertCircle,
    color: 'text-amber-600 dark:text-amber-400',
    bg:    'bg-amber-50 dark:bg-amber-950/20',
    dot:   'bg-amber-500',
    badge: 'bg-amber-500',
  },
  low: {
    icon:  Info,
    color: 'text-blue-600 dark:text-blue-400',
    bg:    'bg-blue-50 dark:bg-blue-950/20',
    dot:   'bg-blue-400',
    badge: 'bg-blue-400',
  },
}

function AlertItem({ alert, onDismiss, onNavigate }: {
  alert:      Alert
  onDismiss:  (id: string) => void
  onNavigate: (link?: string) => void
}) {
  const cfg = PRIORITY_CONFIG[alert.priority]
  const Icon = cfg.icon
  return (
    <div
      className={cn(
        'flex items-start gap-3 px-4 py-3 cursor-pointer group transition-colors',
        alert.is_read ? 'opacity-60' : '',
        'hover:bg-slate-50 dark:hover:bg-slate-800/50',
      )}
      onClick={() => onNavigate(alert.link)}
    >
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg)}>
        <Icon className={cn('w-4 h-4', cfg.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm font-medium leading-tight', alert.is_read ? 'text-muted-foreground' : 'text-slate-800 dark:text-slate-100')}>
            {alert.title}
          </p>
          {!alert.is_read && <span className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1', cfg.dot)} />}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.message}</p>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded"
        onClick={e => { e.stopPropagation(); onDismiss(alert.id) }}
        title="Ignorer"
      >
        <X className="w-3 h-3 text-slate-400" />
      </button>
    </div>
  )
}

interface HeaderProps {
  onMenuToggle: () => void
  collapsed:    boolean
}

export default function Header({ onMenuToggle, collapsed }: HeaderProps) {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const { signOut } = useAuth()
  const [alertsOpen, setAlertsOpen] = useState(false)

  const { alerts, unreadCount, criticalCount, dismiss, dismissAll } = useAlerts()

  const currentPage = BREADCRUMB_MAP[location.pathname]
    || location.pathname.split('/').filter(Boolean)[0]?.replace(/-/g, ' ')
    || 'Accueil'

  const iconBtn = 'h-9 w-9 flex items-center justify-center rounded-lg transition-colors duration-150 text-slate-500 hover:text-slate-700 hover:bg-blue-50 dark:text-slate-400 dark:hover:text-white dark:hover:bg-slate-800'

  const handleAlertNav = (link?: string) => {
    setAlertsOpen(false)
    if (link) navigate(`/${tenantSlug}${link}`)
  }

  const bellColor = criticalCount > 0
    ? 'text-red-500 hover:text-red-600'
    : unreadCount > 0
      ? 'text-amber-500 hover:text-amber-600'
      : ''

  const badgeBg = criticalCount > 0 ? 'bg-red-500' : 'bg-amber-500'

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-14 md:h-16 z-30 flex items-center justify-between px-3 md:px-5',
        'border-b transition-all duration-300',
        'bg-white/95 border-[#E5E7EB]',
        'dark:bg-[#050d1a]/95 dark:border-slate-800/80',
        'backdrop-blur-sm',
        'pt-[env(safe-area-inset-top)]',
        // Mobile: sidebar is a drawer (hidden by default) → header spans full width
        // Desktop (md+): align with the sidebar (64px collapsed / 256px expanded)
        'left-0',
        collapsed ? 'md:left-16' : 'md:left-64',
      )}
    >
      {/* ── Left ── */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
        <button onClick={onMenuToggle} className={cn(iconBtn, 'flex-shrink-0')} aria-label="Menu">
          <Menu className="w-5 h-5" />
        </button>
        <nav className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="text-slate-400 dark:text-slate-500 font-medium hidden sm:inline">NEXT GITAL</span>
          <ChevronRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 flex-shrink-0 hidden sm:block" />
          <span className="font-semibold text-slate-700 dark:text-slate-200 capitalize truncate">
            {currentPage}
          </span>
        </nav>
      </div>

      {/* ── Right ── */}
      <div className="flex items-center gap-1">

        {/* Search — opens global command palette */}
        <button
          onClick={openGlobalSearch}
          className="hidden sm:flex items-center gap-2 px-3 h-9 rounded-lg text-sm text-slate-400 border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:border-blue-400 hover:text-slate-600 dark:hover:border-slate-500 transition-all"
          aria-label="Rechercher"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="text-xs hidden md:inline">Rechercher…</span>
          <kbd className="hidden md:flex items-center gap-0.5 px-1 rounded bg-slate-200 dark:bg-slate-700 text-[10px] font-mono text-slate-400 leading-none py-0.5">⌘K</kbd>
        </button>
        <button onClick={openGlobalSearch} className={`${iconBtn} sm:hidden`} aria-label="Rechercher">
          <Search className="w-4 h-4" />
        </button>

        <ThemeToggle />

        {/* ── Task / validation notifications bell ── */}
        <NotificationBell scope="admin" />

        {/* ── Alerts Bell ── */}
        <div className="relative">
          <button
            className={cn(iconBtn, 'relative', bellColor)}
            onClick={() => setAlertsOpen(v => !v)}
            aria-label="Alertes"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className={cn(
                'absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full',
                'flex items-center justify-center',
                'text-white text-[10px] font-bold ring-2 ring-white dark:ring-slate-900',
                badgeBg,
              )}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {alertsOpen && (
              <>
                {/* Backdrop */}
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setAlertsOpen(false)}
                />
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0,  scale: 1    }}
                  exit={{    opacity: 0, y: -8, scale: 0.95 }}
                  transition={{ duration: 0.15 }}
                  className={cn(
                    'absolute right-0 top-11 z-50 rounded-2xl shadow-xl border overflow-hidden',
                    'w-[calc(100vw-1rem)] max-w-[360px] sm:w-[360px]',
                    'bg-white dark:bg-[#0d1829]',
                    'border-slate-200 dark:border-slate-700/80',
                  )}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-slate-500" />
                      <span className="font-semibold text-sm text-slate-800 dark:text-slate-100">
                        Alertes
                      </span>
                      {unreadCount > 0 && (
                        <span className={cn('text-xs font-bold px-1.5 py-0.5 rounded-full text-white', badgeBg)}>
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={dismissAll}
                        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Tout lire
                      </button>
                    )}
                  </div>

                  {/* Alert list */}
                  <div className="max-h-[420px] overflow-y-auto">
                    {alerts.length === 0 ? (
                      <div className="py-10 text-center">
                        <Bell className="w-8 h-8 text-slate-200 dark:text-slate-700 mx-auto mb-2" />
                        <p className="text-sm text-muted-foreground">Aucune alerte active</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {alerts.map(alert => (
                          <AlertItem
                            key={alert.id}
                            alert={alert}
                            onDismiss={dismiss}
                            onNavigate={handleAlertNav}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  {alerts.length > 0 && (
                    <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 text-center">
                      <button
                        className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                        onClick={() => { navigate(`/${tenantSlug}/statistiques`); setAlertsOpen(false) }}
                      >
                        Voir toutes les analyses →
                      </button>
                    </div>
                  )}
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>

        <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-1" />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2.5 px-2 py-1.5 rounded-xl hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors"
              aria-label="Menu utilisateur"
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
                style={{ background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)' }}
              >
                <span className="text-white text-xs font-bold">NG</span>
              </div>
              <div className="text-left hidden sm:block">
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-none">NEXT GITAL</p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">Admin</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48 rounded-xl shadow-lg border-slate-200">
            <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg text-slate-700 dark:text-slate-300">
              <User className="w-4 h-4 text-slate-400" /> Profil
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer gap-2 rounded-lg text-slate-700 dark:text-slate-300"
              onClick={() => navigate(`/${tenantSlug}/parametres`)}
            >
              <Settings className="w-4 h-4 text-slate-400" /> Paramètres
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 rounded-lg text-red-600 dark:text-red-400 focus:bg-red-50 dark:focus:bg-red-950/30 focus:text-red-600"
              onClick={() => signOut()}
            >
              <LogOut className="w-4 h-4" /> Déconnexion
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
