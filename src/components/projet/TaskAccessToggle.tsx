/**
 * Périmètre des tâches visibles par une personne assignée à un projet.
 *
 * Deux options exclusives, stockées dans projet_assignees.task_access
 * (migration 085). Purement présentationnel : le composant ne connaît ni
 * mutation ni requête, pour servir aussi bien la ligne d'un assigné dans
 * l'onglet Équipe qu'un état local du formulaire projet.
 */
import type { ElementType } from 'react'
import { Eye, ListChecks } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { ProjetTaskAccess } from '@/hooks/useProjetAssignees'

const OPTIONS: { value: ProjetTaskAccess; label: string; hint: string; icon: ElementType; activeCls: string }[] = [
  {
    value: 'all',
    label: 'Toutes les tâches',
    hint: 'Consulte toutes les tâches du projet et suit leur avancement (les tâches des autres restent en lecture seule)',
    icon: Eye,
    activeCls: 'text-blue-600 dark:text-blue-400',
  },
  {
    value: 'assigned',
    label: 'Par tâche',
    hint: 'Ne voit que les tâches qui lui sont attribuées — les autres ne lui sont jamais envoyées',
    icon: ListChecks,
    activeCls: 'text-amber-600 dark:text-amber-400',
  },
]

export default function TaskAccessToggle({
  value, onChange, disabled, size = 'sm', className,
}: {
  value:      ProjetTaskAccess
  onChange:   (v: ProjetTaskAccess) => void
  disabled?:  boolean
  /** 'sm' pour une ligne dense (onglet Équipe), 'md' dans un formulaire. */
  size?:      'sm' | 'md'
  className?: string
}) {
  return (
    <div
      role="group"
      aria-label="Périmètre des tâches visibles"
      className={cn(
        'inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/60 border border-border/60 flex-shrink-0',
        className,
      )}
    >
      {OPTIONS.map(o => {
        const active = value === o.value
        const Icon = o.icon
        return (
          <button
            key={o.value}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            title={o.hint}
            onClick={() => onChange(o.value)}
            className={cn(
              'flex items-center gap-1.5 rounded-md font-medium transition-colors whitespace-nowrap',
              size === 'sm' ? 'px-2 py-1 text-[11px] min-h-8' : 'px-3 py-1.5 text-xs min-h-9',
              active
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground',
              disabled && 'opacity-50 cursor-not-allowed',
            )}
          >
            <Icon className={cn('w-3.5 h-3.5 flex-shrink-0', active ? o.activeCls : 'opacity-70')} />
            {o.label}
          </button>
        )
      })}
    </div>
  )
}
