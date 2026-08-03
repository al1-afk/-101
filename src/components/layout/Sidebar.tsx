import { useEffect, useMemo, useState } from 'react'
import { NavLink, useLocation, useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  DragDropContext, Droppable, Draggable,
  type DropResult,
} from '@hello-pangea/dnd'
import {
  LayoutDashboard, Users, UserCheck, FileText, Receipt, FileSignature,
  CreditCard, DollarSign, TrendingUp, Globe, Server, Package, ShoppingCart,
  Repeat, BarChart3, CheckSquare, Building2, ChevronDown, ChevronsLeft,
  Settings, Briefcase, Banknote, Wallet, Activity, ShieldCheck, ShieldAlert,
  Bot, CalendarDays, Zap, RefreshCcw, PlugZap, FileDown, Rocket, Boxes, Car, Target, Sparkles,
  BookOpen, Crown, MapPin, FolderKanban, FileCheck, Wrench, Contact,
  Plus, Star, Command, Search, GripVertical,
  Radar, Route, LineChart, MessagesSquare, LayoutGrid, Bell, Layers,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStockAlerts } from '@/hooks/useStock'
import { useVehicleAlerts } from '@/hooks/useVehicles'
import { useAuth } from '@/hooks/useAuth'
import { openGlobalSearch } from '@/components/GlobalSearch'

interface NavItem {
  label: string
  href:  string
  icon:  React.ElementType
  badge?: string
  module?: string
  adminOnly?: boolean
}

/** All module keys known to the sidebar — used by the access-management UI */
export const ALL_MODULES: { key: string; label: string }[] = [
  { key: 'dashboard',         label: 'Tableau de bord' },
  { key: 'prospects',         label: 'CRM / Prospects' },
  { key: 'clients',           label: 'Clients' },
  { key: 'taches',            label: 'Tâches' },
  { key: 'projets',           label: 'Projets' },
  { key: 'calendrier',        label: 'Calendrier' },
  { key: 'planificateur',     label: 'Planificateur' },
  { key: 'devis',             label: 'Devis' },
  { key: 'factures',          label: 'Factures' },
  { key: 'contrats',          label: 'Contrats' },
  { key: 'bons-commande',     label: 'Bons de commande' },
  { key: 'bons-livraison',    label: 'Bons de livraison' },
  { key: 'produits',          label: 'Produits & Services' },
  { key: 'services',          label: 'Services' },
  { key: 'produits-stock',    label: 'Produits & Stock' },
  { key: 'paiements',         label: 'Paiements' },
  { key: 'cheques-recus',     label: 'Chèques reçus' },
  { key: 'cheques-emis',      label: 'Chèques émis' },
  { key: 'depenses',          label: 'Dépenses' },
  { key: 'finances',          label: 'Finances' },
  { key: 'finance-ia',        label: 'Finance IA' },
  { key: 'abonnements',       label: 'Abonnements' },
  { key: 'abonnements-clients', label: 'Abonnements clients' },
  { key: 'equipe',            label: 'Équipe' },
  { key: 'fournisseurs',      label: 'Fournisseurs' },
  { key: 'contacts',          label: 'Contacts' },
  { key: 'vehicules',         label: 'Véhicules' },
  { key: 'domaines',          label: 'Domaines' },
  { key: 'hebergements',      label: 'Hébergements' },
  { key: 'statistiques',      label: 'Statistiques' },
  { key: 'activite',          label: 'Journal d\'activité' },
  { key: 'centre-securite',   label: 'Centre de sécurité' },
  { key: 'conseiller-ia',     label: 'Conseiller IA' },
  { key: 'automatisations',   label: 'Automatisations' },
  { key: 'integrations',      label: 'Intégrations' },
  { key: 'rapports',          label: 'Rapports & Export' },
  { key: 'sop',               label: 'SOP & Procédures' },
  { key: 'guides',            label: 'Guides onboarding' },
  { key: 'vision',            label: 'Ma Vision (admin)' },
  { key: 'bientot',           label: 'Bientôt' },
  /* Outbound Marketing */
  { key: 'outbound',           label: 'Outbound — Tableau de bord' },
  { key: 'outbound-prospects', label: 'Outbound — Prospects' },
  { key: 'outbound-pipeline',  label: 'Outbound — Pipeline' },
  { key: 'outbound-followups', label: 'Outbound — Relances' },
  { key: 'outbound-campaigns', label: 'Outbound — Campagnes' },
  { key: 'outbound-templates', label: 'Outbound — Modèles' },
  { key: 'outbound-sectors',   label: 'Outbound — Secteurs' },
  { key: 'outbound-team',      label: 'Outbound — Équipe' },
  { key: 'outbound-reports',   label: 'Outbound — Rapports' },
]

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Principal',
    items: [
      { label: 'Tableau de bord', href: '/',          icon: LayoutDashboard, module: 'dashboard' },
      { label: 'Planificateur',   href: '/planificateur', icon: Target, badge: 'New', module: 'planificateur' },
      { label: 'Ma Vision',       href: '/vision',    icon: Crown, module: 'vision', adminOnly: true },
      { label: 'CRM / Prospects', href: '/prospects', icon: UserCheck, badge: 'IA', module: 'prospects' },
      { label: 'Clients',         href: '/clients',   icon: Users, module: 'clients' },
      { label: 'Projets',         href: '/projets',   icon: FolderKanban, module: 'projets' },
      { label: 'Templates',       href: '/templates', icon: Sparkles, badge: 'New', module: 'projets' },
      { label: 'Tâches',          href: '/taches',    icon: CheckSquare, module: 'taches' },
      { label: 'Calendrier',      href: '/calendrier',icon: CalendarDays, module: 'calendrier' },
    ],
  },
  {
    title: 'Outbound Marketing',
    items: [
      { label: 'Tableau de bord',    href: '/outbound',              icon: LayoutGrid,     badge: 'New', module: 'outbound' },
      { label: 'Autopilot',           href: '/outbound/autopilot',    icon: Bot,            badge: 'Auto', module: 'outbound' },
      { label: 'Tracking email',      href: '/outbound/tracking',     icon: Activity,       badge: 'Live', module: 'outbound' },
      { label: 'Prospecter (Google)',href: '/outbound/enrich',       icon: MapPin,         badge: 'IA', module: 'outbound' },
      { label: 'Prospects Outbound', href: '/outbound/prospects',    icon: Radar,          module: 'outbound-prospects' },
      { label: 'Pipeline',           href: '/outbound/pipeline',     icon: Route,          module: 'outbound-pipeline' },
      { label: 'Relances',           href: '/outbound/follow-ups',   icon: Bell,           module: 'outbound-followups' },
      { label: 'Campagnes',          href: '/outbound/campaigns',    icon: Target,         module: 'outbound-campaigns' },
      { label: 'Modèles messages',   href: '/outbound/templates',    icon: MessagesSquare, module: 'outbound-templates' },
      { label: 'Secteurs & Sources', href: '/outbound/sectors',      icon: Layers,         module: 'outbound-sectors' },
      { label: 'Équipe Outbound',    href: '/outbound/team',         icon: Users,          module: 'outbound-team' },
      { label: 'Rapports',           href: '/outbound/reports',      icon: LineChart,      module: 'outbound-reports' },
      { label: 'Automation setup',   href: '/outbound/settings',     icon: Settings,       module: 'outbound' },
    ],
  },
  {
    title: 'Commercial',
    items: [
      { label: 'Devis',               href: '/devis',        icon: FileText, module: 'devis' },
      { label: 'Factures',            href: '/factures',     icon: Receipt, module: 'factures' },
      { label: 'Contrats',            href: '/contrats',     icon: FileSignature, module: 'contrats' },
      { label: 'Bons de commande',    href: '/bons-commande',icon: ShoppingCart, module: 'bons-commande' },
      { label: 'Bons de livraison',   href: '/bons-livraison',icon: FileCheck, badge: 'New', module: 'bons-livraison' },
      { label: 'Produits & Services', href: '/produits',     icon: Package, module: 'produits' },
      { label: 'Services',            href: '/services',     icon: Wrench, module: 'services' },
      { label: 'Produits & Stock',    href: '/produits-stock', icon: Boxes, badge: 'Stock', module: 'produits-stock' },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Paiements',      href: '/paiements',    icon: CreditCard, module: 'paiements' },
      { label: 'Chèques reçus',  href: '/cheques-recus',icon: Banknote, module: 'cheques-recus' },
      { label: 'Chèques émis',   href: '/cheques-emis', icon: Wallet, module: 'cheques-emis' },
      { label: 'Dépenses',       href: '/depenses',     icon: DollarSign, module: 'depenses' },
      { label: 'Finances',       href: '/finances',     icon: TrendingUp, module: 'finances' },
      { label: 'Finance IA',     href: '/finance-ia',   icon: Sparkles,   badge: 'IA', module: 'finance-ia' },
      { label: 'Abonnements',         href: '/abonnements',         icon: Repeat, module: 'abonnements' },
      { label: 'Abonnements Clients', href: '/abonnements-clients',  icon: RefreshCcw, badge: 'MRR', module: 'abonnements-clients' },
    ],
  },
  {
    title: 'Ressources',
    items: [
      { label: 'Équipe',         href: '/equipe',       icon: Briefcase, module: 'equipe' },
      { label: 'Fournisseurs',   href: '/fournisseurs', icon: Building2, module: 'fournisseurs' },
      { label: 'Contacts',       href: '/contacts',     icon: Contact, module: 'contacts' },
      { label: 'Véhicules',      href: '/vehicules',    icon: Car, badge: 'Vehicles', module: 'vehicules' },
      { label: 'Domaines',       href: '/domaines',     icon: Globe, module: 'domaines' },
      { label: 'Hébergements',   href: '/hebergements', icon: Server, module: 'hebergements' },
    ],
  },
  {
    title: 'Analyse',
    items: [
      { label: 'Statistiques',       href: '/statistiques',  icon: BarChart3, module: 'statistiques' },
      { label: "Journal d'activité", href: '/activite',      icon: Activity, module: 'activite' },
      /* Centre de sécurité — l'entrée est masquée hors admin, mais c'est
         le backend (requireSecurityMonitoring) qui protège réellement. */
      { label: 'Centre de sécurité', href: '/centre-securite', icon: ShieldAlert, module: 'centre-securite', adminOnly: true },
      { label: 'Conseiller IA',      href: '/conseiller-ia',    icon: Bot,     badge: 'IA', module: 'conseiller-ia' },
      { label: 'Automatisations',    href: '/automatisations',  icon: Zap,     badge: 'Auto', module: 'automatisations' },
      { label: 'Intégrations',       href: '/integrations',     icon: PlugZap, module: 'integrations' },
      { label: 'Rapports & Export',  href: '/rapports',         icon: FileDown, module: 'rapports' },
      { label: 'SOP & Procédures',   href: '/sop',              icon: BookOpen, badge: 'New', module: 'sop' },
      { label: 'Guides onboarding',  href: '/guides',           icon: MapPin,   badge: 'New', module: 'guides' },
      { label: 'Bientôt',            href: '/bientot',          icon: Rocket,  badge: 'Soon', module: 'bientot' },
    ],
  },
]

/** Flat lookup for favorite / recent rendering */
const ALL_ITEMS: NavItem[] = NAV_GROUPS.flatMap(g => g.items)

function getInitialExpanded(): string[] {
  try {
    const stored = localStorage.getItem('sidebar-expanded-groups')
    if (stored) {
      const parsed = JSON.parse(stored) as string[]
      /* Nouvelles sections ajoutées après le premier chargement doivent
         apparaître dépliées (sinon l'utilisateur ne voit pas les nouveaux items). */
      const allTitles = NAV_GROUPS.map(g => g.title)
      const missing = allTitles.filter(t => !parsed.includes(t))
      return [...parsed, ...missing]
    }
  } catch {/* ignore */}
  return NAV_GROUPS.map(g => g.title)
}

function getFavorites(): string[] {
  try {
    const raw = localStorage.getItem('sidebar-favorites')
    if (raw) return JSON.parse(raw)
  } catch {/* ignore */}
  return ['/', '/factures', '/devis']
}
function saveFavorites(f: string[]) {
  try { localStorage.setItem('sidebar-favorites', JSON.stringify(f)) } catch {/* ignore */}
}
function getRecents(): string[] {
  try {
    const raw = localStorage.getItem('sidebar-recents')
    if (raw) return JSON.parse(raw)
  } catch {/* ignore */}
  return []
}
function pushRecent(href: string) {
  try {
    const cur = getRecents().filter(h => h !== href)
    const next = [href, ...cur].slice(0, 4)
    localStorage.setItem('sidebar-recents', JSON.stringify(next))
  } catch {/* ignore */}
}

interface SidebarProps {
  collapsed: boolean
  onToggle:  () => void
}

/* ── Badge chip ── */
function BadgeChip({ kind, count, active }: { kind: string; count?: number; active: boolean }) {
  const label = kind === 'Stock' || kind === 'Vehicles' ? String(count ?? 0) : kind
  const tone =
    kind === 'IA'       ? 'text-violet-600 dark:text-violet-300 bg-violet-500/10 border-violet-500/20' :
    kind === 'MRR'      ? 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 border-emerald-500/20' :
    kind === 'Auto'     ? 'text-amber-600 dark:text-amber-300 bg-amber-500/10 border-amber-500/20' :
    kind === 'Soon'     ? 'text-pink-600 dark:text-pink-300 bg-pink-500/10 border-pink-500/20' :
    kind === 'Stock'    ? 'text-red-600 dark:text-red-300 bg-red-500/10 border-red-500/20' :
    kind === 'Vehicles' ? 'text-orange-600 dark:text-orange-300 bg-orange-500/10 border-orange-500/20' :
                          'text-cyan-700 dark:text-cyan-300 bg-cyan-500/10 border-cyan-500/20'
  return (
    <span className={cn(
      'ml-auto text-[9.5px] font-bold leading-none px-1.5 py-[3px] rounded-md border tracking-wide',
      active ? 'bg-white/15 text-white border-white/25' : tone,
    )}>
      {kind === 'IA' ? 'IA ✦' : label}
    </span>
  )
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location       = useLocation()
  const navigate       = useNavigate()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const base           = tenantSlug ? `/${tenantSlug}` : ''
  const [expandedGroups, setExpandedGroups] = useState<string[]>(getInitialExpanded)
  const [favorites, setFavorites]           = useState<string[]>(getFavorites)
  const [recents,   setRecents]             = useState<string[]>(getRecents)
  const { data: stockAlerts = [] } = useStockAlerts()
  const stockAlertCount = stockAlerts.length
  const { data: vehicleAlerts } = useVehicleAlerts()
  const vehicleAlertCount = (vehicleAlerts?.documents.length ?? 0) + (vehicleAlerts?.maintenance.length ?? 0)

  /* Track recents on route change */
  useEffect(() => {
    const raw = location.pathname.replace(base, '') || '/'
    if (raw === '/' || raw === '/parametres') return
    pushRecent(raw)
    setRecents(getRecents())
  }, [location.pathname, base])

  const { role: userRole, allowedModules } = useAuth()

  /* Modules Outbound réservés aux managers (admin/manager).
     L'agent (commercial) voit uniquement les pages où il gère ses propres données. */
  const OUTBOUND_MANAGER_ONLY = new Set([
    'outbound-campaigns',
    'outbound-templates',
    'outbound-sectors',
    'outbound-team',
    'outbound-reports',
  ])
  /* Modules Outbound accessibles aussi à commercial */
  const OUTBOUND_MODULES = new Set([
    'outbound', 'outbound-prospects', 'outbound-pipeline', 'outbound-followups',
  ])

  const filterItem = (item: NavItem): boolean => {
    if (item.adminOnly && userRole !== 'admin') return false

    /* Outbound : ni viewer ni comptable */
    if (item.module?.startsWith('outbound')) {
      if (userRole === 'viewer' || userRole === 'comptable') return false
      if (OUTBOUND_MANAGER_ONLY.has(item.module) && !['admin','manager'].includes(userRole ?? '')) return false
      if (userRole === 'admin' || userRole === 'manager') return true
      /* Pour commercial : accepte les modules "agent" */
      return OUTBOUND_MODULES.has(item.module)
    }

    if (userRole === 'admin') return true
    if (!item.module) return true
    if (Array.isArray(allowedModules)) return allowedModules.includes(item.module)
    return true
  }
  const VISIBLE_GROUPS = NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(filterItem) }))
    .filter(g => g.items.length > 0)

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => {
      const next = prev.includes(title) ? prev.filter(g => g !== title) : [...prev, title]
      try { localStorage.setItem('sidebar-expanded-groups', JSON.stringify(next)) } catch {/* ignore */}
      return next
    })
  }
  const toggleFavorite = (href: string) => {
    const next = favorites.includes(href) ? favorites.filter(h => h !== href) : [...favorites, href].slice(0, 6)
    setFavorites(next); saveFavorites(next)
  }
  const onFavoriteDragEnd = (result: DropResult) => {
    if (!result.destination) return
    const from = result.source.index
    const to   = result.destination.index
    if (from === to) return
    const next = [...favorites]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setFavorites(next); saveFavorites(next)
  }

  const favoriteItems = useMemo(
    () => favorites.map(h => ALL_ITEMS.find(i => i.href === h)).filter(Boolean) as NavItem[],
    [favorites],
  )
  const recentItems = useMemo(
    () => recents.map(h => ALL_ITEMS.find(i => i.href === h)).filter(Boolean).slice(0, 3) as NavItem[],
    [recents],
  )

  const renderBadge = (item: NavItem, isActive: boolean) => {
    if (!item.badge) return null
    if (item.badge === 'Stock')    return stockAlertCount > 0    ? <BadgeChip kind="Stock"    count={stockAlertCount}    active={isActive} /> : null
    if (item.badge === 'Vehicles') return vehicleAlertCount > 0  ? <BadgeChip kind="Vehicles" count={vehicleAlertCount}  active={isActive} /> : null
    return <BadgeChip kind={item.badge} active={isActive} />
  }

  const renderItem = (item: NavItem, opts?: { showStar?: boolean }) => {
    const fullHref = item.href === '/' ? base || '/' : `${base}${item.href}`
    const isActive = item.href === '/'
      ? location.pathname === base || location.pathname === base + '/'
      : location.pathname.startsWith(`${base}${item.href}`)
    const isFav = favorites.includes(item.href)
    return (
      <div key={item.href} className="group/nav relative">
        <NavLink
          to={fullHref}
          title={collapsed ? item.label : undefined}
          className={cn(
            'sidebar-item',
            isActive && 'active',
            collapsed && 'justify-center px-0',
          )}
        >
          <item.icon className={cn('sidebar-icon-el flex-shrink-0', collapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]')} />
          {!collapsed && (
            <>
              <span className="flex-1 truncate">{item.label}</span>
              {renderBadge(item, isActive)}
            </>
          )}
        </NavLink>
        {/* Favorite star — visible on hover, filled when starred */}
        {!collapsed && opts?.showStar !== false && (
          <button
            onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFavorite(item.href) }}
            className={cn(
              'absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md transition-opacity',
              isFav ? 'opacity-100' : 'opacity-0 group-hover/nav:opacity-100',
              'hover:bg-black/5 dark:hover:bg-white/10',
            )}
            aria-label={isFav ? 'Retirer des favoris' : 'Ajouter aux favoris'}
          >
            <Star className={cn('w-3 h-3', isFav ? 'fill-amber-400 text-amber-400' : 'text-slate-400')} />
          </button>
        )}
      </div>
    )
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-[100dvh] z-40 flex flex-col transition-[width] duration-300',
        'border-r',
        'backdrop-blur-2xl backdrop-saturate-150',
        'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
        collapsed ? 'w-[68px]' : 'w-[260px]',
      )}
      style={{
        background: 'var(--sidebar-bg)',
        borderColor: 'var(--sidebar-border)',
      }}
    >
      {/* ── Logo ── */}
      <div className={cn(
        'flex items-center h-16 px-3 flex-shrink-0',
        collapsed ? 'justify-center' : 'justify-between',
      )}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2.5 min-w-0"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 relative overflow-hidden"
              style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-blue)' }}
            >
              <span className="text-white font-black text-[15px] tracking-tight relative z-10">N</span>
              <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-white/25 blur-md" />
            </div>
            <div className="min-w-0">
              <p className="font-bold text-[14px] tracking-tight text-foreground leading-none">NEXT GITAL</p>
              <p className="text-[10px] font-semibold leading-none mt-1 bg-gradient-primary bg-clip-text text-transparent">
                Enterprise ERP
              </p>
            </div>
          </motion.div>
        )}

        {collapsed && (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center relative overflow-hidden"
            style={{ background: 'var(--gradient-primary)', boxShadow: 'var(--shadow-blue)' }}
          >
            <span className="text-white font-black text-[15px]">N</span>
          </div>
        )}

        {!collapsed && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-slate-400 hover:text-foreground hover:bg-black/5 dark:hover:bg-white/10 transition-colors flex-shrink-0"
            title="Réduire"
          >
            <ChevronsLeft className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Search launcher ── */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <button
            onClick={openGlobalSearch}
            className="w-full flex items-center gap-2 h-8 px-2.5 rounded-lg
                       text-[12.5px] text-slate-500 dark:text-slate-400
                       bg-black/[0.03] dark:bg-white/[0.04]
                       hover:bg-black/[0.05] dark:hover:bg-white/[0.07]
                       border border-transparent hover:border-electric-500/20
                       transition-all"
          >
            <Search className="w-3.5 h-3.5" />
            <span className="flex-1 text-left">Rechercher partout</span>
            <span className="flex items-center gap-0.5">
              <span className="kbd">⌘</span><span className="kbd">K</span>
            </span>
          </button>
        </div>
      )}

      {/* ── Quick create ── */}
      {!collapsed && (
        <div className="px-3 pb-2">
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate(`${base}/devis?new=1`)}
              className="btn-primary flex-1 h-8 px-2.5 text-[12px] justify-center"
              title="Nouveau devis"
            >
              <Plus className="w-3.5 h-3.5" /> Créer
            </button>
            <button
              onClick={() => navigate(`${base}/factures?new=1`)}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-foreground bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
              title="Nouvelle facture"
            >
              <Receipt className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => navigate(`${base}/clients?new=1`)}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-500 hover:text-foreground bg-black/[0.03] dark:bg-white/[0.04] hover:bg-black/[0.06] dark:hover:bg-white/[0.08] transition-colors"
              title="Nouveau client"
            >
              <Users className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ── Navigation ── */}
      <div className="flex-1 overflow-y-auto py-2 px-2.5 space-y-4">

        {/* Favoris — drag & drop to reorder */}
        {!collapsed && favoriteItems.length > 0 && (
          <div>
            <div className="px-2 pb-1 flex items-center justify-between">
              <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-600 flex items-center gap-1">
                <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> Favoris
              </p>
              <span className="text-[9px] font-medium text-slate-400 dark:text-slate-600 flex items-center gap-1 opacity-70">
                <GripVertical className="w-2.5 h-2.5" /> Glisser pour trier
              </span>
            </div>
            <DragDropContext onDragEnd={onFavoriteDragEnd}>
              <Droppable droppableId="favorites">
                {(dropProvided, dropSnapshot) => (
                  <div
                    ref={dropProvided.innerRef}
                    {...dropProvided.droppableProps}
                    className={cn(
                      'space-y-[2px] rounded-lg transition-colors',
                      dropSnapshot.isDraggingOver && 'bg-electric-500/[0.04]',
                    )}
                  >
                    {favoriteItems.map((item, index) => {
                      const fullHref = item.href === '/' ? base || '/' : `${base}${item.href}`
                      const isActive = item.href === '/'
                        ? location.pathname === base || location.pathname === base + '/'
                        : location.pathname.startsWith(`${base}${item.href}`)
                      return (
                        <Draggable key={item.href} draggableId={item.href} index={index}>
                          {(dragProvided, dragSnapshot) => (
                            <div
                              ref={dragProvided.innerRef}
                              {...dragProvided.draggableProps}
                              className={cn(
                                'group/nav relative rounded-lg',
                                dragSnapshot.isDragging && 'shadow-premium bg-white dark:bg-navy-800 ring-1 ring-electric-500/25',
                              )}
                              style={dragProvided.draggableProps.style}
                            >
                              {/* Drag handle — appears on hover */}
                              <button
                                {...dragProvided.dragHandleProps}
                                aria-label="Réordonner"
                                className={cn(
                                  'absolute left-[-2px] top-1/2 -translate-y-1/2 z-10',
                                  'w-4 h-6 flex items-center justify-center rounded',
                                  'text-slate-300 dark:text-slate-600 cursor-grab active:cursor-grabbing',
                                  'transition-opacity',
                                  dragSnapshot.isDragging
                                    ? 'opacity-100 text-electric-500'
                                    : 'opacity-0 group-hover/nav:opacity-100',
                                )}
                              >
                                <GripVertical className="w-3 h-3" />
                              </button>
                              <NavLink
                                to={fullHref}
                                title={item.label}
                                className={cn('sidebar-item', isActive && 'active')}
                              >
                                <item.icon className="sidebar-icon-el flex-shrink-0 w-[15px] h-[15px]" />
                                <span className="flex-1 truncate">{item.label}</span>
                                {renderBadge(item, isActive)}
                              </NavLink>
                              {/* Star toggle */}
                              <button
                                onClick={e => { e.preventDefault(); e.stopPropagation(); toggleFavorite(item.href) }}
                                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10"
                                aria-label="Retirer des favoris"
                              >
                                <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                              </button>
                            </div>
                          )}
                        </Draggable>
                      )
                    })}
                    {dropProvided.placeholder}
                  </div>
                )}
              </Droppable>
            </DragDropContext>
          </div>
        )}

        {/* Récents */}
        {!collapsed && recentItems.length > 0 && (
          <div>
            <p className="px-2 pb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400 dark:text-slate-600">
              Récents
            </p>
            <div className="space-y-[2px]">
              {recentItems.map(item => renderItem(item, { showStar: true }))}
            </div>
          </div>
        )}

        {/* Groupes */}
        {VISIBLE_GROUPS.map(group => (
          <div key={group.title}>
            {!collapsed && (
              <button
                onClick={() => toggleGroup(group.title)}
                className="w-full flex items-center justify-between px-2 py-1 mb-0.5
                           text-[10px] font-bold uppercase tracking-[0.14em]
                           text-slate-400 dark:text-slate-600
                           hover:text-electric-600 dark:hover:text-cyan-400
                           transition-colors duration-150 rounded select-none"
              >
                {group.title}
                <motion.span
                  animate={{ rotate: expandedGroups.includes(group.title) ? 0 : -90 }}
                  transition={{ duration: 0.18 }}
                >
                  <ChevronDown className="w-3 h-3" />
                </motion.span>
              </button>
            )}

            <AnimatePresence initial={false}>
              {(collapsed || expandedGroups.includes(group.title)) && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18, ease: 'easeInOut' }}
                  className="overflow-hidden space-y-[2px]"
                >
                  {group.items.map(item => renderItem(item))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <div className="p-2.5 flex-shrink-0 border-t" style={{ borderColor: 'var(--sidebar-border)' }}>
        {!collapsed && (
          <div className="flex items-center gap-2 px-2 py-2 rounded-xl bg-black/[0.02] dark:bg-white/[0.03] mb-1.5">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center relative overflow-hidden flex-shrink-0"
              style={{ background: 'var(--gradient-primary)' }}
            >
              <span className="text-white text-[11px] font-bold">NG</span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[12.5px] font-semibold text-foreground truncate leading-tight">NEXT GITAL</p>
              <p className="text-[10.5px] text-slate-500 dark:text-slate-400">Admin · En ligne</p>
            </div>
            <span className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]" />
          </div>
        )}
        <NavLink
          to={`${base}/securite`}
          className={cn('sidebar-item', location.pathname === `${base}/securite` && 'active', collapsed && 'justify-center px-0')}
          title={collapsed ? 'Sécurité' : undefined}
        >
          <ShieldCheck className={cn('sidebar-icon-el flex-shrink-0', collapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]')} />
          {!collapsed && <span>Sécurité</span>}
        </NavLink>
        <NavLink
          to={`${base}/parametres`}
          className={cn('sidebar-item', location.pathname === `${base}/parametres` && 'active', collapsed && 'justify-center px-0')}
          title={collapsed ? 'Paramètres' : undefined}
        >
          <Settings className={cn('sidebar-icon-el flex-shrink-0', collapsed ? 'w-[18px] h-[18px]' : 'w-[15px] h-[15px]')} />
          {!collapsed && <span>Paramètres</span>}
          {!collapsed && (
            <span className="ml-auto flex items-center gap-0.5">
              <Command className="w-2.5 h-2.5 text-slate-400" />
              <span className="kbd">,</span>
            </span>
          )}
        </NavLink>
      </div>
    </aside>
  )
}
