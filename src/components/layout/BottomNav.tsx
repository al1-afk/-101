/**
 * BottomNav — barre de navigation mobile de l'espace admin.
 *
 * Quatre raccourcis, volontairement : les pages ouvertes le plus souvent
 * depuis un téléphone. Tout le reste passe par le menu latéral (bouton
 * hamburger du header) — cette barre n'a pas vocation à grandir.
 *
 * Masquée à partir de md : sur desktop la barre latérale fait le travail.
 */
import { NavLink, useLocation, useParams } from 'react-router-dom'
import { DollarSign, FolderKanban, CreditCard, UserCheck } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

interface BottomNavItem {
  label:  string
  href:   string
  icon:   React.ElementType
  /** Même clé que dans Sidebar.tsx : un utilisateur sans le module
   *  ne doit pas obtenir ici un raccourci qu'on lui refuse ailleurs. */
  module: string
}

const ITEMS: BottomNavItem[] = [
  { label: 'Dépenses',  href: '/depenses',  icon: DollarSign,   module: 'depenses'  },
  { label: 'Projets',   href: '/projets',   icon: FolderKanban, module: 'projets'   },
  { label: 'Paiements', href: '/paiements', icon: CreditCard,   module: 'paiements' },
  { label: 'Prospects', href: '/prospects', icon: UserCheck,    module: 'prospects' },
]

export default function BottomNav() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const { role, allowedModules } = useAuth()
  const location = useLocation()

  const base = tenantSlug ? `/${tenantSlug}` : ''

  /* Mêmes règles que la barre latérale (Sidebar.filterItem). */
  const visible = ITEMS.filter(item => {
    if (role === 'admin') return true
    if (Array.isArray(allowedModules)) return allowedModules.includes(item.module)
    return true
  })

  if (visible.length === 0) return null

  /* Le préfixe tenant retiré, on compare la première section du chemin :
     /nextgital/projets/42 doit garder « Projets » actif. */
  const bareTop = '/' + (
    location.pathname
      .replace(tenantSlug ? `/${tenantSlug}` : '', '')
      .split('/')
      .filter(Boolean)[0] || ''
  )

  return (
    <nav
      className={cn(
        'md:hidden fixed bottom-0 left-0 right-0 z-30',
        'bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl',
        'border-t border-slate-200 dark:border-slate-800',
        'pb-[env(safe-area-inset-bottom)]',
      )}
      aria-label="Navigation rapide"
    >
      <div className="flex items-stretch">
        {visible.map(item => {
          const Icon   = item.icon
          const active = bareTop === item.href
          return (
            <NavLink
              key={item.href}
              to={`${base}${item.href}`}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-1 py-2 min-h-[56px]',
                'text-[11px] font-medium transition-colors active:scale-[0.97]',
                active
                  ? 'text-electric-600 dark:text-cyan-400'
                  : 'text-slate-500 dark:text-slate-400',
              )}
            >
              <span
                className={cn(
                  'flex items-center justify-center w-9 h-7 rounded-lg transition-colors',
                  active && 'bg-electric-500/10 dark:bg-cyan-400/10',
                )}
              >
                <Icon className="w-[18px] h-[18px]" />
              </span>
              {item.label}
            </NavLink>
          )
        })}
      </div>
    </nav>
  )
}
