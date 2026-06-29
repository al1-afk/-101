/**
 * /my-space/tasks — member's task list with REAL time tracking.
 * Play = démarre le timer (localStorage + status in_progress)
 * Pause = sauvegarde elapsed_seconds en DB
 * Terminer = sauvegarde + statut 'validation'
 */
import { useEffect, useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  CheckSquare, Square, Circle, Loader2, AlertTriangle, Calendar, Inbox,
  Briefcase, Play, Pause, Square as SquareIcon, Check, Sparkles, Clock, Timer,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { mySpaceApi } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { getActiveTimer, setActiveTimer, formatHMS } from '@/lib/taskTimer'
import TaskDetailDialog from '@/components/projet/TaskDetailDialog'
import { useMember } from '@/hooks/useMember'

const PRIORITY_META: Record<string, { label: string; color: string; dot: string }> = {
  urgent: { label: 'URGENTE', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',         dot: 'bg-red-500' },
  high:   { label: 'HAUTE',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300', dot: 'bg-orange-500' },
  normal: { label: 'NORMALE', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',     dot: 'bg-blue-500' },
  low:    { label: 'BASSE',   color: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',    dot: 'bg-slate-400' },
}

function dueLabel(due?: string | null): { text: string; tone: 'overdue' | 'soon' | 'normal' | 'none' } {
  if (!due) return { text: 'Pas de date', tone: 'none' }
  const d = new Date(due + 'T23:59:59')
  const diff = d.getTime() - Date.now()
  const days = Math.ceil(diff / 86_400_000)
  if (days < 0) return { text: `En retard de ${-days}j`, tone: 'overdue' }
  if (days === 0) return { text: "Aujourd'hui", tone: 'soon' }
  if (days === 1) return { text: 'Demain', tone: 'soon' }
  if (days <= 7) return { text: `Dans ${days}j`, tone: 'normal' }
  return { text: d.toLocaleDateString('fr-FR'), tone: 'normal' }
}

export default function MyTasks() {
  const qc = useQueryClient()
  const { member } = useMember()
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('open')
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const { data: tasks = [], isLoading } = useQuery<any[]>({
    queryKey: ['my-space', 'tasks'],
    queryFn:  () => mySpaceApi.tasks(),
    staleTime: 30_000,
  })

  const update = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      mySpaceApi.updateTaskStatus(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-space', 'tasks'] })
      qc.invalidateQueries({ queryKey: ['my-space', 'dashboard'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const saveElapsed = useMutation({
    mutationFn: ({ id, elapsed_seconds, status }: { id: string; elapsed_seconds: number; status?: string }) =>
      mySpaceApi.updateTaskElapsed(id, elapsed_seconds, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-space', 'tasks'] })
      qc.invalidateQueries({ queryKey: ['my-space', 'dashboard'] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  /* Live tick so the running timer updates each second */
  const [, setTick] = useState(0)
  const active = getActiveTimer()
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [active?.taskId])

  /* Total time tracked today + this week (sum of elapsed_seconds + live timer) */
  const totalSeconds = useMemo(() => tasks.reduce((s, t) => s + (t.elapsed_seconds ?? 0), 0), [tasks])
  const liveExtra = active ? Math.floor((Date.now() - active.startedAt) / 1000) : 0
  const totalWithLive = totalSeconds + liveExtra

  /* Timer handlers ─ */
  const startTimer = (task: any) => {
    /* If another timer is running on a different task, stop it first and save its time */
    const cur = getActiveTimer()
    if (cur !== null && cur.taskId !== task.id) {
      const prevId    = cur.taskId
      const startedAt = cur.startedAt
      const existing  = tasks.find(t => t.id === prevId)
      const extra     = Math.floor((Date.now() - startedAt) / 1000)
      if (existing) saveElapsed.mutate({ id: prevId, elapsed_seconds: (existing.elapsed_seconds ?? 0) + extra })
    }
    setActiveTimer({ taskId: task.id, startedAt: Date.now() })
    if (task.status === 'todo') update.mutate({ id: task.id, status: 'in_progress' })
    setTick(t => t + 1)
    toast.success(`▶ Timer démarré : ${task.title}`)
  }
  const pauseTimer = (task: any) => {
    const cur = getActiveTimer(); if (!cur || cur.taskId !== task.id) return
    const extra = Math.floor((Date.now() - cur.startedAt) / 1000)
    setActiveTimer(null)
    saveElapsed.mutate({ id: task.id, elapsed_seconds: (task.elapsed_seconds ?? 0) + extra, status: 'todo' })
    setTick(t => t + 1)
    toast.info(`⏸ Pause — ${formatHMS(extra)} ajouté`)
  }
  const finishTimer = (task: any) => {
    const cur = getActiveTimer()
    const isMine = cur !== null && cur.taskId === task.id
    const extra  = isMine ? Math.floor((Date.now() - cur!.startedAt) / 1000) : 0
    if (isMine) setActiveTimer(null)
    saveElapsed.mutate({ id: task.id, elapsed_seconds: (task.elapsed_seconds ?? 0) + extra, status: 'validation' })
    setTick(t => t + 1)
    toast.success(`✓ Terminée — envoyée en validation au manager`)
  }

  const filtered = useMemo(() => {
    if (filter === 'open') return tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
    if (filter === 'done') return tasks.filter(t => t.status === 'done')
    return tasks
  }, [tasks, filter])

  /* Group tasks by project for readability */
  const grouped = useMemo(() => {
    const m = new Map<string, { projectId: string | null; name: string; tasks: any[] }>()
    for (const t of filtered) {
      const key = t.project_id ?? '__none__'
      const name = t.project_name ?? '— Sans projet —'
      const g = m.get(key) ?? { projectId: t.project_id ?? null, name, tasks: [] as any[] }
      g.tasks.push(t)
      m.set(key, g)
    }
    return Array.from(m.values())
  }, [filtered])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Mes tâches</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Clique <strong>▶ Commencer</strong> pour démarrer le chrono, <strong>⏹ Terminer</strong> pour envoyer au manager.
          </p>
        </div>
        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1">
          {(['open','done','all'] as const).map(k => (
            <button
              key={k}
              onClick={() => setFilter(k)}
              className={cn(
                'px-3 py-1.5 text-xs font-medium rounded-md transition-colors',
                filter === k
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200',
              )}
            >
              {k === 'open' ? 'En cours' : k === 'done' ? 'Terminées' : 'Toutes'}
            </button>
          ))}
        </div>
      </div>

      {/* ── Bandeau timer actif (si en cours) ── */}
      {active && (() => {
        const t = tasks.find(x => x.id === active.taskId)
        if (!t) return null
        const live = (t.elapsed_seconds ?? 0) + liveExtra
        return (
          <div className="bg-gradient-to-r from-amber-500 to-orange-500 text-white rounded-xl p-4 flex items-center gap-3 shadow-md">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0 animate-pulse">
              <Timer className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] uppercase tracking-widest font-bold opacity-80">Timer en cours</p>
              <p className="text-sm font-bold truncate">{t.title}</p>
              {t.project_name && <p className="text-[11px] opacity-90">📁 {t.project_name}</p>}
            </div>
            <div className="text-right">
              <p className="text-2xl font-mono font-extrabold tabular-nums">{formatHMS(live)}</p>
              <p className="text-[10px] opacity-80">temps cumulé</p>
            </div>
            <Button size="sm" variant="secondary" onClick={() => pauseTimer(t)}>
              <Pause className="w-3.5 h-3.5" /> Pause
            </Button>
          </div>
        )
      })()}

      {/* ── KPI temps quotidien ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <KpiCard icon={Clock} label="Temps total cumulé" value={formatHMS(totalWithLive)} color="blue" />
        <KpiCard icon={CheckSquare} label="Tâches terminées" value={String(tasks.filter(t => t.status === 'done').length)} color="emerald" />
        <KpiCard icon={Sparkles} label="En validation" value={String(tasks.filter(t => t.status === 'validation').length)} color="violet" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-10 text-center">
          <Inbox className="w-10 h-10 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {filter === 'open' ? 'Aucune tâche en cours.' : filter === 'done' ? 'Aucune tâche terminée.' : 'Aucune tâche.'}
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map((g) => (
            <div key={g.name}>
              <div className="flex items-center gap-2 mb-2 px-1">
                <Briefcase className="w-4 h-4 text-blue-500" />
                {g.projectId ? (
                  <Link
                    to={`/my-space/projets/${g.projectId}`}
                    className="text-sm font-bold text-slate-700 dark:text-slate-200 hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors flex items-center gap-1"
                    title="Cliquer pour voir les infos, identifiants et chat du projet"
                  >
                    {g.name}
                    <span className="text-[10px] text-blue-500 opacity-60">↗</span>
                  </Link>
                ) : (
                  <h2 className="text-sm font-bold text-slate-700 dark:text-slate-200">{g.name}</h2>
                )}
                <span className="text-xs text-slate-400">· {g.tasks.length} tâche{g.tasks.length > 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-2">
                {g.tasks.map((t, i) => {
                  const p = PRIORITY_META[t.priority] ?? PRIORITY_META.normal
                  const due = dueLabel(t.due_date)
                  const isDone = t.status === 'done'
                  const isInProgress = t.status === 'in_progress'
                  const isValidation = t.status === 'validation'
                  const isRunning = active?.taskId === t.id
                  const taskElapsed = (t.elapsed_seconds ?? 0) + (isRunning ? liveExtra : 0)
                  return (
                    <motion.div
                      key={t.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.02 }}
                      className={cn(
                        'bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-start gap-3 group hover:shadow-sm transition-shadow',
                        isDone && 'opacity-60',
                        isValidation && 'border-violet-300 dark:border-violet-800/60 bg-violet-50/30 dark:bg-violet-950/10',
                      )}
                    >
                      <button
                        onClick={() => update.mutate({ id: t.id, status: isDone ? 'todo' : 'done' })}
                        className="mt-0.5 flex-shrink-0"
                        title={isDone ? 'Rouvrir la tâche' : 'Marquer comme fait'}
                      >
                        {isDone ? (
                          <CheckSquare className="w-5 h-5 text-emerald-600" />
                        ) : isInProgress ? (
                          <Circle className="w-5 h-5 text-blue-600 fill-blue-100 dark:fill-blue-900/40" />
                        ) : (
                          <Square className="w-5 h-5 text-slate-300 dark:text-slate-600 group-hover:text-blue-500" />
                        )}
                      </button>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          {t.category && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                              {t.category}
                            </span>
                          )}
                          {t.is_request && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center gap-1">
                              <Sparkles className="w-2.5 h-2.5" /> Demande client
                            </span>
                          )}
                          <span className={cn('text-[10px] font-bold px-1.5 py-0.5 rounded', p.color)}>
                            <span className="inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle" style={{ backgroundColor: 'currentColor', opacity: .5 }} />
                            {p.label}
                          </span>
                          {due.tone !== 'none' && (
                            <span className={cn(
                              'text-[10px] font-semibold px-1.5 py-0.5 rounded flex items-center gap-1',
                              due.tone === 'overdue' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300' :
                              due.tone === 'soon'    ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' :
                                                        'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                            )}>
                              {due.tone === 'overdue' ? <AlertTriangle className="w-2.5 h-2.5" /> : <Calendar className="w-2.5 h-2.5" />}
                              {due.text}
                            </span>
                          )}
                          {isValidation && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-violet-200 text-violet-800 dark:bg-violet-800/60 dark:text-violet-200">
                              ⚑ En validation
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => setOpenTaskId(t.id)}
                          className={cn(
                            'mt-1.5 text-sm font-medium text-slate-900 dark:text-slate-100 text-left hover:text-blue-600 dark:hover:text-blue-400 hover:underline transition-colors',
                            isDone && 'line-through',
                          )}
                          title="Cliquer pour voir les détails et commentaires"
                        >
                          {t.title}
                        </button>
                        {taskElapsed > 0 && (
                          <p className={cn('mt-1 text-[11px] font-mono', isRunning ? 'text-amber-600 dark:text-amber-400 font-bold' : 'text-slate-500')}>
                            ⏱ {formatHMS(taskElapsed)}{isRunning && ' · en cours…'}
                          </p>
                        )}
                      </div>

                      {!isDone && !isValidation && (
                        <div className="flex gap-1.5">
                          {!isRunning ? (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => startTimer(t)}
                              className={cn('text-xs h-8', (t.elapsed_seconds ?? 0) > 0 && 'border-emerald-300')}
                              title={(t.elapsed_seconds ?? 0) > 0 ? 'Continuer le chrono' : 'Démarrer le chrono'}
                            >
                              <Play className="w-3 h-3 text-emerald-600" /> {(t.elapsed_seconds ?? 0) > 0 ? 'Continuer' : 'Commencer'}
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => pauseTimer(t)}
                              className="text-xs h-8 border-amber-300 bg-amber-50 dark:bg-amber-950/30"
                              title="Pause"
                            >
                              <Pause className="w-3 h-3 text-amber-600" /> Pause
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => finishTimer(t)}
                            className="text-xs h-8 bg-violet-600 hover:bg-violet-700 text-white"
                            title="Terminer → envoyer au manager"
                          >
                            <SquareIcon className="w-3 h-3" /> Terminer
                          </Button>
                        </div>
                      )}

                      {isValidation && (
                        <div className="text-[11px] text-violet-700 dark:text-violet-400 italic flex items-center gap-1">
                          <Check className="w-3 h-3" /> En attente de validation du manager
                        </div>
                      )}
                    </motion.div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Task detail dialog (cliquer sur le titre d'une tâche) */}
      {openTaskId && (() => {
        const t = tasks.find(x => x.id === openTaskId)
        if (!t) return null
        const memberName = member ? `${member.first_name ?? ''} ${member.last_name ?? ''}`.trim() : 'Membre'
        return (
          <TaskDetailDialog
            open={!!openTaskId}
            onClose={() => setOpenTaskId(null)}
            task={t}
            currentUserName={memberName || 'Membre'}
            isAdmin={false}
            readOnlyMeta
            onSave={async (patch) => {
              if (patch.description !== undefined) {
                await mySpaceApi.updateTaskDescription(t.id, patch.description)
                qc.invalidateQueries({ queryKey: ['my-space', 'tasks'] })
              }
            }}
          />
        )
      })()}
    </div>
  )
}

/* ─── KPI card sous-composant ─────────────────────────────── */
function KpiCard({ icon: Icon, label, value, color }: {
  icon: React.ElementType
  label: string
  value: string
  color: 'blue' | 'emerald' | 'violet'
}) {
  const bg = { blue: 'bg-blue-50 dark:bg-blue-900/20', emerald: 'bg-emerald-50 dark:bg-emerald-900/20', violet: 'bg-violet-50 dark:bg-violet-900/20' }[color]
  const text = { blue: 'text-blue-600 dark:text-blue-400', emerald: 'text-emerald-600 dark:text-emerald-400', violet: 'text-violet-600 dark:text-violet-400' }[color]
  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 flex items-center gap-3">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', bg)}>
        <Icon className={cn('w-5 h-5', text)} />
      </div>
      <div className="min-w-0">
        <p className="text-base font-extrabold text-slate-900 dark:text-slate-100 truncate">{value}</p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  )
}
