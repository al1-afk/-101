import { useEffect, useState, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X, Plus, Trash2, GripVertical, Save, FileText,
  Type, ListOrdered, List as ListIcon, CheckSquare, MessageSquare, Code as CodeIcon,
  AlertCircle, Minus, Image as ImageIcon, Quote, Table as TableIcon,
  Upload, Layers, ChevronDown, ChevronUp, Video as VideoIcon, Link as LinkIcon,
} from 'lucide-react'
import { detectVideo } from '@/components/sop/videoEmbed'
import type { Sop, SopBlock, SopBlockType } from '@/hooks/useSops'
import { makeSopSlug, useCreateSop, useUpdateSop } from '@/hooks/useSops'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

interface Props {
  open:        boolean
  existing?:   Sop | null
  initialCategory?: string
  onClose:     () => void
}

const CATEGORY_OPTIONS = [
  { key: 'whatsapp',    label: 'Scripts WhatsApp' },
  { key: 'quick',       label: 'Réponses rapides' },
  { key: 'sales',       label: 'Process Commercial' },
  { key: 'onboarding',  label: 'Onboarding Client' },
  { key: 'delivery',    label: 'Livraison Projet' },
  { key: 'support',     label: 'Support Client' },
  { key: 'marketing',   label: 'Marketing & Ads' },
  { key: 'faq',         label: 'FAQ Interne' },
  { key: 'ai',          label: 'IA & Automatisation' },
  { key: 'projets',     label: 'Chef de projet' },
  { key: 'dev',         label: 'Développeur' },
  { key: 'media_buyer', label: 'Media Buyer' },
  { key: 'prospection', label: 'Prospection' },
  { key: 'designer',    label: 'Designer / Graphiste' },
]

interface BlockTypeDef {
  type:     SopBlockType
  label:    string
  icon:     React.ElementType
  shortcut: string                    // pour slash command (sans le `/`)
  group:    'text' | 'list' | 'media' | 'advanced'
}

const BLOCK_TYPES: BlockTypeDef[] = [
  { type: 'heading',   label: 'Titre H1',      icon: Type,           shortcut: 'titre',     group: 'text'     },
  { type: 'heading2',  label: 'Titre H2',      icon: Type,           shortcut: 'h2',        group: 'text'     },
  { type: 'heading3',  label: 'Titre H3',      icon: Type,           shortcut: 'h3',        group: 'text'     },
  { type: 'paragraph', label: 'Paragraphe',    icon: FileText,       shortcut: 'paragraphe',group: 'text'     },
  { type: 'quote',     label: 'Citation',      icon: Quote,          shortcut: 'citation',  group: 'text'     },
  { type: 'list',      label: 'Liste à puces', icon: ListIcon,       shortcut: 'liste',     group: 'list'     },
  { type: 'numbered',  label: 'Liste num.',    icon: ListOrdered,    shortcut: 'numerotee', group: 'list'     },
  { type: 'checklist', label: 'Checklist',     icon: CheckSquare,    shortcut: 'checklist', group: 'list'     },
  { type: 'steps',     label: 'Étapes',        icon: Layers,         shortcut: 'etapes',    group: 'list'     },
  { type: 'image',     label: 'Image',         icon: ImageIcon,      shortcut: 'image',     group: 'media'    },
  { type: 'video',     label: 'Vidéo (lien)',  icon: VideoIcon,      shortcut: 'video',     group: 'media'    },
  { type: 'table',     label: 'Tableau',       icon: TableIcon,      shortcut: 'tableau',   group: 'media'    },
  { type: 'callout',   label: 'Encadré',       icon: AlertCircle,    shortcut: 'callout',   group: 'advanced' },
  { type: 'template',  label: 'Template msg.', icon: MessageSquare,  shortcut: 'message',   group: 'advanced' },
  { type: 'code',      label: 'Code',          icon: CodeIcon,       shortcut: 'code',      group: 'advanced' },
  { type: 'divider',   label: 'Séparateur',    icon: Minus,          shortcut: 'separateur',group: 'advanced' },
]

const GROUP_LABELS: Record<BlockTypeDef['group'], string> = {
  text:     'Texte',
  list:     'Listes',
  media:    'Média',
  advanced: 'Avancé',
}

const MAX_IMAGE_MB = 10

export default function SopEditor({ open, existing, initialCategory, onClose }: Props) {
  const [title,       setTitle]       = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState('whatsapp')
  const [tagsInput,   setTagsInput]   = useState('')
  const [readMin,     setReadMin]     = useState(2)
  const [popular,     setPopular]     = useState(false)
  const [blocks,      setBlocks]      = useState<SopBlock[]>([])
  const [slashOpen,   setSlashOpen]   = useState(false)
  const [slashQuery,  setSlashQuery]  = useState('')

  const create = useCreateSop()
  const update = useUpdateSop()

  /* Charger les données existantes en mode édition */
  useEffect(() => {
    if (!open) return
    if (existing) {
      setTitle(existing.title ?? '')
      setDescription(existing.description ?? '')
      setCategory(existing.category ?? 'whatsapp')
      setTagsInput((existing.tags ?? []).join(', '))
      setReadMin(existing.read_min ?? 2)
      setPopular(existing.popular ?? false)
      setBlocks(existing.blocks ?? [])
    } else {
      setTitle('')
      setDescription('')
      setCategory(initialCategory && initialCategory !== 'home' ? initialCategory : 'whatsapp')
      setTagsInput('')
      setReadMin(2)
      setPopular(false)
      setBlocks([{ type: 'paragraph', text: '' }])
    }
    setSlashOpen(false)
    setSlashQuery('')
  }, [open, existing, initialCategory])

  const tags = tagsInput.split(',').map(t => t.trim()).filter(Boolean)

  const addBlock = (type: SopBlockType) => {
    const newBlock: SopBlock = makeBlock(type)
    setBlocks(b => [...b, newBlock])
    setSlashOpen(false)
    setSlashQuery('')
  }

  const updateBlock = (idx: number, patch: Partial<SopBlock>) => {
    setBlocks(b => b.map((blk, i) => (i === idx ? { ...blk, ...patch } : blk)))
  }
  const removeBlock = (idx: number) => setBlocks(b => b.filter((_, i) => i !== idx))
  const moveBlock = (idx: number, dir: 'up' | 'down') => {
    setBlocks(b => {
      const next = [...b]
      const j = dir === 'up' ? idx - 1 : idx + 1
      if (j < 0 || j >= next.length) return b
      ;[next[idx], next[j]] = [next[j], next[idx]]
      return next
    })
  }
  const duplicateBlock = (idx: number) => {
    setBlocks(b => {
      const copy = JSON.parse(JSON.stringify(b[idx])) as SopBlock
      const next = [...b]
      next.splice(idx + 1, 0, copy)
      return next
    })
  }

  const updateItem = (blockIdx: number, itemIdx: number, value: string) => {
    setBlocks(b => b.map((blk, i) => {
      if (i !== blockIdx) return blk
      const items = [...(blk.items ?? [])]
      items[itemIdx] = value
      return { ...blk, items }
    }))
  }
  const addItem = (blockIdx: number) => {
    setBlocks(b => b.map((blk, i) =>
      i === blockIdx ? { ...blk, items: [...(blk.items ?? []), ''] } : blk
    ))
  }
  const removeItem = (blockIdx: number, itemIdx: number) => {
    setBlocks(b => b.map((blk, i) => {
      if (i !== blockIdx) return blk
      const items = (blk.items ?? []).filter((_, k) => k !== itemIdx)
      return { ...blk, items }
    }))
  }

  const save = async () => {
    if (!title.trim()) return
    const cleanBlocks = blocks
      .map(blk =>
        blk.items
          ? { ...blk, items: blk.items.filter(it => it.trim() !== '') }
          : blk
      )
      .filter(blk => {
        if (blk.type === 'divider') return true
        if (blk.type === 'image') return !!blk.image?.url
        if (blk.type === 'video') return !!blk.video?.url?.trim()
        if (blk.type === 'table') return !!blk.table && blk.table.rows.length > 0
        if (blk.items) return blk.items.length > 0
        return (blk.text ?? '').trim() !== ''
      })

    const payload = {
      title:       title.trim(),
      description: description.trim() || null,
      category,
      tags,
      slug:        existing?.slug || makeSopSlug(title),
      read_min:    Number(readMin) || 2,
      popular,
      blocks:      cleanBlocks,
    }

    if (existing) await update.mutateAsync({ id: existing.id, ...payload } as any)
    else          await create.mutateAsync(payload as any)
    onClose()
  }

  /* Esc / scroll lock */
  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  /* Slash filter */
  const filteredSlash = useMemo(() => {
    const q = slashQuery.trim().toLowerCase()
    if (!q) return BLOCK_TYPES
    return BLOCK_TYPES.filter(bt =>
      bt.label.toLowerCase().includes(q) ||
      bt.shortcut.toLowerCase().includes(q) ||
      bt.type.toLowerCase().includes(q),
    )
  }, [slashQuery])

  if (!open) return null

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 }}
        className="bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-0 md:p-6"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          className="relative bg-background border border-border rounded-2xl shadow-2xl ring-1 ring-white/10 w-full md:max-w-3xl flex flex-col overflow-hidden"
          style={{ maxHeight: 'min(92vh, 900px)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Header */}
          <div className="relative flex-shrink-0">
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-violet-500 to-emerald-500" />
            <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-border bg-gradient-to-br from-blue-50/50 to-violet-50/30 dark:from-blue-950/20 dark:to-violet-950/10">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center shadow-md shadow-blue-500/20">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-extrabold tracking-tight text-foreground">
                    {existing ? 'Modifier le SOP' : 'Nouveau SOP'}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Éditeur riche · tapez <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">/</kbd> pour insérer un bloc
                  </p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/80 dark:hover:bg-slate-800 transition-colors" title="Fermer (Echap)">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto px-5 md:px-6 py-5 space-y-6">
            {/* Métadonnées */}
            <section className="space-y-3">
              <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5">
                <span className="inline-block w-1 h-4 rounded-full bg-blue-500" />
                Informations
              </h3>
              <Field label="Titre" required>
                <AutocorrectInput value={title} onChange={e => setTitle(e.target.value)} placeholder="Ex. Message d'accueil WhatsApp" />
              </Field>
              <Field label="Description">
                <AutocorrectInput value={description} onChange={e => setDescription(e.target.value)} placeholder="Une phrase qui résume quand utiliser ce SOP" />
              </Field>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <Field label="Catégorie">
                  <select value={category} onChange={e => setCategory(e.target.value)}
                    className="w-full h-10 rounded-lg border border-border bg-[var(--surface-input)] px-3 text-sm text-foreground focus:outline-none focus:border-[#378ADD]">
                    {CATEGORY_OPTIONS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </Field>
                <Field label="Temps de lecture (min)">
                  <Input type="number" min={1} max={60} value={readMin} onChange={e => setReadMin(Number(e.target.value))} />
                </Field>
                <Field label="Populaire">
                  <label className="flex items-center gap-2 h-10 px-3 rounded-lg border border-border bg-[var(--surface-input)] cursor-pointer">
                    <input type="checkbox" checked={popular} onChange={e => setPopular(e.target.checked)} className="w-4 h-4 accent-blue-600" />
                    <span className="text-sm text-foreground">Marquer comme populaire</span>
                  </label>
                </Field>
              </div>
              <Field label="Tags (séparés par des virgules)">
                <AutocorrectInput value={tagsInput} onChange={e => setTagsInput(e.target.value)} placeholder="Ex. WhatsApp, Accueil, Prospect" />
                {tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {tags.map(t => (
                      <span key={t} className="px-2 py-0.5 rounded-md text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/50 dark:text-blue-300">#{t}</span>
                    ))}
                  </div>
                )}
              </Field>
            </section>

            {/* Contenu */}
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground flex items-center gap-1.5">
                  <span className="inline-block w-1 h-4 rounded-full bg-violet-500" />
                  Contenu
                </h3>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded-md">
                    {blocks.length} bloc{blocks.length > 1 ? 's' : ''}
                  </span>
                  <button
                    onClick={() => { setSlashOpen(true); setSlashQuery('') }}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-border bg-background hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 transition-all"
                    title="Ouvrir le menu / (slash)"
                  >
                    <Plus className="w-3 h-3" /> Ajouter
                  </button>
                </div>
              </div>

              <div className="space-y-3">
                {blocks.map((blk, i) => (
                  <BlockEditor
                    key={i}
                    block={blk}
                    index={i}
                    total={blocks.length}
                    onUpdate={patch => updateBlock(i, patch)}
                    onUpdateItem={(j, v) => updateItem(i, j, v)}
                    onAddItem={() => addItem(i)}
                    onRemoveItem={j => removeItem(i, j)}
                    onMoveUp={() => moveBlock(i, 'up')}
                    onMoveDown={() => moveBlock(i, 'down')}
                    onRemove={() => removeBlock(i)}
                    onDuplicate={() => duplicateBlock(i)}
                    onSlash={() => { setSlashOpen(true); setSlashQuery('') }}
                  />
                ))}
              </div>

              {/* Quick add palette (toujours visible) */}
              <div className="mt-4 p-4 rounded-xl border border-dashed border-blue-300 dark:border-blue-700/50 bg-blue-50/30 dark:bg-blue-950/10">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-blue-700 dark:text-blue-300 mb-3 flex items-center gap-1.5">
                  <Plus className="w-3.5 h-3.5" /> Insérer un bloc
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {BLOCK_TYPES.map(bt => {
                    const Icon = bt.icon
                    return (
                      <button key={bt.type} onClick={() => addBlock(bt.type)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border border-border bg-background hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 dark:hover:bg-blue-950/40 dark:hover:text-blue-300 transition-all">
                        <Icon className="w-3.5 h-3.5" />
                        {bt.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-5 md:px-6 py-3.5 border-t border-border flex-shrink-0 bg-card/95 backdrop-blur-sm">
            <div className="text-[11px] text-muted-foreground hidden sm:block">
              {existing
                ? `Modifié le ${new Date(existing.updated_at).toLocaleDateString('fr-FR')} • ${blocks.length} bloc${blocks.length > 1 ? 's' : ''}`
                : `${blocks.length} bloc${blocks.length > 1 ? 's' : ''} • Échap pour annuler`}
            </div>
            <div className="flex items-center gap-2 ml-auto">
              <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
              <Button size="sm" onClick={save} disabled={!title.trim() || create.isPending || update.isPending} className="min-w-[120px]">
                <Save className="w-3.5 h-3.5" />
                {(create.isPending || update.isPending) ? 'Sauvegarde…' : existing ? 'Mettre à jour' : 'Créer le SOP'}
              </Button>
            </div>
          </div>
        </motion.div>

        {/* Slash command palette */}
        {slashOpen && (
          <SlashPalette
            query={slashQuery}
            onQueryChange={setSlashQuery}
            results={filteredSlash}
            onPick={t => addBlock(t)}
            onClose={() => setSlashOpen(false)}
          />
        )}
      </motion.div>
    </AnimatePresence>,
    document.body,
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SUB COMPONENTS
═══════════════════════════════════════════════════════════════════ */

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-1">
        {label}{required && <span className="text-rose-500 ml-1">*</span>}
      </span>
      {children}
    </label>
  )
}

function BlockEditor({
  block, index, total,
  onUpdate, onUpdateItem, onAddItem, onRemoveItem,
  onMoveUp, onMoveDown, onRemove, onDuplicate, onSlash,
}: {
  block:        SopBlock
  index:        number
  total:        number
  onUpdate:     (patch: Partial<SopBlock>) => void
  onUpdateItem: (idx: number, value: string) => void
  onAddItem:    () => void
  onRemoveItem: (idx: number) => void
  onMoveUp:     () => void
  onMoveDown:   () => void
  onRemove:     () => void
  onDuplicate:  () => void
  onSlash:      () => void
}) {
  const isSimpleList = block.type === 'list' || block.type === 'numbered' || block.type === 'checklist' || block.type === 'steps'

  /* Détection de la touche / pour ouvrir le menu slash quand le champ est vide */
  const onKey = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === '/' && !(e.currentTarget.value)) {
      e.preventDefault()
      onSlash()
    }
  }

  return (
    <div className="group rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/20">
        <div className="flex items-center gap-2">
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50" />
          <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            #{index + 1} · {block.type}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={onMoveUp} disabled={index === 0} className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-30" title="Monter">
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button onClick={onMoveDown} disabled={index === total - 1} className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-30" title="Descendre">
            <ChevronDown className="w-3.5 h-3.5" />
          </button>
          <button onClick={onDuplicate} className="p-1 rounded text-muted-foreground hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-900/30" title="Dupliquer">
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button onClick={onRemove} className="p-1 rounded text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30" title="Supprimer">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-3 space-y-2">
        {block.type === 'divider' ? (
          <p className="text-center text-xs text-muted-foreground italic">— Séparateur visuel —</p>
        ) : block.type === 'image' ? (
          <ImageBlockEditor block={block} onUpdate={onUpdate} />
        ) : block.type === 'video' ? (
          <VideoBlockEditor block={block} onUpdate={onUpdate} />
        ) : block.type === 'table' ? (
          <TableBlockEditor block={block} onUpdate={onUpdate} />
        ) : block.type === 'callout' ? (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <select value={block.variant ?? 'tip'} onChange={e => onUpdate({ variant: e.target.value as SopBlock['variant'] })}
                className="h-9 rounded-lg border border-border bg-[var(--surface-input)] px-2 text-sm">
                <option value="tip">💡 Tip</option>
                <option value="info">ℹ️ Info</option>
                <option value="warning">⚠️ Avertissement</option>
                <option value="danger">🚨 Danger</option>
                <option value="success">✅ Succès</option>
              </select>
              <AutocorrectInput value={block.title ?? ''} onChange={e => onUpdate({ title: e.target.value })} placeholder="Titre de l'encadré" />
            </div>
            <AutocorrectTextarea value={block.text ?? ''} onChange={e => onUpdate({ text: e.target.value })} placeholder="Contenu de l'encadré…" rows={3}
              className="w-full rounded-lg border border-border bg-[var(--surface-input)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#378ADD] resize-y" />
          </>
        ) : isSimpleList ? (
          <>
            {(block.items ?? []).map((item, j) => (
              <div key={j} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-7 text-right">
                  {block.type === 'steps' || block.type === 'numbered' ? `${j + 1}.` : block.type === 'checklist' ? '☐' : '•'}
                </span>
                <AutocorrectInput value={item} onChange={e => onUpdateItem(j, e.target.value)} onKeyDown={onKey} placeholder={`Élément ${j + 1}`} className="flex-1" />
                <button onClick={() => onRemoveItem(j)} className="p-1.5 rounded text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <button onClick={onAddItem} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
              <Plus className="w-3 h-3" /> Ajouter un élément
            </button>
          </>
        ) : block.type === 'heading' || block.type === 'heading2' || block.type === 'heading3' ? (
          <AutocorrectInput value={block.text ?? ''} onChange={e => onUpdate({ text: e.target.value })} onKeyDown={onKey} placeholder="Titre de la section"
            className={cn('font-bold', block.type === 'heading' ? 'text-xl' : block.type === 'heading2' ? 'text-lg' : 'text-base')} />
        ) : block.type === 'quote' ? (
          <AutocorrectTextarea value={block.text ?? ''} onChange={e => onUpdate({ text: e.target.value })} placeholder="« Citation »" rows={2}
            className="w-full rounded-lg border-l-4 border-blue-500 bg-muted/40 px-3 py-2 text-sm italic text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#378ADD] resize-y" />
        ) : block.type === 'template' || block.type === 'code' ? (
          <textarea value={block.text ?? ''} onChange={e => onUpdate({ text: e.target.value })} onKeyDown={onKey}
            placeholder={
              block.type === 'template'
                ? 'Template avec variables — ex: Bonjour {{prenom}}…'
                : 'Code (affiché en monospace)'
            }
            rows={5}
            className="w-full rounded-lg border border-border bg-[var(--surface-input)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#378ADD] resize-y font-mono text-[13px]" />
        ) : (
          <AutocorrectTextarea value={block.text ?? ''} onChange={e => onUpdate({ text: e.target.value })} onKeyDown={onKey}
            placeholder="Texte… utilisez **gras**, *italique*, [lien](url)"
            rows={3}
            className="w-full rounded-lg border border-border bg-[var(--surface-input)] px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-[#378ADD] resize-y" />
        )}
      </div>
    </div>
  )
}

/* ─── Image block editor (upload base64) ──────────────────────── */
function ImageBlockEditor({ block, onUpdate }: { block: SopBlock; onUpdate: (patch: Partial<SopBlock>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const meta = block.image ?? { url: '' }

  const onFile = (file: File | null | undefined) => {
    if (!file) return
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
      toast.error(`Image trop volumineuse (max ${MAX_IMAGE_MB} Mo)`)
      return
    }
    if (!/^image\/(png|jpe?g|gif|webp|svg\+xml)$/.test(file.type)) {
      toast.error('Format non supporté (JPG, PNG, GIF, WebP, SVG)')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      onUpdate({ image: { ...meta, url } })
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-2">
      {meta.url ? (
        <div className={cn(
          'mx-auto',
          meta.size === 'small' ? 'max-w-xs' : meta.size === 'medium' ? 'max-w-sm' : meta.size === 'large' ? 'max-w-md' : 'w-full',
          meta.align === 'left' ? 'mr-auto ml-0' : meta.align === 'right' ? 'ml-auto mr-0' : 'mx-auto',
        )}>
          <img src={meta.url} alt={meta.caption || ''} className="w-full rounded-lg border border-border" />
        </div>
      ) : (
        <button onClick={() => fileRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-2 p-6 rounded-lg border-2 border-dashed border-border hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-950/20 transition-all">
          <Upload className="w-6 h-6 text-muted-foreground" />
          <p className="text-sm font-semibold text-foreground">Cliquez pour téléverser une image</p>
          <p className="text-xs text-muted-foreground">JPG, PNG, GIF, WebP, SVG · max {MAX_IMAGE_MB} Mo</p>
        </button>
      )}
      <input type="file" ref={fileRef} hidden accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={e => onFile(e.target.files?.[0])} />

      {meta.url && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            <select value={meta.size ?? 'medium'} onChange={e => onUpdate({ image: { ...meta, size: e.target.value as any } })}
              className="h-9 rounded-lg border border-border bg-[var(--surface-input)] px-2 text-sm">
              <option value="small">Petit</option>
              <option value="medium">Moyen</option>
              <option value="large">Grand</option>
              <option value="full">Pleine largeur</option>
            </select>
            <select value={meta.align ?? 'center'} onChange={e => onUpdate({ image: { ...meta, align: e.target.value as any } })}
              className="h-9 rounded-lg border border-border bg-[var(--surface-input)] px-2 text-sm">
              <option value="left">Gauche</option>
              <option value="center">Centré</option>
              <option value="right">Droite</option>
            </select>
            <button onClick={() => fileRef.current?.click()}
              className="h-9 px-3 rounded-lg border border-border bg-background hover:bg-muted text-sm font-semibold flex items-center justify-center gap-1">
              <Upload className="w-3.5 h-3.5" /> Remplacer
            </button>
          </div>
          <AutocorrectInput value={meta.caption ?? ''} onChange={e => onUpdate({ image: { ...meta, caption: e.target.value } })} placeholder="Légende (optionnel)" />
        </>
      )}
    </div>
  )
}

/* ─── Video block editor (lien YouTube/Vimeo/Loom/MP4) ──────── */
function VideoBlockEditor({ block, onUpdate }: { block: SopBlock; onUpdate: (patch: Partial<SopBlock>) => void }) {
  const meta = block.video ?? { url: '' }
  const info = detectVideo(meta.url)
  const kindLabel = {
    youtube: 'YouTube', vimeo: 'Vimeo', loom: 'Loom', file: 'Fichier vidéo', unknown: 'Lien non reconnu',
  }[info.kind]

  return (
    <div className="space-y-2">
      <div className="relative">
        <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
        <Input
          value={meta.url}
          onChange={e => onUpdate({ video: { ...meta, url: e.target.value } })}
          placeholder="https://youtube.com/watch?v=… ou https://vimeo.com/… ou .mp4"
          className="pl-9"
        />
      </div>

      {meta.url.trim() ? (
        info.embedUrl ? (
          <div className={cn(
            meta.size === 'small' ? 'max-w-xs' : meta.size === 'medium' ? 'max-w-sm' : meta.size === 'large' ? 'max-w-md' : 'w-full',
            meta.align === 'left' ? 'mr-auto ml-0' : meta.align === 'right' ? 'ml-auto mr-0' : 'mx-auto',
          )}>
            <div className="aspect-video w-full rounded-lg overflow-hidden border border-border bg-black">
              {info.kind === 'file' ? (
                <video src={info.embedUrl} controls className="w-full h-full" />
              ) : (
                <iframe
                  src={info.embedUrl}
                  className="w-full h-full"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  title={meta.caption || 'Vidéo'}
                />
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-1">Aperçu · {kindLabel}</p>
          </div>
        ) : (
          <div className="rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
            Lien non reconnu. Collez une URL YouTube, Vimeo, Loom ou un fichier .mp4/.webm.
          </div>
        )
      ) : (
        <div className="rounded-lg border-2 border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
          <VideoIcon className="w-6 h-6 mx-auto mb-1 opacity-50" />
          Collez un lien vidéo (YouTube, Vimeo, Loom ou .mp4)
        </div>
      )}

      {meta.url.trim() && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select value={meta.size ?? 'medium'} onChange={e => onUpdate({ video: { ...meta, size: e.target.value as any } })}
              className="h-9 rounded-lg border border-border bg-[var(--surface-input)] px-2 text-sm">
              <option value="small">Petit</option>
              <option value="medium">Moyen</option>
              <option value="large">Grand</option>
              <option value="full">Pleine largeur</option>
            </select>
            <select value={meta.align ?? 'center'} onChange={e => onUpdate({ video: { ...meta, align: e.target.value as any } })}
              className="h-9 rounded-lg border border-border bg-[var(--surface-input)] px-2 text-sm">
              <option value="left">Gauche</option>
              <option value="center">Centré</option>
              <option value="right">Droite</option>
            </select>
          </div>
          <AutocorrectInput value={meta.caption ?? ''} onChange={e => onUpdate({ video: { ...meta, caption: e.target.value } })} placeholder="Légende (optionnel)" />
        </>
      )}
    </div>
  )
}

/* ─── Table block editor ─────────────────────────────────────── */
function TableBlockEditor({ block, onUpdate }: { block: SopBlock; onUpdate: (patch: Partial<SopBlock>) => void }) {
  const t = block.table ?? { headers: ['Colonne 1', 'Colonne 2'], rows: [['', '']] }

  const setHeader = (i: number, v: string) => {
    const headers = [...t.headers]; headers[i] = v
    onUpdate({ table: { ...t, headers } })
  }
  const setCell = (r: number, c: number, v: string) => {
    const rows = t.rows.map(row => [...row])
    rows[r][c] = v
    onUpdate({ table: { ...t, rows } })
  }
  const addRow = () => onUpdate({ table: { ...t, rows: [...t.rows, t.headers.map(() => '')] } })
  const addCol = () => onUpdate({ table: { headers: [...t.headers, `Colonne ${t.headers.length + 1}`], rows: t.rows.map(r => [...r, '']) } })
  const removeRow = (r: number) => onUpdate({ table: { ...t, rows: t.rows.filter((_, i) => i !== r) } })
  const removeCol = (c: number) => onUpdate({ table: { headers: t.headers.filter((_, i) => i !== c), rows: t.rows.map(r => r.filter((_, i) => i !== c)) } })

  return (
    <div className="space-y-2 overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr>
            {t.headers.map((h, i) => (
              <th key={i} className="border border-border p-1 bg-muted/30">
                <div className="flex items-center gap-1">
                  <AutocorrectInput value={h} onChange={e => setHeader(i, e.target.value)} className="h-7 text-xs font-semibold" />
                  <button onClick={() => removeCol(i)} className="p-1 text-muted-foreground hover:text-rose-500" title="Supprimer colonne">
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </th>
            ))}
            <th className="border border-border p-1 bg-muted/30 w-10">
              <button onClick={addCol} className="p-1 text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950 rounded" title="Ajouter colonne">
                <Plus className="w-3.5 h-3.5" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className="border border-border p-1">
                  <AutocorrectInput value={cell} onChange={e => setCell(r, c, e.target.value)} className="h-7 text-xs" />
                </td>
              ))}
              <td className="border border-border p-1 w-10">
                <button onClick={() => removeRow(r)} className="p-1 text-muted-foreground hover:text-rose-500" title="Supprimer ligne">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-semibold text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30">
        <Plus className="w-3 h-3" /> Ajouter une ligne
      </button>
    </div>
  )
}

/* ─── Slash command palette ──────────────────────────────────── */
function SlashPalette({
  query, onQueryChange, results, onPick, onClose,
}: {
  query:         string
  onQueryChange: (q: string) => void
  results:       BlockTypeDef[]
  onPick:        (t: SopBlockType) => void
  onClose:       () => void
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 8 }}
      style={{ position: 'fixed', inset: 0, zIndex: 200 }}
      className="bg-slate-950/40 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
      onClick={onClose}
    >
      <div onClick={e => e.stopPropagation()} className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="border-b border-border px-3 py-2 flex items-center gap-2">
          <span className="text-blue-500 font-mono font-bold">/</span>
          <input autoFocus value={query} onChange={e => onQueryChange(e.target.value)} placeholder="Tapez pour filtrer…"
            className="flex-1 bg-transparent outline-none text-sm" />
          <kbd className="px-1.5 py-0.5 rounded bg-muted text-[10px] font-mono">Echap</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1">
          {(['text', 'list', 'media', 'advanced'] as const).map(group => {
            const items = results.filter(r => r.group === group)
            if (items.length === 0) return null
            return (
              <div key={group}>
                <p className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{GROUP_LABELS[group]}</p>
                {items.map(it => {
                  const Icon = it.icon
                  return (
                    <button key={it.type} onClick={() => onPick(it.type)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/50 transition-colors text-left">
                      <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
                        <Icon className="w-4 h-4 text-foreground" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{it.label}</p>
                        <p className="text-[11px] text-muted-foreground">/{it.shortcut}</p>
                      </div>
                    </button>
                  )
                })}
              </div>
            )
          })}
          {results.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">Aucun bloc ne correspond.</p>
          )}
        </div>
      </div>
    </motion.div>
  )
}

/* ─── Helpers ────────────────────────────────────────────────── */
function makeBlock(type: SopBlockType): SopBlock {
  switch (type) {
    case 'list':
    case 'numbered':
    case 'checklist':
    case 'steps':
      return { type, items: [''] }
    case 'callout':
      return { type, variant: 'tip', title: '', text: '' }
    case 'divider':
      return { type }
    case 'image':
      return { type, image: { url: '', size: 'medium', align: 'center' } }
    case 'video':
      return { type, video: { url: '', size: 'medium', align: 'center' } }
    case 'table':
      return { type, table: { headers: ['Colonne 1', 'Colonne 2'], rows: [['', ''], ['', '']] } }
    default:
      return { type, text: '' }
  }
}
