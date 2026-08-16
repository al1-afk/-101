/**
 * 7aty — journal des blocs, groupé par jour.
 *
 * Le journal est l'endroit où l'on CORRIGE : c'est en relisant sa
 * journée qu'on se rend compte qu'un film était planifié (repos) ou
 * qu'une « recherche » de deux heures était en réalité de la navigation
 * sans but. Chaque ligne est donc cliquable, et la nature se change en
 * un geste depuis le menu — sans rouvrir tout le formulaire.
 */
import { useMemo } from 'react'
import { Pencil, MoreVertical } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { getCategory, TIME_KINDS, CONTROL_LEVELS, type TimeKind } from '@/lib/timeCategories'
import {
  entryMinutes, formatMinutes, startOfDay, totalsByKind,
  type TimeEntry,
} from '@/lib/timeAnalytics'
import { useUpdateTimeEntry, useDeleteTimeEntry } from '@/hooks/useTimeTracking'

export function TimeJournal({
  entries, now, onEdit,
}: {
  entries: TimeEntry[]
  now: Date
  onEdit: (entry: TimeEntry) => void
}) {
  const update = useUpdateTimeEntry()
  const remove = useDeleteTimeEntry()

  /* Regroupement par jour, du plus récent au plus ancien. */
  const days = useMemo(() => {
    const map = new Map<number, TimeEntry[]>()
    for (const e of entries) {
      const key = startOfDay(new Date(e.started_at)).getTime()
      const list = map.get(key)
      if (list) list.push(e)
      else map.set(key, [e])
    }
    return [...map.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([time, list]) => ({
        date: new Date(time),
        entries: list.sort(
          (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
        ),
      }))
  }, [entries])

  if (!days.length) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <p className="text-3xl mb-2">📋</p>
        <p className="text-sm font-semibold text-foreground">Rien d'enregistré sur cette semaine</p>
        <p className="text-xs text-muted-foreground mt-1">
          Utilise le Quick Log ci-dessus, ou « Enregistrer une distraction » pour un bloc déjà passé.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {days.map(day => {
        const totals = totalsByKind(day.entries, now)
        return (
          <div key={day.date.getTime()} className="rounded-2xl border border-border bg-[var(--surface-card)] overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3 flex-wrap">
              <h3 className="text-sm font-bold text-foreground capitalize">
                {day.date.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <div className="flex items-center gap-3 text-[11px] tabular-nums">
                <span className="text-muted-foreground">Total {formatMinutes(totals.total)}</span>
                {totals.valeur > 0 && (
                  <span style={{ color: TIME_KINDS.valeur.color }}>💰 {formatMinutes(totals.valeur)}</span>
                )}
                {totals.repos > 0 && (
                  <span style={{ color: TIME_KINDS.repos.color }}>🟢 {formatMinutes(totals.repos)}</span>
                )}
                {totals.perdu > 0 && (
                  <span style={{ color: TIME_KINDS.perdu.color }}>🔴 {formatMinutes(totals.perdu)}</span>
                )}
              </div>
            </div>

            <div className="divide-y divide-border">
              {day.entries.map(e => {
                const cat = getCategory(e.category_key)
                const kindMeta = TIME_KINDS[e.kind]
                const running = !e.ended_at
                return (
                  <div
                    key={e.id}
                    className={cn(
                      'px-4 py-3 flex items-center gap-3 group',
                      running && 'bg-amber-50/60 dark:bg-amber-950/10',
                    )}
                  >
                    <span
                      className="w-9 h-9 rounded-xl flex items-center justify-center text-base shrink-0"
                      style={{ backgroundColor: `${cat.color}1a` }}
                    >
                      {cat.emoji}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-foreground truncate">{e.label}</span>
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold text-white shrink-0"
                          style={{ backgroundColor: kindMeta.color }}
                        >
                          {kindMeta.emoji} {kindMeta.short}
                        </span>
                        {e.control_level && (
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            {CONTROL_LEVELS[e.control_level].emoji} {CONTROL_LEVELS[e.control_level].label}
                          </span>
                        )}
                        {running && (
                          <span className="text-[10px] font-bold text-amber-700 dark:text-amber-400 shrink-0">
                            ● en cours
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        {cat.label} · {new Date(e.started_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        {e.ended_at && ` → ${new Date(e.ended_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`}
                      </p>
                      {e.notes && (
                        <p className="text-[11px] text-muted-foreground italic mt-1 line-clamp-2">« {e.notes} »</p>
                      )}
                    </div>

                    <span className="text-sm font-bold tabular-nums text-foreground shrink-0">
                      {formatMinutes(entryMinutes(e, now))}
                    </span>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEdit(e)}
                        className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        aria-label="Modifier le bloc"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <button
                            type="button"
                            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                            aria-label="Autres actions"
                          >
                            <MoreVertical className="w-3.5 h-3.5" />
                          </button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel className="text-[11px]">Reclasser ce bloc</DropdownMenuLabel>
                          {(Object.keys(TIME_KINDS) as TimeKind[]).map(k => (
                            <DropdownMenuItem
                              key={k}
                              disabled={e.kind === k}
                              onClick={() => update.mutate({ id: e.id, kind: k })}
                            >
                              {TIME_KINDS[k].emoji} {TIME_KINDS[k].label}
                            </DropdownMenuItem>
                          ))}
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-rose-600 dark:text-rose-400"
                            onClick={() => remove.mutate(e.id)}
                          >
                            Supprimer
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
