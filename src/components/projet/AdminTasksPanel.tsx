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
  Briefcase, Inbox, CircleDot, Plus, X, Loader2, Archive, RotateCcw, LayoutGrid, Pencil,
} from 'lucide-react'
import {
  useTeamMemberTasks, useCreateTeamMemberTask, useUpdateTeamMemberTask,
  useArchivedTasks, type TaskPriority, type TeamMemberTask,
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

/* L'axe « important » de chaque case, traduit en priorité : une tâche
   écrite dans PLANIFIER doit se lire comme importante dans la vue Liste
   aussi, sinon les deux écrans racontent des choses différentes. */
const PRIORITE_PAR_QUADRANT: Record<Quadrant, TaskPriority> = {
  do: 'urgent', plan: 'high', delegate: 'normal', eliminate: 'low',
}

/** Les champs d'intendance d'une tâche : projet, priorité, échéance,
 *  heure, rappels. Partagés par l'ajout rapide et l'édition en place —
 *  deux formulaires séparés auraient divergé au premier ajout de champ. */
interface ChampsTacheValue {
  project_id:       string
  priority:         TaskPriority
  due_date:         string
  due_time:         string
  reminder_offsets: number[] | null
}

function ChampsTache({ value, onChange, projets, defaults, defaultsReady, children }: {
  value:          ChampsTacheValue
  onChange:       (patch: Partial<ChampsTacheValue>) => void
  projets:        { id: string; nom: string }[]
  defaults:       number[]
  defaultsReady:  boolean
  children?:      React.ReactNode
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Select value={value.project_id} onValueChange={v => onChange({ project_id: v })}>
        <SelectTrigger className="h-7 text-[11px] w-auto min-w-[10rem]"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value={NO_PROJECT}>Sans projet</SelectItem>
          {projets.map(p => <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>)}
        </SelectContent>
      </Select>

      <Select value={value.priority} onValueChange={v => onChange({ priority: v as TaskPriority })}>
        <SelectTrigger className="h-7 text-[11px] w-auto min-w-[6.5rem]"><SelectValue /></SelectTrigger>
        <SelectContent>
          {PRIORITES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
        </SelectContent>
      </Select>

      <Input
        type="date"
        value={value.due_date}
        onChange={e => onChange({ due_date: e.target.value })}
        className="h-7 text-[11px] w-auto"
      />

      {/* L'heure décide de la précision du rappel : « 5 minutes avant »
          n'a de sens que si l'échéance en a une. */}
      <Input
        type="time"
        value={value.due_time}
        onChange={e => onChange({ due_time: e.target.value })}
        className="h-7 text-[11px] w-auto"
        title="Heure d'échéance (facultative)"
      />

      <ReminderPicker
        compact
        value={value.reminder_offsets}
        defaults={defaults}
        defaultsReady={defaultsReady}
        onChange={next => onChange({ reminder_offsets: next })}
        className="!h-7 !text-[11px] !px-2"
      />

      {children}
    </div>
  )
}

export default function AdminTasksPanel({ basePath }: { basePath: string }) {
  const { userId, name: userName, email: userEmail } = useAuth()

  /* Fiche complète de la tâche : c'est là qu'on change l'échéance, la
     priorité, les rappels, et qu'on ajoute notes, sous-tâches et
     pièces jointes. On mémorise l'ID et non l'objet : la ligne doit
     rester à jour pendant que la fiche est ouverte. */
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)

  /* Deux colonnes plutôt que deux onglets : ce qui reste à faire à
     gauche, ce qui est fait à droite. L'archive était derrière un onglet,
     donc invisible tant qu'on n'allait pas la chercher — or voir ce qu'on
     a bouclé à côté de ce qu'il reste est précisément ce qui donne la
     mesure de la journée. Rien n'est perdu : rouvrir une tâche close
     reste possible depuis sa colonne. */
  const [view, setView] = useState<'liste' | 'matrice'>('liste')
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
  /* Un repli par colonne : partager l'état faisait que déplier les
     terminées dépliait aussi les tâches en cours, et inversement. */
  const [showAllActives, setShowAllActives] = useState(false)
  const [showAllTerm,    setShowAllTerm]    = useState(false)

  /* Édition en place : les mêmes champs que l'ajout rapide, sans quitter
     la liste. La fiche complète (clic sur le titre) reste pour le fond —
     mode opératoire, checklist, commentaires. */
  const [editingId, setEditingId] = useState<string | null>(null)
  const EDIT_VIDE = {
    title: '', due_date: '', priority: 'normal' as TaskPriority,
    project_id: NO_PROJECT, due_time: '', reminder_offsets: null as number[] | null,
  }
  const [editDraft, setEditDraft] = useState(EDIT_VIDE)
  /* L'état de la tâche au moment où l'on a ouvert le formulaire. Sert à
     n'envoyer QUE ce qu'on a réellement touché : un formulaire ouvert reste
     figé pendant que la tâche, elle, continue de bouger (rafraîchissement
     toutes les 10 s, modification depuis la fiche, autre appareil).
     Renvoyer les six champs aurait ramené les valeurs d'il y a deux minutes
     par-dessus les nouvelles — corriger une faute de frappe dans un titre
     aurait effacé une échéance changée entre-temps. */
  const [editBase, setEditBase] = useState(EDIT_VIDE)
  const editTitleRef = useRef<HTMLInputElement>(null)

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

  /* Changer de vue ferme l'édition en cours : le formulaire, démonté,
     gardait sinon son brouillon et se rouvrait tel quel au retour — avec
     des valeurs devenues fausses entre-temps. */
  useEffect(() => { setEditingId(null) }, [view])

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
        if (ad !== bd) return ad - bd
        /* Deux tâches sans échéance : la plus récente d'abord. Sinon
           celles qu'on vient d'écrire depuis la matrice — jamais datées —
           tombaient en fond de liste, sous le plafond d'affichage. */
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      })
  }, [tasks, userId])

  /* Requête dédiée : filtrer le cache général aurait donné une archive
     tronquée et trompeuse (cf. useArchivedTasks). */
  const { data: archived = [] } = useArchivedTasks(userId)

  /* Ce que la colonne de droite affiche vraiment.

     L'archive vient d'une requête à part, qui ignore encore ce que le
     cache général sait déjà : après « Rouvrir », la tâche repartait à
     gauche tout en restant barrée à droite, avec deux jeux de boutons
     vivants — l'écran affirmait deux choses contraires sur la même
     ligne. On croise donc avec le cache général, qui porte l'écriture
     optimiste.

     Symétriquement, une tâche qu'on vient de cocher quitte la gauche
     avant que l'archive ne soit revenue du serveur : on la pose ici en
     attendant, sinon elle disparaîtrait des deux colonnes. Seuls les
     identifiants cochés dans ce panneau sont concernés — reprendre
     toutes les tâches closes du cache général ferait remonter des
     clôtures anciennes, hors de la fenêtre de l'archive. */
  const [vientDEtreClose, setVientDEtreClose] = useState<string[]>([])

  const terminees = useMemo(() => {
    const encoreActives = new Set(
      tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled').map(t => t.id))
    const dejaDansArchive = new Set(archived.map(t => t.id))
    const fraiches = vientDEtreClose
      .filter(id => !dejaDansArchive.has(id) && !encoreActives.has(id))
      .map(id => tasks.find(t => t.id === id))
      .filter(Boolean) as TeamMemberTask[]
    return [...fraiches, ...archived.filter(t => !encoreActives.has(t.id))]
  }, [tasks, archived, vientDEtreClose])

  const overdueCount = mine.filter(t => t.due_date && new Date(t.due_date + 'T23:59:59').getTime() < Date.now()).length

  /* Rouvrir : la tâche repart « à faire ». `completed_at` est remis à
     NULL par le trigger de la migration 086 quand le statut quitte
     « done » — inutile de le forcer d'ici, et surtout de risquer de le
     contredire. */
  const reopen = (task: any) => {
    update.mutate({ id: task.id, patch: { status: 'todo' } }, {
      /* Annoncer le succès avant la réponse laissait, en cas d'échec,
         un « Tâche rouverte » suivi d'une liste où elle ne figure pas. */
      onSuccess: () => toast.success('Tâche rouverte'),
    })
  }

  /* Déplacer une carte, c'est trancher : le quadrant devient un choix
     explicite et cesse d'être déduit.

     La priorité n'est délibérément PAS recalée sur la case d'arrivée.
     À la création (addInQuadrant) il n'existe rien à préserver, donc la
     case sert de valeur de départ ; ici la priorité a déjà été choisie,
     et la réécrire en silence effacerait une décision au motif qu'on
     range une carte. Classer et prioriser sont deux gestes distincts. */
  const moveQuadrant = (taskId: string, quadrant: Quadrant) => {
    update.mutate({ id: taskId, patch: { eisenhower: quadrant } })
  }

  /* Écrire une tâche DANS une case, c'est déjà l'arbitrer : le quadrant
     est posé explicitement, et la priorité suit l'axe « important » de
     la case pour que la vue Liste raconte la même chose.
     Aucune échéance n'est inventée : une date déclencherait des rappels
     que personne n'a demandés. */
  const addInQuadrant = (quadrant: Quadrant, title: string) => {
    /* mutateAsync : la case attend la confirmation avant de vider son
       champ, sinon un échec ferait disparaître le texte saisi. */
    return createTask.mutateAsync({
      title,
      assigned_user_id:      userId ?? null,
      team_member_id:        null,
      assigned_stagiaire_id: null,
      project_id: null,
      priority:   PRIORITE_PAR_QUADRANT[quadrant],
      status:     'todo',
      eisenhower: quadrant,
    } as any)
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
  /* ── Édition en place ─────────────────────────────────────────
     On recopie la tâche dans un brouillon : tant qu'on n'a pas validé,
     rien n'est écrit, et « Annuler » rend vraiment la tâche d'origine. */
  const startEdit = (task: TeamMemberTask) => {
    const snapshot = {
      title:            task.title,
      due_date:         task.due_date ? String(task.due_date).slice(0, 10) : '',
      priority:         (task.priority ?? 'normal') as TaskPriority,
      project_id:       task.project_id ?? NO_PROJECT,
      due_time:         task.due_time ? String(task.due_time).slice(0, 5) : '',
      reminder_offsets: task.reminder_offsets ?? null,
    }
    setEditingId(task.id)
    setEditDraft(snapshot)
    setEditBase(snapshot)
    requestAnimationFrame(() => editTitleRef.current?.focus())
  }

  const submitEdit = (e: React.FormEvent, task: TeamMemberTask) => {
    e.preventDefault()
    const title = editDraft.title.trim()
    /* Un titre vide effacerait le seul repère de la tâche dans la liste. */
    if (!title || update.isPending) return

    /* Patch minimal : uniquement les champs que l'on a effectivement
       changés depuis l'ouverture du formulaire. */
    const modifie = (cle: keyof typeof editDraft) =>
      JSON.stringify(editDraft[cle]) !== JSON.stringify(editBase[cle])

    const patch: Record<string, unknown> = {}
    if (title !== editBase.title.trim()) patch.title = title
    if (modifie('project_id')) patch.project_id = editDraft.project_id === NO_PROJECT ? null : editDraft.project_id
    if (modifie('priority'))   patch.priority   = editDraft.priority
    if (modifie('due_date'))   patch.due_date   = editDraft.due_date || null
    if (modifie('due_time'))   patch.due_time   = editDraft.due_time || null
    if (modifie('reminder_offsets')) patch.reminder_offsets = editDraft.reminder_offsets

    /* Rien touché : on referme sans écrire ni annoncer une modification
       qui n'a pas eu lieu. */
    if (Object.keys(patch).length === 0) { setEditingId(null); return }

    update.mutate({ id: task.id, patch }, {
      /* Fermé seulement après confirmation : refermer d'abord aurait
         montré l'ancienne ligne comme si la modification avait pris. */
      onSuccess: () => { setEditingId(null); toast.success('Tâche modifiée') },
    })
  }

  const markDone = (task: any) => {
    const cur = getActiveTimer()
    const isMine = cur !== null && cur.taskId === task.id
    const extra = isMine ? Math.floor((Date.now() - cur!.startedAt) / 1000) : 0
    if (isMine) setActiveTimer(null)
    update.mutate({ id: task.id, patch: { elapsed_seconds: (task.elapsed_seconds ?? 0) + extra, status: 'done' } })
    setVientDEtreClose(v => v.includes(task.id) ? v : [...v, task.id])
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
              onClick={() => setView('liste')}
              className={cn('px-2.5 h-7 text-[11px] font-medium transition-colors',
                view === 'liste'
                  ? 'bg-blue-600 text-white'
                  : 'bg-[var(--surface-input)] text-muted-foreground hover:text-foreground')}
            >
              Liste
            </button>
            <button
              type="button"
              onClick={() => setView('matrice')}
              className={cn('px-2.5 h-7 text-[11px] font-medium transition-colors inline-flex items-center gap-1 border-l border-border',
                view === 'matrice'
                  ? 'bg-violet-600 text-white'
                  : 'bg-[var(--surface-input)] text-muted-foreground hover:text-foreground')}
              title="Urgent / Important — décider quoi faire de chaque tâche"
            >
              <LayoutGrid className="w-3 h-3" /> Matrice
            </button>
          </div>

          {!adding && view === 'liste' && (
            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={openAdd}>
              <Plus className="w-3 h-3" /> Ajouter une tâche
            </Button>
          )}
        </div>
      </div>

      {/* Ajout rapide — sans projet par défaut. */}
      {adding && view === 'liste' && (
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

          <ChampsTache
            value={draft}
            onChange={patch => setDraft(d => ({ ...d, ...patch }))}
            projets={projets}
            defaults={prefs.default_offsets}
            defaultsReady={!prefsLoading}
          >
            <span className="text-[11px] text-muted-foreground">
              Entrée pour enregistrer et enchaîner.
            </span>
          </ChampsTache>
        </form>
      )}

      {view === 'matrice' ? (
        /* Rendue même sans aucune tâche : chaque case porte son bouton
           « Ajouter », et c'est précisément sur une matrice vide qu'il
           faut pouvoir écrire. Un écran « aucune tâche » sans bouton
           laissait sans issue. */
        <EisenhowerMatrix
          tasks={mine}
          projets={projets}
          onMove={moveQuadrant}
          onOpen={setOpenTaskId}
          onAdd={addInQuadrant}
        />
      ) : (
        /* Deux colonnes : à faire · terminées. Elles se replient l'une
           sous l'autre en dessous de « lg » — côte à côte sur un écran
           étroit, chaque ligne serait illisible. */
        <div className="grid gap-4 lg:grid-cols-2 items-start">

          {/* ══ À faire ══════════════════════════════════════════ */}
          <section className="min-w-0">
            <h3 className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <CircleDot className="w-3 h-3 text-blue-600" /> À faire
              <span className="font-mono normal-case tracking-normal">({mine.length})</span>
            </h3>

            {mine.length === 0 ? (
              <div className="py-6 text-center rounded-lg border border-dashed border-border">
                <Inbox className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground px-3">
                  Aucune tâche ne t'est assignée. Utilise <strong>Ajouter une tâche</strong> ci-dessus — le projet
                  est facultatif — ou ouvre un projet, onglet <strong>Tâches</strong>, et sélectionne{' '}
                  <strong>🛡️ Moi (Admin)</strong>.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {mine.slice(0, showAllActives ? mine.length : VISIBLE).map(t => {
                  const projet = projets.find(p => p.id === t.project_id)
                  const due = dueLabel(t.due_date)
                  const isRunning = active?.taskId === t.id
                  const liveExtra = isRunning && active ? Math.floor((Date.now() - active.startedAt) / 1000) : 0
                  const elapsed = (t.elapsed_seconds ?? 0) + liveExtra
                  const isInProgress = t.status === 'in_progress'
                  const isValidation = t.status === 'validation'

                  /* ── En cours de modification : la ligne cède la place
                     au formulaire, pour ne pas afficher deux fois la même
                     tâche avec deux valeurs différentes. */
                  if (editingId === t.id) {
                    return (
                      <form
                        key={t.id}
                        onSubmit={e => submitEdit(e, t)}
                        className="p-2.5 rounded-lg border border-blue-300 dark:border-blue-800 bg-card space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            ref={editTitleRef}
                            value={editDraft.title}
                            onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Escape') setEditingId(null) }}
                            placeholder="Titre de la tâche"
                            className="h-8 text-sm"
                          />
                          <Button type="submit" size="sm" className="h-8 text-[11px] flex-shrink-0"
                                  disabled={!editDraft.title.trim() || update.isPending}>
                            {update.isPending
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Check className="w-3 h-3" />}
                            Enregistrer
                          </Button>
                          <button type="button" onClick={() => setEditingId(null)}
                                  className="p-1.5 rounded text-muted-foreground hover:text-foreground flex-shrink-0"
                                  title="Annuler">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <ChampsTache
                          value={editDraft}
                          onChange={patch => setEditDraft(d => ({ ...d, ...patch }))}
                          projets={projets}
                          defaults={prefs.default_offsets}
                          defaultsReady={!prefsLoading}
                        />
                      </form>
                    )
                  }

                  return (
                    <div key={t.id} className={cn(
                      'flex items-center gap-2 p-2.5 rounded-lg border bg-card hover:border-blue-300 dark:hover:border-blue-700 transition-colors',
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
                          title="Ouvrir la fiche — mode opératoire, checklist, commentaires"
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
                          className="!h-7 !text-[11px] !px-2 hidden xl:inline-flex flex-shrink-0"
                        />
                      )}

                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          size="sm" variant="outline" className="h-7 w-7 p-0"
                          onClick={() => startEdit(t)}
                          title="Modifier la tâche — titre, projet, priorité, échéance, rappels"
                        >
                          <Pencil className="w-3 h-3 text-blue-600" />
                        </Button>

                        {!isValidation && (
                          !isRunning ? (
                            <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => startTimer(t)}>
                              <Play className="w-3 h-3 text-emerald-600" />
                              <span className="hidden xl:inline">{(t.elapsed_seconds ?? 0) > 0 ? 'Continuer' : 'Commencer'}</span>
                            </Button>
                          ) : (
                            <Button size="sm" variant="outline" className="h-7 text-[11px] border-amber-300 bg-amber-50 dark:bg-amber-950/30" onClick={() => pauseTimer(t)}>
                              <Pause className="w-3 h-3 text-amber-600" />
                              <span className="hidden xl:inline">Pause</span>
                            </Button>
                          )
                        )}
                        {isValidation && (
                          <span className="text-[11px] text-violet-700 dark:text-violet-400 italic flex items-center gap-1 px-2">
                            <Check className="w-3 h-3" /> En validation
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {mine.length > VISIBLE && (
                  /* Repliable, sinon les tâches ajoutées à la suite tombent hors
                     du plafond sans que rien ne permette d'aller les voir. */
                  <button
                    type="button"
                    onClick={() => setShowAllActives(v => !v)}
                    className="w-full text-[11px] text-muted-foreground italic text-center pt-1 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {showAllActives ? 'Réduire la liste' : `Voir les ${mine.length - VISIBLE} autres tâches`}
                  </button>
                )}
              </div>
            )}
          </section>

          {/* ══ Terminées ════════════════════════════════════════ */}
          <section className="min-w-0">
            <h3 className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
              <Archive className="w-3 h-3 text-emerald-600" /> Terminées
              <span className="font-mono normal-case tracking-normal">({terminees.length})</span>
            </h3>

            {terminees.length === 0 ? (
              <div className="py-6 text-center rounded-lg border border-dashed border-border">
                <Archive className="w-7 h-7 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground px-3">
                  Rien de terminé pour l'instant. Coche une tâche à gauche et elle apparaîtra ici.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {terminees.slice(0, showAllTerm ? terminees.length : VISIBLE).map(t => {
                  const projet = projets.find(p => p.id === t.project_id)
                  const clos = t.completed_at ?? t.updated_at
                  const annulee = t.status === 'cancelled'

                  /* Modifiable ici aussi : c'est souvent en relisant ce
                     qu'on a bouclé qu'on corrige un titre bâclé. */
                  if (editingId === t.id) {
                    return (
                      <form
                        key={t.id}
                        onSubmit={e => submitEdit(e, t)}
                        className="p-2.5 rounded-lg border border-blue-300 dark:border-blue-800 bg-card space-y-2"
                      >
                        <div className="flex items-center gap-2">
                          <Input
                            ref={editTitleRef}
                            value={editDraft.title}
                            onChange={e => setEditDraft(d => ({ ...d, title: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Escape') setEditingId(null) }}
                            placeholder="Titre de la tâche"
                            className="h-8 text-sm"
                          />
                          <Button type="submit" size="sm" className="h-8 text-[11px] flex-shrink-0"
                                  disabled={!editDraft.title.trim() || update.isPending}>
                            {update.isPending
                              ? <Loader2 className="w-3 h-3 animate-spin" />
                              : <Check className="w-3 h-3" />}
                            Enregistrer
                          </Button>
                          <button type="button" onClick={() => setEditingId(null)}
                                  className="p-1.5 rounded text-muted-foreground hover:text-foreground flex-shrink-0"
                                  title="Annuler">
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <ChampsTache
                          value={editDraft}
                          onChange={patch => setEditDraft(d => ({ ...d, ...patch }))}
                          projets={projets}
                          defaults={prefs.default_offsets}
                          defaultsReady={!prefsLoading}
                        />
                      </form>
                    )
                  }

                  return (
                    <div key={t.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-border bg-card/60">
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

                      <div className="flex gap-1 flex-shrink-0">
                        <Button
                          size="sm" variant="outline" className="h-7 w-7 p-0"
                          onClick={() => startEdit(t)}
                          title="Modifier la tâche"
                        >
                          <Pencil className="w-3 h-3 text-blue-600" />
                        </Button>
                        <Button
                          size="sm" variant="outline" className="h-7 text-[11px]"
                          onClick={() => reopen(t)}
                          title="Remettre dans les tâches en cours"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span className="hidden xl:inline">Rouvrir</span>
                        </Button>
                      </div>
                    </div>
                  )
                })}
                {terminees.length > VISIBLE && (
                  <button
                    type="button"
                    onClick={() => setShowAllTerm(v => !v)}
                    className="w-full text-[11px] text-muted-foreground italic text-center pt-1 hover:text-blue-600 dark:hover:text-blue-400"
                  >
                    {showAllTerm ? 'Réduire la liste' : `Voir les ${terminees.length - VISIBLE} autres tâches terminées`}
                  </button>
                )}
              </div>
            )}
          </section>
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
