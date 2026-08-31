/**
 * TaskDetailDialog — Centre d'exécution de la tâche (v2 Premium).
 *
 * 7 onglets : Aperçu · SOP · Checklist · Prompts IA · Ressources · Commentaires · Historique.
 * Conserve 100 % des fonctionnalités précédentes (auto-save, édition Description via BlockEditor,
 * sous-tâches, liens, commentaires, images collées).
 * Inspiration : Notion / ClickUp / Linear / GitBook / Process Street.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import {
  CheckSquare, Square, Plus, Trash2, MessageSquare, Link2, Clock,
  Send, ExternalLink, Sparkles, Loader2,
  FileText, BookOpen, ListChecks, FolderOpen, History, Target,
  Copy, Check,
} from 'lucide-react'
import { parseTaskDesc, serializeTaskDesc, newId,
  type SubTask, type TaskComment, type TaskAttachment,
} from '@/lib/taskNotes'
import { formatHMS, getActiveTimer, setActiveTimer } from '@/lib/taskTimer'
import BlockEditor from '@/components/BlockEditor'
import TaskSopViewer from '@/components/projet/TaskSopViewer'
import { TaskScheduleEditor } from '@/components/taches/TaskScheduleEditor'
import type { SopBlock } from '@/hooks/useSops'
import type { Projet } from '@/hooks/useProjets'
import type { Client } from '@/hooks/useClients'
import { findSopForTask, autoGenerateSopBlocks } from '@/lib/sopContent'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { motion, AnimatePresence } from 'framer-motion'

type TaskLike = {
  id:              string
  title:           string
  description:     string | null
  status:          string
  priority:        string
  due_date:        string | null
  due_time?:       string | null
  reminder_offsets?: number[] | null
  category:        string | null
  elapsed_seconds: number | null
  is_request:      boolean | null
  request_price:   number | null
  project_id:      string | null
  project_name?:   string | null
  team_member_id?: string | null
  assigned_stagiaire_id?: string | null
  team_member_name?:string | null
  attachments?:    string[] | null
  created_at?:     string
  updated_at?:     string
  completed_at?:   string | null
}

interface Props {
  open:        boolean
  onClose:     () => void
  task:        TaskLike
  currentUserName: string
  isAdmin:     boolean
  onSave:      (patch: {
    description?: string
    title?:       string
    due_date?:    string | null
    due_time?:    string | null
    priority?:    string
    status?:      string
    reminder_offsets?: number[] | null
    elapsed_seconds?:  number
  }) => Promise<void> | void
  readOnlyMeta?: boolean
  /** Affiche la barre d'actions de statut (Commencer / Pause / Terminer).
      Réservé aux appelants dont `onSave` sait persister `status` — sinon les
      boutons seraient des no-op silencieux. */
  statusActions?: boolean
  projet?:     Projet
  client?:     Client
}

type TabKey = 'apercu' | 'sop' | 'checklist' | 'prompts' | 'ressources' | 'commentaires' | 'historique'

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  todo:        { bg: 'bg-slate-100 dark:bg-slate-800',    text: 'text-slate-700 dark:text-slate-300',   label: 'À faire'    },
  in_progress: { bg: 'bg-blue-100 dark:bg-blue-900/40',   text: 'text-blue-700 dark:text-blue-300',     label: 'En cours'   },
  validation:  { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300',   label: 'Validation' },
  done:        { bg: 'bg-emerald-100 dark:bg-emerald-900/40',text: 'text-emerald-700 dark:text-emerald-300', label: 'Terminé' },
  cancelled:   { bg: 'bg-rose-100 dark:bg-rose-900/40',   text: 'text-rose-700 dark:text-rose-300',     label: 'Annulé'     },
}
const PRIORITY_STYLES: Record<string, { color: string; label: string }> = {
  low:    { color: 'text-slate-500',  label: 'Basse' },
  normal: { color: 'text-blue-500',   label: 'Normale' },
  high:   { color: 'text-orange-500', label: 'Haute' },
  urgent: { color: 'text-rose-500',   label: 'Urgente' },
}

export default function TaskDetailDialog({
  open, onClose, task, currentUserName, isAdmin, onSave, readOnlyMeta = false,
  statusActions = false, projet, client,
}: Props) {
  const initial = useMemo(() => parseTaskDesc(task.description), [task.description])
  /* Sortir une tâche de l'état « en cours » depuis la fiche doit valoir
     exactement ce que vaut le bouton correspondant de la liste : arrêter le
     chronomètre et créditer le temps écoulé. Sans ça le minuteur restait
     actif sur une tâche qu'on venait de clore ou de mettre en pause, et son
     segment — potentiellement des jours — finissait imputé à la tâche
     suivante lancée (cf. pauseTimer/finishTimer dans MySpace/MyTasks.tsx).
     'validation' et 'todo' comptent donc autant que 'done' : le travail
     s'arrête dans les quatre cas. Le crédit n'a lieu que si le chronomètre
     porte bien SUR cette tâche — sinon on ne touche à rien. */
  const saveWithTimer: typeof onSave = async (patch) => {
    const arret = patch.status === 'done' || patch.status === 'cancelled'
               || patch.status === 'validation' || patch.status === 'todo'
    const actif = getActiveTimer()
    if (arret && actif?.taskId === task.id) {
      const ecoule = Math.floor((Date.now() - actif.startedAt) / 1000)
      setActiveTimer(null)
      return onSave({ ...patch, elapsed_seconds: (task.elapsed_seconds ?? 0) + ecoule })
    }
    return onSave(patch)
  }

  const [title,       setTitle]       = useState(task.title)
  const [blocks,      setBlocks]      = useState<SopBlock[]>(initial.blocks)
  const [subtasks,    setSubtasks]    = useState<SubTask[]>(initial.subtasks)
  const [comments,    setComments]    = useState<TaskComment[]>(initial.comments)
  const [attachments, setAttachments] = useState<TaskAttachment[]>(initial.attachments)
  const [newComment,  setNewComment]  = useState('')
  const [newSubtask,  setNewSubtask]  = useState('')
  const [saveState,   setSaveState]   = useState<'idle' | 'saving' | 'saved'>('idle')
  const [editMode,    setEditMode]    = useState(false)
  const [activeTab,   setActiveTab]   = useState<TabKey>('apercu')
  const lastSerialized = useRef<string>(task.description ?? '')

  useEffect(() => {
    if (!open) return
    setTitle(task.title)
    setBlocks(initial.blocks)
    setSubtasks(initial.subtasks)
    setComments(initial.comments)
    setAttachments(initial.attachments)
    setEditMode(false)
    setActiveTab('apercu')
    lastSerialized.current = task.description ?? ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task.id])

  /* Auto-save 700 ms */
  useEffect(() => {
    if (!open) return
    const next = serializeTaskDesc({ blocks, subtasks, comments, attachments })
    if (next === lastSerialized.current && title === task.title) return
    setSaveState('saving')
    const t = setTimeout(async () => {
      try {
        const patch: any = {}
        if (next !== (task.description ?? '')) patch.description = next
        if (title !== task.title && !readOnlyMeta) patch.title = title
        if (Object.keys(patch).length > 0) {
          await onSave(patch)
          lastSerialized.current = next
        }
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 1500)
      } catch (e: any) {
        toast.error(e?.message ?? 'Erreur de sauvegarde')
        setSaveState('idle')
      }
    }, 700)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blocks, subtasks, comments, attachments, title])

  /* ── Comments ─────────────────────────────────────────────── */
  const addComment = () => {
    const txt = newComment.trim()
    if (!txt) return
    setComments(p => [...p, { id: newId(), author: currentUserName, is_admin: isAdmin, text: txt, at: new Date().toISOString() }])
    setNewComment('')
  }
  const removeComment = (id: string) => setComments(p => p.filter(c => c.id !== id))

  /* ── Sub-tâches ───────────────────────────────────────────── */
  const addSubtask = () => {
    const t = newSubtask.trim()
    if (!t) return
    setSubtasks(p => [...p, { id: newId(), title: t, done: false }])
    setNewSubtask('')
  }
  const handleSubtaskPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const raw = e.clipboardData?.getData('text/plain') ?? ''
    if (!raw.includes('\n')) return
    e.preventDefault()
    const lines = raw.split(/\r?\n/)
      .map(l => l.replace(/^\s*(?:[-•*□☐☑]|\[[ xX]\]|\d+[.)])\s*/, '').trim())
      .filter(Boolean)
    if (lines.length === 0) return
    const newOnes: SubTask[] = lines.map(title => ({
      id: newId(), title,
      done: /^[✓✅]/.test(title) || title.startsWith('[x]') || title.startsWith('[X]'),
    }))
    setSubtasks(p => [...p, ...newOnes])
    setNewSubtask('')
    toast.success(`${newOnes.length} sous-tâche${newOnes.length > 1 ? 's' : ''} ajoutée${newOnes.length > 1 ? 's' : ''}`)
  }
  const toggleSubtask = (id: string) => setSubtasks(p => p.map(s => s.id === id ? { ...s, done: !s.done } : s))
  const removeSubtask = (id: string) => setSubtasks(p => p.filter(s => s.id !== id))

  /* ── Attachments ──────────────────────────────────────────── */
  const addAttachment = () => setAttachments(p => [...p, { id: newId(), label: '', url: '' }])
  const updateAttachment = (id: string, patch: Partial<TaskAttachment>) =>
    setAttachments(p => p.map(a => a.id === id ? { ...a, ...patch } : a))
  const removeAttachment = (id: string) => setAttachments(p => p.filter(a => a.id !== id))

  /* ── Métriques dérivées ───────────────────────────────────── */
  const meta = useMemo(() => {
    const totalEtapes  = blocks.filter(b => b.type === 'heading3').length
    const totalPrompts = blocks.filter(b => b.type === 'code').length
    const totalChecks  = blocks.filter(b => b.type === 'checklist').reduce((s, b) => s + (b.items?.length ?? 0), 0)
    const totalCallouts = blocks.filter(b => b.type === 'callout').length
    let minutes = 0
    for (const b of blocks) {
      if (b.type !== 'paragraph') continue
      const m = (b.text ?? '').match(/temps\s*:\s*(\d+)\s*(min|minutes|h|heure)/i)
      if (m) minutes += m[2].toLowerCase().startsWith('h') ? Number(m[1]) * 60 : Number(m[1])
    }
    const totalTime = minutes > 0
      ? (minutes >= 60 ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ''}` : `${minutes} min`)
      : null
    return { totalEtapes, totalPrompts, totalChecks, totalCallouts, totalTime }
  }, [blocks])

  const doneSubtasks = subtasks.filter(s => s.done).length
  const subPct = subtasks.length > 0 ? Math.round((doneSubtasks / subtasks.length) * 100) : 0

  const hasBlocks       = blocks.length > 0
  const hasSubtasks     = subtasks.length > 0
  const hasChecklists   = meta.totalChecks > 0
  const hasPrompts      = meta.totalPrompts > 0
  const hasResources    = attachments.length > 0 || (task.attachments?.length ?? 0) > 0

  /* ── Onglets définis dynamiquement (badge count) ─────────── */
  const TABS: Array<{ key: TabKey; icon: React.ElementType; label: string; badge?: number | boolean; disabled?: boolean }> = [
    { key: 'apercu',       icon: FileText,     label: 'Aperçu' },
    { key: 'sop',          icon: BookOpen,     label: 'SOP',          badge: hasBlocks },
    { key: 'checklist',    icon: ListChecks,   label: 'Checklist',    badge: hasChecklists || hasSubtasks ? (meta.totalChecks + subtasks.length) : undefined },
    { key: 'prompts',      icon: Sparkles,     label: 'Prompts IA',   badge: hasPrompts ? meta.totalPrompts : undefined },
    { key: 'ressources',   icon: FolderOpen,   label: 'Ressources',   badge: hasResources ? (attachments.length + (task.attachments?.length ?? 0)) : undefined },
    { key: 'commentaires', icon: MessageSquare,label: 'Commentaires', badge: comments.length > 0 ? comments.length : undefined },
    { key: 'historique',   icon: History,      label: 'Historique' },
  ]

  const statusCfg   = STATUS_STYLES[task.status]   ?? STATUS_STYLES.todo
  const priorityCfg = PRIORITY_STYLES[task.priority] ?? PRIORITY_STYLES.normal

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-4xl max-h-[92vh] p-0 overflow-hidden flex flex-col">
        {/* ═══════ HEADER ═══════ */}
        <DialogHeader className="px-6 pt-5 pb-3 border-b border-border bg-gradient-to-br from-blue-500/5 to-violet-500/5">
          <DialogTitle className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5">
                {task.category && <span className="px-1.5 py-0.5 rounded bg-background/80 font-bold uppercase tracking-wider">{task.category}</span>}
                {task.is_request && (
                  <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center gap-1 font-bold">
                    <Sparkles className="w-2.5 h-2.5" /> Demande
                  </span>
                )}
                {task.project_name && <span>📁 {task.project_name}</span>}
              </div>
              {readOnlyMeta ? (
                <p className="text-xl font-bold text-foreground">{title}</p>
              ) : (
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full text-xl font-bold bg-transparent border-0 border-b border-transparent hover:border-border focus:border-blue-400 focus:outline-none py-1 text-foreground"
                />
              )}
              {/* Métriques compactes du header */}
              <div className="flex items-center gap-2 flex-wrap mt-2">
                <span className={cn('px-2 py-0.5 rounded-md text-[11px] font-bold', statusCfg.bg, statusCfg.text)}>
                  {statusCfg.label}
                </span>
                <span className={cn('flex items-center gap-1 text-[11px] font-semibold', priorityCfg.color)}>
                  ● {priorityCfg.label}
                </span>
                {task.team_member_name && (
                  <span className="text-[11px] text-muted-foreground">👤 {task.team_member_name}</span>
                )}
                {task.due_date && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Clock className="w-3 h-3" /> {new Date(task.due_date).toLocaleDateString('fr-FR')}
                  </span>
                )}
                {(task.elapsed_seconds ?? 0) > 0 && (
                  <span className="text-[11px] font-mono text-muted-foreground">⏱ {formatHMS(task.elapsed_seconds ?? 0)}</span>
                )}
                {meta.totalTime && (
                  <span className="px-2 py-0.5 rounded-md bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 text-[11px] font-semibold">
                    ⏱ {meta.totalTime} estimés
                  </span>
                )}
                {hasBlocks && (
                  <span className="px-2 py-0.5 rounded-md bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-400 text-[11px] font-semibold">
                    📘 SOP · {meta.totalEtapes} étape{meta.totalEtapes > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            </div>
            <span className={cn(
              'text-[11px] font-medium whitespace-nowrap flex-shrink-0',
              saveState === 'saving' && 'text-amber-500',
              saveState === 'saved'  && 'text-emerald-600 dark:text-emerald-400',
              saveState === 'idle'   && 'text-muted-foreground',
            )}>
              {saveState === 'saving' && '💾 Enregistrement…'}
              {saveState === 'saved'  && '✓ Enregistré'}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* ═══════ TAB BAR ═══════ */}
        <div className="border-b border-border bg-background/60 backdrop-blur-sm sticky top-0 z-10">
          <div className="flex items-center gap-0.5 px-4 overflow-x-auto">
            {TABS.map(t => {
              const Icon = t.icon
              const isActive = activeTab === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setActiveTab(t.key)}
                  className={cn(
                    'flex items-center gap-2 px-3 py-2.5 text-[13px] font-semibold whitespace-nowrap transition-colors relative',
                    isActive
                      ? 'text-blue-600 dark:text-blue-400'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                  {typeof t.badge === 'number' && t.badge > 0 && (
                    <span className={cn(
                      'inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold',
                      isActive ? 'bg-blue-500 text-white' : 'bg-muted text-foreground',
                    )}>
                      {t.badge}
                    </span>
                  )}
                  {t.badge === true && (
                    <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-blue-500' : 'bg-muted-foreground/40')} />
                  )}
                  {isActive && (
                    <motion.div
                      layoutId="active-tab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500"
                      transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                    />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* ═══════ CONTENT ═══════ */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >

              {/* ─── APERÇU ─── */}
              {activeTab === 'apercu' && (
                <ApercuTab
                  task={task}
                  readOnlyMeta={readOnlyMeta}
                  statusActions={statusActions}
                  onSave={saveWithTimer}
                  statusCfg={statusCfg}
                  priorityCfg={priorityCfg}
                  meta={meta}
                  subtasksTotal={subtasks.length}
                  subtasksDone={doneSubtasks}
                  subPct={subPct}
                  commentsCount={comments.length}
                  resourcesCount={attachments.length + (task.attachments?.length ?? 0)}
                  hasBlocks={hasBlocks}
                  onGoTo={setActiveTab}
                />
              )}

              {/* ─── SOP ─── */}
              {activeTab === 'sop' && (
                <SopTab
                  blocks={blocks}
                  onChange={setBlocks}
                  taskId={task.id}
                  taskTitle={task.title}
                  taskCategory={task.category}
                  title={title}
                  editMode={editMode}
                  setEditMode={setEditMode}
                  projet={projet}
                  client={client}
                />
              )}

              {/* ─── CHECKLIST ─── */}
              {activeTab === 'checklist' && (
                <ChecklistTab
                  subtasks={subtasks}
                  newSubtask={newSubtask}
                  setNewSubtask={setNewSubtask}
                  addSubtask={addSubtask}
                  toggleSubtask={toggleSubtask}
                  removeSubtask={removeSubtask}
                  handleSubtaskPaste={handleSubtaskPaste}
                  setSubtasks={setSubtasks}
                  blocks={blocks}
                  taskId={task.id}
                />
              )}

              {/* ─── PROMPTS IA ─── */}
              {activeTab === 'prompts' && (
                <PromptsTab blocks={blocks} />
              )}

              {/* ─── RESSOURCES ─── */}
              {activeTab === 'ressources' && (
                <RessourcesTab
                  attachments={attachments}
                  addAttachment={addAttachment}
                  updateAttachment={updateAttachment}
                  removeAttachment={removeAttachment}
                  imageAttachments={task.attachments ?? []}
                  blocks={blocks}
                />
              )}

              {/* ─── COMMENTAIRES ─── */}
              {activeTab === 'commentaires' && (
                <CommentairesTab
                  comments={comments}
                  currentUserName={currentUserName}
                  newComment={newComment}
                  setNewComment={setNewComment}
                  addComment={addComment}
                  removeComment={removeComment}
                />
              )}

              {/* ─── HISTORIQUE ─── */}
              {activeTab === 'historique' && (
                <HistoriqueTab task={task} comments={comments} />
              )}

            </motion.div>
          </AnimatePresence>
        </div>

        {/* ═══════ FOOTER ═══════ */}
        <div className="flex items-center justify-between gap-3 px-6 py-3 border-t border-border bg-muted/20 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-4 flex-wrap">
            {meta.totalEtapes > 0 && <span>🎯 {meta.totalEtapes} étape{meta.totalEtapes > 1 ? 's' : ''}</span>}
            {(meta.totalChecks > 0 || subtasks.length > 0) && (
              <span>☑️ {meta.totalChecks + subtasks.length} check{meta.totalChecks + subtasks.length > 1 ? 's' : ''}</span>
            )}
            {meta.totalPrompts > 0 && <span>✨ {meta.totalPrompts} prompt{meta.totalPrompts > 1 ? 's' : ''}</span>}
            {meta.totalTime && <span>⏱ {meta.totalTime} estimés</span>}
          </div>
          <Button size="sm" onClick={onClose}>
            {saveState === 'saving' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   Barre d'actions de statut — mêmes transitions que la liste de tâches
   de l'espace membre : Commencer → in_progress, Pause → todo,
   Terminer → validation (c'est le manager qui clôt).

   `onSave` est ici `saveWithTimer` : Pause et Terminer arrêtent le
   chronomètre s'il tournait sur cette tâche et créditent le temps dans le
   même PATCH. Commencer ne DÉMARRE pas de chronomètre — le bouton homonyme
   de la liste projet ne le fait pas non plus ; seule la page « Mes tâches »
   est un poste de pointage, et démarrer ici sans son contexte obligerait à
   solder à l'aveugle un minuteur laissé sur une autre tâche.
═══════════════════════════════════════════════════════════════════ */
function StatusActions({ task, onSave }: {
  task:   TaskLike
  onSave: (patch: { status?: string }) => Promise<void> | void
}) {
  const [busy, setBusy] = useState(false)
  const go = async (status: string) => {
    if (busy) return
    setBusy(true)
    try { await onSave({ status }) }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Erreur') }
    finally { setBusy(false) }
  }

  const isDone       = task.status === 'done'
  const isValidation = task.status === 'validation'
  const isInProgress = task.status === 'in_progress'

  return (
    <div className="rounded-2xl border border-border bg-muted/30 p-3 flex items-center gap-2 flex-wrap">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold mr-1">
        Actions
      </span>
      {busy && <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-600" />}

      {isValidation ? (
        <span className="text-[12px] text-violet-700 dark:text-violet-400 italic flex items-center gap-1">
          <Check className="w-3.5 h-3.5" /> Terminée — en attente de validation du manager
        </span>
      ) : isDone ? (
        <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy}
          onClick={() => go('todo')}>
          <Square className="w-3.5 h-3.5" /> Rouvrir la tâche
        </Button>
      ) : (
        <>
          {!isInProgress ? (
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy}
              onClick={() => go('in_progress')}>
              ▶ Commencer
            </Button>
          ) : (
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={busy}
              onClick={() => go('todo')}>
              ⏸ Mettre en pause
            </Button>
          )}
          <Button size="sm" className="h-8 text-xs bg-violet-600 hover:bg-violet-700 text-white"
            disabled={busy} onClick={() => go('validation')}>
            <CheckSquare className="w-3.5 h-3.5" /> Terminer
          </Button>
        </>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TAB : APERÇU
═══════════════════════════════════════════════════════════════════ */
function ApercuTab({
  task, statusCfg, priorityCfg, meta, subtasksTotal, subtasksDone, subPct,
  commentsCount, resourcesCount, hasBlocks, onGoTo, readOnlyMeta, statusActions, onSave,
}: any) {
  const globalProgress = subtasksTotal > 0 ? subPct : 0
  return (
    <div className="space-y-4">
      {statusActions && <StatusActions task={task} onSave={onSave} />}
      {/* Progression globale */}
      <div className="rounded-2xl bg-gradient-to-br from-blue-500/5 via-violet-500/5 to-cyan-500/5 border border-blue-200/50 dark:border-blue-900/40 p-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Progression globale</span>
          <span className={cn(
            'text-2xl font-bold tabular-nums',
            globalProgress === 100 ? 'text-emerald-600' : 'text-blue-600',
          )}>
            {globalProgress}%
          </span>
        </div>
        <div className="h-2 rounded-full bg-background overflow-hidden">
          <motion.div
            initial={false}
            animate={{ width: `${globalProgress}%` }}
            transition={{ duration: 0.4 }}
            className={cn(
              'h-full rounded-full',
              globalProgress === 100
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                : 'bg-gradient-to-r from-blue-500 to-violet-500',
            )}
          />
        </div>
        {subtasksTotal > 0 && (
          <p className="text-[11px] text-muted-foreground mt-2">
            {subtasksDone} sous-tâche{subtasksDone > 1 ? 's' : ''} terminée{subtasksDone > 1 ? 's' : ''} sur {subtasksTotal}
          </p>
        )}
      </div>

      {/* Échéance : modifiable pour l'admin, en lecture seule côté membre
          (readOnlyMeta), qui n'a pas la main sur la planification. */}
      {!readOnlyMeta && (
        <TaskScheduleEditor
          /* Le planificateur de rappels ne traite que les tâches d'un
             compte de l'espace (server/lib/taskReminderScheduler.ts
             exclut team_member_id et assigned_stagiaire_id). Le dire ici
             plutôt que d'afficher « enregistré » sur un rappel qui ne
             partira jamais. */
          remindersEligible={!task.team_member_id && !task.assigned_stagiaire_id}
          dueDate={task.due_date ?? null}
          dueTime={task.due_time ?? null}
          priority={task.priority ?? 'normal'}
          status={task.status ?? 'todo'}
          reminderOffsets={task.reminder_offsets ?? null}
          onPatch={patch => onSave(patch)}
        />
      )}

      {/* Grille infos */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {readOnlyMeta && (
          <>
            <MetricCard icon={Target} label="Statut" value={statusCfg.label} accent={statusCfg.text} />
            <MetricCard icon={Sparkles} label="Priorité" value={priorityCfg.label} accent={priorityCfg.color} />
            <MetricCard
              icon={Clock} label="Échéance"
              value={task.due_date
                ? new Date(task.due_date).toLocaleDateString('fr-FR')
                  + (task.due_time ? ` à ${String(task.due_time).slice(0, 5)}` : '')
                : '—'}
            />
          </>
        )}
        <MetricCard icon={Clock} label="Temps passé" value={(task.elapsed_seconds ?? 0) > 0 ? formatHMS(task.elapsed_seconds ?? 0) : '—'} />
        <MetricCard icon={Clock} label="Temps estimé" value={meta.totalTime ?? '—'} />
        <MetricCard icon={Target} label="Responsable" value={task.team_member_name ?? 'Non assigné'} />
        <MetricCard icon={BookOpen} label="Étapes SOP" value={String(meta.totalEtapes || '—')} />
        <MetricCard icon={Sparkles} label="Prompts IA" value={String(meta.totalPrompts || '—')} />
      </div>

      {/* Raccourcis vers autres onglets */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {hasBlocks && (
          <ShortcutCard
            icon={BookOpen}
            label="Ouvrir le SOP"
            hint={`${meta.totalEtapes} étape${meta.totalEtapes > 1 ? 's' : ''} · ${meta.totalChecks} check${meta.totalChecks > 1 ? 's' : ''}`}
            color="blue"
            onClick={() => onGoTo('sop')}
          />
        )}
        {(subtasksTotal > 0 || meta.totalChecks > 0) && (
          <ShortcutCard
            icon={ListChecks}
            label="Checklist"
            hint={`${subtasksDone + 0} / ${subtasksTotal + meta.totalChecks} coché${subtasksTotal + meta.totalChecks > 1 ? 's' : ''}`}
            color="emerald"
            onClick={() => onGoTo('checklist')}
          />
        )}
        {meta.totalPrompts > 0 && (
          <ShortcutCard
            icon={Sparkles}
            label="Prompts IA"
            hint={`${meta.totalPrompts} prompt${meta.totalPrompts > 1 ? 's' : ''} disponible${meta.totalPrompts > 1 ? 's' : ''}`}
            color="violet"
            onClick={() => onGoTo('prompts')}
          />
        )}
        {resourcesCount > 0 && (
          <ShortcutCard
            icon={FolderOpen}
            label="Ressources"
            hint={`${resourcesCount} élément${resourcesCount > 1 ? 's' : ''}`}
            color="amber"
            onClick={() => onGoTo('ressources')}
          />
        )}
        <ShortcutCard
          icon={MessageSquare}
          label="Commentaires"
          hint={commentsCount > 0 ? `${commentsCount} message${commentsCount > 1 ? 's' : ''}` : 'Aucun encore'}
          color="slate"
          onClick={() => onGoTo('commentaires')}
        />
      </div>
    </div>
  )
}

function MetricCard({ icon: Icon, label, value, accent }: any) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
        <Icon className="w-3 h-3" /> {label}
      </div>
      <p className={cn('text-sm font-bold text-foreground truncate', accent)}>{value}</p>
    </div>
  )
}

const SHORTCUT_COLORS: Record<string, string> = {
  blue:    'hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/20',
  emerald: 'hover:border-emerald-400 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20',
  violet:  'hover:border-violet-400 hover:bg-violet-50/40 dark:hover:bg-violet-950/20',
  amber:   'hover:border-amber-400 hover:bg-amber-50/40 dark:hover:bg-amber-950/20',
  slate:   'hover:border-slate-400 hover:bg-slate-50/40 dark:hover:bg-slate-800/40',
}
function ShortcutCard({ icon: Icon, label, hint, color, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'flex items-start gap-3 p-3 rounded-lg border border-border bg-background text-left transition-colors',
        SHORTCUT_COLORS[color] ?? SHORTCUT_COLORS.slate,
      )}
    >
      <Icon className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground">{label}</p>
        <p className="text-[11px] text-muted-foreground truncate">{hint}</p>
      </div>
    </button>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TAB : SOP
═══════════════════════════════════════════════════════════════════ */
function SopTab({ blocks, onChange, taskId, taskTitle, taskCategory, title, editMode, setEditMode, projet, client }: any) {
  const preWritten = useMemo(() => findSopForTask(taskTitle), [taskTitle])

  const loadDefault = () => {
    const preset = findSopForTask(taskTitle)
    const finalBlocks = preset && preset.length > 0
      ? preset
      : autoGenerateSopBlocks(taskTitle, taskCategory ?? undefined)
    onChange(finalBlocks)
    toast.success(`SOP chargé — ${finalBlocks.length} blocks`)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          📘 Standard Operating Procedure
        </label>
        <div className="flex items-center gap-2">
          {blocks.length === 0 && (
            <button
              onClick={loadDefault}
              className="px-3 py-1 rounded-md text-[11px] font-semibold bg-blue-500 text-white hover:bg-blue-600 flex items-center gap-1"
            >
              ⚡ Charger le SOP par défaut
            </button>
          )}
          {editMode ? (
            <button
              onClick={() => setEditMode(false)}
              className="px-3 py-1 rounded-md text-[11px] font-semibold bg-emerald-600 text-white hover:bg-emerald-700 flex items-center gap-1"
            >
              ✓ Terminer
            </button>
          ) : (
            <button
              onClick={() => setEditMode(true)}
              className="px-3 py-1 rounded-md text-[11px] font-semibold border border-border bg-background hover:bg-muted flex items-center gap-1"
            >
              ✏ Modifier
            </button>
          )}
        </div>
      </div>

      {blocks.length === 0 && !editMode && (
        <div className="text-center py-12 border-2 border-dashed border-border rounded-xl bg-gradient-to-br from-blue-50/30 to-violet-50/30 dark:from-blue-950/10 dark:to-violet-950/10">
          <BookOpen className="w-10 h-10 text-blue-400 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">Aucun SOP encore chargé pour cette tâche.</p>
          {preWritten ? (
            <div className="space-y-2">
              <p className="text-[13px] font-semibold text-blue-600 dark:text-blue-400">
                ✨ Un SOP Premium existe pour cette tâche ({preWritten.length} blocs)
              </p>
              <button
                onClick={loadDefault}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-500 text-white text-sm font-semibold hover:bg-blue-600 shadow-lg shadow-blue-500/20"
              >
                ⚡ Charger le SOP maintenant
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-[12px] text-muted-foreground">
                Générer une trame SOP structurée à personnaliser
              </p>
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={loadDefault}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-500 text-white text-xs font-semibold hover:bg-blue-600"
                >
                  ⚡ Générer une trame
                </button>
                <button
                  onClick={() => setEditMode(true)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-border text-xs font-semibold hover:bg-muted"
                >
                  + Créer manuellement
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {blocks.length > 0 && !editMode && (
        <TaskSopViewer blocks={blocks} taskId={taskId} title={title} projet={projet} client={client} />
      )}

      {editMode && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground italic">
            💡 Tape « / » pour insérer un titre, une image, une vidéo, une liste, un tableau…
          </p>
          <BlockEditor value={blocks} onChange={onChange} placeholder="Commencez à décrire la tâche…" />
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TAB : CHECKLIST
═══════════════════════════════════════════════════════════════════ */
function ChecklistTab({
  subtasks, newSubtask, setNewSubtask, addSubtask, toggleSubtask, removeSubtask,
  handleSubtaskPaste, setSubtasks, blocks, taskId,
}: any) {
  /* Progression persistée du SOP (partagée avec TaskSopViewer) */
  const key = `sop-progress:${taskId}`
  const [sopChecked, setSopChecked] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(key) ?? '[]')) }
    catch { return new Set() }
  })
  useEffect(() => {
    try { localStorage.setItem(key, JSON.stringify(Array.from(sopChecked))) } catch {}
  }, [key, sopChecked])
  const toggleSop = (i: number) => setSopChecked(prev => {
    const next = new Set(prev)
    if (next.has(i)) next.delete(i)
    else next.add(i)
    return next
  })

  /* Extrait toutes les checklists du SOP en une liste plate */
  const sopChecklists = useMemo(() => {
    const flat: Array<{ globalIdx: number; text: string; section: string }> = []
    let section = 'SOP'
    let idx = 0
    for (const b of blocks) {
      if (b.type === 'heading' || b.type === 'heading2' || b.type === 'heading3') {
        section = b.text ?? section
        continue
      }
      if (b.type === 'checklist') {
        for (const item of (b.items ?? [])) {
          flat.push({ globalIdx: idx, text: item, section })
          idx++
        }
      }
    }
    return flat
  }, [blocks])

  const doneSub  = subtasks.filter((s: SubTask) => s.done).length
  const doneSop  = sopChecklists.filter(c => sopChecked.has(c.globalIdx)).length
  const totalAll = subtasks.length + sopChecklists.length
  const doneAll  = doneSub + doneSop
  const pct      = totalAll > 0 ? Math.round((doneAll / totalAll) * 100) : 0

  return (
    <div className="space-y-4">
      {/* Progression */}
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">Progression</span>
          <span className={cn(
            'text-lg font-bold tabular-nums',
            pct === 100 ? 'text-emerald-600' : 'text-blue-600',
          )}>
            {doneAll} / {totalAll} ({pct}%)
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <motion.div
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4 }}
            className={cn(
              'h-full rounded-full',
              pct === 100
                ? 'bg-gradient-to-r from-emerald-500 to-teal-500'
                : 'bg-gradient-to-r from-blue-500 to-violet-500',
            )}
          />
        </div>
      </div>

      {/* Sous-tâches perso */}
      <div className="rounded-xl border border-border bg-background p-4 space-y-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Sous-tâches personnelles ({doneSub}/{subtasks.length})
        </p>
        {subtasks.length === 0 && (
          <p className="text-[11px] text-muted-foreground italic">Aucune. Ajoute-en une ci-dessous.</p>
        )}
        {subtasks.map((s: SubTask) => (
          <div key={s.id} className="flex items-center gap-2 group">
            <button onClick={() => toggleSubtask(s.id)} className="flex-shrink-0">
              {s.done ? <CheckSquare className="w-4 h-4 text-emerald-500" /> : <Square className="w-4 h-4 text-muted-foreground" />}
            </button>
            <AutocorrectInput
              value={s.title}
              onChange={e => setSubtasks((p: SubTask[]) => p.map(x => x.id === s.id ? { ...x, title: e.target.value } : x))}
              className={cn('h-7 text-sm border-transparent hover:border-border focus:border-blue-400 shadow-none', s.done && 'line-through text-muted-foreground')}
            />
            <button onClick={() => removeSubtask(s.id)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
        <div className="flex items-center gap-2 pt-1">
          <AutocorrectInput
            value={newSubtask}
            onChange={e => setNewSubtask(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSubtask())}
            onPaste={handleSubtaskPaste}
            placeholder="+ Ajouter une sous-tâche (Cmd+V pour coller plusieurs lignes)"
            className="h-7 text-sm border-dashed"
          />
          <Button size="sm" variant="secondary" onClick={addSubtask} disabled={!newSubtask.trim()}>
            <Plus className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Checklists du SOP */}
      {sopChecklists.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-4 space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Checklists du SOP ({doneSop}/{sopChecklists.length})
          </p>
          {sopChecklists.map(c => {
            const done = sopChecked.has(c.globalIdx)
            return (
              <label
                key={c.globalIdx}
                className={cn(
                  'flex items-start gap-2.5 px-3 py-2 rounded-lg cursor-pointer transition-colors',
                  done ? 'bg-emerald-50/60 dark:bg-emerald-950/20' : 'hover:bg-muted/40',
                )}
              >
                <button
                  type="button"
                  onClick={() => toggleSop(c.globalIdx)}
                  className={cn(
                    'mt-0.5 flex-shrink-0 w-4 h-4 rounded border-2 flex items-center justify-center transition-all',
                    done ? 'bg-emerald-500 border-emerald-500' : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400',
                  )}
                >
                  {done && <Check className="w-3 h-3 text-white" />}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={cn('text-sm', done && 'line-through text-muted-foreground')}>{c.text}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{c.section}</p>
                </div>
              </label>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TAB : PROMPTS IA
═══════════════════════════════════════════════════════════════════ */
function PromptsTab({ blocks }: { blocks: SopBlock[] }) {
  /* Extrait les prompts : chaque code block précédé d'un h3/paragraph
     nommant un agent est étiqueté. Sinon "Prompt". */
  const prompts = useMemo(() => {
    const out: Array<{ agent: string; content: string; hint?: string }> = []
    let currentAgent: string | null = null
    let currentHint: string | null = null
    for (const b of blocks) {
      const raw = (b.text ?? '').toLowerCase()
      if (b.type === 'heading3' || (b.type === 'paragraph' && raw.length < 60)) {
        const detected =
          raw.includes('claude code') || raw.startsWith('claude') ? 'Claude Code' :
          raw.includes('chatgpt')     ? 'ChatGPT' :
          raw.includes('gemini')      ? 'Gemini'  :
          raw.includes('cursor')      ? 'Cursor'  : null
        if (detected) {
          currentAgent = detected
          currentHint = b.text ?? null
          continue
        }
        if (b.type === 'heading3') currentAgent = null
      }
      if (b.type === 'code') {
        out.push({
          agent: currentAgent ?? 'Prompt',
          content: b.text ?? '',
          hint: currentHint ?? undefined,
        })
        currentAgent = null
        currentHint = null
      }
    }
    return out
  }, [blocks])

  if (prompts.length === 0) {
    return (
      <div className="text-center py-12 border-2 border-dashed border-border rounded-xl">
        <Sparkles className="w-8 h-8 text-muted-foreground/50 mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">Aucun prompt IA dans cette tâche.</p>
        <p className="text-[11px] text-muted-foreground mt-1">Ajoute des blocs code dans le SOP pour créer des prompts.</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {prompts.map((p, i) => (
        <PromptFullCard key={i} agent={p.agent} content={p.content} />
      ))}
    </div>
  )
}

function PromptFullCard({ agent, content }: { agent: string; content: string }) {
  const [copied, setCopied] = useState(false)
  const label = agent.toLowerCase()
  const styles =
    label.includes('claude')  ? { bg: 'from-orange-500/10 to-amber-500/10',  text: 'text-orange-700 dark:text-orange-400',  border: 'border-orange-200 dark:border-orange-900/50', emoji: '🤖' } :
    label.includes('chatgpt') ? { bg: 'from-emerald-500/10 to-teal-500/10',  text: 'text-emerald-700 dark:text-emerald-400',border: 'border-emerald-200 dark:border-emerald-900/50', emoji: '💬' } :
    label.includes('gemini')  ? { bg: 'from-blue-500/10 to-cyan-500/10',     text: 'text-blue-700 dark:text-blue-400',      border: 'border-blue-200 dark:border-blue-900/50', emoji: '✨' } :
    label.includes('cursor')  ? { bg: 'from-violet-500/10 to-purple-500/10', text: 'text-violet-700 dark:text-violet-400',  border: 'border-violet-200 dark:border-violet-900/50', emoji: '⌨️' } :
                                { bg: 'from-slate-500/10 to-slate-400/10',   text: 'text-slate-700 dark:text-slate-400',    border: 'border-slate-200 dark:border-slate-800', emoji: '📝' }
  const copy = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true)
      toast.success('Prompt copié ✨')
      setTimeout(() => setCopied(false), 1500)
    })
  }
  return (
    <div className={cn('rounded-xl border overflow-hidden bg-gradient-to-br', styles.bg, styles.border)}>
      <div className={cn('flex items-center justify-between px-4 py-2 border-b', styles.border)}>
        <div className={cn('flex items-center gap-2 font-bold text-sm', styles.text)}>
          <span>{styles.emoji}</span> {agent}
        </div>
        <button
          type="button"
          onClick={copy}
          className={cn(
            'inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all',
            copied ? 'bg-emerald-500 text-white scale-105' : 'bg-background hover:bg-muted border border-border',
          )}
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copié' : 'Copier'}
        </button>
      </div>
      <pre className="p-4 text-[12.5px] font-mono whitespace-pre-wrap break-words text-foreground/90 max-h-[400px] overflow-y-auto">
        {content}
      </pre>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TAB : RESSOURCES
═══════════════════════════════════════════════════════════════════ */
function RessourcesTab({
  attachments, addAttachment, updateAttachment, removeAttachment, imageAttachments, blocks,
}: any) {
  /* Détecte les URLs mentionnées dans les paragraphes/listes du SOP */
  const linksFromSop = useMemo(() => {
    const urls: string[] = []
    const rx = /https?:\/\/[^\s)]+/g
    for (const b of blocks) {
      const src = b.text ?? (b.items?.join(' ') ?? '')
      const m = src.match(rx)
      if (m) urls.push(...m)
    }
    return Array.from(new Set(urls))
  }, [blocks])

  return (
    <div className="space-y-4">
      {/* Liens / pièces jointes éditables */}
      <div className="rounded-xl border border-border bg-background p-4 space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
            <Link2 className="w-3 h-3" /> Liens ({attachments.length})
          </label>
          <Button size="sm" variant="secondary" onClick={addAttachment}>
            <Plus className="w-3 h-3" /> Ajouter
          </Button>
        </div>
        {attachments.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic text-center py-2">Drive, Figma, Notion, mockup, doc…</p>
        ) : (
          <div className="space-y-1.5">
            {attachments.map((a: TaskAttachment) => (
              <div key={a.id} className="flex items-center gap-2 group">
                <AutocorrectInput
                  value={a.label}
                  onChange={e => updateAttachment(a.id, { label: e.target.value })}
                  placeholder="Libellé"
                  className="h-7 text-sm w-32 flex-shrink-0"
                />
                <Input
                  value={a.url}
                  onChange={e => updateAttachment(a.id, { url: e.target.value })}
                  placeholder="https://…"
                  className="h-7 text-xs font-mono flex-1"
                />
                {a.url && (
                  <a href={a.url} target="_blank" rel="noreferrer" className="p-1.5 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30 rounded">
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
                <button onClick={() => removeAttachment(a.id)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Images collées (Cmd+V à la création) */}
      {imageAttachments.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-4 space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            📎 Images collées ({imageAttachments.length})
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
            {imageAttachments.map((src: string, i: number) => (
              <a key={i} href={src} target="_blank" rel="noopener noreferrer"
                className="block rounded-lg border border-border overflow-hidden hover:border-blue-400 transition-colors">
                <img src={src} alt={`Image ${i + 1}`} className="w-full h-32 object-cover" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Liens détectés dans le SOP */}
      {linksFromSop.length > 0 && (
        <div className="rounded-xl border border-border bg-background p-4 space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            🔗 Liens détectés dans le SOP ({linksFromSop.length})
          </label>
          <ul className="space-y-1">
            {linksFromSop.map((url, i) => (
              <li key={i}>
                <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline break-all">
                  <ExternalLink className="w-3 h-3 flex-shrink-0" /> {url}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TAB : COMMENTAIRES (inchangé fonctionnellement)
═══════════════════════════════════════════════════════════════════ */
function CommentairesTab({
  comments, currentUserName, newComment, setNewComment, addComment, removeComment,
}: any) {
  return (
    <div className="space-y-3">
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
        <MessageSquare className="w-3 h-3" /> Commentaires ({comments.length})
      </label>
      <div className="space-y-2 max-h-[50vh] overflow-y-auto">
        {comments.length === 0 ? (
          <p className="text-[11px] text-muted-foreground/70 text-center py-6">Aucun commentaire</p>
        ) : (
          comments.slice().reverse().map((c: TaskComment) => (
            <div key={c.id} className={cn(
              'rounded-lg p-2.5 group',
              c.is_admin ? 'bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40'
                         : 'bg-muted/30 border border-border',
            )}>
              <div className="flex items-center gap-2 mb-1">
                <span className={cn('text-xs font-bold', c.is_admin ? 'text-blue-700 dark:text-blue-300' : 'text-foreground')}>
                  {c.author}
                </span>
                {c.is_admin && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500 text-white font-bold">MANAGER</span>}
                <span className="text-[10px] text-muted-foreground ml-auto">
                  {new Date(c.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
                {c.author === currentUserName && (
                  <button onClick={() => removeComment(c.id)} className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-500">
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
              <p className="text-sm whitespace-pre-wrap text-foreground/90">{c.text}</p>
            </div>
          ))
        )}
      </div>
      <div className="flex items-start gap-2 pt-2 border-t border-border">
        <AutocorrectTextarea
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); addComment() }
          }}
          placeholder={`Écris un commentaire en tant que ${currentUserName}…   (⌘+Entrée pour envoyer)`}
          rows={2}
          className="flex-1 rounded-lg border border-border bg-[var(--surface-input)] px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-blue-400 resize-none"
        />
        <Button size="sm" onClick={addComment} disabled={!newComment.trim()}>
          <Send className="w-3.5 h-3.5" />
        </Button>
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TAB : HISTORIQUE
═══════════════════════════════════════════════════════════════════ */
function HistoriqueTab({ task, comments }: { task: TaskLike; comments: TaskComment[] }) {
  const events = useMemo(() => {
    const arr: Array<{ at: string; who: string; label: string; icon: React.ElementType; color: string }> = []
    if (task.created_at)
      arr.push({ at: task.created_at, who: 'Système', label: 'Tâche créée', icon: Plus, color: 'text-blue-500' })
    for (const c of comments)
      arr.push({ at: c.at, who: c.author, label: `Commentaire : "${c.text.slice(0, 60)}${c.text.length > 60 ? '…' : ''}"`, icon: MessageSquare, color: 'text-violet-500' })
    if (task.updated_at && task.updated_at !== task.created_at)
      arr.push({ at: task.updated_at, who: 'Système', label: 'Dernière mise à jour', icon: History, color: 'text-slate-500' })
    if (task.completed_at)
      arr.push({ at: task.completed_at, who: 'Système', label: 'Tâche terminée', icon: Check, color: 'text-emerald-500' })
    return arr.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
  }, [task, comments])

  return (
    <div className="space-y-3">
      <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
        Historique de la tâche
      </label>
      {events.length === 0 ? (
        <p className="text-[11px] text-muted-foreground text-center py-8">Aucun événement enregistré.</p>
      ) : (
        <div className="relative space-y-3 pl-6 before:content-[''] before:absolute before:left-2 before:top-2 before:bottom-2 before:w-px before:bg-border">
          {events.map((e, i) => {
            const Icon = e.icon
            return (
              <div key={i} className="relative">
                <div className={cn('absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-background border-2 flex items-center justify-center', e.color.replace('text-', 'border-'))}>
                  <Icon className={cn('w-2.5 h-2.5', e.color)} />
                </div>
                <div className="rounded-lg border border-border bg-background p-2.5">
                  <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-0.5">
                    <span className="font-semibold text-foreground">{e.who}</span>
                    <span>·</span>
                    <span>{new Date(e.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                  </div>
                  <p className="text-sm text-foreground/90">{e.label}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
