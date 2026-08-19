/**
 * Panneau "Mes tâches admin" — sur la page /projets.
 * Liste toutes les tâches assignées à l'admin connecté (assigned_user_id),
 * à travers tous les projets, avec quick-actions (timer + done) et un
 * ajout rapide où le projet est facultatif.
 */
import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Shield, Play, Pause, Check, Square as SquareIcon, Calendar, AlertTriangle,
  Briefcase, Inbox, CircleDot, Plus, X, Loader2, Archive, RotateCcw, LayoutGrid,
} from 'lucide-react'
import {
  useTeamMemberTasks, useCreateTeamMemberTask, useUpdateTeamMemberTask,
  useArchivedTasks, type TaskPriority,
} from '@/hooks/useTeamMemberTasks'
import { useProjets } from '@/hooks/useProjets'
import { useTaskReminderPrefs } from '@/hooks/useTaskReminders'
import { ReminderPicker } from '@/components/taches/ReminderPicker'
import { EisenhowerMatrix } from '@/components/taches/EisenhowerMatrix'
import type { Quadrant } from '@/lib/eisenhower'
import { useAuth } from '@/hooks/useAuth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getActiveTimer, setActiveTimer, formatHMS } from '@/lib/taskTimer'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/** Date du jour en YYYY-MM-DD, fuseau local — toISOString() renverrait la
    veille en soirée depuis le Maroc. Même helper que ProjetDetail. */
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const PRIORITES: { value: TaskPriority; label: string }[] = [
  { value: 'low',    label: 'Basse'   },
  { value: 'normal', label: 'Normale' },
  { value: 'high',   label: 'Haute'   },
  { value: 'urgent', label: 'Urgente' },
]

/** Tâche sans projet : project_id est nullable et la FK est ON DELETE SET
    NULL, une tâche isolée est donc une ligne parfaitement valide. */
const NO_PROJECT = 'none'

/** Tâches montrées avant repli — le panneau n'est pas la liste complète. */
const VISIBLE = 8

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

/* La fiche complète est un écran à part entière (SOP, checklist, prompts,
   commentaires) et pèse son propre chunk. La charger à l'ouverture d'une
   tâche, et non au chargement de la page Projets, évite de faire payer ce
   poids à tous ceux qui ne l'ouvrent jamais. */
const TaskDetailDialog = lazy(() => import('@/components/projet/TaskDetailDialog'))

export default function AdminTasksPanel({ basePath }: { basePath: string }) {
  const { userId, name: userName, email: userEmail } = useAuth()

  /* Fiche complète de la tâche : c'est là qu'on change l'échéance, la
     priorité, les rappels, et qu'on ajoute notes, sous-tâches et
     pièces jointes. On mémorise l'ID et non l'objet : la ligne doit
     rester à jour pendant que la fiche est ouverte. */
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  /* Une tâche terminée ne disparaît plus : elle bascule dans l'archive,
     consultable et réversible. Sans elle, la seule trace de ce qui a été
     fait était l'absence de la ligne — impossible de vérifier, de rouvrir
     une clôture par erreur, ou de retrouver le temps passé. */
  const [view, setView] = useState<'actives' | 'matrice' | 'archive'>('actives')
  const { data: tasks = [] } = useTeamMemberTasks()
  const { data: projets = [] } = useProjets()
  const { prefs, isLoading: prefsLoading } = useTaskReminderPrefs()

  /* Le menu de rappels reste ouvert pour enchaîner plusieurs coches. Sans
     cet état local, chaque coche repartirait de `t.reminder_offsets`
     encore périmé (le refetch n'est pas revenu) et écraserait la
     précédente. La valeur locale prime jusqu'au retour du serveur. */
  const [draftOffsets, setDraftOffsets] = useState<Record<string, number[] | null>>({})

  /* Le hook partagé plutôt qu'une mutation locale : lui seul crée
     l'occurrence suivante d'une tâche récurrente passée à « Terminée ».
     Avec une mutation maison, terminer une tâche depuis ce panneau
     l'aurait fait disparaître sans jamais la reprogrammer — alors que
     le même geste depuis la fiche projet la reconduisait. */
  const updateTask = useUpdateTeamMemberTask()
  const update = {
    isPending: updateTask.isPending,
    mutate: (
      { id, patch }: { id: string; patch: any },
      opts?: { onSettled?: () => void; onSuccess?: () => void },
    ) => updateTask.mutate({ id, ...patch }, {
      onSettled: opts?.onSettled,
      onSuccess: opts?.onSuccess,
    }),
    mutateAsync: ({ id, patch }: { id: string; patch: any }) =>
      updateTask.mutateAsync({ id, ...patch }),
  }

  /* ── Ajout rapide ─────────────────────────────────────────────
     Le projet est facultatif : c'est tout l'intérêt du panneau, pouvoir
     noter une tâche sans passer par la fiche d'un projet. */
  const createTask = useCreateTeamMemberTask()
  const [adding, setAdding] = useState(false)
  const [draft, setDraft]   = useState({
    title: '', due_date: todayISO(), priority: 'normal' as TaskPriority, project_id: NO_PROJECT,
    /* Heure facultative : sans elle, la tâche est due à l'heure par
       défaut de la personne (réglages → Notifications). */
    due_time: '',
    /* null = suivre les rappels par défaut, cf. ReminderPicker. */
    reminder_offsets: null as number[] | null,
  })
  const titleRef = useRef<HTMLInputElement>(null)
  const [showAll, setShowAll] = useState(false)

  const openAdd = () => {
    setDraft(d => ({ ...d, title: '', due_date: todayISO() }))
    setAdding(true)
    /* Le champ n'existe pas encore au moment du clic. */
    requestAnimationFrame(() => titleRef.current?.focus())
  }

  const submitDraft = (e: React.FormEvent) => {
    e.preventDefault()
    const title = draft.title.trim()
    if (!title || createTask.isPending) return
    createTask.mutate({
      title,
      /* Se l'assigner : sans ça la tâche n'apparaîtrait pas dans ce panneau,
         qui filtre sur assigned_user_id. Les trois colonnes d'assignation
         sont exclusives entre elles. */
      assigned_user_id:      userId ?? null,
      team_member_id:        null,
      assigned_stagiaire_id: null,
      project_id: draft.project_id === NO_PROJECT ? null : draft.project_id,
      due_date:   draft.due_date || null,
      due_time:   draft.due_time || null,
      reminder_offsets: draft.reminder_offsets,
      priority:   draft.priority,
      status:     'todo',
    }, {
      onSuccess: () => {
        /* Le formulaire reste ouvert, projet/priorité/date conservés : on
           enchaîne les tâches d'une même série sans tout resaisir. */
        setDraft(d => ({ ...d, title: '' }))
        titleRef.current?.focus()
      },
    })
  }

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

  /* Requête dédiée : filtrer le cache général aurait donné une archive
     tronquée et trompeuse (cf. useArchivedTasks). */
  const { data: archived = [] } = useArchivedTasks(userId)

  const overdueCount = mine.filter(t => t.due_date && new Date(t.due_date + 'T23:59:59').getTime() < Date.now()).length

  /* Rouvrir : la tâche repart « à faire ». `completed_at` est remis à
     NULL par le trigger de la migration 086 quand le statut quitte
     « done » — inutile de le forcer d'ici, et surtout de risquer de le
     contredire. */
  const reopen = (task: any) => {
    update.mutate({ id: task.id, patch: { status: 'todo' } }, {
      /* Annoncer le succès avant la réponse laissait, en cas d'échec,
         un « Tâche rouverte » suivi d'une liste où elle ne figure pas. */
      onSuccess: () => {
        toast.success('Tâche rouverte')
        setView('actives')
      },
    })
  }

  /* Déplacer une carte dans la matrice, c'est trancher : le quadrant
     devient un choix explicite et cesse d'être déduit. */
  const moveQuadrant = (taskId: string, quadrant: Quadrant) => {
    update.mutate({ id: taskId, patch: { eisenhower: quadrant } })
  }

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

        <div className="flex items-center gap-1.5">
          {/* Bascule : ce qui reste à faire ⇄ ce qui est fait. L'archive
              n'apparaît que s'il y a quelque chose dedans, pour ne pas
              proposer un écran vide dès le premier jour. */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              type="button"
              onClick={() => { setView('actives'); setShowAll(false) }}
              className={cn('px-2.5 h-7 text-[11px] font-medium transition-colors',
                view === 'actives'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--surface-input)] text-muted-foreground hover:text-foreground')}
            >
              Liste
            </button>
            <button
              type="button"
              onClick={() => { setView('matrice'); setShowAll(false) }}
              className={cn('px-2.5 h-7 text-[11px] font-medium transition-colors inline-flex items-center gap-1 border-l border-border',
                view === 'matrice'
                  ? 'bg-violet-600 text-white'
                  : 'bg-[var(--surface-input)] text-muted-foreground hover:text-foreground')}
              title="Urgent / Important — décider quoi faire de chaque tâche"
            >
              <LayoutGrid className="w-3 h-3" /> Matrice
            </button>
            {(archived.length > 0 || view === 'archive') && (
              <button
                type="button"
                onClick={() => { setView('archive'); setShowAll(false) }}
                className={cn('px-2.5 h-7 text-[11px] font-medium transition-colors inline-flex items-center gap-1 border-l border-border',
                  view === 'archive'
                    ? 'bg-slate-700 text-white'
                    : 'bg-[var(--surface-input)] text-muted-foreground hover:text-foreground')}
              >
                <Archive className="w-3 h-3" /> Terminées {archived.length}
              </button>
            )}
          </div>

          {!adding && view === 'actives' && (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={openAdd}>
              <Plus className="w-3 h-3" /> Ajouter une tâche
            </Button>
          )}
        </div>
      </div>

      {/* Ajout rapide — sans projet par défaut. */}
      {adding && view === 'actives' && (
        <form onSubmit={submitDraft} className="mb-3 p-2.5 rounded-lg border border-blue-200 dark:border-blue-900/50 bg-card space-y-2">
          <div className="flex items-center gap-2">
            <Input
              ref={titleRef}
              value={draft.title}
              onChange={e => setDraft(d => ({ ...d, title: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Escape') setAdding(false) }}
              placeholder="Que faut-il faire ?"
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" className="h-8 text-[11px] flex-shrink-0"
              disabled={!draft.title.trim() || createTask.isPending}>
              {createTask.isPending
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <Plus className="w-3 h-3" />}
              Ajouter
            </Button>
            <button type="button" onClick={() => setAdding(false)}
              className="p-1.5 rounded text-muted-foreground hover:text-foreground flex-shrink-0" title="Fermer">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Select value={draft.project_id} onValueChange={v => setDraft(d => ({ ...d, project_id: v }))}>
              <SelectTrigger className="h-7 text-[11px] w-auto min-w-[10rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_PROJECT}>Sans projet</SelectItem>
                {projets.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
              </SelectContent>
            </Select>

            <Select value={draft.priority} onValueChange={v => setDraft(d => ({ ...d, priority: v as TaskPriority }))}>
              <SelectTrigger className="h-7 text-[11px] w-auto min-w-[6.5rem]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PRIORITES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
              </SelectContent>
            </Select>

            <Input
              type="date"
              value={draft.due_date}
              onChange={e => setDraft(d => ({ ...d, due_date: e.target.value }))}
              className="h-7 text-[11px] w-auto"
            />

            {/* L'heure décide de la précision du rappel : « 5 minutes
                avant » n'a de sens que si l'échéance en a une. */}
            <Input
              type="time"
              value={draft.due_time}
              onChange={e => setDraft(d => ({ ...d, due_time: e.target.value }))}
              className="h-7 text-[11px] w-auto"
              title="Heure d'échéance (facultative)"
            />

            <ReminderPicker
              compact
              value={draft.reminder_offsets}
              defaults={prefs.default_offsets}
              defaultsReady={!prefsLoading}
              onChange={next => setDraft(d => ({ ...d, reminder_offsets: next }))}
              className="!h-7 !text-[11px] !px-2"
            />

            <span className="text-[11px] text-muted-foreground">
              Entrée pour enregistrer et enchaîner.
            </span>
          </div>
        </form>
      )}

      {view === 'matrice' ? (
        mine.length === 0 ? (
          <div className="py-6 text-center">
            <Inbox className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground">Aucune tâche à arbitrer.</p>
          </div>
        ) : (
          <EisenhowerMatrix
            tasks={mine}
            projets={projets}
            onMove={moveQuadrant}
            onOpen={setOpenTaskId}
          />
        )
      ) : view === 'archive' ? (
        archived.length === 0 ? (
          <div className="py-6 text-center">
            <Archive className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-xs text-muted-foreground mb-2">Aucune tâche terminée pour l'instant.</p>
            <Button size="sm" variant="outline" className="h-7 text-[11px]"
                    onClick={() => { setView('actives'); setShowAll(false) }}>
              Revenir aux tâches en cours
            </Button>
          </div>
        ) : (
        <div className="space-y-1.5">
          {archived.slice(0, showAll ? archived.length : VISIBLE).map(t => {
            const projet = projets.find(p => p.id === t.project_id)
            const clos = t.completed_at ?? t.updated_at
            const annulee = t.status === 'cancelled'
            return (
              <div key={t.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-card/60">
                <span className={cn('w-4 h-4 shrink-0 flex items-center justify-center rounded',
                  annulee ? 'text-slate-400' : 'text-emerald-600')}>
                  {annulee ? <X className="w-3.5 h-3.5" /> : <Check className="w-4 h-4" />}
                </span>

                <div className="flex-1 min-w-0">
                  <button
                    type="button"
                    onClick={() => setOpenTaskId(t.id)}
                    className="text-sm font-medium text-muted-foreground line-through truncate block text-left w-full hover:text-foreground"
                    title="Ouvrir la fiche"
                  >
                    {t.title}
                  </button>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <Briefcase className="w-2.5 h-2.5" /> {projet ? projet.nom : 'Sans projet'}
                    </span>
                    <span>
                      {annulee ? 'Annulée' : 'Terminée'} le{' '}
                      {new Date(clos).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
                    </span>
                    {(t.elapsed_seconds ?? 0) > 0 && (
                      <span className="font-mono">⏱ {formatHMS(t.elapsed_seconds ?? 0)}</span>
                    )}
                  </div>
                </div>

                <Button
                  size="sm" variant="outline" className="h-7 text-[11px] flex-shrink-0"
                  onClick={() => reopen(t)}
                  title="Remettre dans les tâches en cours"
                >
                  <RotateCcw className="w-3 h-3" /> Rouvrir
                </Button>
              </div>
            )
          })}
          {archived.length > VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              className="w-full text-[11px] text-muted-foreground italic text-center pt-1 hover:text-blue-600 dark:hover:text-blue-400"
            >
              {showAll ? 'Réduire la liste' : `Voir les ${archived.length - VISIBLE} autres tâches terminées`}
            </button>
          )}
        </div>
        )
      ) : mine.length === 0 ? (
        <div className="py-6 text-center">
          <Inbox className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">
            Aucune tâche ne t'est assignée. Utilise <strong>Ajouter une tâche</strong> ci-dessus — le projet est
            facultatif — ou ouvre un projet, onglet <strong>Tâches</strong>, et sélectionne <strong>🛡️ Moi (Admin)</strong>.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {mine.slice(0, showAll ? mine.length : VISIBLE).map(t => {
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
                  <button
                    type="button"
                    onClick={() => setOpenTaskId(t.id)}
                    className="text-sm font-medium text-foreground truncate block text-left w-full hover:text-blue-600 dark:hover:text-blue-400 hover:underline"
                    title="Ouvrir la fiche — échéance, rappels, notes"
                  >
                    {t.title}
                  </button>
                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground flex-wrap">
                    {projet ? (
                      <Link to={`${basePath}/projets/${projet.id}`} className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 hover:underline truncate">
                        <Briefcase className="w-2.5 h-2.5" /> {projet.nom}
                      </Link>
                    ) : (
                      /* Tâche isolée : sans repère, elle se confondrait avec une
                         tâche dont le projet a simplement été supprimé. */
                      <span className="flex items-center gap-1 italic">
                        <Briefcase className="w-2.5 h-2.5" /> Sans projet
                      </span>
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
                    {t.due_time && (
                      <span className="tabular-nums">{t.due_time.slice(0, 5)}</span>
                    )}
                    {t.priority === 'urgent' && (
                      <span className="px-1.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300 font-bold">URGENT</span>
                    )}
                  </div>
                </div>

                {t.due_date && (
                  <ReminderPicker
                    compact
                    value={t.id in draftOffsets ? draftOffsets[t.id] : (t.reminder_offsets ?? null)}
                    defaults={prefs.default_offsets}
                    defaultsReady={!prefsLoading}
                    onChange={next => {
                      setDraftOffsets(d => ({ ...d, [t.id]: next }))
                      update.mutate({ id: t.id, patch: { reminder_offsets: next } }, {
                        /* Une fois le serveur revenu, la ligne redevient
                           la source de vérité — y compris en cas d'échec,
                           pour ne pas afficher un réglage jamais écrit. */
                        onSettled: () => setDraftOffsets(d => {
                          const rest = { ...d }
                          delete rest[t.id]
                          return rest
                        }),
                      })
                    }}
                    className="!h-7 !text-[11px] !px-2 hidden lg:inline-flex flex-shrink-0"
                  />
                )}

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
          {mine.length > VISIBLE && (
            /* Repliable, sinon les tâches ajoutées à la suite tombent hors
               du plafond sans que rien ne permette d'aller les voir. */
            <button
              type="button"
              onClick={() => setShowAll(v => !v)}
              className="w-full text-[11px] text-muted-foreground italic text-center pt-1 hover:text-blue-600 dark:hover:text-blue-400"
            >
              {showAll ? 'Réduire la liste' : `Voir les ${mine.length - VISIBLE} autres tâches`}
            </button>
          )}
        </div>
      )}

      {/* Fiche complète. La tâche est relue dans la liste à chaque rendu :
          ce que l'on enregistre depuis la fiche se reflète aussitôt
          derrière elle, sans copie figée à re-synchroniser. */}
      {(() => {
        const open = openTaskId ? tasks.find(t => t.id === openTaskId) : null
        if (!open) return null
        const projet = projets.find(p => p.id === open.project_id)
        return (
          <Suspense fallback={null}>
          <TaskDetailDialog
            open
            onClose={() => setOpenTaskId(null)}
            /* Ce panneau ne liste que MES tâches : afficher « Non assigné »
               dans la fiche serait faux. */
            task={{
              ...open,
              project_name: projet?.nom ?? null,
              team_member_name: userName ?? userEmail ?? 'Moi (Admin)',
            }}
            currentUserName={userName ?? userEmail ?? 'Admin'}
            isAdmin
            onSave={async (patch) => {
              await update.mutateAsync({ id: open.id, patch })
            }}
          />
          </Suspense>
        )
      })()}
    </div>
  )
}
