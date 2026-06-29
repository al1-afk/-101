/**
 * Vue "Pipeline équipe" — affiche pour chaque membre actif :
 *   - tâches en cours, en retard, à faire aujourd'hui
 *   - tâches en attente de validation (que l'admin doit approuver)
 * Idéal pour le stand-up quotidien : qui fait quoi, qui est bloqué, qui attend.
 */
import { useMemo } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Users, AlertTriangle, Calendar, Play, Sparkles,
  Check, ChevronRight, Inbox, Clock,
} from 'lucide-react'
import { useTeam } from '@/hooks/useTeam'
import { useTeamMemberTasks } from '@/hooks/useTeamMemberTasks'
import { teamMemberTasksApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

function startOfDayMs(): number { const x = new Date(); x.setHours(0,0,0,0); return x.getTime() }

interface MemberStats {
  member: any
  inProgress: number
  validation: number
  overdue: number
  today: number
  open: number
  validationTasks: any[]
}

export default function TeamPipelinePanel({ basePath }: { basePath: string }) {
  const { data: members = [] } = useTeam()
  const { data: tasks = [] } = useTeamMemberTasks()
  const qc = useQueryClient()

  const validateTask = useMutation({
    mutationFn: (id: string) => teamMemberTasksApi.update(id, { status: 'done' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team_member_tasks'] })
      toast.success('✓ Tâche validée')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const rejectTask = useMutation({
    mutationFn: (id: string) => teamMemberTasksApi.update(id, { status: 'in_progress' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['team_member_tasks'] })
      toast.info('Renvoyée en cours')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const rows: MemberStats[] = useMemo(() => {
    const today = startOfDayMs()
    const tomorrow = today + 86_400_000
    return members
      .filter(m => m.statut !== 'inactif')
      .map(m => {
        const mt = tasks.filter(t => t.team_member_id === m.id && t.status !== 'cancelled')
        const open = mt.filter(t => t.status !== 'done')
        const inProgress = open.filter(t => t.status === 'in_progress').length
        const validationTasks = mt.filter(t => t.status === 'validation')
        const overdue = open.filter(t => {
          if (!t.due_date) return false
          return new Date(t.due_date + 'T23:59:59').getTime() < Date.now() && t.status !== 'validation'
        }).length
        const todayCount = open.filter(t => {
          if (!t.due_date) return false
          const due = new Date(t.due_date + 'T23:59:59').getTime()
          return due >= today && due < tomorrow
        }).length
        return {
          member: m,
          inProgress,
          validation: validationTasks.length,
          validationTasks,
          overdue,
          today: todayCount,
          open: open.length,
        }
      })
      .filter(r => r.open > 0 || r.validation > 0)
      .sort((a, b) => {
        if (a.validation !== b.validation) return b.validation - a.validation
        if (a.overdue !== b.overdue) return b.overdue - a.overdue
        return b.open - a.open
      })
  }, [members, tasks])

  return (
    <div className="card-premium p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          Pipeline équipe
          <span className="text-[11px] font-medium text-muted-foreground">— qui fait quoi maintenant</span>
        </h2>
        <Link to={`${basePath}/equipe`} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
          Gérer l'équipe <ChevronRight className="w-3 h-3" />
        </Link>
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center">
          <Inbox className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Aucun membre n'a de tâche active.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {rows.map(r => (
            <div key={r.member.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
              {/* Ligne membre + compteurs */}
              <div className="flex items-center gap-3">
                <div className="avatar-initials-purple w-8 h-8 flex-shrink-0">
                  <span className="font-bold text-[11px]">
                    {(r.member.prenom?.[0] ?? '') + (r.member.nom?.[0] ?? '')}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {r.member.prenom} {r.member.nom}
                  </p>
                  {r.member.poste && (
                    <p className="text-[11px] text-muted-foreground truncate">{r.member.poste}</p>
                  )}
                </div>

                {/* Compteurs cliquables visuellement */}
                <div className="flex items-center gap-1.5 flex-wrap justify-end">
                  {r.validation > 0 && (
                    <Pill icon={Sparkles} count={r.validation} label="à valider" tone="violet" pulse />
                  )}
                  {r.overdue > 0 && (
                    <Pill icon={AlertTriangle} count={r.overdue} label="en retard" tone="red" />
                  )}
                  {r.today > 0 && (
                    <Pill icon={Calendar} count={r.today} label="aujourd'hui" tone="amber" />
                  )}
                  {r.inProgress > 0 && (
                    <Pill icon={Play} count={r.inProgress} label="en cours" tone="blue" />
                  )}
                  {r.open === 0 && r.validation === 0 && (
                    <span className="text-[11px] text-muted-foreground">à jour</span>
                  )}
                </div>
              </div>

              {/* Tâches en validation : actions inline */}
              {r.validationTasks.length > 0 && (
                <div className="pl-11 space-y-1.5 border-l-2 border-violet-300 dark:border-violet-800/60">
                  {r.validationTasks.slice(0, 3).map(t => (
                    <div key={t.id} className="flex items-center gap-2 pl-2 py-1">
                      <Sparkles className="w-3 h-3 text-violet-500 flex-shrink-0" />
                      <Link
                        to={t.project_id ? `${basePath}/projets/${t.project_id}` : '#'}
                        className="flex-1 text-xs text-foreground hover:text-violet-600 dark:hover:text-violet-400 hover:underline truncate"
                        title="Voir le projet"
                      >
                        {t.title}
                      </Link>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] border-slate-300"
                        onClick={() => rejectTask.mutate(t.id)}
                        title="Renvoyer en cours pour correction"
                      >
                        <Clock className="w-3 h-3" /> À refaire
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => validateTask.mutate(t.id)}
                        title="Valider la tâche (status → done)"
                      >
                        <Check className="w-3 h-3" /> Valider
                      </Button>
                    </div>
                  ))}
                  {r.validationTasks.length > 3 && (
                    <p className="text-[11px] text-muted-foreground pl-2 italic">
                      +{r.validationTasks.length - 3} autres en validation
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function Pill({ icon: Icon, count, label, tone, pulse }: {
  icon: React.ElementType
  count: number
  label: string
  tone: 'red' | 'amber' | 'blue' | 'violet'
  pulse?: boolean
}) {
  const cfg = {
    red:    'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 border-red-200 dark:border-red-900/40',
    amber:  'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-900/40',
    blue:   'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border-blue-200 dark:border-blue-900/40',
    violet: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300 border-violet-200 dark:border-violet-900/40',
  }[tone]
  return (
    <span
      className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[11px] font-semibold', cfg, pulse && 'animate-pulse')}
      title={`${count} ${label}`}
    >
      <Icon className="w-3 h-3" />
      <span className="font-bold">{count}</span>
      <span className="hidden md:inline">{label}</span>
    </span>
  )
}
