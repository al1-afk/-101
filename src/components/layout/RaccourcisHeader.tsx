/**
 * RACCOURCIS DU HAUT — les quatre pages qu'on ouvre le plus.
 *
 * ── Pourquoi ils existent aussi sur ordinateur ──────────────────────
 * Le téléphone a sa barre du bas (BottomNav) depuis longtemps : quatre
 * pages à un doigt. Sur ordinateur, atteindre les mêmes pages demandait
 * de parcourir une barre latérale de vingt entrées réparties en
 * sections — ou de la rouvrir quand elle est repliée. Les mêmes
 * raccourcis, au même endroit qu'on regarde déjà, valent mieux qu'un
 * menu à relire.
 *
 * ── Une seule liste, deux barres ────────────────────────────────────
 * Les quatre entrées et la règle d'accès viennent de BottomNav : les
 * recopier ici, c'est se préparer à un jour où le téléphone et
 * l'ordinateur ne proposeront plus les mêmes pages, sans que personne
 * ne l'ait décidé.
 *
 * Masqués sous `lg` : en dessous, le bandeau porte déjà le fil
 * d'Ariane, la recherche et six boutons — les serrer davantage les
 * rendrait tous moins atteignables. Le téléphone, lui, a sa barre du
 * bas.
 */
import { NavLink, useLocation, useParams } from 'react-router-dom'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { RACCOURCIS_RAPIDES, sectionCourante, raccourcisVisibles } from './raccourcis'

export default function RaccourcisHeader() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const { role, allowedModules } = useAuth()
  const location = useLocation()

  const visible = raccourcisVisibles(RACCOURCIS_RAPIDES, role, allowedModules)
  if (!visible.length) return null

  const base   = tenantSlug ? `/${tenantSlug}` : ''
  const active = sectionCourante(location.pathname, tenantSlug)

  return (
    /* `shrink-0` : sans lui, c'est le fil d'Ariane qui cède — et le nom
       de la page, tronqué jusqu'à disparaître, est précisément ce qu'on
       vient y lire. Les raccourcis ont une largeur fixe et connue ; le
       fil d'Ariane, lui, sait se tronquer proprement. */
    <nav className="hidden lg:flex items-center gap-0.5 ml-2 pl-2 border-l border-border/70 shrink-0">
      {visible.map(item => {
        const Icon = item.icon
        const on   = active === item.href
        return (
          <NavLink
            key={item.href}
            to={`${base}${item.href}`}
            title={item.label}
            className={cn(
              'flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12.5px] font-medium transition-colors',
              on
                ? 'bg-electric-500/10 text-electric-700 dark:text-cyan-300'
                : 'text-slate-500 dark:text-slate-400 hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
            )}
          >
            <Icon className="w-3.5 h-3.5 flex-shrink-0" />
            {item.label}
          </NavLink>
        )
      })}
    </nav>
  )
}
