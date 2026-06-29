/**
 * Panneau "Mes tâches admin" — sur la page /projets.
 * Liste toutes les tâches assignées à l'admin connecté (assigned_user_id),
 * à travers tous les projets, avec quick-actions (timer + done).
 */
import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Shield, Play, Pause, Check, Square as SquareIcon, Calendar, AlertTriangle,
  Briefcase, Inbox, CircleDot,
} from 'lucide-react'
import { useTeamMemberTasks } from '@/hooks/useTeamMemberTasks'
import { useProjets } from '@/hooks/useProjets'
import { useAuth } from '@/hooks/useAuth'
import { teamMemberTasksApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { getActiveTimer, setActiveTimer, formatHMS } from '@/lib/taskTimer'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

function dueLabel(due?: string | null): { text: string; tone: 'overdue' | 'today' | 'soon' | 'later' | 'none' } {
  if (!due) return { text: '', tone: 'none' }
  const d = new Date(due + 'T23:59:59')
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000)
  if (days < 0)  return { text: `En retard de ${-days}j`, tone: 'overdue' }
  if (days === 0) return { text: "Aujourd'hui", tone: 'today' }
  if (days === 1) return { text: 'Demain', tone: 'soon' }
  if (days <= 7)  return { text: `Dans ${days}j`, tone: 'soon' }
  return { text: d.toLocaleDateString('fr-FR'), tone: 'later' }
}

export default function AdminTasksPanel({ basePath }: { basePath: string }) {
  const { userId } = useAuth()
  const { data: tasks = [] } = useTeamMemberTasks()
  const { data: projets = [] } = useProjets()
  const qc = useQueryClient()

  const update = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: any }) => teamMemberTasksApi.update(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['team_member_tasks'] }),
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  /* Live tick for running timer */
  const [, setTick] = useState(0)
  const active = getActiveTimer()
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [active?.taskId])

  const mine = useMemo(() => {
    if (!userId) return []
    return tasks
      .filter(t => t.assigned_user_id === userId && t.status !== 'done' && t.status !== 'cancelled')
      .sort((a, b) => {
        const order = { in_progress: 0, todo: 1, validation: 2, done: 3, cancelled: 4 } as const
        if (order[a.status] !== order[b.status]) return order[a.status] - order[b.status]
        const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity
        const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity
        return ad - bd
      })
  }, [tasks, userId])

  const overdueCount = mine.filter(t => t.due_date && new Date(t.due_date + 'T23:59:59').getTime() < Date.now()).length

  const startTimer = (task: any) => {
    const cur = getActiveTimer()
    if (cur !== null && cur.taskId !== task.id) {
      const prev = tasks.find(t => t.id === cur.taskId)
      const extra = Math.floor((Date.now() - cur.startedAt) / 1000)
      if (prev) update.mutate({ id: cur.taskId, patch: { elapsed_seconds: (prev.elapsed_seconds ?? 0) + extra } })
    }
    setActiveTimer({ taskId: task.id, startedAt: Date.now() })
    if (task.status === 'todo') update.mutate({ id: task.id, patch: { status: 'in_progress' } })
    setTick(t => t + 1)
    toast.success(`▶ Timer démarré`)
  }
  const pauseTimer = (task: any) => {
    const cur = getActiveTimer(); if (!cur || cur.taskId !== task.id) return
    const extra = Math.floor((Date.now() - cur.startedAt) / 1000)
    setActiveTimer(null)
    update.mutate({ id: task.id, patch: { elapsed_seconds: (task.elapsed_seconds ?? 0) + extra, status: 'todo' } })
    setTick(t => t + 1)
  }
  const markDone = (task: any) => {
    const cur = getActiveTimer()
    const isMine = cur !== null && cur.taskId === task.id
    const extra = isMine ? Math.floor((Date.now() - cur!.startedAt) / 1000) : 0
    if (isMine) setActiveTimer(null)
    update.mutate({ id: task.id, patch: { elapsed_seconds: (task.elapsed_seconds ?? 0) + extra, status: 'done' } })
    toast.success(`✓ Terminée`)
    setTick(t => t + 1)
  }

  return (
    <div className="card-premium p-5 bg-gradient-to-br from-blue-50/30 to-violet-50/20 dark:from-blue-950/15 dark:to-violet-950/10 border-blue-200/60 dark:border-blue-900/40">
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h2 className="text-base font-bold text-foreground flex items-center gap-2">
          <Shield className="w-4 h-4 text-blue-600" />
          Mes tâches (admin)
          {mine.length > 0 && (
            <span className="text-[11px] font-medium text-muted-foreground">— {mine.length} en cours</span>
          )}
          {overdueCount > 0 && (
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 flex items-center gap-1 animate-pulse">
              <AlertTriangle className="w-2.5 h-2.5" /> {overdueCount} en retard
            </span>
          )}
        </h2>
      </div>

      {mine.length === 0 ? (
        <div className="py-6 text-center">
          <Inbox className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            Aucune tâche ne t'est assignée. Ouvre un projet, onglet <strong>Tâches</strong>, et sélectionne <strong>🛡️ Moi (Admin)</strong> dans l'assignation.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {mine.slice(0, 8).map(t => {
            const projet = projets.find(p => p.id === t.project_id)
            const due = dueLabel(t.due_date)
            const isRunning = active?.taskId === t.id
            const liveExtra = isRunning && active ? Math.floor((Date.now() - active.startedAt) / 1000) : 0
            const elapsed = (t.elapsed_seconds ?? 0) + liveExtra
            const isInProgress = t.status === 'in_progress'
            const isValidation = t.status === 'validation'

            return (
              <div key={t.id} className={cn(
                'flex items-center gap-3 p-2.5 rounded-lg border bg-card hover:border-blue-300 dark:hover:border-blue-700 transition-colors',
                due.tone === 'overdue' && 'border-red-200 dark:border-red-900/40',
                isValidation && 'border-violet-300 dark:border-violet-800/60 bg-violet-50/30 dark:bg-violet-950/10',
              )}>
                <button
                  onClick={() => markDone(t)}
                  className="flex-shrink-0"
                  title="Marquer comme terminé"
                >
                  {isInProgress ? <CircleDot className="w-4 h-4 text-blue-600" /> : <SquareIcon className="w-4 h-4 text-slate-300 hover:text-emerald-500" />}
                </button>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">{t.title}</p>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                    {projet && (
                      <Link to={`${basePath}/projets/${projet.id}`} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate">
                        <Briefcase className="w-2.5 h-2.5" /> {projet.nom}
                      </Link>
                    )}
                    {due.tone !== 'none' && (
                      <span className={cn(
                        'flex items-center gap-1',
                        due.tone === 'overdue' && 'text-red-600 dark:text-red-400 font-semibold',
                        due.tone === 'today'   && 'text-amber-600 dark:text-amber-400 font-semibold',
                      )}>
                        {due.tone === 'overdue' ? <AlertTriangle className="w-2.5 h-2.5" /> : <Calendar className="w-2.5 h-2.5" />}
                        {due.text}
                      </span>
                    )}
                    {elapsed > 0 && (
                      <span className={cn('font-mono', isRunning && 'text-amber-600 dark:text-amber-400 font-bold')}>
                        ⏱ {formatHMS(elapsed)}{isRunning && ' · en cours'}
                      </span>
                    )}
                    {t.priority === 'urgent' && (
                      <span className="px-1.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-bold">URGENT</span>
                    )}
                  </div>
                </div>

                {!isValidation && (
                  <div className="flex gap-1 flex-shrink-0">
                    {!isRunning ? (
                      <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => startTimer(t)}>
                        <Play className="w-3 h-3 text-emerald-600" />
                        <span className="hidden md:inline">{(t.elapsed_seconds ?? 0) > 0 ? 'Continuer' : 'Commencer'}</span>
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" className="h-7 text-[11px] border-amber-300 bg-amber-50 dark:bg-amber-950/30" onClick={() => pauseTimer(t)}>
                        <Pause className="w-3 h-3 text-amber-600" />
                        <span className="hidden md:inline">Pause</span>
                      </Button>
                    )}
                  </div>
                )}
                {isValidation && (
                  <span className="text-[11px] text-violet-700 dark:text-violet-400 italic flex items-center gap-1 px-2">
                    <Check className="w-3 h-3" /> En validation
                  </span>
                )}
              </div>
            )
          })}
          {mine.length > 8 && (
            <p className="text-[11px] text-muted-foreground italic text-center pt-1">
              +{mine.length - 8} autres tâches non affichées
            </p>
          )}
        </div>
      )}
    </div>
  )
}
