import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Menu, Search, Bell, ChevronRight, User, LogOut, Settings,
  AlertTriangle, AlertCircle, Info, X, CheckCheck, Plus,
  FileText, Receipt, UserCheck, FolderKanban, Sparkles, Languages,
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuLabel,
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
  '/projets':        'Projets',
  '/calendrier':     'Calendrier',
  '/planificateur':  'Planificateur',
  '/devis':          'Devis',
  '/factures':       'Factures',
  '/contrats':       'Contrats',
  '/bons-commande':  'Bons de commande',
  '/bons-livraison': 'Bons de livraison',
  '/produits':       'Articles',
  '/services':       'Services',
  '/produits-stock': 'Produits & Stock',
  '/paiements':      'Paiements',
  '/cheques-recus':  'Chèques reçus',
  '/cheques-emis':   'Chèques émis',
  '/depenses':       'Dépenses',
  '/finances':       'Finances',
  '/finance-ia':     'Finance IA',
  '/abonnements':    'Abonnements',
  '/abonnements-clients': 'Abonnements clients',
  '/equipe':         'Équipe',
  '/fournisseurs':   'Fournisseurs',
  '/contacts':       'Contacts',
  '/vehicules':      'Véhicules',
  '/domaines':       'Domaines',
  '/hebergements':   'Hébergements',
  '/statistiques':   'Statistiques',
  '/activite':       "Journal d'activité",
  '/conseiller-ia':  'Conseiller IA',
  '/parametres':     'Paramètres',
  '/automatisations':'Automatisations',
  '/integrations':   'Intégrations',
  '/rapports':       'Rapports & Export',
  '/sop':            'SOP & Procédures',
  '/guides':         'Guides onboarding',
  '/vision':         'Ma Vision',
  '/bientot':        'Bientôt',
}

/* Group by section for the pill breadcrumb */
const SECTION_OF: Record<string, string> = {
  '/prospects':'CRM','/clients':'CRM','/taches':'Principal','/projets':'Principal','/calendrier':'Principal','/planificateur':'Principal',
  '/devis':'Commercial','/factures':'Commercial','/contrats':'Commercial','/bons-commande':'Commercial','/bons-livraison':'Commercial',
  '/produits':'Commercial','/services':'Commercial','/produits-stock':'Commercial',
  '/paiements':'Finance','/cheques-recus':'Finance','/cheques-emis':'Finance','/depenses':'Finance','/finances':'Finance','/finance-ia':'Finance','/abonnements':'Finance','/abonnements-clients':'Finance',
  '/equipe':'Ressources','/fournisseurs':'Ressources','/contacts':'Ressources','/vehicules':'Ressources','/domaines':'Ressources','/hebergements':'Ressources',
  '/statistiques':'Analyse','/activite':'Analyse','/conseiller-ia':'Analyse','/automatisations':'Analyse','/integrations':'Analyse','/rapports':'Analyse',
  '/sop':'Analyse','/guides':'Analyse','/vision':'Principal',
}

const PRIORITY_CONFIG: Record<AlertPriority, {
  icon:  React.ElementType
  color: string
  bg:    string
  dot:   string
  badge: string
}> = {
  critical: { icon: AlertTriangle, color: 'text-red-500',   bg: 'bg-red-500/10',   dot: 'bg-red-500',   badge: 'bg-red-500' },
  medium:   { icon: AlertCircle,   color: 'text-amber-500', bg: 'bg-amber-500/10', dot: 'bg-amber-500', badge: 'bg-amber-500' },
  low:      { icon: Info,          color: 'text-electric-500', bg: 'bg-electric-500/10', dot: 'bg-electric-500', badge: 'bg-electric-500' },
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
        'hover:bg-black/[0.03] dark:hover:bg-white/[0.04]',
      )}
      onClick={() => onNavigate(alert.link)}
    >
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5', cfg.bg)}>
        <Icon className={cn('w-4 h-4', cfg.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-start justify-between gap-2">
          <p className={cn('text-sm font-medium leading-tight', alert.is_read ? 'text-muted-foreground' : 'text-foreground')}>
            {alert.title}
          </p>
          {!alert.is_read && <span className={cn('w-2 h-2 rounded-full flex-shrink-0 mt-1', cfg.dot)} />}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{alert.message}</p>
      </div>
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:bg-black/5 dark:hover:bg-white/10 rounded"
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

  /* Strip tenant prefix for lookup */
  const bareTop = '/' + (location.pathname.replace(tenantSlug ? `/${tenantSlug}` : '', '').split('/').filter(Boolean)[0] || '')
  const currentPage = BREADCRUMB_MAP[bareTop] || bareTop.replace('/', '').replace(/-/g, ' ') || 'Tableau de bord'
  const currentSection = SECTION_OF[bareTop]

  const iconBtn = 'h-9 w-9 flex items-center justify-center rounded-xl transition-all duration-150 text-slate-500 dark:text-slate-400 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]'

  const handleAlertNav = (link?: string) => {
    setAlertsOpen(false)
    if (link) navigate(`/${tenantSlug}${link}`)
  }

  const bellTone = criticalCount > 0 ? 'text-red-500' : unreadCount > 0 ? 'text-amber-500' : ''
  const badgeBg  = criticalCount > 0 ? 'bg-red-500' : 'bg-amber-500'

  const base = tenantSlug ? `/${tenantSlug}` : ''

  /* Fermeture au clic extérieur.

     On n'utilise PAS de voile `fixed inset-0` : le <header> porte
     backdrop-blur-2xl, et un ancêtre avec backdrop-filter devient le bloc
     conteneur de ses descendants position:fixed. Mesuré dans Chrome, un
     `fixed inset-0` posé ici ne couvre que la bande du header (500×56 au
     lieu de 500×713) — cliquer sur la page ne fermait donc rien. Un
     écouteur au niveau du document ne dépend d'aucun bloc conteneur, et
     ferme aussi quand on clique la barre latérale. */
  const alertsRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!alertsOpen) return
    const onDown = (e: MouseEvent) => {
      if (!alertsRef.current?.contains(e.target as Node)) setAlertsOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setAlertsOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [alertsOpen])

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-14 md:h-16 z-30 flex items-center justify-between px-3 md:px-5',
        'border-b transition-[left] duration-300',
        'backdrop-blur-2xl backdrop-saturate-150',
        'pt-[env(safe-area-inset-top)]',
        'left-0',
        collapsed ? 'md:left-[68px]' : 'md:left-[260px]',
      )}
      style={{
        background: 'var(--surface-header)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      {/* ── Left ── */}
      <div className="flex items-center gap-2 md:gap-3 min-w-0 flex-1">
        <button onClick={onMenuToggle} className={cn(iconBtn, 'flex-shrink-0')} aria-label="Menu">
          <Menu className="w-4 h-4" />
        </button>
        <nav className="flex items-center gap-1.5 text-sm min-w-0">
          <span className="text-slate-400 dark:text-slate-500 font-medium hidden md:inline text-[12.5px]">NEXT GITAL</span>
          {currentSection && (
            <>
              <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-700 flex-shrink-0 hidden md:block" />
              <span className="hidden md:inline-flex items-center h-5 px-2 rounded-md text-[10.5px] font-semibold uppercase tracking-wide text-electric-700 dark:text-cyan-300 bg-electric-500/10">
                {currentSection}
              </span>
            </>
          )}
          <ChevronRight className="w-3 h-3 text-slate-300 dark:text-slate-700 flex-shrink-0 hidden sm:block" />
          <span className="font-semibold text-foreground capitalize truncate text-[13px]">
            {currentPage}
          </span>
        </nav>
      </div>

      {/* ── Right ── */}
      <div className="flex items-center gap-1">

        {/* Global search */}
        <button
          onClick={openGlobalSearch}
          className="hidden sm:flex items-center gap-2 pl-2.5 pr-1.5 h-9 rounded-xl text-[12.5px]
                     text-slate-500 dark:text-slate-400
                     bg-black/[0.03] dark:bg-white/[0.04]
                     border border-transparent hover:border-electric-500/25
                     hover:text-foreground transition-all"
          aria-label="Rechercher"
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden md:inline">Rechercher partout</span>
          <span className="hidden md:flex items-center gap-0.5">
            <span className="kbd">⌘</span><span className="kbd">K</span>
          </span>
        </button>
        <button onClick={openGlobalSearch} className={`${iconBtn} sm:hidden`} aria-label="Rechercher">
          <Search className="w-4 h-4" />
        </button>

        {/* Quick Create */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-xl text-[12.5px] font-semibold text-white
                         btn-primary py-0"
              aria-label="Créer"
              style={{ padding: '0 12px' }}
            >
              <Plus className="w-3.5 h-3.5" /> Créer
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">Créer</DropdownMenuLabel>
            <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg" onClick={() => navigate(`${base}/devis?new=1`)}>
              <FileText className="w-4 h-4 text-electric-500" /> Nouveau devis
              <span className="ml-auto flex gap-0.5"><span className="kbd">⌘</span><span className="kbd">D</span></span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg" onClick={() => navigate(`${base}/factures?new=1`)}>
              <Receipt className="w-4 h-4 text-cyan-500" /> Nouvelle facture
              <span className="ml-auto flex gap-0.5"><span className="kbd">⌘</span><span className="kbd">F</span></span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg" onClick={() => navigate(`${base}/prospects?new=1`)}>
              <UserCheck className="w-4 h-4 text-violet-500" /> Nouveau prospect
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg" onClick={() => navigate(`${base}/projets?new=1`)}>
              <FolderKanban className="w-4 h-4 text-emerald-500" /> Nouveau projet
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg" onClick={() => navigate(`${base}/conseiller-ia`)}>
              <Sparkles className="w-4 h-4 text-violet-500" /> Demander à l'IA
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Language selector */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className={iconBtn} aria-label="Langue">
              <Languages className="w-4 h-4" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40 rounded-xl">
            <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg text-electric-600 dark:text-cyan-400">
              <span className="text-base">🇫🇷</span> Français
              <span className="ml-auto text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-electric-500/10">Actuel</span>
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg text-slate-500">
              <span className="text-base">🇺🇸</span> English
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg text-slate-500">
              <span className="text-base">🇲🇦</span> العربية
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <ThemeToggle />

        {/* Task notifications */}
        <NotificationBell scope="admin" />

        {/* Alerts */}
        <div className="relative" ref={alertsRef}>
          <button
            className={cn(iconBtn, 'relative', bellTone)}
            onClick={() => setAlertsOpen(v => !v)}
            aria-label="Alertes"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className={cn(
                'absolute top-1 right-1 min-w-[16px] h-4 px-0.5 rounded-full',
                'flex items-center justify-center',
                'text-white text-[9.5px] font-bold ring-2 ring-white dark:ring-navy-800',
                badgeBg,
              )}>
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <AnimatePresence>
            {alertsOpen && (
              <>
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0,  scale: 1    }}
                  exit={{    opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.15 }}
                  /* Fond OPAQUE, pas `card-glass`.
                     Ce panneau est un descendant du <header>, qui porte
                     déjà backdrop-blur-2xl : un ancêtre avec backdrop-filter
                     devient la racine de backdrop de ses descendants, donc
                     le blur du panneau ne capte plus le contenu de la page.
                     Il ne restait qu'un voile blanc à 55 % à travers lequel
                     le texte de la page passait, net et illisible. */
                  className={cn(
                    'z-50 rounded-2xl overflow-hidden shadow-xl border',
                    'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700/80',
                    /* Mobile : ancré au viewport, pas au bouton. En absolute
                       + right-0, la largeur 100vw partait vers la gauche
                       depuis la cloche et sortait de l'écran — le panneau
                       était rogné au bord gauche. */
                    'fixed left-2 right-2 top-[calc(3.5rem+env(safe-area-inset-top))]',
                    'sm:absolute sm:left-auto sm:right-0 sm:top-11 sm:w-[380px]',
                  )}
                >
                  <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-slate-500" />
                      <span className="font-semibold text-sm text-foreground">Alertes</span>
                      {unreadCount > 0 && (
                        <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white', badgeBg)}>
                          {unreadCount}
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        onClick={dismissAll}
                        className="flex items-center gap-1 text-xs text-electric-600 dark:text-cyan-400 hover:underline"
                      >
                        <CheckCheck className="w-3.5 h-3.5" /> Tout lire
                      </button>
                    )}
                  </div>

                  <div className="max-h-[420px] overflow-y-auto">
                    {alerts.length === 0 ? (
                      <div className="py-12 text-center">
                        <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-3">
                          <CheckCheck className="w-6 h-6 text-emerald-500" />
                        </div>
                        <p className="text-sm text-foreground font-medium">Vous êtes à jour</p>
                        <p className="text-xs text-muted-foreground mt-0.5">Aucune alerte active</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {alerts.map(alert => (
                          <AlertItem key={alert.id} alert={alert} onDismiss={dismiss} onNavigate={handleAlertNav} />
                        ))}
                      </div>
                    )}
                  </div>

                  {alerts.length > 0 && (
                    <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 text-center">
                      <button
                        className="text-xs text-electric-600 dark:text-cyan-400 hover:underline"
                        onClick={() => { navigate(`${base}/statistiques`); setAlertsOpen(false) }}
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

        <div className="w-px h-5 bg-black/[0.08] dark:bg-white/[0.08] mx-1" />

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-xl hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
              aria-label="Menu utilisateur"
            >
              <div
                className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 relative overflow-hidden"
                style={{ background: 'var(--gradient-primary)' }}
              >
                <span className="text-white text-[11px] font-bold">NG</span>
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-white/25 blur-sm" />
              </div>
              <div className="text-left hidden md:block">
                <p className="text-[12.5px] font-semibold text-foreground leading-none">NEXT GITAL</p>
                <p className="text-[10.5px] text-slate-400 dark:text-slate-500 mt-0.5">Admin</p>
              </div>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 rounded-xl">
            <DropdownMenuLabel className="text-[10.5px] font-bold uppercase tracking-widest text-slate-400">Compte</DropdownMenuLabel>
            <div className="px-2 py-1.5 flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'var(--gradient-primary)' }}>
                <span className="text-white text-xs font-bold">NG</span>
              </div>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-foreground leading-tight truncate">NEXT GITAL</p>
                <p className="text-[11px] text-muted-foreground">admin@nextgital.ma</p>
              </div>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer gap-2 rounded-lg">
              <User className="w-4 h-4 text-slate-400" /> Profil
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer gap-2 rounded-lg"
              onClick={() => navigate(`${base}/parametres`)}
            >
              <Settings className="w-4 h-4 text-slate-400" /> Paramètres
              <span className="ml-auto flex gap-0.5"><span className="kbd">⌘</span><span className="kbd">,</span></span>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer gap-2 rounded-lg text-red-600 dark:text-red-400 focus:bg-red-500/10 focus:text-red-500"
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
