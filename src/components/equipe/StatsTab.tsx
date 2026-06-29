/**
 * Onglet "Stats" de la page Équipe (admin) — temps + tâches par membre,
 * avec breakdown par projet quand on déplie une ligne.
 */
import { useMemo, useState } from 'react'
import {
  Clock, CheckSquare, ChevronDown, ChevronRight, TrendingUp, Users,
  Briefcase, Sparkles, Loader2,
} from 'lucide-react'
import { useTeam, type TeamMember } from '@/hooks/useTeam'
import { useTeamMemberTasks, type TeamMemberTask } from '@/hooks/useTeamMemberTasks'
import { useProjets } from '@/hooks/useProjets'
import { formatHMS } from '@/lib/taskTimer'
import { getInitials, cn } from '@/lib/utils'

type Period = 'all' | '7d' | '30d' | 'this_month'

const PERIOD_LABELS: Record<Period, string> = {
  all:        'Tout',
  '7d':       '7 derniers jours',
  '30d':      '30 derniers jours',
  this_month: 'Ce mois',
}

function periodCutoff(p: Period): number {
  const now = Date.now()
  if (p === '7d')        return now - 7  * 86_400_000
  if (p === '30d')       return now - 30 * 86_400_000
  if (p === 'this_month') { const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d.getTime() }
  return 0
}

export default function StatsTab() {
  const { data: members = [], isLoading: lm } = useTeam()
  const { data: tasks   = [], isLoading: lt } = useTeamMemberTasks()
  const { data: projets = [] }                = useProjets()
  const [period, setPeriod]   = useState<Period>('all')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const cutoff = periodCutoff(period)

  /* Filter tasks by period (based on updated_at or completed_at) */
  const filteredTasks = useMemo(() => tasks.filter(t => {
    if (cutoff === 0) return true
    const ref = t.completed_at ?? t.updated_at ?? t.created_at
    return ref ? new Date(ref).getTime() >= cutoff : true
  }), [tasks, cutoff])

  /* Per-member stats */
  const stats = useMemo(() => members.map(m => {
    const mine = filteredTasks.filter(t => t.team_member_id === m.id)
    const done = mine.filter(t => t.status === 'done').length
    const inProg = mine.filter(t => t.status === 'in_progress').length
    const valid = mine.filter(t => t.status === 'validation').length
    const time = mine.reduce((s, t) => s + (t.elapsed_seconds ?? 0), 0)
    const pct  = mine.length > 0 ? Math.round((done / mine.length) * 100) : 0
    /* Per-project breakdown */
    const byProject = new Map<string | null, { count: number; done: number; time: number }>()
    for (const t of mine) {
      const k = t.project_id
      const cur = byProject.get(k) ?? { count: 0, done: 0, time: 0 }
      cur.count++
      if (t.status === 'done') cur.done++
      cur.time += t.elapsed_seconds ?? 0
      byProject.set(k, cur)
    }
    return { member: m, total: mine.length, done, inProg, valid, time, pct, byProject }
  }).sort((a, b) => b.time - a.time), [members, filteredTasks])

  /* Agency totals */
  const totals = useMemo(() => ({
    time:  stats.reduce((s, x) => s + x.time, 0),
    done:  stats.reduce((s, x) => s + x.done, 0),
    tasks: stats.reduce((s, x) => s + x.total, 0),
  }), [stats])

  const projetName = (id: string | null) => {
    if (!id) return '— Sans projet —'
    return projets.find(p => p.id === id)?.nom ?? '?'
  }

  const toggle = (id: string) => setExpanded(p => {
    const next = new Set(p)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })

  if (lm || lt) {
    return <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
  }

  return (
    <div className="space-y-4">
      {/* Period filter */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-blue-500" />
            Activité de l'équipe
          </h3>
          <p className="text-[11px] text-muted-foreground">Temps tracké et progression de chaque membre · classé par temps total décroissant</p>
        </div>
        <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-muted/30">
          {(Object.entries(PERIOD_LABELS) as [Period, string][]).map(([k, label]) => (
            <button key={k}
              onClick={() => setPeriod(k)}
              className={cn(
                'px-3 py-1.5 rounded-md text-xs font-semibold transition-colors',
                period === k ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
              )}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs agence */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi icon={Users}       label="Membres actifs"  value={String(members.filter(m => m.statut === 'actif').length)} />
        <Kpi icon={Clock}       label="Temps total tracké" value={formatHMS(totals.time)} color="amber" />
        <Kpi icon={CheckSquare} label="Tâches terminées" value={`${totals.done} / ${totals.tasks}`} color="emerald" />
        <Kpi icon={Sparkles}    label="Taux de complétion"
             value={totals.tasks > 0 ? `${Math.round((totals.done / totals.tasks) * 100)}%` : '—'} color="violet" />
      </div>

      {/* Table membres */}
      <div className="card-premium overflow-hidden">
        {stats.length === 0 ? (
          <div className="empty-state py-12">
            <Users className="empty-state-icon" />
            <p className="empty-state-title">Aucun membre</p>
            <p className="empty-state-desc">Invite un collaborateur depuis l'onglet Invitations</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2.5 w-10"></th>
                <th className="text-left px-4 py-2.5">Membre</th>
                <th className="text-left px-4 py-2.5 w-44">Tâches</th>
                <th className="text-left px-4 py-2.5 w-40">Progression</th>
                <th className="text-right px-4 py-2.5 w-32">Temps tracké</th>
                <th className="text-right px-4 py-2.5 w-24">En cours</th>
                <th className="text-right px-4 py-2.5 w-24">Validation</th>
              </tr>
            </thead>
            <tbody>
              {stats.map(({ member: m, total, done, inProg, valid, time, pct, byProject }) => {
                const isOpen = expanded.has(m.id)
                return (
                  <>
                    <tr key={m.id} className="border-t border-border hover:bg-muted/30 cursor-pointer"
                        onClick={() => toggle(m.id)}>
                      <td className="px-4 py-3">
                        {isOpen ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="avatar-initials-purple w-9 h-9">
                            <span className="font-bold text-xs">{getInitials(`${m.prenom} ${m.nom}`)}</span>
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">{m.prenom} {m.nom}</p>
                            <p className="text-[11px] text-muted-foreground">{m.poste ?? '—'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold text-foreground">{done} / {total}</span>
                        <span className="text-[11px] text-muted-foreground ml-1">terminées</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div className="h-full rounded-full transition-all"
                              style={{
                                width: `${pct}%`,
                                background: pct === 100 ? 'linear-gradient(90deg, #10b981, #34d399)' : 'linear-gradient(90deg, #6366f1, #818cf8)',
                              }}
                            />
                          </div>
                          <span className="text-xs font-mono font-bold w-10 text-right">{pct}%</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                          {time > 0 ? formatHMS(time) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        {inProg > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 dark:text-blue-400">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" /> {inProg}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {valid > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-violet-600 dark:text-violet-400">
                            ⚑ {valid}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                    </tr>

                    {/* Drill-down per project */}
                    {isOpen && (
                      <tr key={m.id + '-detail'} className="border-t border-border bg-muted/10">
                        <td></td>
                        <td colSpan={6} className="px-4 py-3">
                          <p className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                            Répartition par projet
                          </p>
                          {byProject.size === 0 ? (
                            <p className="text-xs text-muted-foreground italic">Aucune tâche pour cette période.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {[...byProject.entries()]
                                .sort((a, b) => b[1].time - a[1].time)
                                .map(([projId, s]) => {
                                const projPct = s.count > 0 ? Math.round((s.done / s.count) * 100) : 0
                                return (
                                  <div key={projId ?? 'none'} className="flex items-center gap-3 p-2 rounded-lg bg-background border border-border/60">
                                    <Briefcase className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                                    <span className="text-sm font-medium text-foreground flex-1 truncate">{projetName(projId)}</span>
                                    <span className="text-xs text-muted-foreground">{s.done}/{s.count} tâches</span>
                                    <div className="w-24 h-1 rounded-full bg-muted overflow-hidden">
                                      <div className="h-full rounded-full bg-blue-500" style={{ width: `${projPct}%` }} />
                                    </div>
                                    <span className="text-xs font-mono w-8 text-right">{projPct}%</span>
                                    <span className="text-xs font-mono font-bold text-amber-600 dark:text-amber-400 w-20 text-right">
                                      {formatHMS(s.time)}
                                    </span>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className="text-[11px] text-muted-foreground text-center">
        💡 Clique sur une ligne pour voir la répartition par projet de chaque membre.
      </p>
    </div>
  )
}

function Kpi({ icon: Icon, label, value, color = 'blue' }: {
  icon: React.ElementType
  label: string
  value: string
  color?: 'blue' | 'amber' | 'emerald' | 'violet'
}) {
  const bg = { blue: 'bg-blue-500/10', amber: 'bg-amber-500/10', emerald: 'bg-emerald-500/10', violet: 'bg-violet-500/10' }[color]
  const tc = { blue: 'text-blue-600 dark:text-blue-400', amber: 'text-amber-600 dark:text-amber-400', emerald: 'text-emerald-600 dark:text-emerald-400', violet: 'text-violet-600 dark:text-violet-400' }[color]
  return (
    <div className="card-premium p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', bg)}>
        <Icon className={cn('w-5 h-5', tc)} />
      </div>
      <div>
        <p className="text-base font-extrabold text-foreground">{value}</p>
        <p className="text-[11px] text-muted-foreground">{label}</p>
      </div>
    </div>
  )
}
