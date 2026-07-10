/**
 * BlockEditor — inline Notion-style block editor.
 * Reuses the same SopBlock schema as the SopEditor so anything created here
 * can be rendered with SopBlocksRenderer.
 *
 *   <BlockEditor value={blocks} onChange={setBlocks} />
 *
 * Click on text to edit, press `/` on an empty block to open the slash menu,
 * hover a block to reveal move/duplicate/delete handles.
 */
import { useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, GripVertical, ChevronDown, ChevronUp,
  Type, ListOrdered, List as ListIcon, CheckSquare, MessageSquare, Code as CodeIcon,
  AlertCircle, Minus, Image as ImageIcon, Quote, Table as TableIcon,
  Layers, Upload, FileText, Video as VideoIcon, Link as LinkIcon, X,
  Repeat2,
} from 'lucide-react'
import type { SopBlock, SopBlockType } from '@/hooks/useSops'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { detectVideo } from '@/components/sop/videoEmbed'
import { parseRichPaste, shouldParseAsRichPaste } from '@/lib/parseRichPaste'

const MAX_IMAGE_MB = 10

interface BlockTypeDef {
  type:     SopBlockType
  label:    string
  icon:     React.ElementType
  shortcut: string
  group:    'text' | 'list' | 'media' | 'advanced'
}

const BLOCK_TYPES: BlockTypeDef[] = [
  { type: 'heading',   label: 'Titre H1',      icon: Type,           shortcut: 'titre',      group: 'text'     },
  { type: 'heading2',  label: 'Titre H2',      icon: Type,           shortcut: 'h2',         group: 'text'     },
  { type: 'heading3',  label: 'Titre H3',      icon: Type,           shortcut: 'h3',         group: 'text'     },
  { type: 'paragraph', label: 'Paragraphe',    icon: FileText,       shortcut: 'paragraphe', group: 'text'     },
  { type: 'quote',     label: 'Citation',      icon: Quote,          shortcut: 'citation',   group: 'text'     },
  { type: 'list',      label: 'Liste à puces', icon: ListIcon,       shortcut: 'liste',      group: 'list'     },
  { type: 'numbered',  label: 'Liste num.',    icon: ListOrdered,    shortcut: 'numerotee',  group: 'list'     },
  { type: 'checklist', label: 'Checklist',     icon: CheckSquare,    shortcut: 'checklist',  group: 'list'     },
  { type: 'steps',     label: 'Étapes',        icon: Layers,         shortcut: 'etapes',     group: 'list'     },
  { type: 'image',     label: 'Image',         icon: ImageIcon,      shortcut: 'image',      group: 'media'    },
  { type: 'video',     label: 'Vidéo (lien)',  icon: VideoIcon,      shortcut: 'video',      group: 'media'    },
  { type: 'table',     label: 'Tableau',       icon: TableIcon,      shortcut: 'tableau',    group: 'media'    },
  { type: 'callout',   label: 'Encadré',       icon: AlertCircle,    shortcut: 'callout',    group: 'advanced' },
  { type: 'template',  label: 'Template msg.', icon: MessageSquare,  shortcut: 'message',    group: 'advanced' },
  { type: 'code',      label: 'Code',          icon: CodeIcon,       shortcut: 'code',       group: 'advanced' },
  { type: 'divider',   label: 'Séparateur',    icon: Minus,          shortcut: 'separateur', group: 'advanced' },
]

const GROUP_LABELS: Record<BlockTypeDef['group'], string> = {
  text: 'Texte', list: 'Listes', media: 'Média', advanced: 'Avancé',
}

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

/** Convertit un bloc existant vers un autre type en essayant de préserver le contenu. */
function convertBlock(block: SopBlock, target: SopBlockType): SopBlock {
  if (block.type === target) return block

  const LIST_TYPES: SopBlockType[] = ['list', 'numbered', 'checklist', 'steps']
  const TEXT_TYPES: SopBlockType[] = ['heading', 'heading2', 'heading3', 'paragraph', 'quote', 'template', 'code']

  const fromItems = block.items ?? []
  const fromText  = block.text  ?? ''

  // Structures non convertibles → repartir sur un bloc neuf
  if (target === 'divider' || target === 'image' || target === 'video' || target === 'table') {
    return makeBlock(target)
  }

  // Callout : conserver texte s'il existe
  if (target === 'callout') {
    const text = LIST_TYPES.includes(block.type) ? fromItems.join('\n') : fromText
    return { type: 'callout', variant: block.variant ?? 'tip', title: block.title ?? '', text }
  }

  // Vers une liste
  if (LIST_TYPES.includes(target)) {
    let items: string[] = []
    if (LIST_TYPES.includes(block.type)) items = fromItems
    else if (fromText.trim()) items = fromText.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
    if (items.length === 0) items = ['']
    return { type: target, items }
  }

  // Vers un bloc texte
  if (TEXT_TYPES.includes(target)) {
    let text = ''
    if (LIST_TYPES.includes(block.type)) text = fromItems.join('\n')
    else if (block.type === 'callout')   text = [block.title, block.text].filter(Boolean).join(' — ')
    else                                  text = fromText
    return { type: target, text }
  }

  return makeBlock(target)
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN
═══════════════════════════════════════════════════════════════════ */
interface Props {
  value:        SopBlock[]
  onChange:     (blocks: SopBlock[]) => void
  placeholder?: string   // shown when empty
}

export default function BlockEditor({ value, onChange, placeholder = 'Commencez à écrire — tapez « / » pour insérer un bloc' }: Props) {
  const [slashOpen,  setSlashOpen]  = useState(false)
  const [slashQuery, setSlashQuery] = useState('')
  /* Where the next inserted block should go: -1 = append, else after this index */
  const [insertAt,   setInsertAt]   = useState<number>(-1)

  const filteredSlash = useMemo(() => {
    const q = slashQuery.trim().toLowerCase()
    if (!q) return BLOCK_TYPES
    return BLOCK_TYPES.filter(bt =>
      bt.label.toLowerCase().includes(q) ||
      bt.shortcut.toLowerCase().includes(q) ||
      bt.type.toLowerCase().includes(q),
    )
  }, [slashQuery])

  const addBlock = (type: SopBlockType) => {
    const newBlock = makeBlock(type)
    if (insertAt < 0) onChange([...value, newBlock])
    else {
      const next = [...value]
      next.splice(insertAt + 1, 0, newBlock)
      onChange(next)
    }
    setSlashOpen(false)
    setSlashQuery('')
  }
  const updateBlock = (idx: number, patch: Partial<SopBlock>) =>
    onChange(value.map((b, i) => i === idx ? { ...b, ...patch } : b))
  const changeBlockType = (idx: number, target: SopBlockType) =>
    onChange(value.map((b, i) => i === idx ? convertBlock(b, target) : b))
  const removeBlock = (idx: number) => onChange(value.filter((_, i) => i !== idx))
  const moveBlock = (idx: number, dir: 'up' | 'down') => {
    const j = dir === 'up' ? idx - 1 : idx + 1
    if (j < 0 || j >= value.length) return
    const next = [...value]
    ;[next[idx], next[j]] = [next[j], next[idx]]
    onChange(next)
  }
  const duplicateBlock = (idx: number) => {
    const copy = JSON.parse(JSON.stringify(value[idx])) as SopBlock
    const next = [...value]
    next.splice(idx + 1, 0, copy)
    onChange(next)
  }
  const updateItem = (blockIdx: number, itemIdx: number, val: string) => {
    onChange(value.map((b, i) => {
      if (i !== blockIdx) return b
      const items = [...(b.items ?? [])]
      items[itemIdx] = val
      return { ...b, items }
    }))
  }
  const addItem = (blockIdx: number) =>
    onChange(value.map((b, i) => i === blockIdx ? { ...b, items: [...(b.items ?? []), ''] } : b))
  const removeItem = (blockIdx: number, itemIdx: number) =>
    onChange(value.map((b, i) => {
      if (i !== blockIdx) return b
      const items = (b.items ?? []).filter((_, k) => k !== itemIdx)
      return { ...b, items }
    }))

  const openSlashAt = (idx: number) => { setInsertAt(idx); setSlashQuery(''); setSlashOpen(true) }

  /* Notion-style rich paste : intercepte le collage multi-lignes n'importe où
     dans l'éditeur, parse en blocs (titres, checklists, listes, tableaux…) et
     les insère à la suite. Un collage mono-ligne reste géré nativement par
     l'input focus, on ne préempte rien. */
  const handleRichPaste = (e: React.ClipboardEvent) => {
    const target = e.target as HTMLElement
    // Ne pas voler le collage dans les champs "table" ou dans un champ de saisie de tableau/callout etc. qui a du sens en mono-ligne.
    if (target.tagName === 'SELECT') return
    const raw = e.clipboardData?.getData('text/plain') ?? ''
    if (!shouldParseAsRichPaste(raw)) return
    const parsed = parseRichPaste(raw)
    if (parsed.length === 0) return
    e.preventDefault()
    e.stopPropagation()
    onChange([...value, ...parsed])
    toast.success(`${parsed.length} bloc${parsed.length > 1 ? 's' : ''} ajouté${parsed.length > 1 ? 's' : ''} depuis le presse-papier`)
  }

  return (
    <div className="space-y-2" onPaste={handleRichPaste}>
      <AnimatePresence>
        {value.map((blk, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
          >
            <InlineBlock
              block={blk}
              index={i}
              total={value.length}
              onUpdate={patch => updateBlock(i, patch)}
              onChangeType={t => changeBlockType(i, t)}
              onUpdateItem={(j, v) => updateItem(i, j, v)}
              onAddItem={() => addItem(i)}
              onRemoveItem={j => removeItem(i, j)}
              onMoveUp={() => moveBlock(i, 'up')}
              onMoveDown={() => moveBlock(i, 'down')}
              onRemove={() => removeBlock(i)}
              onDuplicate={() => duplicateBlock(i)}
              onSlashBelow={() => openSlashAt(i)}
            />
          </motion.div>
        ))}
      </AnimatePresence>

      {/* Footer add button (always visible) */}
      <button
        onClick={() => openSlashAt(value.length - 1)}
        className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg border-2 border-dashed border-border text-xs font-medium text-muted-foreground hover:border-blue-400 hover:text-blue-600 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all"
      >
        <Plus className="w-3.5 h-3.5" />
        {value.length === 0 ? placeholder : 'Ajouter un bloc'}
      </button>

      {/* Slash command palette */}
      {slashOpen && (
        <SlashPalette
          query={slashQuery}
          onQueryChange={setSlashQuery}
          results={filteredSlash}
          onPick={addBlock}
          onClose={() => setSlashOpen(false)}
        />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   INLINE BLOCK
═══════════════════════════════════════════════════════════════════ */
function InlineBlock({
  block, index, total,
  onUpdate, onChangeType, onUpdateItem, onAddItem, onRemoveItem,
  onMoveUp, onMoveDown, onRemove, onDuplicate, onSlashBelow,
}: {
  block:        SopBlock
  index:        number
  total:        number
  onUpdate:     (patch: Partial<SopBlock>) => void
  onChangeType: (target: SopBlockType) => void
  onUpdateItem: (idx: number, value: string) => void
  onAddItem:    () => void
  onRemoveItem: (idx: number) => void
  onMoveUp:     () => void
  onMoveDown:   () => void
  onRemove:     () => void
  onDuplicate:  () => void
  onSlashBelow: () => void
}) {
  const isSimpleList = block.type === 'list' || block.type === 'numbered' || block.type === 'checklist' || block.type === 'steps'
  const [convertOpen, setConvertOpen] = useState(false)

  /* Slash trigger when typing / on empty text input */
  const onKey = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === '/' && !(e.currentTarget.value)) {
      e.preventDefault()
      onSlashBelow()
    }
  }

  return (
    <div className="group/blk relative rounded-lg hover:bg-muted/20 transition-colors">
      {/* Hover toolbar (left) */}
      <div className="absolute -left-[104px] top-1 flex items-center gap-0.5 opacity-0 group-hover/blk:opacity-100 focus-within:opacity-100 transition-opacity">
        <button onClick={onMoveUp}   disabled={index === 0}          className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-20" title="Monter">
          <ChevronUp className="w-3.5 h-3.5" />
        </button>
        <button onClick={onMoveDown} disabled={index === total - 1}  className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-20" title="Descendre">
          <ChevronDown className="w-3.5 h-3.5" />
        </button>
        <button onClick={onSlashBelow} className="p-1 rounded text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-950/30" title="Insérer un bloc en dessous">
          <Plus className="w-3.5 h-3.5" />
        </button>
        <div className="relative">
          <button
            onClick={() => setConvertOpen(o => !o)}
            className={cn(
              'p-1 rounded text-muted-foreground hover:bg-blue-50 hover:text-blue-600 dark:hover:bg-blue-950/30',
              convertOpen && 'bg-blue-50 text-blue-600 dark:bg-blue-950/30',
            )}
            title="Convertir en…"
          >
            <Repeat2 className="w-3.5 h-3.5" />
          </button>
          {convertOpen && (
            <ConvertMenu
              currentType={block.type}
              onPick={t => { onChangeType(t); setConvertOpen(false) }}
              onClose={() => setConvertOpen(false)}
            />
          )}
        </div>
        <button onClick={onDuplicate} className="p-1 rounded text-muted-foreground hover:bg-muted" title="Dupliquer">
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <button onClick={onRemove} className="p-1 rounded text-muted-foreground hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-900/30" title="Supprimer">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="px-2 py-1.5">
        {block.type === 'divider' ? (
          <div className="my-2 h-px bg-border" />
        ) : block.type === 'image' ? (
          <ImageBlock block={block} onUpdate={onUpdate} />
        ) : block.type === 'video' ? (
          <VideoBlock block={block} onUpdate={onUpdate} />
        ) : block.type === 'table' ? (
          <TableBlock block={block} onUpdate={onUpdate} />
        ) : block.type === 'callout' ? (
          <div className="space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <select value={block.variant ?? 'tip'} onChange={e => onUpdate({ variant: e.target.value as SopBlock['variant'] })}
                className="h-8 rounded-md border border-border bg-[var(--surface-input)] px-2 text-xs">
                <option value="tip">💡 Tip</option>
                <option value="info">ℹ️ Info</option>
                <option value="warning">⚠️ Avertissement</option>
                <option value="danger">🚨 Danger</option>
                <option value="success">✅ Succès</option>
              </select>
              <AutocorrectInput value={block.title ?? ''} onChange={e => onUpdate({ title: e.target.value })} placeholder="Titre" className="h-8 text-sm" />
            </div>
            <AutocorrectTextarea value={block.text ?? ''} onChange={e => onUpdate({ text: e.target.value })} placeholder="Contenu de l'encadré…" rows={2}
              className="w-full rounded-md border border-border bg-[var(--surface-input)] px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-blue-400 resize-y" />
          </div>
        ) : isSimpleList ? (
          <div className="space-y-1">
            {(block.items ?? []).map((item, j) => (
              <div key={j} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-6 text-right select-none">
                  {block.type === 'steps' || block.type === 'numbered' ? `${j + 1}.` : block.type === 'checklist' ? '☐' : '•'}
                </span>
                <AutocorrectInput value={item} onChange={e => onUpdateItem(j, e.target.value)} onKeyDown={onKey} placeholder={`Élément ${j + 1}`} className="h-8 text-sm flex-1 border-transparent hover:border-border focus:border-blue-400 shadow-none" />
                <button onClick={() => onRemoveItem(j)} className="p-1 rounded text-muted-foreground hover:text-rose-600 opacity-0 group-hover/blk:opacity-100 transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button onClick={onAddItem} className="inline-flex items-center gap-1 ml-8 px-1.5 py-0.5 rounded text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30 transition-colors">
              <Plus className="w-3 h-3" /> Ajouter
            </button>
          </div>
        ) : block.type === 'heading' || block.type === 'heading2' || block.type === 'heading3' ? (
          <AutocorrectInput value={block.text ?? ''} onChange={e => onUpdate({ text: e.target.value })} onKeyDown={onKey}
            placeholder={block.type === 'heading' ? 'Titre' : block.type === 'heading2' ? 'Sous-titre' : 'Titre 3'}
            className={cn('font-bold border-transparent hover:border-border focus:border-blue-400 shadow-none',
              block.type === 'heading' ? 'text-2xl h-12' : block.type === 'heading2' ? 'text-xl h-10' : 'text-base h-9')} />
        ) : block.type === 'quote' ? (
          <AutocorrectTextarea value={block.text ?? ''} onChange={e => onUpdate({ text: e.target.value })} placeholder="« Citation »" rows={2}
            className="w-full rounded-md border-l-4 border-blue-500 bg-muted/40 px-3 py-1.5 text-sm italic placeholder:text-muted-foreground focus:outline-none focus:border-blue-400 resize-y" />
        ) : block.type === 'template' || block.type === 'code' ? (
          <textarea value={block.text ?? ''} onChange={e => onUpdate({ text: e.target.value })} onKeyDown={onKey}
            placeholder={
              block.type === 'template' ? 'Template avec variables — ex: Bonjour {{prenom}}…' :
              'Code (affiché en monospace)'
            }
            rows={4}
            className="w-full rounded-md border border-transparent hover:border-border bg-transparent hover:bg-[var(--surface-input)] focus:bg-[var(--surface-input)] focus:border-blue-400 px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none resize-y font-mono text-[13px]" />
        ) : (
          <AutocorrectTextarea value={block.text ?? ''} onChange={e => onUpdate({ text: e.target.value })} onKeyDown={onKey}
            placeholder="Texte… utilisez **gras**, *italique*, [lien](url)"
            rows={2}
            className="w-full rounded-md border border-transparent hover:border-border bg-transparent hover:bg-[var(--surface-input)] focus:bg-[var(--surface-input)] focus:border-blue-400 px-2.5 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none resize-y" />
        )}
      </div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   IMAGE BLOCK (data: URL upload)
═══════════════════════════════════════════════════════════════════ */
function ImageBlock({ block, onUpdate }: { block: SopBlock; onUpdate: (patch: Partial<SopBlock>) => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const meta = block.image ?? { url: '' }

  const onFile = (file: File | null | undefined) => {
    if (!file) return
    if (file.size > MAX_IMAGE_MB * 1024 * 1024) { toast.error(`Image trop volumineuse (max ${MAX_IMAGE_MB} Mo)`); return }
    if (!/^image\/(png|jpe?g|gif|webp|svg\+xml)$/.test(file.type)) { toast.error('Format non supporté'); return }
    const reader = new FileReader()
    reader.onload = () => onUpdate({ image: { ...meta, url: String(reader.result || '') } })
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-1.5">
      {meta.url ? (
        <img src={meta.url} alt={meta.caption || ''} className="max-w-full rounded-lg border border-border" />
      ) : (
        <button onClick={() => fileRef.current?.click()}
          className="w-full flex flex-col items-center justify-center gap-1.5 p-4 rounded-lg border-2 border-dashed border-border hover:border-blue-400 hover:bg-blue-50/30 dark:hover:bg-blue-950/20 transition-all">
          <Upload className="w-5 h-5 text-muted-foreground" />
          <p className="text-xs text-muted-foreground">Cliquez pour téléverser une image (max {MAX_IMAGE_MB} Mo)</p>
        </button>
      )}
      <input type="file" ref={fileRef} hidden accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml" onChange={e => onFile(e.target.files?.[0])} />
      {meta.url && (
        <AutocorrectInput value={meta.caption ?? ''} onChange={e => onUpdate({ image: { ...meta, caption: e.target.value } })} placeholder="Légende (optionnel)" className="h-7 text-xs" />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   VIDEO BLOCK
═══════════════════════════════════════════════════════════════════ */
function VideoBlock({ block, onUpdate }: { block: SopBlock; onUpdate: (patch: Partial<SopBlock>) => void }) {
  const meta = block.video ?? { url: '' }
  const info = detectVideo(meta.url)
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <LinkIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
        <Input value={meta.url} onChange={e => onUpdate({ video: { ...meta, url: e.target.value } })}
          placeholder="https://youtube.com/… ou https://vimeo.com/… ou .mp4" className="h-8 pl-7 text-xs" />
      </div>
      {info.embedUrl && (
        <div className="aspect-video w-full rounded-lg overflow-hidden border border-border bg-black">
          {info.kind === 'file'
            ? <video src={info.embedUrl} controls className="w-full h-full" />
            : <iframe src={info.embedUrl} className="w-full h-full" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen title="Vidéo" />}
        </div>
      )}
      {meta.url && (
        <AutocorrectInput value={meta.caption ?? ''} onChange={e => onUpdate({ video: { ...meta, caption: e.target.value } })} placeholder="Légende (optionnel)" className="h-7 text-xs" />
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   TABLE BLOCK
═══════════════════════════════════════════════════════════════════ */
function TableBlock({ block, onUpdate }: { block: SopBlock; onUpdate: (patch: Partial<SopBlock>) => void }) {
  const t = block.table ?? { headers: ['Colonne 1', 'Colonne 2'], rows: [['', '']] }
  const setHeader = (i: number, v: string) => { const h = [...t.headers]; h[i] = v; onUpdate({ table: { ...t, headers: h } }) }
  const setCell = (r: number, c: number, v: string) => { const rows = t.rows.map(row => [...row]); rows[r][c] = v; onUpdate({ table: { ...t, rows } }) }
  const addRow = () => onUpdate({ table: { ...t, rows: [...t.rows, t.headers.map(() => '')] } })
  const addCol = () => onUpdate({ table: { headers: [...t.headers, `Colonne ${t.headers.length + 1}`], rows: t.rows.map(r => [...r, '']) } })
  const removeRow = (r: number) => onUpdate({ table: { ...t, rows: t.rows.filter((_, i) => i !== r) } })
  const removeCol = (c: number) => onUpdate({ table: { headers: t.headers.filter((_, i) => i !== c), rows: t.rows.map(r => r.filter((_, i) => i !== c)) } })

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr>
            {t.headers.map((h, i) => (
              <th key={i} className="border border-border p-0.5 bg-muted/30">
                <div className="flex items-center gap-1">
                  <AutocorrectInput value={h} onChange={e => setHeader(i, e.target.value)} className="h-6 text-xs font-semibold border-transparent shadow-none" />
                  <button onClick={() => removeCol(i)} className="p-0.5 text-muted-foreground hover:text-rose-500"><X className="w-3 h-3" /></button>
                </div>
              </th>
            ))}
            <th className="border border-border p-0.5 bg-muted/30 w-8">
              <button onClick={addCol} className="p-0.5 text-blue-500"><Plus className="w-3 h-3" /></button>
            </th>
          </tr>
        </thead>
        <tbody>
          {t.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, c) => (
                <td key={c} className="border border-border p-0.5">
                  <AutocorrectInput value={cell} onChange={e => setCell(r, c, e.target.value)} className="h-6 text-xs border-transparent shadow-none" />
                </td>
              ))}
              <td className="border border-border p-0.5 w-8">
                <button onClick={() => removeRow(r)} className="p-0.5 text-muted-foreground hover:text-rose-500"><Trash2 className="w-3 h-3" /></button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button onClick={addRow} className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-[11px] font-medium text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/30">
        <Plus className="w-3 h-3" /> Ligne
      </button>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════
   SLASH PALETTE
═══════════════════════════════════════════════════════════════════ */
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

/* ═══════════════════════════════════════════════════════════════════
   CONVERT MENU (per block – "Turn into")
═══════════════════════════════════════════════════════════════════ */
function ConvertMenu({
  currentType, onPick, onClose,
}: {
  currentType: SopBlockType
  onPick:      (t: SopBlockType) => void
  onClose:     () => void
}) {
  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: -4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.12 }}
        className="absolute z-50 left-full ml-1 top-0 w-56 max-h-[320px] overflow-y-auto rounded-lg border border-border bg-background shadow-xl py-1"
      >
        <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground border-b border-border">
          Convertir en…
        </p>
        {(['text', 'list', 'media', 'advanced'] as const).map(group => {
          const items = BLOCK_TYPES.filter(bt => bt.group === group)
          return (
            <div key={group}>
              <p className="px-3 pt-1.5 pb-0.5 text-[9px] font-bold uppercase tracking-wider text-muted-foreground/70">{GROUP_LABELS[group]}</p>
              {items.map(it => {
                const Icon = it.icon
                const active = it.type === currentType
                return (
                  <button
                    key={it.type}
                    onClick={() => onPick(it.type)}
                    disabled={active}
                    className={cn(
                      'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors',
                      active
                        ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/30 cursor-default'
                        : 'hover:bg-muted/50 text-foreground',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1 truncate">{it.label}</span>
                    {active && <span className="text-[10px] text-blue-600">actuel</span>}
                  </button>
                )
              })}
            </div>
          )
        })}
      </motion.div>
    </>
  )
}
