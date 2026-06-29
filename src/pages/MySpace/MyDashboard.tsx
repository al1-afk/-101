/**
 * /my-space — Dashboard tab refondé.
 * Widgets : Aujourd'hui · Temps tracké · Progression · Notifications · Mes SOPs.
 */
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CheckSquare, BookOpen, Clock, AlertTriangle, ChevronRight, Loader2,
  Calendar, Timer, Bell, TrendingUp, Briefcase, ArrowRight, Sparkles,
  Play, Pause, Square as SquareIcon, Check, Flame, Inbox,
} from 'lucide-react'
import { mySpaceApi } from '@/lib/api'
import { SOP_CATEGORY_BY_KEY } from '@/lib/sopCategories'
import { Button } from '@/components/ui/button'
import { formatHMS, getActiveTimer, setActiveTimer } from '@/lib/taskTimer'
import { readNotifications, subscribe, type Notification } from '@/lib/notificationStore'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

function timeAgo(iso?: string | null): string {
  if (!iso) return 'jamais'
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1)  return "à l'instant"
  if (m < 60) return `il y a ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `il y a ${h} h`
  const d = Math.floor(h / 24)
  if (d < 7)  return `il y a ${d} j`
  return new Date(iso).toLocaleDateString('fr-FR')
}

function startOfDay(d: Date): number {
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x.getTime()
}
function startOfWeek(d: Date): number {
  const x = new Date(d); const dow = x.getDay() || 7  // Mon=1 .. Sun=7
  x.setDate(x.getDate() - (dow - 1)); x.setHours(0, 0, 0, 0); return x.getTime()
}

export default function MyDashboard() {
  const qc = useQueryClient()

  /* Dashboard aggregates (profile, access list, ...) */
  const { data, isLoading } = useQuery({
    queryKey: ['my-space', 'dashboard'],
    queryFn:  () => mySpaceApi.dashboard(),
    staleTime: 60_000,
  })

  /* Full tasks list — for today/overdue/this-week computation */
  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ['my-space', 'tasks'],
    queryFn:  () => mySpaceApi.tasks(),
    staleTime: 30_000,
  })

  /* Mutations for quick task actions from the focus list */
  const updateStatus = useMutation({
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

  const startTimer = (task: any) => {
    const cur = getActiveTimer()
    if (cur !== null && cur.taskId !== task.id) {
      const prevId = cur.taskId
      const startedAt = cur.startedAt
      const existing = tasks.find(t => t.id === prevId)
      const extra = Math.floor((Date.now() - startedAt) / 1000)
      if (existing) saveElapsed.mutate({ id: prevId, elapsed_seconds: (existing.elapsed_seconds ?? 0) + extra })
    }
    setActiveTimer({ taskId: task.id, startedAt: Date.now() })
    if (task.status === 'todo') updateStatus.mutate({ id: task.id, status: 'in_progress' })
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
    const extra = isMine ? Math.floor((Date.now() - cur!.startedAt) / 1000) : 0
    if (isMine) setActiveTimer(null)
    saveElapsed.mutate({ id: task.id, elapsed_seconds: (task.elapsed_seconds ?? 0) + extra, status: 'validation' })
    setTick(t => t + 1)
    toast.success(`✓ Terminée — envoyée en validation au manager`)
  }

  /* Notifications store (localStorage) */
  const notifJson = useSyncExternalStore(
    subscribe,
    () => JSON.stringify(readNotifications('member')),
  )
  const notifications: Notification[] = JSON.parse(notifJson)
  const unreadCount = notifications.filter(n => !n.is_read).length

  /* Compute today/overdue/week stats from tasks */
  const widgets = useMemo(() => {
    const now = Date.now()
    const todayStart = startOfDay(new Date())
    const tomorrowStart = todayStart + 86_400_000
    const weekEnd = startOfWeek(new Date()) + 7 * 86_400_000

    const open = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')

    const isToday = (t: any) => {
      if (!t.due_date) return false
      const due = new Date(t.due_date + 'T23:59:59').getTime()
      return due >= todayStart && due < tomorrowStart
    }
    const isOverdue = (t: any) => {
      if (!t.due_date) return false
      const due = new Date(t.due_date + 'T23:59:59').getTime()
      return due < now
    }
    const isThisWeek = (t: any) => {
      if (!t.due_date) return false
      const due = new Date(t.due_date + 'T23:59:59').getTime()
      return due >= tomorrowStart && due < weekEnd
    }

    /* Time tracked aggregates */
    const totalAllTime = tasks.reduce((s, t) => s + (t.elapsed_seconds ?? 0), 0)
    const updatedToday = tasks.filter(t => {
      const ref = t.completed_at ?? t.updated_at
      return ref && new Date(ref).getTime() >= todayStart
    })
    const updatedThisWeek = tasks.filter(t => {
      const ref = t.completed_at ?? t.updated_at
      return ref && new Date(ref).getTime() >= startOfWeek(new Date())
    })
    /* Note : sans logs détaillés on attribue tout le temps cumulé aux tâches modifiées
       sur la période (approximation honnête sans timetracking ligne par ligne) */
    const timeToday = updatedToday.reduce((s, t) => s + (t.elapsed_seconds ?? 0), 0)
    const timeWeek  = updatedThisWeek.reduce((s, t) => s + (t.elapsed_seconds ?? 0), 0)
    /* Add live timer */
    const active = getActiveTimer()
    const liveExtra = active ? Math.floor((Date.now() - active.startedAt) / 1000) : 0

    /* Focus list — what the member should do NOW.
       Priorité : overdue → today → in_progress → cette semaine.
       Limité aux 6 premières pour rester scannable. */
    const PRIO_WEIGHT: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 }
    const focusList = open
      .map(t => {
        const overdue = isOverdue(t)
        const today = !overdue && isToday(t)
        const inProgress = t.status === 'in_progress'
        const validation = t.status === 'validation'
        let bucket: 'overdue' | 'today' | 'in_progress' | 'soon' | 'later' = 'later'
        if (overdue) bucket = 'overdue'
        else if (today) bucket = 'today'
        else if (inProgress) bucket = 'in_progress'
        else if (isThisWeek(t)) bucket = 'soon'
        return { ...t, _bucket: bucket, _validation: validation }
      })
      .filter(t => t._bucket !== 'later' || t._validation)
      .sort((a, b) => {
        const order = { overdue: 0, today: 1, in_progress: 2, soon: 3, later: 4 } as const
        const ab = order[a._bucket as keyof typeof order]
        const bb = order[b._bucket as keyof typeof order]
        if (ab !== bb) return ab - bb
        const pa = PRIO_WEIGHT[a.priority] ?? 9
        const pb = PRIO_WEIGHT[b.priority] ?? 9
        if (pa !== pb) return pa - pb
        const da = a.due_date ? new Date(a.due_date).getTime() : Infinity
        const db = b.due_date ? new Date(b.due_date).getTime() : Infinity
        return da - db
      })
      .slice(0, 6)

    return {
      todayCount:   open.filter(isToday).length,
      overdueCount: open.filter(isOverdue).length,
      weekCount:    open.filter(isThisWeek).length,
      totalAllTime: totalAllTime + liveExtra,
      timeToday:    timeToday + liveExtra,
      timeWeek:     timeWeek + liveExtra,
      focusList,
    }
  }, [tasks])

  if (isLoading || !data) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /></div>
  }

  const { profile, access, tasks: taskAgg } = data
  const taskDonePct = taskAgg.total > 0 ? Math.round((taskAgg.done / taskAgg.total) * 100) : 0

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="bg-gradient-to-br from-blue-600 to-violet-600 rounded-2xl p-5 md:p-6 text-white shadow-lg">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold">👋 Bonjour {profile?.first_name} !</h1>
            <p className="text-blue-100 text-sm mt-1">
              {profile?.job_title || 'Membre'} · {profile?.tenant_name ?? 'Next Gital'}
            </p>
          </div>
          <div className="text-xs text-blue-100 bg-white/15 px-3 py-1.5 rounded-lg">
            Dernière connexion : {timeAgo(profile?.last_login_at)}
          </div>
        </div>
      </div>

      {/* ── 📅 Aujourd'hui (top priorité) ── */}
      <div className="card-premium p-5 bg-gradient-to-br from-amber-50/40 to-orange-50/30 dark:from-amber-950/20 dark:to-orange-950/10 border-amber-200 dark:border-amber-900/40">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            📅 Aujourd'hui
          </h2>
          <Link to="/my-space/tasks" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
            Voir toutes les tâches <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <TodayPill
            value={widgets.todayCount}
            label={widgets.todayCount > 1 ? 'tâches à faire aujourd\'hui' : 'tâche à faire aujourd\'hui'}
            icon={Calendar}
            color="blue"
          />
          <TodayPill
            value={widgets.overdueCount}
            label={widgets.overdueCount > 1 ? 'tâches en retard' : 'tâche en retard'}
            icon={AlertTriangle}
            color={widgets.overdueCount > 0 ? 'red' : 'slate'}
            alert={widgets.overdueCount > 0}
          />
          <TodayPill
            value={widgets.weekCount}
            label="à terminer cette semaine"
            icon={Clock}
            color="violet"
          />
        </div>
      </div>

      {/* ── 🔥 À traiter maintenant — liste actionnable ── */}
      <div className="card-premium p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Flame className="w-4 h-4 text-orange-500" /> À traiter maintenant
            {widgets.focusList.length > 0 && (
              <span className="text-[11px] font-medium text-muted-foreground">({widgets.focusList.length})</span>
            )}
          </h2>
          {tasks.length > 0 && (
            <Link to="/my-space/tasks" className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
              Toutes les tâches <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </div>
        {widgets.focusList.length === 0 ? (
          <div className="py-8 text-center">
            <Inbox className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              {tasks.length === 0 ? 'Aucune tâche pour le moment.' : '🎉 Rien d\'urgent — tu es à jour !'}
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {widgets.focusList.map((t: any) => {
              const isRunning = active?.taskId === t.id
              const liveExtra = isRunning && active ? Math.floor((Date.now() - active.startedAt) / 1000) : 0
              const elapsed = (t.elapsed_seconds ?? 0) + liveExtra
              return (
                <FocusRow
                  key={t.id}
                  task={t}
                  isRunning={isRunning}
                  elapsed={elapsed}
                  onStart={() => startTimer(t)}
                  onPause={() => pauseTimer(t)}
                  onFinish={() => finishTimer(t)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* ── ⏱ Temps + 📈 Progression + 🔔 Notif (3 colonnes) ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Temps */}
        <div className="card-premium p-5 space-y-3">
          <div className="flex items-center gap-2">
            <Timer className="w-4 h-4 text-amber-500" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Temps tracké</h3>
          </div>
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-muted-foreground">Aujourd'hui</span>
              <span className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400">{formatHMS(widgets.timeToday)}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-[11px] text-muted-foreground">Cette semaine</span>
              <span className="text-base font-semibold font-mono">{formatHMS(widgets.timeWeek)}</span>
            </div>
            <div className="flex items-baseline justify-between pt-2 border-t border-border">
              <span className="text-[11px] text-muted-foreground">Total cumulé</span>
              <span className="text-sm font-medium font-mono text-muted-foreground">{formatHMS(widgets.totalAllTime)}</span>
            </div>
          </div>
        </div>

        {/* Progression */}
        <div className="card-premium p-5 space-y-3">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-violet-500" />
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Progression</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-end justify-between">
              <span className="text-3xl font-extrabold text-foreground">{taskDonePct}%</span>
              <span className="text-xs text-muted-foreground mb-1">{taskAgg.done} / {taskAgg.total}</span>
            </div>
            <div className="h-2 rounded-full bg-muted overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${taskDonePct}%` }}
                transition={{ duration: 0.8 }}
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500"
              />
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">✓ {taskAgg.done} terminées</span>
              <span className="text-muted-foreground">{taskAgg.total - taskAgg.done} restantes</span>
            </div>
          </div>
        </div>

        {/* Notifications */}
        <div className="card-premium p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-blue-500" />
              <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Notifications</h3>
            </div>
            {unreadCount > 0 && (
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white bg-red-500 animate-pulse">
                {unreadCount}
              </span>
            )}
          </div>
          <div className="space-y-1.5 max-h-32 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-3">Aucune notification</p>
            ) : notifications.slice(0, 3).map(n => (
              <div key={n.id} className={cn('text-xs p-2 rounded-lg', !n.is_read && 'bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200/40 dark:border-blue-900/40')}>
                <div className="flex items-start gap-1.5">
                  <span className="flex-shrink-0">{n.icon ?? '🔔'}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground truncate">{n.title}</p>
                    <p className="text-[10px] text-muted-foreground">{timeAgo(n.created_at)}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Link to="/my-space/notifications" className="text-[11px] text-blue-600 dark:text-blue-400 hover:underline block text-center pt-1 border-t border-border">
            Voir toutes →
          </Link>
        </div>
      </div>

      {/* Quick links projects/tasks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link to="/my-space/projets" className="card-premium p-4 flex items-center gap-3 hover:border-blue-300 hover:shadow-md transition-all group">
          <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
            <Briefcase className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">Mes projets</p>
            <p className="text-xs text-muted-foreground">Voir tous tes projets assignés</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-500 transition-colors" />
        </Link>
        <Link to="/my-space/tasks" className="card-premium p-4 flex items-center gap-3 hover:border-blue-300 hover:shadow-md transition-all group">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
            <CheckSquare className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-foreground">Mes tâches</p>
            <p className="text-xs text-muted-foreground">{taskAgg.todo + taskAgg.in_progress} ouvertes</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-blue-500 transition-colors" />
        </Link>
      </div>

      {/* My SOPs */}
      {access.length > 0 && (
        <section>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3 flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-blue-600" /> Mes SOPs
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {access.map((a, i) => {
              const meta = SOP_CATEGORY_BY_KEY[a.category]
              return (
                <motion.div key={a.category} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                  <Link to={`/my-space/sops?category=${a.category}`}
                    className="group block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 hover:border-blue-300 dark:hover:border-blue-700 transition-all hover:shadow-md">
                    <div className="flex items-start gap-3">
                      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center text-lg', meta?.bg ?? 'bg-slate-100 dark:bg-slate-800')}>
                        {meta?.emoji ?? '📚'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate">{meta?.label ?? a.category}</div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                          {a.total_sops} procédure{a.total_sops > 1 ? 's' : ''} · {a.level === 'edit' ? 'Édition' : a.level === 'complete' ? 'Checklist' : 'Lecture'}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors" />
                    </div>
                  </Link>
                </motion.div>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}

/* ─── FocusRow — une tâche actionnable dans la liste "À traiter maintenant" ── */
function FocusRow({ task, isRunning, elapsed, onStart, onPause, onFinish }: {
  task: any
  isRunning: boolean
  elapsed: number
  onStart: () => void
  onPause: () => void
  onFinish: () => void
}) {
  const bucket = task._bucket as 'overdue' | 'today' | 'in_progress' | 'soon' | 'later'
  const validation = task._validation
  const isInProgress = task.status === 'in_progress'

  const bucketCfg = {
    overdue:     { dot: 'bg-red-500',     label: 'En retard',     cls: 'text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30',     icon: AlertTriangle },
    today:       { dot: 'bg-amber-500',   label: "Aujourd'hui",   cls: 'text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30', icon: Calendar },
    in_progress: { dot: 'bg-blue-500',    label: 'En cours',      cls: 'text-blue-700 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',   icon: Play },
    soon:        { dot: 'bg-violet-500',  label: 'Cette semaine', cls: 'text-violet-700 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30', icon: Clock },
    later:       { dot: 'bg-slate-400',   label: '',              cls: 'text-slate-600 bg-slate-100',                                        icon: Clock },
  }[bucket]
  const B = bucketCfg.icon

  return (
    <div className={cn(
      'flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:border-blue-300 dark:hover:border-blue-700 transition-colors',
      validation && 'border-violet-300 dark:border-violet-800/60 bg-violet-50/30 dark:bg-violet-950/10',
      bucket === 'overdue' && 'border-red-200 dark:border-red-900/40',
    )}>
      {/* Status / bucket pill */}
      <div className={cn('flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center', bucketCfg.cls)} title={bucketCfg.label}>
        <B className="w-3.5 h-3.5" />
      </div>

      {/* Title + project */}
      <div className="flex-1 min-w-0">
        <Link
          to={task.project_id ? `/my-space/projets/${task.project_id}` : '/my-space/tasks'}
          className="text-sm font-medium text-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate block"
        >
          {task.title}
        </Link>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground">
          {task.project_name && (
            <span className="flex items-center gap-1 truncate"><Briefcase className="w-2.5 h-2.5" /> {task.project_name}</span>
          )}
          {task.priority && task.priority !== 'normal' && (
            <span className={cn(
              'px-1.5 rounded font-bold',
              task.priority === 'urgent' && 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
              task.priority === 'high'   && 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
              task.priority === 'low'    && 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
            )}>
              {task.priority === 'urgent' ? 'URGENT' : task.priority === 'high' ? 'HAUTE' : 'BASSE'}
            </span>
          )}
          {elapsed > 0 && (
            <span className={cn('font-mono', isRunning && 'text-amber-600 dark:text-amber-400 font-bold')}>
              ⏱ {formatHMS(elapsed)}{isRunning && ' · en cours'}
            </span>
          )}
        </div>
      </div>

      {/* Quick actions */}
      {validation ? (
        <span className="text-[11px] text-violet-700 dark:text-violet-400 italic flex items-center gap-1 px-2">
          <Check className="w-3 h-3" /> En validation
        </span>
      ) : (
        <div className="flex gap-1 flex-shrink-0">
          {!isRunning ? (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onStart} title={isInProgress ? 'Continuer le chrono' : 'Démarrer le chrono'}>
              <Play className="w-3 h-3 text-emerald-600" />
              <span className="hidden sm:inline">{(task.elapsed_seconds ?? 0) > 0 ? 'Continuer' : 'Commencer'}</span>
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-8 text-xs border-amber-300 bg-amber-50 dark:bg-amber-950/30" onClick={onPause} title="Pause">
              <Pause className="w-3 h-3 text-amber-600" />
              <span className="hidden sm:inline">Pause</span>
            </Button>
          )}
          <Button size="sm" className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white" onClick={onFinish} title="Marquer comme terminé (envoie en validation)">
            <SquareIcon className="w-3 h-3" />
            <span className="hidden sm:inline">Terminer</span>
          </Button>
        </div>
      )}
    </div>
  )
}

/* ─── TodayPill — large stat avec contexte ──────────────────── */
function TodayPill({ value, label, icon: Icon, color, alert }: {
  value: number
  label: string
  icon: React.ElementType
  color: 'blue' | 'red' | 'violet' | 'slate'
  alert?: boolean
}) {
  const cfg = {
    blue:   'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
    red:    'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
    violet: 'text-violet-600 dark:text-violet-400 bg-violet-100 dark:bg-violet-900/30',
    slate:  'text-slate-500 bg-slate-100 dark:bg-slate-800',
  }[color]
  return (
    <div className={cn('p-3 rounded-xl bg-white dark:bg-slate-900 border', alert && 'border-red-300 dark:border-red-800/50 animate-pulse')}>
      <div className="flex items-center gap-2 mb-1">
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', cfg)}>
          <Icon className="w-3.5 h-3.5" />
        </div>
        <span className={cn('text-3xl font-extrabold', alert ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100')}>{value}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-tight">{label}</p>
    </div>
  )
}
