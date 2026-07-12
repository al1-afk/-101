/**
 * StepAttachments — pièces jointes scopées à une étape SOP.
 *
 * Comportement :
 *   • CMD+V / CTRL+V colle directement l'image du presse-papier (aucun sélecteur)
 *   • Drag & drop d'images / PDF / vidéos
 *   • Persistance localStorage sous la clé `sop-medias:{taskId}:{etapeIdx}`
 *   • Un item = { id, kind, name, url (data URL), size, addedAt }
 *   • Rendu inline : images en grille, vidéos avec <video>, PDF/files en carte téléchargeable
 *
 * Utilisé au bas de chaque étape par TaskSopViewer.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ImagePlus, FileText, Film, Paperclip, X, Download, Copy, Check,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

type MediaKind = 'image' | 'video' | 'file'

interface StepMedia {
  id:       string
  kind:     MediaKind
  name:     string
  url:      string          // data URL (base64) ou blob URL
  mimeType: string
  size:     number          // bytes
  addedAt:  string          // ISO
}

const MAX_TOTAL_BYTES = 25 * 1024 * 1024   // 25 MB par étape en localStorage
const IMAGE_MIMES = /^image\/(png|jpe?g|gif|webp|svg\+xml|bmp)$/
const VIDEO_MIMES = /^video\//
const PDF_MIME    = 'application/pdf'

function keyFor(taskId: string, etapeIdx: number) {
  return `sop-medias:${taskId}:${etapeIdx}`
}

function readStorage(taskId: string, etapeIdx: number): StepMedia[] {
  try {
    const raw = localStorage.getItem(keyFor(taskId, etapeIdx))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function writeStorage(taskId: string, etapeIdx: number, items: StepMedia[]) {
  try { localStorage.setItem(keyFor(taskId, etapeIdx), JSON.stringify(items)) }
  catch (e: any) {
    if (String(e?.name || e).includes('Quota')) {
      toast.error('Espace de stockage saturé — supprime des pièces jointes ou utilise des images plus légères.')
    }
  }
}

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload  = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

function detectKind(mime: string): MediaKind | null {
  if (IMAGE_MIMES.test(mime)) return 'image'
  if (VIDEO_MIMES.test(mime)) return 'video'
  if (mime === PDF_MIME || mime.startsWith('application/') || mime.startsWith('text/')) return 'file'
  return null
}

function humanSize(n: number) {
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} Ko`
  return `${(n / (1024 * 1024)).toFixed(1)} Mo`
}

interface Props {
  taskId:    string
  etapeIdx:  number
  etapeTitle:string
}

export default function StepAttachments({ taskId, etapeIdx, etapeTitle }: Props) {
  const [items, setItems] = useState<StepMedia[]>(() => readStorage(taskId, etapeIdx))
  const [dragging, setDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setItems(readStorage(taskId, etapeIdx)) }, [taskId, etapeIdx])

  const persist = useCallback((next: StepMedia[]) => {
    setItems(next)
    writeStorage(taskId, etapeIdx, next)
  }, [taskId, etapeIdx])

  const addFiles = useCallback(async (files: File[] | FileList) => {
    const arr = Array.from(files)
    if (arr.length === 0) return
    const currentBytes = items.reduce((s, m) => s + m.size, 0)
    const additions: StepMedia[] = []
    let added = 0
    let skipped = 0
    for (const file of arr) {
      const kind = detectKind(file.type)
      if (!kind) { skipped++; continue }
      if (currentBytes + additions.reduce((s, m) => s + m.size, 0) + file.size > MAX_TOTAL_BYTES) {
        toast.error(`Limite 25 Mo par étape atteinte — « ${file.name} » ignoré.`)
        skipped++
        continue
      }
      const url = await fileToDataUrl(file)
      additions.push({
        id:       crypto.randomUUID(),
        kind,
        name:     file.name || `capture-${Date.now()}.${kind === 'image' ? 'png' : 'bin'}`,
        url,
        mimeType: file.type,
        size:     file.size,
        addedAt:  new Date().toISOString(),
      })
      added++
    }
    if (additions.length > 0) {
      persist([...items, ...additions])
      toast.success(`${added} pièce${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}${skipped ? ` (${skipped} ignoré${skipped > 1 ? 's' : ''})` : ''}`)
    } else if (skipped > 0) {
      toast.error('Aucun fichier accepté (images, PDF ou vidéos uniquement)')
    }
  }, [items, persist])

  /* --- Paste CMD+V / CTRL+V --- */
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onPaste = (e: ClipboardEvent) => {
      const dt = e.clipboardData
      if (!dt) return
      const files: File[] = []
      for (let i = 0; i < dt.items.length; i++) {
        const it = dt.items[i]
        if (it.kind === 'file') {
          const f = it.getAsFile()
          if (f) files.push(f)
        }
      }
      if (files.length > 0) {
        e.preventDefault()
        addFiles(files)
      }
    }
    el.addEventListener('paste', onPaste)
    return () => el.removeEventListener('paste', onPaste)
  }, [addFiles])

  /* --- Drag & drop --- */
  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
  }
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer?.files?.length) addFiles(e.dataTransfer.files)
  }

  const remove = (id: string) => {
    persist(items.filter(m => m.id !== id))
  }

  const copyImage = async (m: StepMedia) => {
    try {
      if (!m.url.startsWith('data:')) { toast.error('Format non copiable'); return }
      const blob = await (await fetch(m.url)).blob()
      // ClipboardItem API (Chrome, Safari, Edge)
      if ('ClipboardItem' in window) {
        await (navigator.clipboard as any).write([new (window as any).ClipboardItem({ [blob.type]: blob })])
        toast.success('Image copiée dans le presse-papier')
      } else {
        toast.error('Copie image non supportée par ce navigateur')
      }
    } catch { toast.error('Copie impossible') }
  }

  const totalBytes = items.reduce((s, m) => s + m.size, 0)

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'mt-3 rounded-xl border border-dashed transition-colors outline-none',
        dragging
          ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/30 ring-2 ring-blue-500/20'
          : 'border-border bg-muted/20 focus-within:border-blue-300 focus-within:bg-blue-50/20 dark:focus-within:bg-blue-950/10',
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border/50">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Paperclip className="w-3.5 h-3.5" />
          Pièces jointes de l'étape
          {items.length > 0 && (
            <span className="text-[10px] font-mono">
              · {items.length} · {humanSize(totalBytes)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-blue-600 hover:bg-blue-100 dark:hover:bg-blue-950/50"
          >
            <ImagePlus className="w-3.5 h-3.5" /> Ajouter
          </button>
        </div>
      </div>

      {/* Zone vide — guide utilisateur */}
      {items.length === 0 && (
        <div className="px-3 py-6 text-center text-[11.5px] text-muted-foreground leading-relaxed">
          <p>
            📎 Colle une capture d'écran (<kbd className="px-1.5 py-0.5 rounded bg-background border border-border text-[10px] font-mono">⌘V</kbd> Mac ·{' '}
            <kbd className="px-1.5 py-0.5 rounded bg-background border border-border text-[10px] font-mono">Ctrl+V</kbd> Windows) ou glisse-dépose une image, un PDF, une vidéo.
          </p>
          <p className="mt-1 text-muted-foreground/70">
            Les pièces jointes restent liées à l'étape « <span className="font-medium">{etapeTitle}</span> ».
          </p>
        </div>
      )}

      {/* Grille des médias */}
      {items.length > 0 && (
        <div className="p-3 grid grid-cols-2 md:grid-cols-3 gap-2">
          {items.map(m => (
            <MediaTile key={m.id} media={m} onRemove={() => remove(m.id)} onCopy={() => copyImage(m)} />
          ))}
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*,video/*,application/pdf"
        className="hidden"
        onChange={e => {
          if (e.target.files) addFiles(e.target.files)
          if (fileInputRef.current) fileInputRef.current.value = ''
        }}
      />
    </div>
  )
}

function MediaTile({ media, onRemove, onCopy }: { media: StepMedia; onRemove: () => void; onCopy: () => void }) {
  const [copied, setCopied] = useState(false)
  const doCopy = async () => { await onCopy(); setCopied(true); setTimeout(() => setCopied(false), 1500) }

  return (
    <div className="group relative rounded-lg border border-border bg-background overflow-hidden">
      {media.kind === 'image' && (
        <img src={media.url} alt={media.name} className="w-full aspect-video object-cover" />
      )}
      {media.kind === 'video' && (
        <video src={media.url} controls className="w-full aspect-video object-cover bg-black" />
      )}
      {media.kind === 'file' && (
        <div className="w-full aspect-video flex flex-col items-center justify-center gap-1 bg-slate-50 dark:bg-slate-900 text-slate-500">
          {media.mimeType === PDF_MIME ? <FileText className="w-8 h-8" /> : <Film className="w-8 h-8" />}
          <span className="text-[10px] font-mono uppercase">{media.mimeType.split('/')[1] || 'file'}</span>
        </div>
      )}
      <div className="px-2 py-1.5 text-[11px] truncate flex items-center justify-between gap-1 border-t border-border/50">
        <span className="truncate text-foreground/80" title={media.name}>{media.name}</span>
        <span className="text-[10px] text-muted-foreground font-mono flex-shrink-0">{humanSize(media.size)}</span>
      </div>
      {/* Actions overlay */}
      <div className="absolute top-1 right-1 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {media.kind === 'image' && (
          <button
            type="button"
            onClick={doCopy}
            title="Copier l'image"
            className="p-1 rounded bg-background/90 border border-border hover:bg-blue-500 hover:text-white hover:border-blue-500"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          </button>
        )}
        <a
          href={media.url}
          download={media.name}
          title="Télécharger"
          className="p-1 rounded bg-background/90 border border-border hover:bg-slate-800 hover:text-white hover:border-slate-800"
        >
          <Download className="w-3 h-3" />
        </a>
        <button
          type="button"
          onClick={onRemove}
          title="Supprimer"
          className="p-1 rounded bg-background/90 border border-border hover:bg-rose-500 hover:text-white hover:border-rose-500"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}
