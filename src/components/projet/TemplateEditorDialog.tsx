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

type Priority = 'low' | 'normal' | 'high' | 'urgent'
const PRIO_OPTIONS: { value: Priority; label: string }[] = [
  { value: 'low',    label: 'Basse' },
  { value: 'normal', label: 'Normale' },
  { value: 'high',   label: 'Haute' },
  { value: 'urgent', label: 'Urgente' },
]

interface EditorState {
  label: string
  emoji: string
  description: string
  groups: { category: string; tasks: { title: string; priority?: Priority }[] }[]
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
        ? row.groups.map(g => ({ category: g.category, tasks: g.tasks.map(t => ({ title: t.title, priority: (t.priority as Priority) ?? 'normal' })) }))
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
        tasks:    g.tasks.map(task => ({ title: task.title, priority: (task.priority as Priority) ?? 'normal' })),
      })),
    })
    setView('edit')
  }
  const backToList = () => { setView('list'); setEditingId(null) }

  const save = () => {
    if (!form.label.trim()) return
    /* Strip empty tasks before save */
    const groups = form.groups
      .map(g => ({ category: g.category.trim() || 'Général', tasks: g.tasks.filter(t => t.title.trim()).map(t => ({ title: t.title.trim(), priority: t.priority })) }))
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
    setForm(p => ({ ...p, groups: p.groups.map((g, i) => i === gIdx ? { ...g, tasks: [...g.tasks, { title: '', priority: 'normal' }] } : g) }))
  const removeTask = (gIdx: number, tIdx: number) =>
    setForm(p => ({ ...p, groups: p.groups.map((g, i) => i === gIdx ? { ...g, tasks: g.tasks.filter((_, j) => j !== tIdx) } : g) }))
  const updateTask = (gIdx: number, tIdx: number, patch: Partial<{ title: string; priority: Priority }>) =>
    setForm(p => ({
      ...p,
      groups: p.groups.map((g, i) => i === gIdx
        ? { ...g, tasks: g.tasks.map((t, j) => j === tIdx ? { ...t, ...patch } : t) }
        : g),
    }))

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
                    {g.tasks.map((t, tIdx) => (
                      <div key={tIdx} className="flex items-center gap-1.5">
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
                        <Button size="icon" variant="ghost" className="w-7 h-7 text-red-400 hover:text-red-600" onClick={() => removeTask(gIdx, tIdx)} title="Supprimer la tâche">
                          <X className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    ))}
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
