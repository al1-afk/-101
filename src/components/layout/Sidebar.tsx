import { useState } from 'react'
import { NavLink, useLocation, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Users, UserCheck, FileText, Receipt, FileSignature,
  CreditCard, DollarSign, TrendingUp, Globe, Server, Package, ShoppingCart,
  Repeat, BarChart3, CheckSquare, Building2, ChevronDown,
  Settings, Briefcase, Banknote, Wallet, Activity, X,
  Bot, CalendarDays, Zap, RefreshCcw, PlugZap, FileDown, Rocket, Boxes, Car, Target, Sparkles,
  BookOpen, Crown, MapPin, FolderKanban, FileCheck, Wrench, Contact,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useStockAlerts } from '@/hooks/useStock'
import { useVehicleAlerts } from '@/hooks/useVehicles'
import { useAuth } from '@/hooks/useAuth'

interface NavItem {
  label: string
  href:  string
  icon:  React.ElementType
  badge?: string
  /** Module key — used by per-user access overrides. Same as href without leading slash; '' for dashboard */
  module?: string
  /** Si true → caché pour tous sauf admin (filtre AVANT filterItem) */
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
  { key: 'conseiller-ia',     label: 'Conseiller IA' },
  { key: 'automatisations',   label: 'Automatisations' },
  { key: 'integrations',      label: 'Intégrations' },
  { key: 'rapports',          label: 'Rapports & Export' },
  { key: 'sop',               label: 'SOP & Procédures' },
  { key: 'guides',            label: 'Guides onboarding' },
  { key: 'vision',            label: 'Ma Vision (admin)' },
  { key: 'bientot',           label: 'Bientôt' },
]

const NAV_GROUPS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Principal',
    items: [
      { label: 'Tableau de bord', href: '/',          icon: LayoutDashboard, module: 'dashboard' },
      { label: 'Ma Vision',       href: '/vision',    icon: Crown, module: 'vision', adminOnly: true },
      { label: 'CRM / Prospects', href: '/prospects', icon: UserCheck, badge: 'IA', module: 'prospects' },
      { label: 'Clients',         href: '/clients',   icon: Users, module: 'clients' },
      { label: 'Projets',         href: '/projets',   icon: FolderKanban, module: 'projets' },
      { label: 'Tâches',          href: '/taches',    icon: CheckSquare, module: 'taches' },
      { label: 'Calendrier',      href: '/calendrier',icon: CalendarDays, module: 'calendrier' },
      { label: 'Planificateur',   href: '/planificateur', icon: Target, badge: 'New', module: 'planificateur' },
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

function getInitialExpanded(): string[] {
  try {
    const stored = localStorage.getItem('sidebar-expanded-groups')
    if (stored) return JSON.parse(stored)
  } catch {}
  return NAV_GROUPS.map(g => g.title)
}

interface SidebarProps {
  collapsed: boolean
  onToggle:  () => void
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const location       = useLocation()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const base           = tenantSlug ? `/${tenantSlug}` : ''
  const [expandedGroups, setExpandedGroups] = useState<string[]>(getInitialExpanded)
  const { data: stockAlerts = [] } = useStockAlerts()
  const stockAlertCount = stockAlerts.length
  const { data: vehicleAlerts } = useVehicleAlerts()
  const vehicleAlertCount = (vehicleAlerts?.documents.length ?? 0) + (vehicleAlerts?.maintenance.length ?? 0)

  /* Per-user module filter — admins see everything; others get the
     allowed_modules list when set, role default otherwise */
  const { role: userRole, allowedModules } = useAuth()
  const filterItem = (item: NavItem): boolean => {
    /* Items marqués adminOnly cachés à tous sauf admin */
    if (item.adminOnly && userRole !== 'admin') return false
    if (userRole === 'admin') return true
    /* No module key on item → show by default (Settings link, etc.) */
    if (!item.module) return true
    /* Explicit override: only the listed modules are visible */
    if (Array.isArray(allowedModules)) return allowedModules.includes(item.module)
    /* No override yet — let everything through (role-default behaviour). */
    return true
  }
  const VISIBLE_GROUPS = NAV_GROUPS
    .map(g => ({ ...g, items: g.items.filter(filterItem) }))
    .filter(g => g.items.length > 0)

  const toggleGroup = (title: string) => {
    setExpandedGroups(prev => {
      const next = prev.includes(title)
        ? prev.filter(g => g !== title)
        : [...prev, title]
      try { localStorage.setItem('sidebar-expanded-groups', JSON.stringify(next)) } catch {}
      return next
    })
  }

  return (
    <aside
      className={cn(
        'fixed left-0 top-0 h-[100dvh] z-40 flex flex-col transition-all duration-300',
        'border-r border-slate-200/80 dark:border-slate-800/60',
        'bg-white dark:bg-[#060d1c]',
        'pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      {/* ── Logo ── */}
      <div className={cn(
        'flex items-center h-16 px-4 flex-shrink-0 border-b border-slate-100 dark:border-slate-800/60',
        collapsed ? 'justify-center' : 'justify-between',
      )}>
        {!collapsed && (
          <motion.div
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            className="flex items-center gap-2.5 min-w-0"
          >
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}
            >
              <span className="text-white font-black text-[15px] tracking-tight">N</span>
            </div>
            <div className="min-w-0">
              <p className="font-extrabold text-[15px] tracking-tight text-slate-900 dark:text-white leading-none">NEXT GITAL</p>
              <p className="text-[10px] font-semibold leading-none mt-1" style={{ background: 'linear-gradient(90deg, #2563EB, #7C3AED)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                CRM & Gestion
              </p>
            </div>
          </motion.div>
        )}

        {collapsed && (
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #2563EB 0%, #4F46E5 100%)', boxShadow: '0 4px 12px rgba(37,99,235,0.3)' }}
          >
            <span className="text-white font-black text-[15px]">N</span>
          </div>
        )}

        {!collapsed && (
          <button
            onClick={onToggle}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-white transition-colors flex-shrink-0"
            title="Réduire"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* ── Navigation ── */}
      <div className="flex-1 overflow-y-auto py-4 px-2.5 space-y-0.5">
        {VISIBLE_GROUPS.map(group => (
          <div key={group.title} className="mb-2">

            {/* Section label */}
            {!collapsed && (
              <button
                onClick={() => toggleGroup(group.title)}
                className="w-full flex items-center justify-between px-2 py-1 mb-1
                           text-[10px] font-bold uppercase tracking-[0.12em]
                           text-slate-400 dark:text-slate-600
                           hover:text-blue-500 dark:hover:text-slate-400
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
                  className="overflow-hidden space-y-0.5"
                >
                  {group.items.map(item => {
                    const fullHref = item.href === '/' ? base || '/' : `${base}${item.href}`
                    const isActive = item.href === '/'
                      ? location.pathname === base || location.pathname === base + '/'
                      : location.pathname.startsWith(`${base}${item.href}`)

                    return (
                      <NavLink
                        key={item.href}
                        to={fullHref}
                        title={collapsed ? item.label : undefined}
                        className={cn(
                          'sidebar-item',
                          isActive && 'active',
                          collapsed && 'justify-center px-0',
                        )}
                      >
                        <item.icon
                          className={cn(
                            'sidebar-icon-el flex-shrink-0 transition-colors',
                            collapsed ? 'w-5 h-5' : 'w-4 h-4',
                          )}
                        />
                        {!collapsed && (
                          <>
                            <span className="flex-1 truncate">{item.label}</span>
                            {item.badge === 'IA' && (
                              <span className={cn(
                                'px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none',
                                isActive
                                  ? 'bg-white/20 text-white border border-white/30'
                                  : 'bg-violet-50 text-violet-600 border border-violet-200 dark:bg-violet-950/50 dark:text-violet-300 dark:border-violet-800/50'
                              )}>
                                IA ✦
                              </span>
                            )}
                            {item.badge === 'MRR' && (
                              <span className={cn(
                                'px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none',
                                isActive
                                  ? 'bg-white/20 text-white border border-white/30'
                                  : 'bg-emerald-50 text-emerald-600 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/50'
                              )}>
                                MRR
                              </span>
                            )}
                            {item.badge === 'Auto' && (
                              <span className={cn(
                                'px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none',
                                isActive
                                  ? 'bg-white/20 text-white border border-white/30'
                                  : 'bg-amber-50 text-amber-600 border border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/50'
                              )}>
                                Auto
                              </span>
                            )}
                            {item.badge === 'Soon' && (
                              <span className={cn(
                                'px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none',
                                isActive
                                  ? 'bg-white/20 text-white border border-white/30'
                                  : 'bg-pink-50 text-pink-600 border border-pink-200 dark:bg-pink-950/50 dark:text-pink-300 dark:border-pink-800/50'
                              )}>
                                Soon
                              </span>
                            )}
                            {item.badge === 'Stock' && stockAlertCount > 0 && (
                              <span className={cn(
                                'px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none',
                                isActive
                                  ? 'bg-white/20 text-white border border-white/30'
                                  : 'bg-red-50 text-red-600 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-800/50'
                              )}>
                                {stockAlertCount}
                              </span>
                            )}
                            {item.badge === 'Vehicles' && vehicleAlertCount > 0 && (
                              <span className={cn(
                                'px-1.5 py-0.5 rounded-md text-[10px] font-bold leading-none',
                                isActive
                                  ? 'bg-white/20 text-white border border-white/30'
                                  : 'bg-orange-50 text-orange-600 border border-orange-200 dark:bg-orange-950/50 dark:text-orange-300 dark:border-orange-800/50'
                              )}>
                                {vehicleAlertCount}
                              </span>
                            )}
                          </>
                        )}
                      </NavLink>
                    )
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-slate-100 dark:border-slate-800/60 p-2.5 flex-shrink-0">
        <NavLink
          to="/parametres"
          className={cn('sidebar-item', location.pathname === '/parametres' && 'active', collapsed && 'justify-center px-0')}
          title={collapsed ? 'Paramètres' : undefined}
        >
          <Settings className={cn(
            'sidebar-icon-el flex-shrink-0',
            collapsed ? 'w-5 h-5' : 'w-4 h-4',
          )} />
          {!collapsed && <span>Paramètres</span>}
        </NavLink>
      </div>
    </aside>
  )
}
