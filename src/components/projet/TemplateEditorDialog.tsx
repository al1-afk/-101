/**
 * Éditeur de templates de projet personnalisés.
 * Permet de créer, modifier, supprimer des templates persos.
 * Les 6 templates intégrés (hardcoded) sont affichés en lecture seule.
 */
import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus, X, Trash2, Pencil, Save, ArrowLeft, FolderPlus, Sparkles, Copy,
} from 'lucide-react'
import type { ProjetTemplate } from '@/lib/projetTemplates'
import { PROJET_TEMPLATES } from '@/lib/projetTemplates'
import {
  useCustomTemplates, useCreateCustomTemplate, useUpdateCustomTemplate, useDeleteCustomTemplate,
  rowToTemplate, type CustomProjetTemplate,
} from '@/hooks/useProjetTemplates'
import { cn } from '@/lib/utils'
import BlockEditor from '@/components/BlockEditor'
import { SopBlocksRenderer } from '@/components/sop/SopBlocksRenderer'
import type { SopBlock } from '@/hooks/useSops'
import { Link as LinkIcon, Eye, PencilLine } from 'lucide-react'

type Priority = 'low' | 'normal' | 'high' | 'urgent'
const PRIO_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'low',    label: 'Basse' },
  { value: 'normal', label: 'Normale' },
  { value: 'high',   label: 'Haute' },
  { value: 'urgent', label: 'Urgente' },
]

interface EditorAttachment {
  label: string
  url:   string
}

interface EditorTask {
  title:     string
  priority?: Priority
  /** Blocs riches (BlockEditor : titres, listes, images, tableaux, code…) —
      injectés tels quels dans la description à la création. */
  blocks?:   SopBlock[]
  /** Liste de sous-tâches pré-remplies. */
  subtasks?: string[]
  /** Liens / pièces jointes (Drive, Figma, mockup…). */
  attachments?: EditorAttachment[]
  /** Prompt IA — bloc code dédié à la fin de la description. */
  prompt?:   string
}

interface EditorState {
  label: string
  emoji: string
  description: string
  groups: { category: string; tasks: EditorTask[] }[]
}

const EMPTY: EditorState = {
  label: '',
  emoji: '📋',
  description: '',
  groups: [{ category: 'Général', tasks: [{ title: '', priority: 'normal' }] }],
}

export default function TemplateEditorDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: customs = [], isLoading } = useCustomTemplates()
  const createTpl = useCreateCustomTemplate()
  const updateTpl = useUpdateCustomTemplate()
  const deleteTpl = useDeleteCustomTemplate()

  /* 'list' = vue liste de tous les templates, 'edit' = formulaire d'édition */
  const [view, setView] = useState<'list' | 'edit'>('list')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState<EditorState>(EMPTY)

  const totalTasks = useMemo(
    () => form.groups.reduce((s, g) => s + g.tasks.filter(t => t.title.trim()).length, 0),
    [form.groups]
  )

  const openCreate = () => {
    setEditingId(null)
    setForm(EMPTY)
    setView('edit')
  }
  const openEdit = (row: CustomProjetTemplate) => {
    setEditingId(row.id)
    setForm({
      label:       row.label,
      emoji:       row.emoji || '📋',
      description: row.description || '',
      groups:      (Array.isArray(row.groups) && row.groups.length > 0)
        ? row.groups.map(g => ({
            category: g.category,
            tasks: g.tasks.map(t => ({
              title:       t.title,
              priority:    (t.priority as Priority) ?? 'normal',
              blocks:      Array.isArray((t as any).blocks)      ? (t as any).blocks      : [],
              subtasks:    Array.isArray((t as any).subtasks)    ? (t as any).subtasks    : [],
              attachments: Array.isArray((t as any).attachments) ? (t as any).attachments : [],
              prompt:      (t as any).prompt   ?? '',
            })),
          }))
        : EMPTY.groups,
    })
    setView('edit')
  }
  /** Clone un template intégré dans le formulaire — l'utilisateur peut ensuite
      le modifier et enregistrer comme template perso. L'original reste intact. */
  const cloneBuiltIn = (t: ProjetTemplate) => {
    setEditingId(null)
    setForm({
      label:       `${t.label} (copie)`,
      emoji:       t.emoji,
      description: t.description,
      groups:      t.groups.map(g => ({
        category: g.category,
        tasks:    g.tasks.map(task => ({
          title:       task.title,
          priority:    (task.priority as Priority) ?? 'normal',
          blocks:      [], // les templates built-in n'ont pas de blocks (clone vide)
          subtasks:    Array.isArray(task.subtasks) ? task.subtasks : [],
          attachments: [],
          prompt:      task.prompt ?? '',
        })),
      })),
    })
    setView('edit')
  }
  const backToList = () => { setView('list'); setEditingId(null) }

  const save = () => {
    if (!form.label.trim()) return
    /* Strip empty tasks before save. Ne persiste que les champs renseignés
       pour garder le JSON en DB léger. */
    const groups = form.groups
      .map(g => ({
        category: g.category.trim() || 'Général',
        tasks:    g.tasks
          .filter(t => t.title.trim())
          .map(t => {
            const cleanSubtasks    = (t.subtasks    ?? []).map(s => s.trim()).filter(Boolean)
            const cleanAttachments = (t.attachments ?? []).filter(a => a.label.trim() && a.url.trim())
            return {
              title:    t.title.trim(),
              priority: t.priority,
              ...(t.blocks && t.blocks.length > 0  ? { blocks:      t.blocks }         : {}),
              ...(cleanSubtasks.length > 0         ? { subtasks:    cleanSubtasks }    : {}),
              ...(cleanAttachments.length > 0      ? { attachments: cleanAttachments } : {}),
              ...(t.prompt && t.prompt.trim()      ? { prompt:      t.prompt.trim() }  : {}),
            }
          }),
      }))
      .filter(g => g.tasks.length > 0)
    const payload = {
      label:       form.label.trim(),
      emoji:       form.emoji.trim() || '📋',
      description: form.description.trim(),
      groups,
    }
    if (editingId) {
      updateTpl.mutate({ id: editingId, ...payload }, { onSuccess: backToList })
    } else {
      createTpl.mutate(payload, { onSuccess: backToList })
    }
  }

  const remove = (row: CustomProjetTemplate) => {
    if (!confirm(`Supprimer le template « ${row.label} » ?`)) return
    deleteTpl.mutate(row.id)
  }

  /* Group manipulation helpers */
  const addGroup = () =>
    setForm(p => ({ ...p, groups: [...p.groups, { category: 'Nouvelle catégorie', tasks: [{ title: '', priority: 'normal' }] }] }))
  const removeGroup = (idx: number) =>
    setForm(p => ({ ...p, groups: p.groups.filter((_, i) => i !== idx) }))
  const updateGroupCategory = (idx: number, val: string) =>
    setForm(p => ({ ...p, groups: p.groups.map((g, i) => i === idx ? { ...g, category: val } : g) }))
  const addTask = (gIdx: number) =>
    setForm(p => ({ ...p, groups: p.groups.map((g, i) => i === gIdx ? { ...g, tasks: [...g.tasks, { title: '', priority: 'normal', blocks: [], subtasks: [], attachments: [], prompt: '' }] } : g) }))
  const removeTask = (gIdx: number, tIdx: number) =>
    setForm(p => ({ ...p, groups: p.groups.map((g, i) => i === gIdx ? { ...g, tasks: g.tasks.filter((_, j) => j !== tIdx) } : g) }))
  const updateTask = (gIdx: number, tIdx: number, patch: Partial<EditorTask>) =>
    setForm(p => ({
      ...p,
      groups: p.groups.map((g, i) => i === gIdx
        ? { ...g, tasks: g.tasks.map((t, j) => j === tIdx ? { ...t, ...patch } : t) }
        : g),
    }))

  /* État local pour afficher/masquer l'éditeur d'une tâche. */
  const [expandedPrompt, setExpandedPrompt] = useState<string | null>(null)
  /* Vue vs Édition par tâche — set des clés en mode vue. */
  const [viewMode, setViewMode] = useState<Set<string>>(new Set())
  const promptKey = (g: number, t: number) => `${g}:${t}`
  const isViewMode = (k: string) => viewMode.has(k)
  const toggleViewMode = (k: string) => {
    setViewMode(prev => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else            next.add(k)
      return next
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {view === 'edit' && (
              <button onClick={backToList} className="text-muted-foreground hover:text-foreground" title="Retour">
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <Sparkles className="w-4 h-4 text-blue-500" />
            {view === 'list' ? 'Gérer mes templates' : editingId ? 'Modifier le template' : 'Nouveau template'}
          </DialogTitle>
        </DialogHeader>

        {view === 'list' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Crée tes propres templates pour générer des tâches en un clic.
              </p>
              <Button size="sm" onClick={openCreate}>
                <Plus className="w-3.5 h-3.5" /> Nouveau template
              </Button>
            </div>

            {/* Custom templates (éditables) */}
            {isLoading ? (
              <p className="text-xs text-muted-foreground text-center py-4">Chargement…</p>
            ) : customs.length === 0 ? (
              <div className="border border-dashed border-border rounded-lg p-6 text-center">
                <FolderPlus className="w-8 h-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-xs text-muted-foreground">Aucun template perso pour l'instant.</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Mes templates</p>
                {customs.map(row => {
                  const t = rowToTemplate(row)
                  const taskCount = t.groups.reduce((n, g) => n + g.tasks.length, 0)
                  return (
                    <div key={row.id} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-card hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                      <span className="text-lg">{t.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">
                          {t.label}
                          <span className="text-[10px] font-mono text-muted-foreground ml-2">({taskCount} tâches)</span>
                        </p>
                        {t.description && <p className="text-[11px] text-muted-foreground truncate">{t.description}</p>}
                      </div>
                      <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => openEdit(row)} title="Modifier">
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button size="icon" variant="ghost" className="w-7 h-7 text-red-500 hover:text-red-600" onClick={() => remove(row)} title="Supprimer">
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Built-in templates — clic "Personnaliser" pour cloner et éditer */}
            <div className="space-y-1.5 pt-3 border-t border-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Templates intégrés
                <span className="font-normal normal-case tracking-normal">— clic « Personnaliser » pour les copier et les modifier</span>
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                {PROJET_TEMPLATES.map(t => {
                  const taskCount = t.groups.reduce((n, g) => n + g.tasks.length, 0)
                  return (
                    <div key={t.key} className="flex items-center gap-2 p-2 rounded-lg border border-border bg-card hover:border-blue-300 dark:hover:border-blue-700 transition-colors">
                      <span className="text-base">{t.emoji}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[12px] font-semibold text-foreground truncate">
                          {t.label}
                          <span className="text-[10px] font-mono text-muted-foreground ml-1.5">({taskCount})</span>
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => cloneBuiltIn(t)} title="Copier ce template pour le personnaliser">
                        <Copy className="w-3 h-3" /> Personnaliser
                      </Button>
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        ) : (
          /* ─── EDIT VIEW ─── */
          <div className="space-y-3">
            {/* Header fields */}
            <div className="grid grid-cols-12 gap-2">
              <Input
                className="col-span-2 text-center text-lg"
                value={form.emoji}
                onChange={e => setForm(p => ({ ...p, emoji: e.target.value }))}
                placeholder="📋"
              />
              <AutocorrectInput
                className="col-span-10"
                value={form.label}
                onChange={e => setForm(p => ({ ...p, label: e.target.value }))}
                placeholder="Nom du template (ex: Refonte site, Maintenance mensuelle…)"
                autoFocus
              />
            </div>
            <AutocorrectInput
              value={form.description}
              onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
              placeholder="Description courte (optionnel)"
            />

            {/* Groups */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Catégories & tâches</p>
                <Button size="sm" variant="secondary" onClick={addGroup}>
                  <FolderPlus className="w-3.5 h-3.5" /> Catégorie
                </Button>
              </div>

              {form.groups.map((g, gIdx) => (
                <div key={gIdx} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <AutocorrectInput
                      className="flex-1 h-8 text-sm font-semibold"
                      value={g.category}
                      onChange={e => updateGroupCategory(gIdx, e.target.value)}
                      placeholder="Catégorie (ex: Design, Dev, SEO…)"
                    />
                    <Button size="icon" variant="ghost" className="w-7 h-7 text-red-500"
                      onClick={() => removeGroup(gIdx)}
                      disabled={form.groups.length === 1}
                      title="Supprimer la catégorie"
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>

                  <div className="space-y-1.5 pl-2 border-l-2 border-blue-200 dark:border-blue-900/40">
                    {g.tasks.map((t, tIdx) => {
                      const k = promptKey(gIdx, tIdx)
                      const isOpen  = expandedPrompt === k
                      const hasBlocks      = (t.blocks ?? []).length > 0
                      const hasPrompt      = !!(t.prompt && t.prompt.trim())
                      const hasSubtasks    = (t.subtasks ?? []).filter(s => s.trim()).length > 0
                      const hasAttachments = (t.attachments ?? []).filter(a => a.url.trim()).length > 0
                      const hasAny = hasBlocks || hasPrompt || hasSubtasks || hasAttachments
                      const setSubtasks    = (arr: string[])            => updateTask(gIdx, tIdx, { subtasks: arr })
                      const setAttachments = (arr: EditorAttachment[])  => updateTask(gIdx, tIdx, { attachments: arr })
                      const setBlocks      = (arr: SopBlock[])           => updateTask(gIdx, tIdx, { blocks: arr })
                      return (
                        <div key={tIdx} className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <AutocorrectInput
                              className="flex-1 h-8 text-xs"
                              value={t.title}
                              onChange={e => updateTask(gIdx, tIdx, { title: e.target.value })}
                              placeholder="Titre de la tâche…"
                            />
                            <Select value={t.priority ?? 'normal'} onValueChange={v => updateTask(gIdx, tIdx, { priority: v as Priority })}>
                              <SelectTrigger className="h-8 w-24 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {PRIO_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                              </SelectContent>
                            </Select>
                            <button
                              type="button"
                              onClick={() => setExpandedPrompt(isOpen ? null : k)}
                              className={cn(
                                'inline-flex items-center gap-1 h-8 px-2 rounded-md text-[11px] font-medium border transition-colors',
                                hasAny
                                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                                  : 'border-border hover:bg-muted/50 text-muted-foreground',
                              )}
                              title="Éditer le contenu complet (SOP, sous-tâches, prompt)"
                            >
                              🖊️ Éditer
                              {hasAny && <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" />}
                            </button>
                            <Button size="icon" variant="ghost" className="w-7 h-7 text-red-400 hover:text-red-600" onClick={() => removeTask(gIdx, tIdx)} title="Supprimer la tâche">
                              <X className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                          {isOpen && (
                            <div className="ml-2 rounded-lg border border-blue-200 dark:border-blue-900/40 bg-blue-50/20 dark:bg-blue-950/10 p-3 space-y-4">
                              {/* Toggle Vue / Édition */}
                              <div className="flex items-center justify-between border-b border-blue-200/70 dark:border-blue-900/30 pb-2">
                                <span className="text-[10px] uppercase tracking-widest font-bold text-blue-700 dark:text-blue-300">
                                  Contenu de la tâche
                                </span>
                                <div className="flex items-center gap-0.5 p-0.5 rounded-md border border-border bg-background">
                                  <button
                                    type="button"
                                    onClick={() => { if (!isViewMode(k)) toggleViewMode(k) }}
                                    className={cn(
                                      'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors',
                                      isViewMode(k)
                                        ? 'bg-blue-500 text-white shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground',
                                    )}
                                    disabled={!hasAny}
                                    title={hasAny ? 'Aperçu (lecture seule)' : 'Aucun contenu à prévisualiser'}
                                  >
                                    <Eye className="w-3 h-3" /> Vue
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => { if (isViewMode(k)) toggleViewMode(k) }}
                                    className={cn(
                                      'flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold transition-colors',
                                      !isViewMode(k)
                                        ? 'bg-emerald-500 text-white shadow-sm'
                                        : 'text-muted-foreground hover:text-foreground',
                                    )}
                                  >
                                    <PencilLine className="w-3 h-3" /> Édition
                                  </button>
                                </div>
                              </div>

                              {/* ═══════ MODE VUE (aperçu) ═══════ */}
                              {isViewMode(k) && hasAny && (
                                <div className="space-y-3">
                                  {hasBlocks && (
                                    <div className="rounded-md border border-border bg-background p-3">
                                      <SopBlocksRenderer blocks={t.blocks ?? []} />
                                    </div>
                                  )}
                                  {hasSubtasks && (
                                    <div className="rounded-md border border-border bg-background p-3">
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">☑️ Sous-tâches</p>
                                      <ul className="space-y-0.5">
                                        {(t.subtasks ?? []).filter(s => s.trim()).map((s, i) => (
                                          <li key={i} className="flex items-center gap-2 text-sm">
                                            <span className="text-muted-foreground">☐</span>{s}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {hasAttachments && (
                                    <div className="rounded-md border border-border bg-background p-3">
                                      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">🔗 Liens</p>
                                      <ul className="space-y-0.5">
                                        {(t.attachments ?? []).filter(a => a.url.trim()).map((a, i) => (
                                          <li key={i} className="flex items-center gap-2 text-xs">
                                            <LinkIcon className="w-3 h-3 text-muted-foreground" />
                                            <a href={a.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 dark:text-blue-400 hover:underline">
                                              {a.label || a.url}
                                            </a>
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  )}
                                  {hasPrompt && (
                                    <div className="rounded-md border border-blue-200 dark:border-blue-800/40 bg-blue-50/60 dark:bg-blue-950/20 p-3">
                                      <div className="flex items-center justify-between mb-1.5">
                                        <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">✨ Prompt IA</p>
                                        <button
                                          type="button"
                                          onClick={() => navigator.clipboard.writeText(t.prompt ?? '').then(() => { /* silent */ })}
                                          className="text-[10px] text-blue-600 hover:underline"
                                        >
                                          Copier
                                        </button>
                                      </div>
                                      <pre className="whitespace-pre-wrap text-xs font-mono text-foreground">{t.prompt}</pre>
                                    </div>
                                  )}
                                </div>
                              )}

                              {isViewMode(k) && !hasAny && (
                                <p className="text-center text-xs text-muted-foreground italic py-6">
                                  Aucun contenu — bascule en <span className="font-semibold text-emerald-600">Édition</span> pour ajouter.
                                </p>
                              )}

                              {/* ═══════ MODE ÉDITION ═══════ */}
                              {!isViewMode(k) && (
                                <>
                              {/* Description riche (BlockEditor : titres, listes, images, code…) */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-[10px] uppercase tracking-widest font-bold text-blue-700 dark:text-blue-300">
                                    📝 Description
                                  </label>
                                  {hasBlocks && (
                                    <button type="button" onClick={() => setBlocks([])} className="text-[10px] text-rose-600 hover:underline">Vider</button>
                                  )}
                                </div>
                                <div className="rounded-md border border-border bg-background p-2">
                                  <BlockEditor
                                    value={t.blocks ?? []}
                                    onChange={setBlocks}
                                    placeholder="Cliquer pour commencer — tape « / » pour insérer un bloc (titre, liste, image, code…)"
                                  />
                                </div>
                              </div>

                              {/* Sous-tâches */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-[10px] uppercase tracking-widest font-bold text-blue-700 dark:text-blue-300">
                                    ☑️ Sous-tâches ({(t.subtasks ?? []).filter(s => s.trim()).length})
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setSubtasks([...(t.subtasks ?? []), ''])}
                                    className="text-[10px] text-blue-600 hover:underline"
                                  >
                                    + Ajouter
                                  </button>
                                </div>
                                {(t.subtasks ?? []).length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground italic">Aucune sous-tâche pré-remplie.</p>
                                ) : (
                                  <div className="space-y-1">
                                    {(t.subtasks ?? []).map((sub, sIdx) => (
                                      <div key={sIdx} className="flex items-center gap-1.5">
                                        <span className="text-muted-foreground text-xs">☐</span>
                                        <input
                                          value={sub}
                                          onChange={e => {
                                            const next = [...(t.subtasks ?? [])]
                                            next[sIdx] = e.target.value
                                            setSubtasks(next)
                                          }}
                                          placeholder={`Sous-tâche ${sIdx + 1}`}
                                          className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:border-blue-400"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => setSubtasks((t.subtasks ?? []).filter((_, j) => j !== sIdx))}
                                          className="w-6 h-6 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center justify-center"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Liens / Pièces jointes */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-[10px] uppercase tracking-widest font-bold text-blue-700 dark:text-blue-300">
                                    🔗 Liens / Pièces jointes ({(t.attachments ?? []).length})
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setAttachments([...(t.attachments ?? []), { label: '', url: '' }])}
                                    className="text-[10px] text-blue-600 hover:underline"
                                  >
                                    + Ajouter
                                  </button>
                                </div>
                                {(t.attachments ?? []).length === 0 ? (
                                  <p className="text-[10px] text-muted-foreground italic">Aucun lien (Drive, Figma, doc…).</p>
                                ) : (
                                  <div className="space-y-1">
                                    {(t.attachments ?? []).map((att, aIdx) => (
                                      <div key={aIdx} className="flex items-center gap-1.5">
                                        <LinkIcon className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                                        <input
                                          value={att.label}
                                          onChange={e => {
                                            const next = [...(t.attachments ?? [])]
                                            next[aIdx] = { ...next[aIdx], label: e.target.value }
                                            setAttachments(next)
                                          }}
                                          placeholder="Libellé"
                                          className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:border-blue-400"
                                        />
                                        <input
                                          value={att.url}
                                          onChange={e => {
                                            const next = [...(t.attachments ?? [])]
                                            next[aIdx] = { ...next[aIdx], url: e.target.value }
                                            setAttachments(next)
                                          }}
                                          placeholder="https://…"
                                          className="flex-1 h-7 rounded-md border border-border bg-background px-2 text-xs focus:outline-none focus:border-blue-400"
                                        />
                                        <button
                                          type="button"
                                          onClick={() => setAttachments((t.attachments ?? []).filter((_, j) => j !== aIdx))}
                                          className="w-6 h-6 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 flex items-center justify-center"
                                        >
                                          <X className="w-3 h-3" />
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Prompt IA */}
                              <div>
                                <div className="flex items-center justify-between mb-1.5">
                                  <label className="text-[10px] uppercase tracking-widest font-bold text-blue-700 dark:text-blue-300">
                                    ✨ Prompt IA (copier/coller)
                                  </label>
                                  {hasPrompt && (
                                    <button type="button" onClick={() => updateTask(gIdx, tIdx, { prompt: '' })} className="text-[10px] text-rose-600 hover:underline">Vider</button>
                                  )}
                                </div>
                                <textarea
                                  value={t.prompt ?? ''}
                                  onChange={e => updateTask(gIdx, tIdx, { prompt: e.target.value })}
                                  placeholder="Ex : Agis comme un Product Manager senior. Ta mission…"
                                  rows={5}
                                  className="w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-mono placeholder:text-muted-foreground focus:outline-none focus:border-blue-400 resize-y"
                                />
                              </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                    <Button size="sm" variant="ghost" className="text-[11px] h-7" onClick={() => addTask(gIdx)}>
                      <Plus className="w-3 h-3" /> Tâche
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between pt-3 border-t border-border">
              <span className={cn('text-xs', totalTasks > 0 ? 'font-bold text-blue-600' : 'text-muted-foreground')}>
                {totalTasks > 0 ? `${totalTasks} tâche${totalTasks > 1 ? 's' : ''}` : 'Aucune tâche'}
              </span>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={backToList}>Annuler</Button>
                <Button size="sm" onClick={save} disabled={!form.label.trim() || totalTasks === 0 || createTpl.isPending || updateTpl.isPending}>
                  <Save className="w-3.5 h-3.5" /> {editingId ? 'Enregistrer' : 'Créer'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
