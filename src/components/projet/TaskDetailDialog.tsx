/**
 * TaskDetailDialog — modal de détail d'une tâche, réutilisable admin + membre.
 * Affiche/édite : titre, description longue, sous-tâches, commentaires, pièces jointes,
 * timer, statut, priorité, échéance, assignation, catégorie.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  CheckSquare, Square, Plus, Trash2, MessageSquare, Link2, Clock,
  Send, ExternalLink, Sparkles, Loader2,
} from 'lucide-react'
import { parseTaskDesc, serializeTaskDesc, newId,
  type SubTask, type TaskComment, type TaskAttachment,
} from '@/lib/taskNotes'
import { formatHMS } from '@/lib/taskTimer'
import BlockEditor from '@/components/BlockEditor'
import { SopBlocksRenderer } from '@/components/sop/SopBlocksRenderer'
import type { SopBlock } from '@/hooks/useSops'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type TaskLike = {
  id:              string
  title:           string
  description:     string | null
  status:          string
  priority:        string
  due_date:        string | null
  category:        string | null
  elapsed_seconds: number | null
  is_request:      boolean | null
  request_price:   number | null
  project_id:      string | null
  project_name?:   string | null
  team_member_id?: string | null
  team_member_name?:string | null
}

interface Props {
  open:        boolean
  onClose:     () => void
  task:        TaskLike
  /** Auteur courant pour les commentaires */
  currentUserName: string
  isAdmin:     boolean
  /** Sauvegarde — appelé avec { description, title?, ... } selon ce qui change.
      Le parent décide quelle API appeler. */
  onSave:      (patch: { description?: string; title?: string }) => Promise<void> | void
  /** Optionnel : permettre éditer titre seulement si admin */
  readOnlyMeta?: boolean
}

export default function TaskDetailDialog({
  open, onClose, task, currentUserName, isAdmin, onSave, readOnlyMeta = false,
}: Props) {
  const initial = useMemo(() => parseTaskDesc(task.description), [task.description])
  const [title,       setTitle]       = useState(task.title)
  const [blocks,      setBlocks]      = useState<SopBlock[]>(initial.blocks)
  const [subtasks,    setSubtasks]    = useState<SubTask[]>(initial.subtasks)
  const [comments,    setComments]    = useState<TaskComment[]>(initial.comments)
  const [attachments, setAttachments] = useState<TaskAttachment[]>(initial.attachments)
  const [newComment,  setNewComment]  = useState('')
  const [newSubtask,  setNewSubtask]  = useState('')
  const [saveState,   setSaveState]   = useState<'idle' | 'saving' | 'saved'>('idle')
  const [editMode,    setEditMode]    = useState(initial.blocks.length === 0)   // pour membre : aperçu par défaut si du contenu
  const lastSerialized = useRef<string>(task.description ?? '')

  useEffect(() => {
    if (!open) return
    setTitle(task.title)
    setBlocks(initial.blocks)
    setSubtasks(initial.subtasks)
    setComments(initial.comments)
    setAttachments(initial.attachments)
    lastSerialized.current = task.description ?? ''
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task.id])

  /* Auto-save 700ms */
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

  const addComment = () => {
    const txt = newComment.trim()
    if (!txt) return
    setComments(p => [...p, {
      id: newId(), author: currentUserName, is_admin: isAdmin, text: txt, at: new Date().toISOString(),
    }])
    setNewComment('')
  }
  const removeComment = (id: string) => setComments(p => p.filter(c => c.id !== id))

  const addSubtask = () => {
    const t = newSubtask.trim()
    if (!t) return
    setSubtasks(p => [...p, { id: newId(), title: t, done: false }])
    setNewSubtask('')
  }
  const toggleSubtask = (id: string) => setSubtasks(p => p.map(s => s.id === id ? { ...s, done: !s.done } : s))
  const removeSubtask = (id: string) => setSubtasks(p => p.filter(s => s.id !== id))

  const addAttachment = () => setAttachments(p => [...p, { id: newId(), label: '', url: '' }])
  const updateAttachment = (id: string, patch: Partial<TaskAttachment>) =>
    setAttachments(p => p.map(a => a.id === id ? { ...a, ...patch } : a))
  const removeAttachment = (id: string) => setAttachments(p => p.filter(a => a.id !== id))

  const doneSubtasks = subtasks.filter(s => s.done).length
  const subPct = subtasks.length > 0 ? Math.round((doneSubtasks / subtasks.length) * 100) : 0

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1">
                {task.category && <span className="px-1.5 py-0.5 rounded bg-muted font-bold uppercase tracking-wider">{task.category}</span>}
                {task.is_request && (
                  <span className="px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 flex items-center gap-1 font-bold">
                    <Sparkles className="w-2.5 h-2.5" /> Demande
                  </span>
                )}
                {task.project_name && <span>📁 {task.project_name}</span>}
              </div>
              {readOnlyMeta ? (
                <p className="text-lg font-bold">{title}</p>
              ) : (
                <input
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  className="w-full text-lg font-bold bg-transparent border-0 border-b border-transparent hover:border-border focus:border-blue-400 focus:outline-none py-1"
                />
              )}
            </div>
            <span className={cn(
              'text-[11px] font-medium whitespace-nowrap',
              saveState === 'saving' && 'text-amber-500',
              saveState === 'saved'  && 'text-emerald-600 dark:text-emerald-400',
              saveState === 'idle'   && 'text-muted-foreground',
            )}>
              {saveState === 'saving' && '💾 Enregistrement…'}
              {saveState === 'saved'  && '✓ Enregistré'}
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Méta strip : statut · priorité · assignation · échéance · temps */}
        <div className="flex items-center gap-2 flex-wrap text-xs text-muted-foreground border-b border-border pb-3">
          <Pill label={`Statut : ${task.status}`} />
          <Pill label={`Priorité : ${task.priority}`} />
          {task.team_member_name && <Pill label={`Assigné à : ${task.team_member_name}`} />}
          {task.due_date && <Pill icon={Clock} label={`Échéance : ${new Date(task.due_date).toLocaleDateString('fr-FR')}`} />}
          {(task.elapsed_seconds ?? 0) > 0 && <Pill label={`⏱ ${formatHMS(task.elapsed_seconds ?? 0)}`} />}
          {task.is_request && task.request_price != null && <Pill label={`💰 ${task.request_price} MAD`} />}
        </div>

        {/* Description riche (BlockEditor — texte, titres, images, vidéos, code, listes, callouts…) */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
              Description
            </label>
            <div className="flex items-center gap-1">
              {blocks.length > 0 && (
                <div className="flex items-center gap-1 p-0.5 rounded-lg border border-border bg-muted/30">
                  <button onClick={() => setEditMode(false)}
                    className={cn('px-2 py-0.5 rounded text-[11px] font-semibold transition-colors',
                      !editMode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    👁 Aperçu
                  </button>
                  <button onClick={() => setEditMode(true)}
                    className={cn('px-2 py-0.5 rounded text-[11px] font-semibold transition-colors',
                      editMode ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
                    ✏ Édition
                  </button>
                </div>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground -mt-1">
            {editMode
              ? 'Tape « / » pour insérer titre, image, vidéo, liste, code, callout, tableau…'
              : 'Aperçu formaté de la description.'}
          </p>
          {!editMode && blocks.length > 0 ? (
            <div className="rounded-lg border border-border bg-background p-4">
              <SopBlocksRenderer blocks={blocks} />
            </div>
          ) : (
            <BlockEditor
              value={blocks}
              onChange={setBlocks}
              placeholder="Cliquer pour commencer à décrire la tâche — tape « / » pour insérer une image, un titre, une liste…"
            />
          )}
        </div>

        {/* Sous-tâches */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
              <CheckSquare className="w-3 h-3" /> Sous-tâches ({doneSubtasks}/{subtasks.length})
            </label>
            {subtasks.length > 0 && (
              <span className="text-[11px] font-mono text-muted-foreground">{subPct}%</span>
            )}
          </div>
          {subtasks.length > 0 && (
            <div className="h-1 rounded-full bg-muted overflow-hidden">
              <div className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-500 transition-all" style={{ width: `${subPct}%` }} />
            </div>
          )}
          <div className="space-y-1">
            {subtasks.map(s => (
              <div key={s.id} className="flex items-center gap-2 group">
                <button onClick={() => toggleSubtask(s.id)} className="flex-shrink-0">
                  {s.done ? <CheckSquare className="w-4 h-4 text-emerald-500" /> : <Square className="w-4 h-4 text-muted-foreground" />}
                </button>
                <Input
                  value={s.title}
                  onChange={e => setSubtasks(p => p.map(x => x.id === s.id ? { ...x, title: e.target.value } : x))}
                  className={cn('h-7 text-sm border-transparent hover:border-border focus:border-blue-400 shadow-none', s.done && 'line-through text-muted-foreground')}
                />
                <button onClick={() => removeSubtask(s.id)} className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-red-500">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Input
              value={newSubtask}
              onChange={e => setNewSubtask(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addSubtask())}
              placeholder="+ Ajouter une sous-tâche"
              className="h-7 text-sm border-dashed"
            />
            <Button size="sm" variant="secondary" onClick={addSubtask} disabled={!newSubtask.trim()}>
              <Plus className="w-3 h-3" />
            </Button>
          </div>
        </div>

        {/* Pièces jointes / liens */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
              <Link2 className="w-3 h-3" /> Liens / pièces jointes ({attachments.length})
            </label>
            <Button size="sm" variant="secondary" onClick={addAttachment}>
              <Plus className="w-3 h-3" /> Ajouter
            </Button>
          </div>
          {attachments.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/70 text-center py-2">Drive, Figma, mockup, doc…</p>
          ) : (
            <div className="space-y-1.5">
              {attachments.map(a => (
                <div key={a.id} className="flex items-center gap-2 group">
                  <Input
                    value={a.label}
                    onChange={e => updateAttachment(a.id, { label: e.target.value })}
                    placeholder="Label"
                    className="h-7 text-sm w-32 flex-shrink-0"
                  />
                  <Input
                    value={a.url}
                    onChange={e => updateAttachment(a.id, { url: e.target.value })}
                    placeholder="https://..."
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

        {/* Commentaires */}
        <div className="space-y-2">
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold flex items-center gap-1.5">
            <MessageSquare className="w-3 h-3" /> Commentaires ({comments.length})
          </label>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {comments.length === 0 ? (
              <p className="text-[11px] text-muted-foreground/70 text-center py-2">Aucun commentaire</p>
            ) : (
              comments.slice().reverse().map(c => (
                <div key={c.id} className={cn(
                  'rounded-lg p-2.5 group',
                  c.is_admin
                    ? 'bg-blue-50/50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900/40'
                    : 'bg-muted/30 border border-border',
                )}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={cn('text-xs font-bold', c.is_admin ? 'text-blue-700 dark:text-blue-300' : 'text-foreground')}>
                      {c.author}
                    </span>
                    {c.is_admin && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500 text-white font-bold">MANAGER</span>}
                    <span className="text-[10px] text-muted-foreground ml-auto">{new Date(c.at).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    {(c.author === currentUserName) && (
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
            <textarea
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

        {/* Footer */}
        <div className="flex items-center justify-end pt-3 border-t border-border">
          <Button onClick={onClose}>
            {saveState === 'saving' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
            Fermer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Pill({ label, icon: Icon }: { label: string; icon?: React.ElementType }) {
  return (
    <span className="px-2 py-0.5 rounded-md bg-muted/50 flex items-center gap-1">
      {Icon && <Icon className="w-3 h-3" />}
      {label}
    </span>
  )
}
