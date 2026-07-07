import { useState, useMemo, useRef, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import DOMPurify from 'dompurify'
import {
  Plus, Search, Download, FileText, Loader2, Edit2, Trash2,
  ChevronRight, ChevronLeft, Check, Building2, Phone, Mail,
  MapPin, X, ToggleLeft, ToggleRight, PenLine, AlertTriangle, Eye,
  AlignLeft, List as ListIcon, Receipt,
  Bold, Italic, Underline, AlignCenter, AlignRight,
  ListOrdered, IndentIncrease, IndentDecrease, Eraser, Strikethrough,
  BookMarked, Save, Package, Send,
} from 'lucide-react'
import { useDevis, useCreateDevis, useUpdateDevis, useDeleteDevis, type Devis } from '@/hooks/useDevis'
import { useClients, useCreateClient, type Client } from '@/hooks/useClients'
import { useCreateFacture, useFactures } from '@/hooks/useFactures'
import { produitsApi } from '@/lib/api'
import { Button }  from '@/components/ui/button'
import { Input }   from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Badge }   from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate, getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import { generateDevisPDFWithRetry } from '@/lib/generateDevisPDF'
import { generateDevisPDFBlob }     from '@/lib/generateDevisPDFBlob'
import { SendDocumentDialog }       from '@/components/SendDocumentDialog'
import DevisTemplate from '@/components/devis/DevisTemplate'
import DevisActions, { buildPdfFilename } from '@/components/devis/DevisActions'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { devisSchema } from '@/lib/importExportSchemas'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'

/* ─── Types ───────────────────────────────────────────────────────── */
export type BlockType = 'title' | 'paragraph' | 'list'

export interface DescriptionBlock {
  id:      string
  type:    BlockType
  content: string   // for list: \n-separated items
}

export interface Prestation {
  id:              string
  titre:           string
  description:     DescriptionBlock[]
  quantite:        number
  prix_unitaire:   number
  showQuantite?:   boolean
  showPrixUnit?:   boolean
}

export interface BankInfo { banque: string; iban: string; swift: string }

export type Currency = 'MAD' | 'EUR' | 'USD' | 'GBP'

export const CURRENCY_SYMBOL: Record<Currency, string> = {
  MAD: 'MAD', EUR: '€', USD: '$', GBP: '£',
}

/* ─── Notes JSON structure ─────────────────────────────────────────── */
export type DevisTemplateKind = 'default' | 'simple' | 'offer' | 'executive'

export interface DevisNotesData {
  prestations: Omit<Prestation, 'id'>[]
  conditions:  string[]
  bankInfo:    BankInfo
  signature?:  string | null
  /* International invoice extensions (optional → backward compatible) */
  isInternational?: boolean
  currency?:        Currency
  bilingual?:       boolean    // FR + EN labels on the PDF
  /* Template & ICE client — utilisés par les modèles alternatifs. */
  template?:        DevisTemplateKind
  clientIce?:       string
}

export const DEFAULT_BANK: BankInfo = { banque: 'CIH', iban: '230 570 6435881221008400 29', swift: 'CIHMMAMC' }

export function parseDevisNotes(notes: string | null): DevisNotesData {
  if (!notes) return { prestations: [], conditions: [], bankInfo: DEFAULT_BANK }
  try {
    const d = JSON.parse(notes) as DevisNotesData
    if (d.conditions && d.bankInfo) {
      return { currency: 'MAD', isInternational: false, bilingual: false, ...d }
    }
    throw new Error('legacy')
  } catch {
    // Legacy format: bullet conditions + bank line
    const lines = notes.split('\n').filter(Boolean)
    const conditions = lines.filter(l => l.startsWith('•')).map(l => l.replace(/^•\s*/, ''))
    const bl = lines.find(l => l.startsWith('Banque:'))
    let bankInfo = DEFAULT_BANK
    if (bl) {
      const parts = bl.split(' | ')
      bankInfo = {
        banque: parts[0]?.replace('Banque:', '').trim() ?? '',
        iban:   parts[1]?.replace('IBAN:', '').trim() ?? '',
        swift:  parts[2]?.replace('SWIFT:', '').trim() ?? '',
      }
    }
    return { prestations: [], conditions, bankInfo }
  }
}

/* ─── Statut config ───────────────────────────────────────────────── */
const STATUT_CONFIG = {
  brouillon: { label: 'Brouillon', color: 'text-muted-foreground',                    bg: 'bg-muted'                              },
  envoye:    { label: 'Envoyé',    color: 'text-blue-600 dark:text-blue-400',          bg: 'bg-blue-50 dark:bg-blue-500/15'        },
  accepte:   { label: 'Accepté',   color: 'text-emerald-600 dark:text-emerald-400',    bg: 'bg-emerald-50 dark:bg-emerald-500/15'  },
  refuse:    { label: 'Refusé',    color: 'text-red-600 dark:text-red-400',            bg: 'bg-red-50 dark:bg-red-500/15'          },
  expire:    { label: 'Expiré',    color: 'text-amber-600 dark:text-amber-400',        bg: 'bg-amber-50 dark:bg-amber-500/15'      },
}

/* ─── Step indicator ──────────────────────────────────────────────── */
export function StepBar({ step, labels = ['Client', 'Devis'] }: { step: number; labels?: [string, string] }) {
  const steps = labels
  return (
    <div className="flex items-center gap-0 mb-6">
      {steps.map((label, i) => {
        const n    = i + 1
        const done = step > n
        const cur  = step === n
        return (
          <div key={n} className="flex items-center flex-1 last:flex-none">
            <div className="flex items-center gap-2">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all ${
                done ? 'bg-emerald-500 text-white' :
                cur  ? 'bg-blue-600 text-white ring-4 ring-blue-600/20' :
                       'bg-muted text-muted-foreground'
              }`}>
                {done ? <Check className="w-3.5 h-3.5" /> : n}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${cur ? 'text-foreground' : 'text-muted-foreground'}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`flex-1 h-px mx-3 transition-colors ${step > n ? 'bg-emerald-500' : 'bg-border'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── uid helper ───────────────────────────────────────────────────── */
function uid() { return String(Date.now()) + String(Math.random()).slice(2, 7) }

/* ─── Description block renderer (shared edit/preview/PDF) ───────── */
export function DescriptionPreview({
  blocks, compact = false,
}: { blocks: DescriptionBlock[]; compact?: boolean }) {
  if (!blocks.length) return null
  return (
    <div className={compact ? 'space-y-1.5' : 'space-y-2.5'}>
      {blocks.map(b => (
        <div key={b.id}>
          {b.type === 'title' && (
            <p className={`font-bold text-foreground ${compact ? 'text-xs' : 'text-sm'}`}>{b.content}</p>
          )}
          {b.type === 'paragraph' && (
            <p className={`text-muted-foreground leading-relaxed ${compact ? 'text-[11px]' : 'text-sm'}`}>
              {b.content}
            </p>
          )}
          {b.type === 'list' && (
            <ul className="space-y-0.5">
              {b.content.split('\n').filter(Boolean).map((item, i) => (
                <li key={i} className={`flex items-start gap-2 text-muted-foreground ${compact ? 'text-[11px]' : 'text-sm'}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0 mt-1.5" />
                  {item}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}

/* ─── helpers: blocks ↔ html ──────────────────────────────────────── */
/* Allow only the inline tags the editor toolbar can produce. No <script>,
   no event handlers, no javascript: URLs — DOMPurify enforces this. */
const SANITIZE_OPTS = {
  ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'u', 's', 'br', 'ul', 'ol', 'li', 'div', 'span', 'p'],
  ALLOWED_ATTR: ['style'],
}

export function sanitizeDescription(html: string): string {
  return DOMPurify.sanitize(html, SANITIZE_OPTS)
}

function blocksToHtml(blocks: DescriptionBlock[]): string {
  return blocks.map(b => {
    if (b.type === 'list') {
      const items = b.content.split('\n').filter(Boolean)
      return `<ul>${items.map(i => `<li>${sanitizeDescription(i)}</li>`).join('')}</ul>`
    }
    return sanitizeDescription(b.content)
  }).join('')
}
function htmlToBlocks(html: string): DescriptionBlock[] {
  if (!html.trim() || html === '<br>') return []
  return [{ id: uid(), type: 'paragraph', content: sanitizeDescription(html) }]
}

/* ─── Description editor with toolbar ────────────────────────────── */
export function DescriptionEditor({
  value, onChange,
}: {
  value:    DescriptionBlock[]
  onChange: (v: DescriptionBlock[]) => void
}) {
  const editorRef   = useRef<HTMLDivElement>(null)
  const inited      = useRef(false)
  const savedRange  = useRef<Range | null>(null)

  // Seed innerHTML once on mount
  useEffect(() => {
    if (!inited.current && editorRef.current) {
      editorRef.current.innerHTML = blocksToHtml(value)
      inited.current = true
    }
  }, []) // eslint-disable-line

  const [fmt, setFmt] = useState({
    bold: false, italic: false, underline: false, strikethrough: false,
    justifyLeft: true, justifyCenter: false, justifyRight: false,
  })

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedRange.current = sel.getRangeAt(0).cloneRange()
    }
    try {
      setFmt({
        bold:          document.queryCommandState('bold'),
        italic:        document.queryCommandState('italic'),
        underline:     document.queryCommandState('underline'),
        strikethrough: document.queryCommandState('strikeThrough'),
        justifyLeft:   document.queryCommandState('justifyLeft'),
        justifyCenter: document.queryCommandState('justifyCenter'),
        justifyRight:  document.queryCommandState('justifyRight'),
      })
    } catch {}
  }

  const applyCmd = (cmd: string) => {
    // Restore focus + selection before execCommand
    editorRef.current?.focus()
    const sel = window.getSelection()
    if (sel && savedRange.current) {
      sel.removeAllRanges()
      sel.addRange(savedRange.current)
    }
    document.execCommand(cmd, false)
    saveSelection()
  }

  type TBtn = { icon: React.ElementType; cmd: string; title: string; key?: keyof typeof fmt }
  const groups: TBtn[][] = [
    [
      { icon: Bold,          cmd: 'bold',                title: 'Gras',          key: 'bold'          },
      { icon: Italic,        cmd: 'italic',              title: 'Italique',      key: 'italic'        },
      { icon: Underline,     cmd: 'underline',           title: 'Souligné',      key: 'underline'     },
      { icon: Strikethrough, cmd: 'strikeThrough',       title: 'Barré',         key: 'strikethrough' },
    ],
    [
      { icon: AlignLeft,     cmd: 'justifyLeft',         title: 'Gauche',        key: 'justifyLeft'   },
      { icon: AlignCenter,   cmd: 'justifyCenter',       title: 'Centrer',       key: 'justifyCenter' },
      { icon: AlignRight,    cmd: 'justifyRight',        title: 'Droite',        key: 'justifyRight'  },
    ],
    [
      { icon: ListIcon,      cmd: 'insertUnorderedList', title: 'Liste à puces'  },
      { icon: ListOrdered,   cmd: 'insertOrderedList',   title: 'Liste numérotée'},
    ],
    [
      { icon: IndentIncrease,cmd: 'indent',              title: 'Indenter'       },
      { icon: IndentDecrease,cmd: 'outdent',             title: 'Désindenter'    },
    ],
    [
      { icon: Eraser,        cmd: 'removeFormat',        title: 'Effacer format' },
    ],
  ]

  return (
    <div className="rounded-lg border border-border overflow-hidden focus-within:border-blue-600/60 focus-within:ring-1 focus-within:ring-blue-600/20 transition-colors">
      {/* Toolbar */}
      <div className="flex items-center flex-nowrap gap-0.5 px-2 py-1.5 bg-muted/30 border-b border-border overflow-x-auto">
        {groups.map((group, gi) => (
          <span key={gi} className="flex items-center gap-0.5">
            {gi > 0 && <span className="w-px h-4 bg-border mx-1 inline-block flex-shrink-0" />}
            {group.map(({ icon: Icon, cmd, title, key }) => {
              const active = !!(key && fmt[key])
              return (
                <button
                  key={cmd}
                  type="button"
                  onMouseDown={e => { e.preventDefault(); applyCmd(cmd) }}
                  title={title}
                  className={`w-6 h-6 flex items-center justify-center rounded transition-colors ${
                    active
                      ? 'bg-blue-600/20 text-blue-600 dark:text-blue-400 ring-1 ring-blue-600/30'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <Icon className="w-3 h-3" />
                </button>
              )
            })}
          </span>
        ))}
      </div>

      {/* ContentEditable area */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        onInput={e  => onChange(htmlToBlocks(e.currentTarget.innerHTML))}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onSelect={saveSelection}
        data-placeholder="Description de la prestation (optionnel)..."
        className={[
          'min-h-[72px] px-3 py-2 text-sm text-foreground outline-none leading-relaxed',
          'empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40 empty:before:pointer-events-none',
          '[&_strong]:font-bold [&_em]:italic [&_u]:underline [&_s]:line-through',
          '[&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4',
        ].join(' ')}
      />
    </div>
  )
}

/* ─── Saved prestation (Produit) type ──────────────────────────────── */
interface SavedPrestation {
  id:           string
  nom:          string
  description:  string
  prix_ht:      number
  tva:          number
  unite:        string
}

/* ─── Prestation row ──────────────────────────────────────────────── */
export function PrestationRow({
  p, onChange, onDelete,
}: {
  p: Prestation
  onChange: (id: string, field: keyof Prestation, val: string | number | DescriptionBlock[]) => void
  onDelete: (id: string) => void
}) {
  const showQty  = p.showQuantite ?? true
  const showPrix = p.showPrixUnit ?? true
  const total    = showQty ? p.quantite * p.prix_unitaire : p.prix_unitaire

  /* ── Saved prestations library ── */
  const qc = useQueryClient()
  const { data: savedList = [] } = useQuery<SavedPrestation[]>({
    queryKey: ['produits'],
    queryFn:  () => produitsApi.list({ orderBy: 'nom', order: 'asc' }) as Promise<SavedPrestation[]>,
    staleTime: 1000 * 60 * 5,
  })

  const saveMutation = useMutation({
    mutationFn: (data: Omit<SavedPrestation, 'id'>) => produitsApi.create(data) as Promise<SavedPrestation>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['produits'] })
      toast.success('Prestation enregistrée')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur lors de l\'enregistrement'),
  })

  const [libOpen,    setLibOpen]    = useState(false)
  const [librarySearch, setLibrarySearch] = useState('')
  const libRef = useRef<HTMLDivElement>(null)

  /* Close picker on outside click */
  useEffect(() => {
    if (!libOpen) return
    const onClick = (e: MouseEvent) => {
      if (libRef.current && !libRef.current.contains(e.target as Node)) setLibOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [libOpen])

  const filteredSaved = useMemo(() => {
    const q = librarySearch.trim().toLowerCase()
    if (!q) return savedList
    return savedList.filter(s =>
      s.nom.toLowerCase().includes(q) ||
      (s.description ?? '').toLowerCase().includes(q)
    )
  }, [savedList, librarySearch])

  const applySaved = (s: SavedPrestation) => {
    onChange(p.id, 'titre',         s.nom)
    onChange(p.id, 'prix_unitaire', s.prix_ht)
    /* Convert the produit's plain-text description to a paragraph
       block — preserves what the user wrote in the catalog. */
    onChange(p.id, 'description', s.description
      ? [{ id: String(Date.now()), type: 'paragraph', content: s.description }]
      : []
    )
    setLibOpen(false)
    setLibrarySearch('')
  }

  const saveCurrent = () => {
    if (!p.titre.trim()) {
      toast.error('Donnez un titre avant d\'enregistrer')
      return
    }
    /* Strip HTML from description blocks for plain-text storage */
    const desc = p.description
      .map(b => b.content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('\n')
    saveMutation.mutate({
      nom:         p.titre.trim(),
      description: desc,
      prix_ht:     p.prix_unitaire,
      tva:         20,
      unite:       'projet',
    })
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -16 }}
      className="rounded-xl border border-border bg-muted/20 p-4 space-y-3"
    >
      {/* Titre + library + save */}
      <div className="flex items-start gap-2">
        <div className="flex-1 relative" ref={libRef}>
          <AutocorrectInput
            value={p.titre}
            onChange={e => onChange(p.id, 'titre', e.target.value)}
            placeholder="Titre de la prestation..."
            className="text-sm font-medium pr-9"
          />
          {/* Library picker trigger inside input */}
          <button
            type="button"
            onClick={() => setLibOpen(v => !v)}
            title={savedList.length > 0
              ? `Choisir parmi ${savedList.length} prestation(s) enregistrée(s)`
              : 'Aucune prestation enregistrée pour le moment'}
            className={`absolute right-1.5 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md transition-colors ${
              libOpen
                ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                : 'text-muted-foreground hover:bg-muted hover:text-blue-600'
            }`}
          >
            <BookMarked className="w-3.5 h-3.5" />
          </button>

          {/* Picker dropdown */}
          {libOpen && (
            <div className="absolute z-30 top-full left-0 right-0 mt-1.5 rounded-xl border border-border bg-popover shadow-lg overflow-hidden">
              <div className="p-2 border-b border-border">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                  <Input
                    value={librarySearch}
                    onChange={e => setLibrarySearch(e.target.value)}
                    placeholder="Rechercher une prestation..."
                    className="pl-8 h-8 text-xs"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-56 overflow-y-auto">
                {filteredSaved.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-muted-foreground">
                    <Package className="w-5 h-5 mx-auto mb-1.5 opacity-40" />
                    {savedList.length === 0
                      ? 'Aucune prestation enregistrée. Créez-en une via le bouton 💾'
                      : 'Aucun résultat'}
                  </div>
                ) : (
                  filteredSaved.map(s => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => applySaved(s)}
                      className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-muted/60 transition-colors group"
                    >
                      <div className="w-7 h-7 rounded-md bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Package className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-foreground truncate">{s.nom}</p>
                        {s.description && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">{s.description}</p>
                        )}
                      </div>
                      <span className="text-[11px] font-mono font-semibold text-foreground flex-shrink-0 mt-0.5">
                        {s.prix_ht.toLocaleString('fr-FR')} MAD
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Save current as library entry */}
        <button
          type="button"
          onClick={saveCurrent}
          disabled={!p.titre.trim() || saveMutation.isPending}
          title="Enregistrer cette prestation dans la bibliothèque"
          className="w-8 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-emerald-600 hover:bg-emerald-500/10 transition-colors flex-shrink-0 disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
        >
          {saveMutation.isPending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Save className="w-4 h-4" />}
        </button>

        <button
          onClick={() => onDelete(p.id)}
          className="w-8 h-9 flex items-center justify-center rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors flex-shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Description */}
      <DescriptionEditor
        value={p.description}
        onChange={blocks => onChange(p.id, 'description', blocks)}
      />

      {/* Quantité + Prix + Total */}
      <div className="flex items-end gap-2">
        {/* Quantité with toggle */}
        <div className="w-28 flex-shrink-0">
          <div className="flex items-center gap-1.5 mb-1">
            <button
              type="button"
              onClick={() => onChange(p.id, 'showQuantite' as keyof Prestation, !showQty as unknown as string)}
              className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                showQty ? 'bg-[#1e64c4]' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${showQty ? 'translate-x-3' : 'translate-x-0'}`} />
            </button>
            <label className="form-label leading-none whitespace-nowrap">Quantité</label>
          </div>
          <Input
            type="number"
            min={1}
            value={p.quantite}
            onChange={e => onChange(p.id, 'quantite', Math.max(1, +e.target.value))}
            disabled={!showQty}
            className={`text-sm text-center ${!showQty ? 'opacity-40 pointer-events-none' : ''}`}
          />
        </div>

        {/* Prix unitaire */}
        <div className="flex-1">
          <div className="flex items-center gap-1.5 mb-1">
            <button
              type="button"
              onClick={() => onChange(p.id, 'showPrixUnit' as keyof Prestation, !showPrix as unknown as string)}
              className={`relative inline-flex h-4 w-7 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                showPrix ? 'bg-[#1e64c4]' : 'bg-slate-300 dark:bg-slate-600'
              }`}
            >
              <span className={`pointer-events-none inline-block h-3 w-3 rounded-full bg-white shadow transition-transform duration-200 ${showPrix ? 'translate-x-3' : 'translate-x-0'}`} />
            </button>
            <label className="form-label leading-none whitespace-nowrap truncate">Prix unitaire HT (DH) *</label>
          </div>
          <Input
            type="number"
            min={0}
            step="0.01"
            value={p.prix_unitaire}
            onChange={e => onChange(p.id, 'prix_unitaire', +e.target.value)}
            disabled={!showPrix}
            className={`text-sm ${!showPrix ? 'opacity-40 pointer-events-none' : ''}`}
          />
        </div>

        {/* Total */}
        <div className="w-28 flex-shrink-0">
          <label className="form-label mb-1">Total HT</label>
          <div className="h-9 flex items-center px-3 rounded-md border border-border bg-muted/50 text-sm font-semibold text-foreground">
            {total.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} MAD
          </div>
        </div>
      </div>
    </motion.div>
  )
}

/* ─── A4Preview — scaled, multi-page ─────────────────────────────── */
const A4_W_PX = 794   // 210mm @ 96 dpi
const A4_H_PX = 1123  // 297mm @ 96 dpi

export function A4Preview({ children }: { children: React.ReactNode }) {
  const containerRef  = useRef<HTMLDivElement>(null)
  const contentRef    = useRef<HTMLDivElement>(null)
  const [scale, setScale]   = useState(1)
  const [pages, setPages]   = useState(1)

  // Recalculate scale when container resizes
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const ro = new ResizeObserver(() => {
      const avail = container.clientWidth - 48  // 24px padding each side
      setScale(Math.min(1, avail / A4_W_PX))
    })
    ro.observe(container)
    return () => ro.disconnect()
  }, [])

  // Recalculate page count when content height changes
  useEffect(() => {
    const content = contentRef.current
    if (!content) return
    const ro = new ResizeObserver(() => {
      setPages(Math.max(1, Math.ceil(content.scrollHeight / A4_H_PX)))
    })
    ro.observe(content)
    return () => ro.disconnect()
  }, [])

  const scaledH = A4_H_PX * scale

  return (
    <div
      ref={containerRef}
      className="flex-1 overflow-y-auto bg-slate-200 dark:bg-slate-900"
    >
      <div className="py-6 flex flex-col items-center gap-0" style={{ paddingLeft: 24, paddingRight: 24 }}>

        {/* Scaled A4 wrapper */}
        <div
          style={{
            width:  A4_W_PX * scale,
            height: scaledH * pages,
            position: 'relative',
            flexShrink: 0,
          }}
        >
          {/* The actual template, scaled via transform */}
          <div
            ref={contentRef}
            style={{
              width:           A4_W_PX,
              transformOrigin: 'top left',
              transform:       `scale(${scale})`,
              boxShadow:       '0 2px 16px rgba(0,0,0,0.18)',
              background:      'white',
            }}
          >
            {children}
          </div>

          {/* Page-break lines */}
          {Array.from({ length: pages - 1 }).map((_, i) => (
            <div
              key={i}
              style={{
                position:   'absolute',
                left:       0,
                right:      0,
                top:        scaledH * (i + 1),
                height:     2,
                background: '#94a3b8',
                zIndex:     10,
              }}
            />
          ))}
        </div>

        {/* Page count badge */}
        {pages > 1 && (
          <div className="mt-3 text-xs text-slate-500 dark:text-slate-400 bg-white dark:bg-slate-800 px-3 py-1 rounded-full shadow text-center">
            {pages} pages
          </div>
        )}

        <div className="h-8" />
      </div>
    </div>
  )
}

/* ─── DevisWizard ─────────────────────────────────────────────────── */
function DevisWizard({ onClose, editDevis, onStepChange }: {
  onClose: () => void
  editDevis?: Devis
  onStepChange?: (step: number) => void
}) {
  const create       = useCreateDevis()
  const update       = useUpdateDevis()
  const createClient = useCreateClient()
  const { data: clients  = [] } = useClients()
  const { data: allDevis = [] } = useDevis()

  const today     = new Date().toISOString().slice(0, 10)
  const plus30    = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10)

  /* ── Wizard state ── */
  const [step,           setStep]           = useState(editDevis ? 2 : 1)

  // Notify parent whenever step changes (used to resize Dialog)
  useEffect(() => { onStepChange?.(step) }, [step])
  const [clientSearch,   setClientSearch]   = useState('')
  const [selectedId,     setSelectedId]     = useState(editDevis?.client_id ?? '')
  const [dateDevis,      setDateDevis]      = useState(editDevis?.date_emission ?? today)
  const [dateValidite,   setDateValidite]   = useState(editDevis?.date_expiration ?? plus30)
  const [prestations,    setPrestations]    = useState<Prestation[]>(() => {
    if (!editDevis?.notes) return [{ id: '1', titre: '', description: [], quantite: 1, prix_unitaire: 0 }]
    const { prestations: p } = parseDevisNotes(editDevis.notes)
    return p.length
      ? p.map((x, i) => ({ ...x, id: String(i + 1) })) as Prestation[]
      : [{ id: '1', titre: '', description: [], quantite: 1, prix_unitaire: 0 }]
  })
  const [tvaEnabled,     setTvaEnabled]     = useState(() => editDevis ? editDevis.tva > 0 : true)
  const [tvaRate,        setTvaRate]        = useState(() => (editDevis?.tva ?? 0) > 0 ? editDevis!.tva : 20)
  const [bankInfo,       setBankInfo]       = useState<BankInfo>(() =>
    editDevis?.notes ? parseDevisNotes(editDevis.notes).bankInfo : DEFAULT_BANK
  )
  const [conditions,     setConditions]     = useState<string[]>(() => {
    if (!editDevis?.notes) return ['Délai de livraison : 7 jours ouvrables']
    const { conditions: c } = parseDevisNotes(editDevis.notes)
    return c.length ? c : ['Délai de livraison : 7 jours ouvrables']
  })
  const [newCondition,   setNewCondition]   = useState('')
  const [template,       setTemplate]       = useState<DevisTemplateKind>(() => {
    if (!editDevis?.notes) return 'default'
    try { const d = JSON.parse(editDevis.notes) as DevisNotesData; return (d.template as DevisTemplateKind) ?? 'default' } catch { return 'default' }
  })
  const [clientIce,      setClientIce]      = useState<string>(() => {
    if (!editDevis?.notes) return ''
    try { const d = JSON.parse(editDevis.notes) as DevisNotesData; return typeof d.clientIce === 'string' ? d.clientIce : '' } catch { return '' }
  })
  const [signature, setSignature] = useState<string | null>(() => {
    // Load saved company signature from localStorage
    try { return localStorage.getItem('ng_signature') ?? null } catch { return null }
  })

  // Persist signature whenever it changes
  useEffect(() => {
    try {
      if (signature) localStorage.setItem('ng_signature', signature)
      else localStorage.removeItem('ng_signature')
    } catch {}
  }, [signature])
  const sigRef      = useRef<HTMLInputElement>(null)
  const previewRef  = useRef<HTMLDivElement>(null)

  /* ── Resizable left panel ── */
  const [panelWidth, setPanelWidth] = useState(400)
  const isResizing = useRef(false)

  /* ── Mobile view tab — split-screen is unusable below md, so on
       small screens we toggle between the editor and the A4 preview. */
  const [mobileTab, setMobileTab] = useState<'edit' | 'preview'>('edit')

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault()
    isResizing.current = true
    const startX = e.clientX
    const startW = panelWidth
    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return
      const newW = Math.min(600, Math.max(240, startW + ev.clientX - startX))
      setPanelWidth(newW)
    }
    const onUp = () => {
      isResizing.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  /* ── New client form ── */
  const [showNewClient, setShowNewClient] = useState(false)
  const [newClientForm, setNewClientForm] = useState({ nom: '', telephone: '', email: '', entreprise: '' })

  const client = clients.find(c => c.id === selectedId)

  const filteredClients = useMemo(() =>
    clients.filter(c =>
      !clientSearch ||
      c.nom.toLowerCase().includes(clientSearch.toLowerCase()) ||
      (c.telephone ?? '').includes(clientSearch) ||
      (c.entreprise ?? '').toLowerCase().includes(clientSearch.toLowerCase())
    )
  , [clients, clientSearch])

  /* ── Calculations ── */
  const montantHT  = prestations.reduce((s, p) => s + ((p.showQuantite ?? true) ? p.quantite * p.prix_unitaire : p.prix_unitaire), 0)
  const montantTVA = tvaEnabled ? montantHT * (tvaRate / 100) : 0
  const montantTTC = montantHT + montantTVA

  /* ── Prestation helpers ── */
  const addPrestation = () =>
    setPrestations(p => [...p, { id: Date.now().toString(), titre: '', description: [], quantite: 1, prix_unitaire: 0 }])

  const updatePrestation = (id: string, field: keyof Prestation, val: string | number | DescriptionBlock[]) =>
    setPrestations(p => p.map(x => x.id === id ? { ...x, [field]: val } : x))

  const deletePrestation = (id: string) =>
    setPrestations(p => p.filter(x => x.id !== id))

  /* ── New client save ── */
  const saveNewClient = () => {
    if (!newClientForm.nom.trim()) return
    createClient.mutate(
      { nom: newClientForm.nom, telephone: newClientForm.telephone || null,
        email: newClientForm.email || null, entreprise: newClientForm.entreprise || null,
        adresse: null, ville: null, pays: 'Maroc', notes: null },
      {
        onSuccess: (c: any) => {
          setSelectedId(c.id)
          setShowNewClient(false)
          setNewClientForm({ nom: '', telephone: '', email: '', entreprise: '' })
        },
      }
    )
  }

  /* ── Final submit ── */
  const handleSubmit = () => {
    if (!selectedId) { toast.error('Sélectionnez un client'); setStep(1); return }
    const notesData: DevisNotesData = {
      prestations: prestations.map(({ id: _id, ...p }) => p),
      conditions,
      bankInfo,
      signature,
      template,
      clientIce: clientIce.trim() || undefined,
    }
    const notes = JSON.stringify(notesData)

    /* Sequential numero: DEV-YYYY-001, DEV-YYYY-002… (no collision) */
    const year   = new Date().getFullYear()
    const maxSeq = allDevis
      .filter(x => x.numero.startsWith(`DEV-${year}-`))
      .reduce((max, x) => {
        const m = x.numero.match(/DEV-\d{4}-(\d+)/)
        return m ? Math.max(max, parseInt(m[1], 10)) : max
      }, 0)
    const newNumero = `DEV-${year}-${String(maxSeq + 1).padStart(3, '0')}`

    const clientNom = clients.find(c => c.id === selectedId)?.nom ?? ''

    const payload = {
      numero:          editDevis?.numero ?? newNumero,
      client_id:       selectedId,
      client_nom:      clientNom,
      /* ✅ BUG-01 fix: NEVER overwrite the existing statut on edit */
      statut:          editDevis?.statut ?? ('brouillon' as const),
      date_emission:   dateDevis,
      date_expiration: dateValidite,
      montant_ht:      montantHT,
      tva:             tvaEnabled ? tvaRate : 0,
      montant_ttc:     montantTTC,
      notes,
    }

    if (editDevis) {
      update.mutate({ id: editDevis.id, ...payload }, { onSuccess: onClose })
    } else {
      create.mutate(payload, { onSuccess: onClose })
    }
  }

  const busy = create.isPending || update.isPending || createClient.isPending

  /* ══════════════════════════════════════════════
     STEP 3 — LIVE PREVIEW PORTAL
  ══════════════════════════════════════════════ */
  if (step === 2) {
    const previewDevis: import('@/hooks/useDevis').Devis = {
      id:              editDevis?.id ?? 'preview',
      created_at:      new Date().toISOString(),
      numero:          editDevis?.numero ?? `DEV-${new Date().getFullYear()}-XXXX`,
      client_id:       selectedId,
      client_nom:      client?.entreprise ?? client?.nom,
      statut:          editDevis?.statut ?? 'brouillon',
      date_emission:   dateDevis,
      date_expiration: dateValidite,
      montant_ht:      montantHT,
      tva:             tvaEnabled ? tvaRate : 0,
      montant_ttc:     montantTTC,
      notes: JSON.stringify({
        prestations: prestations.map(({ id: _id, ...p }) => p),
        conditions,
        bankInfo,
        signature,
        template,
        clientIce: clientIce.trim() || undefined,
      }),
    }

    return (
      <div className="flex flex-col bg-slate-100 dark:bg-slate-900 overflow-hidden h-[100dvh] max-h-[100dvh]">

        {/* Top bar — sticky so it stays pinned while the form scrolls,
            even on mobile browsers where the dynamic viewport jiggles. */}
        <div className="sticky top-0 z-30 flex items-center justify-between gap-2 px-3 md:px-5 py-2 md:py-3 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 shadow-sm flex-shrink-0">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <button onClick={() => setStep(1)}
              className="flex items-center gap-1 md:gap-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-white transition-colors">
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Client</span>
            </button>
            <div className="hidden sm:block w-px h-5 bg-slate-200 dark:bg-slate-600" />
            <span className="hidden sm:inline-block text-xs text-slate-400 font-mono bg-slate-100 dark:bg-slate-700 px-2 py-1 rounded select-none truncate">
              {previewDevis.numero}
            </span>

            {/* Mobile-only tab switcher */}
            <div className="md:hidden flex items-center rounded-lg border border-slate-200 dark:border-slate-600 p-0.5 bg-slate-50 dark:bg-slate-700/50">
              <button
                type="button"
                onClick={() => setMobileTab('edit')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  mobileTab === 'edit'
                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Édition
              </button>
              <button
                type="button"
                onClick={() => setMobileTab('preview')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                  mobileTab === 'preview'
                    ? 'bg-white dark:bg-slate-800 text-slate-800 dark:text-white shadow-sm'
                    : 'text-slate-500'
                }`}
              >
                Aperçu
              </button>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2 flex-shrink-0">
            <div className="hidden md:flex items-center gap-2">
              <DevisActions
                templateRef={previewRef}
                filename={buildPdfFilename({
                  numero:     previewDevis.numero,
                  clientName: client?.entreprise ?? client?.nom ?? previewDevis.client_nom,
                  date:       previewDevis.date_emission,
                })}
              />
              <div className="w-px h-5 bg-slate-200 dark:bg-slate-600" />
            </div>
            <Button size="sm" onClick={handleSubmit} disabled={busy}
              className="bg-emerald-600 hover:bg-emerald-700 text-white border-0 px-2.5 md:px-3 h-8">
              {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span className="hidden sm:inline">{editDevis ? 'Mettre à jour' : 'Créer le devis'}</span>
              <span className="sm:hidden">{editDevis ? 'Maj' : 'Créer'}</span>
            </Button>
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Two-panel body */}
        <div className="flex flex-1 min-h-0 overflow-hidden">

          {/* LEFT — Edit panel
              Mobile: full-width, only when mobileTab === 'edit'.
              Desktop: resizable fixed width, always visible. */}
          <div
            style={{
              ['--panel-w' as any]: `${panelWidth}px`,
              minWidth: 0,
              flexShrink: 0,
            }}
            className={`bg-white dark:bg-slate-800 overflow-y-auto h-full w-full md:w-[var(--panel-w)] md:min-w-[240px] md:max-w-[600px] ${
              mobileTab === 'edit' ? 'block' : 'hidden md:block'
            }`}
          >
            <div className="p-4 space-y-5">

              {/* ── Prestations ── */}
              <div className="space-y-3">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Prestations / Services</p>
                <AnimatePresence>
                  {prestations.map(p => (
                    <PrestationRow key={p.id} p={p} onChange={updatePrestation} onDelete={deletePrestation} />
                  ))}
                </AnimatePresence>
                <button
                  onClick={addPrestation}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-slate-200 dark:border-slate-600 text-xs text-slate-400 hover:border-blue-600/50 hover:text-blue-600 dark:text-blue-400 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" /> Ajouter une prestation
                </button>

                {/* Template selector — label au-dessus + menu large pour rester lisible même en panneau étroit */}
                <div className="rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30 divide-y divide-slate-200 dark:divide-slate-600">
                  <div className="p-2.5 space-y-2">
                    <div className="flex items-center gap-2">
                      <FileText className="w-3.5 h-3.5 text-slate-400" />
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-200">Modèle de devis</p>
                    </div>
                    <Select value={template} onValueChange={v => setTemplate(v as DevisTemplateKind)}>
                      <SelectTrigger className="w-full h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="default">Détaillé (par défaut)</SelectItem>
                        <SelectItem value="simple">Simple (Nextgital)</SelectItem>
                        <SelectItem value="offer">Proposition sans tableau</SelectItem>
                        <SelectItem value="executive">Executive (premium)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {(template === 'simple' || template === 'offer') && (
                    <div className="p-2.5 space-y-1.5">
                      <p className="text-xs text-slate-600 dark:text-slate-300">ICE client</p>
                      <Input
                        value={clientIce}
                        onChange={e => setClientIce(e.target.value)}
                        placeholder="003549446000085"
                        className="h-8 text-xs w-full font-mono"
                      />
                    </div>
                  )}
                </div>

                {/* TVA */}
                <div className="flex items-center justify-between p-2.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/30">
                  <div>
                    <p className="text-xs font-medium text-slate-700 dark:text-slate-200">TVA</p>
                    {tvaEnabled && <p className="text-[10px] text-slate-400">{tvaRate}% · +{formatCurrency(montantTVA)}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {tvaEnabled && (
                      <Select value={String(tvaRate)} onValueChange={v => setTvaRate(+v)}>
                        <SelectTrigger className="w-20 h-6 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {[0, 7, 10, 14, 20].map(r => (
                            <SelectItem key={r} value={String(r)}>{r}%</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                    <button onClick={() => setTvaEnabled(v => !v)}>
                      {tvaEnabled
                        ? <ToggleRight className="w-7 h-7 text-blue-600 dark:text-blue-400" />
                        : <ToggleLeft  className="w-7 h-7 text-slate-400" />}
                    </button>
                  </div>
                </div>
                {/* Totals mini summary */}
                <div className="rounded-xl bg-slate-50 dark:bg-slate-700/30 border border-slate-200 dark:border-slate-600 divide-y divide-slate-200 dark:divide-slate-600 text-xs">
                  <div className="flex justify-between px-3 py-2">
                    <span className="text-slate-500">Sous-total HT</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(montantHT)}</span>
                  </div>
                  {tvaEnabled && (
                    <div className="flex justify-between px-3 py-2">
                      <span className="text-slate-500">TVA {tvaRate}%</span>
                      <span className="font-semibold text-slate-700 dark:text-slate-200">{formatCurrency(montantTVA)}</span>
                    </div>
                  )}
                  <div className="flex justify-between px-3 py-2 bg-slate-100 dark:bg-slate-700 rounded-b-xl">
                    <span className="font-bold text-slate-700 dark:text-slate-100">TOTAL TTC</span>
                    <span className="font-bold text-[#1e64c4]">{formatCurrency(montantTTC)}</span>
                  </div>
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-700" />

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Coordonnées bancaires</p>
                {(['banque', 'iban', 'swift'] as const).map(field => (
                  <div key={field}>
                    <label className="form-label text-xs capitalize">{field === 'swift' ? 'SWIFT/BIC' : field.charAt(0).toUpperCase() + field.slice(1)}</label>
                    <Input value={bankInfo[field]} onChange={e => setBankInfo(p => ({ ...p, [field]: e.target.value }))}
                      className={`h-8 text-sm mt-0.5 ${field === 'iban' ? 'font-mono text-xs' : ''}`} />
                  </div>
                ))}
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-700" />

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Conditions générales</p>
                <div className="space-y-1.5">
                  {conditions.map((c, i) => (
                    <div key={i} className="flex items-start gap-1.5 py-1 px-2.5 rounded-lg bg-slate-50 dark:bg-slate-700/50 border border-slate-200 dark:border-slate-600 group">
                      <span className="text-slate-400 text-xs mt-0.5">•</span>
                      <span className="text-xs text-slate-700 dark:text-slate-200 flex-1 leading-relaxed">{c}</span>
                      <button onClick={() => setConditions(p => p.filter((_, j) => j !== i))}
                        className="opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <X className="w-3 h-3 text-slate-400 hover:text-red-400" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <AutocorrectInput value={newCondition} onChange={e => setNewCondition(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter' && newCondition.trim()) { setConditions(p => [...p, newCondition.trim()]); setNewCondition('') }}}
                    placeholder="Nouvelle condition..." className="h-7 text-xs" />
                  <Button size="sm" className="h-7 px-2.5 flex-shrink-0"
                    disabled={!newCondition.trim()}
                    onClick={() => { if (newCondition.trim()) { setConditions(p => [...p, newCondition.trim()]); setNewCondition('') }}}>
                    <Plus className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-700" />

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Dates</p>
                <div>
                  <label className="form-label text-xs">Date du devis</label>
                  <Input type="date" value={dateDevis} onChange={e => setDateDevis(e.target.value)} className="h-8 text-sm mt-0.5" />
                </div>
                <div>
                  <label className="form-label text-xs">Valide jusqu'au</label>
                  <Input type="date" value={dateValidite} onChange={e => setDateValidite(e.target.value)} className="h-8 text-sm mt-0.5" />
                </div>
              </div>

              <div className="h-px bg-slate-100 dark:bg-slate-700" />

              <div className="space-y-2">
                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Signature</p>
                {signature ? (
                  <div className="space-y-2">
                    <div className="relative inline-block">
                      <img src={signature} alt="Signature" className="h-20 rounded-lg border border-slate-200 bg-white object-contain" />
                      <button type="button" onClick={() => setSignature(null)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center shadow">
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                    <label className="cursor-pointer flex items-center gap-1.5 text-xs text-slate-400 hover:text-[#1e64c4] transition-colors">
                      <input type="file" accept="image/*" className="hidden"
                        onChange={e => {
                          const f = e.target.files?.[0]
                          if (f) { const r = new FileReader(); r.onload = ev => setSignature(ev.target?.result as string); r.readAsDataURL(f) }
                        }} />
                      <PenLine className="w-3 h-3" /> Changer
                    </label>
                  </div>
                ) : (
                  <label className="cursor-pointer flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-xs text-slate-500 hover:border-[#1e64c4]/50 hover:text-[#1e64c4] hover:bg-[#1e64c4]/5 transition-colors w-full">
                    <input type="file" accept="image/*" className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0]
                        if (f) { const r = new FileReader(); r.onload = ev => setSignature(ev.target?.result as string); r.readAsDataURL(f) }
                      }} />
                    <PenLine className="w-3.5 h-3.5" /> Ajouter une signature / tampon
                  </label>
                )}
              </div>

            </div>
          </div>

          {/* RESIZE HANDLE — desktop only */}
          <div
            onMouseDown={startResize}
            className="hidden md:block w-1 flex-shrink-0 bg-slate-200 dark:bg-slate-700 hover:bg-[#1e64c4] active:bg-[#1e64c4] cursor-col-resize transition-colors relative group"
            title="Glisser pour redimensionner"
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>

          {/* RIGHT — Scaled A4 preview
              Mobile: only when mobileTab === 'preview'. Desktop: always. */}
          <div className={`flex-1 min-w-0 flex flex-col ${
            mobileTab === 'preview' ? 'flex' : 'hidden md:flex'
          }`}>
            <A4Preview>
              <DevisTemplate ref={previewRef} devis={previewDevis} client={client} />
            </A4Preview>
          </div>
        </div>
      </div>
    )
  }

  /* ══════════════════════════════════════════════
     RENDER  (steps 1–2)
  ══════════════════════════════════════════════ */
  return (
    <div className="space-y-0">
      <p className="text-xs text-muted-foreground mb-1">
        {editDevis ? 'Modifier le devis' : 'Nouveau devis'} · Étape {step}/2
      </p>
      <StepBar step={step} />

      <AnimatePresence mode="wait">

        {/* ════ STEP 1 — CLIENT ════ */}
        {step === 1 && (
          <motion.div key="s1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-4">

            <div>
              <label className="form-label">Sélectionner un client *</label>
              <div className="flex gap-2 mt-1.5">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input
                    value={clientSearch}
                    onChange={e => setClientSearch(e.target.value)}
                    placeholder="Rechercher par nom, téléphone, entreprise…"
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <Button size="sm" variant="secondary" onClick={() => setShowNewClient(s => !s)}>
                  <Plus className="w-3.5 h-3.5" /> Nouveau client
                </Button>
              </div>
            </div>

            {/* New client inline form */}
            <AnimatePresence>
              {showNewClient && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="rounded-xl border border-blue-600/30 bg-blue-600/5 p-4 space-y-3">
                    <p className="text-xs font-bold text-blue-600 dark:text-blue-400">Nouveau client</p>
                    <div className="grid grid-cols-2 gap-3">
                      <AutocorrectInput placeholder="Nom *" value={newClientForm.nom}
                        onChange={e => setNewClientForm(p => ({ ...p, nom: e.target.value }))} className="text-sm" />
                      <Input placeholder="Téléphone" value={newClientForm.telephone}
                        onChange={e => setNewClientForm(p => ({ ...p, telephone: e.target.value }))} className="text-sm" />
                      <Input placeholder="Email" value={newClientForm.email}
                        onChange={e => setNewClientForm(p => ({ ...p, email: e.target.value }))} className="text-sm" />
                      <AutocorrectInput placeholder="Entreprise" value={newClientForm.entreprise}
                        onChange={e => setNewClientForm(p => ({ ...p, entreprise: e.target.value }))} className="text-sm" />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button variant="ghost" size="sm" onClick={() => setShowNewClient(false)}>Annuler</Button>
                      <Button size="sm" onClick={saveNewClient} disabled={!newClientForm.nom.trim() || busy}>
                        {busy && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Créer & sélectionner
                      </Button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Client list */}
            <div className="max-h-48 overflow-y-auto space-y-1 rounded-xl border border-border">
              {filteredClients.map(c => (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors first:rounded-t-xl last:rounded-b-xl ${
                    selectedId === c.id
                      ? 'bg-blue-600/10 text-foreground'
                      : 'hover:bg-muted/50 text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${
                    selectedId === c.id ? 'bg-blue-600 text-white' : 'bg-muted'
                  }`}>
                    {getInitials(c.nom)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium leading-tight ${selectedId === c.id ? 'text-foreground' : ''}`}>
                      {c.telephone && <span className="mr-1">{c.telephone}</span>}
                      {c.entreprise && <span className="text-muted-foreground">{c.entreprise}</span>}
                    </p>
                    <p className="text-xs text-muted-foreground truncate">{c.nom}</p>
                  </div>
                  {selectedId === c.id && <Check className="w-4 h-4 text-blue-600 dark:text-blue-400 flex-shrink-0" />}
                </button>
              ))}
              {filteredClients.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">Aucun client trouvé</p>
              )}
            </div>

            {/* Selected client info card */}
            {client && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border border-blue-600/30 bg-blue-600/5 p-4"
              >
                <div className="mb-3">
                  <p className="text-xs font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wide">Informations du client</p>
                </div>
                <p className="text-sm font-semibold text-foreground">{client.entreprise ?? client.nom}</p>
                {client.telephone && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                    <Phone className="w-3 h-3" />{client.telephone}
                  </p>
                )}
                {client.email && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <Mail className="w-3 h-3" />{client.email}
                  </p>
                )}
                {client.adresse && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3 h-3" />{[client.adresse, client.ville].filter(Boolean).join(', ')}
                  </p>
                )}
              </motion.div>
            )}

            {/* Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="form-label">Date du devis</label>
                <Input type="date" value={dateDevis} onChange={e => setDateDevis(e.target.value)} className="mt-1" />
              </div>
              <div>
                <label className="form-label">Valide jusqu'au</label>
                <Input type="date" value={dateValidite} onChange={e => setDateValidite(e.target.value)} className="mt-1" />
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between pt-2">
              <Button variant="secondary" size="sm" onClick={onClose}>Annuler</Button>
              <Button size="sm" onClick={() => { if (!selectedId) { toast.error('Sélectionnez un client'); return }; setStep(2) }}
                disabled={!selectedId}>
                Suivant <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )

}

/* ─── PDF Preview Modal — NEXT GITAL Premium ─────────────────────── */
const STATUT_PREVIEW: Record<string, { label: string; cls: string }> = {
  brouillon: { label: 'BROUILLON', cls: 'bg-slate-100 text-slate-500' },
  envoye:    { label: 'ENVOYÉ',    cls: 'bg-blue-50 text-blue-600'    },
  accepte:   { label: 'ACCEPTÉ',   cls: 'bg-emerald-50 text-emerald-600' },
  refuse:    { label: 'REFUSÉ',    cls: 'bg-red-50 text-red-600'      },
  expire:    { label: 'EXPIRÉ',    cls: 'bg-amber-50 text-amber-600'  },
}

function fmtDate(s: string) {
  return new Date(s).toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}
function addValidity(s: string, days = 30) {
  const d = new Date(s); d.setDate(d.getDate() + days)
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })
}

function DevisPreviewModal({ devis: d, client, onClose }: { devis: Devis; client?: Client; onClose: () => void }) {
  const sp      = STATUT_PREVIEW[d.statut] ?? STATUT_PREVIEW.brouillon
  const hasTVA  = d.tva > 0
  const parsed  = parseDevisNotes(d.notes)
  const [sendOpen, setSendOpen] = useState(false)
  const { conditions: parsedConds, bankInfo: parsedBank, prestations: parsedPrests } = parsed

  const bankParts = [
    { label: 'Banque',    val: parsedBank.banque },
    { label: 'IBAN',      val: parsedBank.iban   },
    { label: 'SWIFT/BIC', val: parsedBank.swift  },
  ].filter(p => p.val)

  const defaultConditions = [
    '50% à la signature du devis',
    '50% à la livraison du projet',
    'Délai de livraison : 15 à 21 jours ouvrables',
    'Validité du devis : 15 jours',
    'Acompte non remboursable après démarrage',
  ]
  const displayConditions = parsedConds.length > 0 ? parsedConds : defaultConditions
  const displayPrests     = parsedPrests.length > 0 ? parsedPrests : null

  /* Dynamic title from first prestation (fallback: generic label) */
  const mainTitle    = parsedPrests[0]?.titre   || 'Détail des prestations'
  const mainSubtitle = parsedPrests[1]?.titre   || parsedPrests[0]?.description[0]?.content || ''

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="max-w-3xl max-h-[95dvh] overflow-y-auto p-0 gap-0">

        {/* ── Toolbar */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-border bg-[#0a1430] sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-full bg-[#1E64C8] flex items-center justify-center">
              <span className="text-white text-[10px] font-black">NG</span>
            </div>
            <span className="font-mono font-semibold text-sm text-white">{d.numero}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${sp.cls}`}>{sp.label}</span>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setSendOpen(true)}>
              <Send className="w-3.5 h-3.5" /> Envoyer au client
            </Button>
            <Button size="sm" className="bg-[#1E64C8] hover:bg-[#1558B0] text-white border-0"
              onClick={() => generateDevisPDFWithRetry(d, client).catch(console.error)}>
              <Download className="w-3.5 h-3.5" /> Télécharger PDF
            </Button>
            <button onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors">
              <X className="w-4 h-4 text-slate-400" />
            </button>
          </div>
        </div>

        <SendDocumentDialog
          open={sendOpen}
          onClose={() => setSendOpen(false)}
          kind="devis"
          numero={d.numero}
          filename={`${d.numero}.pdf`}
          defaultEmail={client?.email ?? ''}
          clientNom={d.client_nom ?? client?.entreprise ?? client?.nom}
          buildPdf={() => generateDevisPDFBlob(d, {
            clientNom:   d.client_nom ?? client?.entreprise ?? client?.nom,
            clientEmail: client?.email ?? undefined,
          })}
        />

        {/* ── A4 Preview */}
        <div className="bg-slate-200 p-6">
          <div className="bg-white shadow-2xl rounded-sm overflow-hidden" style={{ fontFamily: "'Segoe UI', system-ui, sans-serif", minHeight: '1050px' }}>

            {/* ── LEFT SIDEBAR + CONTENT layout */}
            <div className="flex min-h-full">

              {/* Sidebar */}
              <div className="w-52 flex-shrink-0 bg-[#08143A] flex flex-col" style={{ minHeight: '1050px' }}>

                {/* Logo area */}
                <div className="px-5 pt-8 pb-6 border-b border-white/10">
                  <div className="w-14 h-14 rounded-full border-2 border-[#00A2FF] flex items-center justify-center mb-3 mx-auto" style={{ background: 'rgba(30,100,200,0.3)' }}>
                    <span className="text-white font-black text-lg">NG</span>
                  </div>
                  <p className="text-white font-black text-center text-sm tracking-wide">NEXT GITAL</p>
                  <p className="text-[#00A2FF] text-[9px] text-center mt-0.5 leading-tight">Agence Web & Solutions<br/>Digitales</p>
                </div>

                {/* Contact */}
                <div className="px-5 py-5 border-b border-white/10 space-y-2">
                  <p className="text-[#00A2FF] text-[9px] font-bold uppercase tracking-widest mb-2">Contact</p>
                  {[
                    { icon: '✉', v: 'info@nextgital.com' },
                    { icon: '✆', v: '+212 620002066'    },
                    { icon: '⌂', v: 'www.nextgital.com' },
                  ].map(({ icon, v }) => (
                    <div key={v} className="flex gap-2 items-start">
                      <span className="text-slate-400 text-[9px] mt-0.5 w-3">{icon}</span>
                      <span className="text-white text-[9px] leading-tight break-all">{v}</span>
                    </div>
                  ))}
                </div>

                {/* Quote meta */}
                <div className="px-5 py-5 border-b border-white/10 space-y-3">
                  <p className="text-[#00A2FF] text-[9px] font-bold uppercase tracking-widest">Devis</p>
                  {[
                    { label: 'Référence', val: d.numero },
                    { label: 'Date', val: fmtDate(d.date_emission) },
                    { label: 'Validité', val: addValidity(d.date_emission) },
                  ].map(({ label, val }) => (
                    <div key={label}>
                      <p className="text-slate-400 text-[8.5px]">{label}</p>
                      <p className="text-white text-[9.5px] font-semibold mt-0.5">{val}</p>
                    </div>
                  ))}
                  <div className={`mt-2 text-[9px] font-bold px-2 py-1 rounded text-center ${sp.cls}`}>{sp.label}</div>
                </div>

                {/* Client */}
                <div className="px-5 py-5 flex-1">
                  <p className="text-[#00A2FF] text-[9px] font-bold uppercase tracking-widest mb-3">Client</p>
                  <p className="text-white font-bold text-[10.5px] leading-snug">{client?.entreprise ?? d.client_nom ?? '—'}</p>
                  {d.client_nom && client?.entreprise && (
                    <p className="text-slate-400 text-[9px] mt-1">{d.client_nom}</p>
                  )}
                  {client?.telephone && <p className="text-slate-400 text-[9px] mt-1">{client.telephone}</p>}
                  {client?.email     && <p className="text-slate-400 text-[9px] mt-0.5 break-all">{client.email}</p>}
                  {client?.adresse   && (
                    <p className="text-slate-400 text-[9px] mt-0.5">
                      {[client.adresse, client.ville].filter(Boolean).join(', ')}
                    </p>
                  )}
                </div>

                {/* Legal footer */}
                <div className="px-5 py-4 border-t border-white/10">
                  {['RC : 42415', 'Patente N° : 10301120', 'IF N° : 60270023', 'ICE : 003453451000013'].map(l => (
                    <p key={l} className="text-slate-500 text-[7.5px] leading-relaxed">{l}</p>
                  ))}
                </div>
              </div>

              {/* Main content */}
              <div className="flex-1 flex flex-col">

                {/* Title section */}
                <div className="px-8 pt-10 pb-6 border-b border-slate-100">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mb-1">Document commercial</p>
                      <h1 className="text-2xl font-black text-[#08143A] leading-tight">DEVIS</h1>
                      {mainTitle    && <p className="text-sm font-semibold text-slate-600 mt-1">{mainTitle}</p>}
                      {mainSubtitle && <p className="text-xs text-slate-400 mt-0.5">{mainSubtitle}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-slate-400 uppercase tracking-wider">Émission</p>
                      <p className="text-sm font-bold text-slate-700">{fmtDate(d.date_emission)}</p>
                      {d.date_expiration && (
                        <>
                          <p className="text-[9px] text-slate-400 uppercase tracking-wider mt-2">Expiration</p>
                          <p className="text-sm font-bold text-slate-700">{fmtDate(d.date_expiration)}</p>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Prestations table */}
                <div className="px-8 pt-6">
                  <p className="text-[9px] font-bold text-[#1E64C8] uppercase tracking-widest mb-3">Détail des prestations</p>
                  <div className="rounded-lg overflow-hidden border border-slate-200">
                    <div className="grid grid-cols-[1fr_auto_auto_auto] bg-[#08143A] text-white text-[9px] font-bold uppercase tracking-wider">
                      <div className="px-3 py-2.5">Prestation / Description</div>
                      <div className="px-3 py-2.5 text-center w-12">Qté</div>
                      <div className="px-3 py-2.5 text-right w-24">P.U. HT</div>
                      <div className="px-3 py-2.5 text-right w-24">Total HT</div>
                    </div>
                    {displayPrests ? (
                      displayPrests.map((p, i) => (
                        <div key={i} className={`grid grid-cols-[1fr_auto_auto_auto] border-t border-slate-200 ${i % 2 === 0 ? 'bg-slate-50' : 'bg-white'}`}>
                          <div className="px-3 py-3">
                            <p className="text-[10.5px] font-bold text-slate-800">{p.titre || 'Prestation'}</p>
                            {p.description.length > 0 && (
                              <div className="mt-1.5">
                                {p.description.map((b, bi) => (
                                  <div key={bi} className="mt-0.5">
                                    {b.type === 'title'     && <p className="text-[8.5px] font-bold text-slate-700">{b.content}</p>}
                                    {b.type === 'paragraph' && <p className="text-[8px] text-slate-500 leading-relaxed">{b.content}</p>}
                                    {b.type === 'list'      && (
                                      <ul className="space-y-0.5">
                                        {b.content.split('\n').filter(Boolean).map((item, li) => (
                                          <li key={li} className="flex items-start gap-1 text-[8px] text-slate-500">
                                            <span className="w-1 h-1 rounded-full bg-[#1E64C8] flex-shrink-0 mt-1" />
                                            {item}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div className="px-3 py-3 text-center w-12 text-[10px] text-slate-700 font-medium">{p.quantite}</div>
                          <div className="px-3 py-3 text-right w-24 text-[10px] text-slate-700 font-medium">{formatCurrency(p.prix_unitaire)}</div>
                          <div className="px-3 py-3 text-right w-24 text-[10px] text-slate-800 font-bold">{formatCurrency(p.quantite * p.prix_unitaire)}</div>
                        </div>
                      ))
                    ) : (
                      <div className="grid grid-cols-[1fr_auto_auto_auto] bg-slate-50 border-t border-slate-200">
                        <div className="px-3 py-3">
                          <p className="text-[10.5px] font-bold text-slate-800">Prestations digitales</p>
                          <p className="text-[8.5px] text-slate-500 mt-0.5 leading-relaxed">Voir devis pour le détail complet des prestations</p>
                        </div>
                        <div className="px-3 py-3 text-center w-12 text-[10px] text-slate-700 font-medium">1</div>
                        <div className="px-3 py-3 text-right w-24 text-[10px] text-slate-700 font-medium">{formatCurrency(d.montant_ht)}</div>
                        <div className="px-3 py-3 text-right w-24 text-[10px] text-slate-800 font-bold">{formatCurrency(d.montant_ht)}</div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Totals */}
                <div className="px-8 pt-4 flex justify-end">
                  <div className="w-60 rounded-lg overflow-hidden border border-slate-200">
                    <div className="flex justify-between px-4 py-2.5 bg-white border-b border-slate-100">
                      <span className="text-[10px] text-slate-500">Sous-total HT</span>
                      <span className="text-[10px] font-bold text-slate-700">{formatCurrency(d.montant_ht)}</span>
                    </div>
                    {hasTVA && (
                      <div className="flex justify-between px-4 py-2.5 bg-white border-b border-slate-100">
                        <span className="text-[10px] text-slate-500">TVA ({d.tva}%)</span>
                        <span className="text-[10px] font-bold text-slate-700">{formatCurrency(d.montant_ttc - d.montant_ht)}</span>
                      </div>
                    )}
                    <div className="flex justify-between px-4 py-3 bg-[#08143A]">
                      <span className="text-[10px] font-bold text-[#00A2FF] uppercase tracking-wide">Total TTC</span>
                      <span className="text-sm font-black text-white">{formatCurrency(d.montant_ttc)}</span>
                    </div>
                  </div>
                </div>

                {/* Value prop */}
                <div className="px-8 pt-6">
                  <div className="flex gap-3 rounded-lg bg-slate-50 border border-slate-200 p-4">
                    <div className="w-0.5 flex-shrink-0 bg-[#1E64C8] rounded-full self-stretch" />
                    <div>
                      <p className="text-[9px] font-bold text-[#1E64C8] uppercase tracking-widest mb-1.5">Notre engagement</p>
                      <p className="text-[9.5px] text-slate-600 leading-relaxed">
                        Chez NEXT GITAL, chaque projet est une opportunité de créer de la valeur durable pour votre entreprise.
                        Nous combinons expertise technique, design premium et stratégie digitale pour livrer des solutions
                        qui génèrent des résultats mesurables. Notre équipe vous accompagne de la conception à la mise en ligne,
                        avec un support continu post-livraison.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Conditions + Bank */}
                <div className="px-8 pt-5 pb-6 grid grid-cols-2 gap-5 flex-1">
                  <div>
                    <p className="text-[9px] font-bold text-[#1E64C8] uppercase tracking-widest mb-2">Conditions de paiement</p>
                    <ul className="space-y-1.5">
                      {displayConditions.map((c, i) => (
                        <li key={i} className="flex gap-2 text-[9.5px] text-slate-600">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#1E64C8] flex-shrink-0 mt-1.5" />
                          {c}
                        </li>
                      ))}
                    </ul>
                  </div>

                  {bankParts.length > 0 && (
                    <div className="bg-slate-50 rounded-lg border border-slate-200 p-4">
                      <p className="text-[9px] font-bold text-[#1E64C8] uppercase tracking-widest mb-3">Coordonnées bancaires</p>
                      <div className="space-y-2.5">
                        {bankParts.map(({ label, val }, i) => (
                          <div key={i}>
                            <p className="text-[8px] text-slate-400 font-bold uppercase">{label}</p>
                            <p className="text-[9.5px] font-mono font-semibold text-slate-700 mt-0.5">{val}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-8 py-3 border-t border-slate-100 flex justify-between items-center">
                  <p className="text-[8px] text-slate-400">Merci de votre confiance — Document confidentiel</p>
                  <p className="text-[8px] font-mono text-slate-400">{d.numero}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/* ─── Main DevisPage ──────────────────────────────────────────────── */
export default function DevisPage() {
  const navigate      = useNavigate()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const { data: devis = [], isLoading } = useDevis()
  const createDevis    = useCreateDevis()
  const deleteDevis    = useDeleteDevis()
  const updateDevis    = useUpdateDevis()
  const createFacture  = useCreateFacture()
  const { data: allFactures = [] } = useFactures()

  const convertToFacture = async (d: Devis) => {
    try {
      const today    = new Date().toISOString().slice(0, 10)
      const echeance = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)

      /* Sequential FAC-YYYY-NNN — no collision with existing factures */
      const year   = new Date().getFullYear()
      const maxSeq = allFactures
        .filter(x => x.numero.startsWith(`FAC-${year}-`))
        .reduce((max, x) => {
          const m = x.numero.match(/FAC-\d{4}-(\d+)/)
          return m ? Math.max(max, parseInt(m[1], 10)) : max
        }, 0)
      const nextNum = `FAC-${year}-${String(maxSeq + 1).padStart(3, '0')}`

      /* Copy the full JSON notes payload — preserves prestations,
         conditions, bankInfo and signature so the new facture opens
         pre-filled in the wizard. */
      await createFacture.mutateAsync({
        numero:        nextNum,
        client_id:     d.client_id,
        statut:        'impayee',
        date_emission: today,
        date_echeance: echeance,
        montant_ht:    d.montant_ht,
        tva:           d.tva,
        montant_ttc:   d.montant_ttc,
        montant_paye:  0,
        notes:         d.notes,
      } as any)
      toast.success(`Facture ${nextNum} créée depuis ${d.numero}`)
      navigate(`/${tenantSlug}/factures`)
    } catch {
      toast.error('Erreur lors de la conversion')
    }
  }
  const [search,       setSearch]       = useState('')
  const [filterStatut, setFilterStatut] = useState('all')
  const [dateRange,    setDateRange]    = useState<DateRange>(DEFAULT_RANGE)
  const [wizardOpen,   setWizardOpen]   = useState(false)
  const [wizardStep,   setWizardStep]   = useState(1)
  const [editing,      setEditing]      = useState<Devis | undefined>()
  const [delTarget,    setDelTarget]    = useState<Devis | null>(null)
  const [previewing,   setPreviewing]   = useState<Devis | null>(null)
  const [sendTarget,   setSendTarget]   = useState<Devis | null>(null)
  const [statusConfirm, setStatusConfirm] = useState<{ devis: Devis; newStatut: Devis['statut'] } | null>(null)
  const { data: clients = [] } = useClients()

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const filtered = useMemo(() =>
    devis.filter(d => {
      const matchSearch = !search || [d.numero, d.client_nom].some(f => f?.toLowerCase().includes(search.toLowerCase()))
      const matchStatut = filterStatut === 'all' || d.statut === filterStatut
      const matchDate   = dateMatch(d.date_emission)
      return matchSearch && matchStatut && matchDate
    })
  , [devis, search, filterStatut, dateMatch])

  /* ── Stats: all three as monetary amounts (cohérence dashboard) ── */
  const stats = useMemo(() => ({
    total:     devis.reduce((s, d) => s + d.montant_ttc, 0),
    acceptes:  devis.filter(d => d.statut === 'accepte').reduce((s, d) => s + d.montant_ttc, 0),
    enAttente: devis.filter(d => d.statut === 'envoye').reduce((s, d) => s + d.montant_ttc, 0),
  }), [devis])

  const closeWizard = () => { setWizardOpen(false); setEditing(undefined); setWizardStep(1) }
  const openNew  = () => { setEditing(undefined); setWizardStep(1); setWizardOpen(true) }
  const openEdit = (d: Devis) => { setEditing(d); setWizardStep(2); setWizardOpen(true) }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Devis</h1>
          <p className="text-muted-foreground text-sm mt-1">{devis.length} devis · {formatCurrency(stats.total)} total</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={devisSchema}
            data={devis}
            onImport={async (row) => { await createDevis.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={openNew}>
            <Plus className="w-4 h-4" /> Nouveau devis
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {[
          { label: 'Total pipeline', value: formatCurrency(stats.total),     color: 'text-foreground' },
          { label: 'Acceptés',       value: formatCurrency(stats.acceptes),  color: 'text-emerald-600 dark:text-emerald-400' },
          { label: 'En attente',     value: formatCurrency(stats.enAttente), color: 'text-amber-600 dark:text-amber-400'   },
        ].map(s => (
          <div key={s.label} className="card-premium p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{s.label}</p>
            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Date filter */}
      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={filterStatut} onValueChange={setFilterStatut}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous</SelectItem>
            {Object.entries(STATUT_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="card-premium overflow-hidden">
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="table-header">
                {['N° Devis', 'Client', 'Émission', 'Expiration', 'Montant TTC', 'Statut', ''].map(h => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={7} className="text-center py-12"><Loader2 className="w-6 h-6 animate-spin text-blue-600 dark:text-blue-400 mx-auto" /></td></tr>
              ) : filtered.map(d => {
                const s = STATUT_CONFIG[d.statut]
                return (
                  <tr key={d.id} className="table-row group">
                    <td className="font-mono font-medium text-foreground">{d.numero}</td>
                    <td className="text-foreground">{d.client_nom || '—'}</td>
                    <td className="text-muted-foreground">{formatDate(d.date_emission)}</td>
                    <td className="text-muted-foreground">{d.date_expiration ? formatDate(d.date_expiration) : '—'}</td>
                    <td className="font-semibold text-foreground">{formatCurrency(d.montant_ttc)}</td>
                    <td className="px-4 py-3">
                      <Select
                        value={d.statut}
                        disabled={updateDevis.isPending}
                        onValueChange={v => {
                          if (v !== d.statut) setStatusConfirm({ devis: d, newStatut: v as Devis['statut'] })
                        }}
                      >
                        <SelectTrigger className="h-auto w-auto p-0 border-0 bg-transparent shadow-none focus:ring-0 [&>svg]:hidden">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full cursor-pointer ${s?.bg} ${s?.color}`}>
                            {s?.label}
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {Object.entries(STATUT_CONFIG).map(([k, v]) => (
                            <SelectItem key={k} value={k}>
                              <span className={`text-xs font-semibold ${v.color}`}>{v.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        {/* Always-visible: Aperçu + Modifier */}
                        <button
                          onClick={() => navigate(`/${tenantSlug}/devis/${d.id}/preview`)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-600/10 transition-colors"
                          title="Aperçu & impression"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          Aperçu
                        </button>
                        <button
                          onClick={() => openEdit(d)}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-slate-400 hover:text-foreground hover:bg-muted transition-colors"
                          title="Modifier le devis"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          Modifier
                        </button>

                        <button
                          onClick={() => convertToFacture(d)}
                          disabled={createFacture.isPending}
                          className="flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                          title="Créer une facture à partir de ce devis (copie prestations, conditions, banque, signature)"
                        >
                          {createFacture.isPending
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <Receipt className="w-3.5 h-3.5" />}
                          Facturer
                        </button>

                        {/* Hidden-until-hover: envoi, PDF, delete */}
                        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-blue-500" onClick={() => setSendTarget(d)} title="Envoyer au client">
                            <Send className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => generateDevisPDFWithRetry(d, clients.find(c => c.id === d.client_id)).catch(console.error)} title="Télécharger PDF">
                            <Download className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400" onClick={() => setDelTarget(d)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {!isLoading && filtered.length === 0 && (
            <div className="empty-state py-16">
              <FileText className="empty-state-icon" />
              <p className="empty-state-title">Aucun devis trouvé</p>
            </div>
          )}
        </div>
      </div>

      {/* Wizard dialog — confirm before discarding unsaved data */}
      <Dialog
        open={wizardOpen}
        onOpenChange={v => {
          if (!v) {
            if (wizardStep === 1) { closeWizard(); return }
            // Step 2 has unsaved content — ask before discarding
            if (window.confirm('Quitter sans sauvegarder ? Les modifications seront perdues.')) {
              closeWizard()
            }
          }
        }}
      >
        <DialogContent
          className={wizardStep === 2
            ? '!left-0 !top-0 !translate-x-0 !translate-y-0 !max-w-none !w-screen !h-[100dvh] !max-h-[100dvh] !p-0 !gap-0 !rounded-none !overflow-hidden [&>button:last-child]:hidden'
            : 'max-w-2xl max-h-[90dvh] overflow-y-auto'
          }
        >
          {wizardStep === 1 && (
            <DialogHeader>
              <DialogTitle>{editing ? `Modifier ${editing.numero}` : 'Nouveau devis'}</DialogTitle>
            </DialogHeader>
          )}
          <DevisWizard
            editDevis={editing}
            onClose={closeWizard}
            onStepChange={setWizardStep}
          />
        </DialogContent>
      </Dialog>

      {/* PDF Preview */}
      {previewing && (
        <DevisPreviewModal
          devis={previewing}
          client={clients.find(c => c.id === previewing.client_id)}
          onClose={() => setPreviewing(null)}
        />
      )}

      {/* Status change confirm */}
      <Dialog open={!!statusConfirm} onOpenChange={v => { if (!v) setStatusConfirm(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-400" /> Modifier le statut ?
            </DialogTitle>
          </DialogHeader>
          {statusConfirm && (
            <>
              <p className="text-sm text-muted-foreground py-2">
                Passer <strong className="text-foreground">{statusConfirm.devis.numero}</strong> de{' '}
                <span className={`font-semibold ${STATUT_CONFIG[statusConfirm.devis.statut]?.color}`}>
                  {STATUT_CONFIG[statusConfirm.devis.statut]?.label}
                </span>{' '}vers{' '}
                <span className={`font-semibold ${STATUT_CONFIG[statusConfirm.newStatut]?.color}`}>
                  {STATUT_CONFIG[statusConfirm.newStatut]?.label}
                </span> ?
              </p>
              <div className="flex justify-end gap-3">
                <Button variant="secondary" size="sm" onClick={() => setStatusConfirm(null)}>Annuler</Button>
                <Button
                  size="sm"
                  disabled={updateDevis.isPending}
                  className="bg-[#1e64c4] hover:bg-[#1558b0] text-white border-0"
                  onClick={() => {
                    updateDevis.mutate(
                      { id: statusConfirm.devis.id, statut: statusConfirm.newStatut },
                      { onSettled: () => setStatusConfirm(null) }
                    )
                  }}
                >
                  {updateDevis.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  Confirmer
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!delTarget} onOpenChange={v => { if (!v) setDelTarget(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="w-5 h-5" /> Supprimer ce devis ?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            Le devis <strong className="text-foreground">{delTarget?.numero}</strong> sera définitivement supprimé.
          </p>
          <div className="flex justify-end gap-3">
            <Button variant="secondary" size="sm" onClick={() => setDelTarget(null)}>Annuler</Button>
            <Button size="sm" className="bg-red-500 hover:bg-red-600 text-white border-0"
              onClick={() => { if (delTarget) { deleteDevis.mutate(delTarget.id); setDelTarget(null) }}}>
              <Trash2 className="w-3.5 h-3.5" /> Supprimer
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Envoyer au client (PDF joint) */}
      {sendTarget && (() => {
        const c = clients.find(cl => cl.id === sendTarget.client_id)
        return (
          <SendDocumentDialog
            open={!!sendTarget}
            onClose={() => setSendTarget(null)}
            kind="devis"
            numero={sendTarget.numero}
            filename={`${sendTarget.numero}.pdf`}
            defaultEmail={c?.email ?? ''}
            clientNom={sendTarget.client_nom ?? c?.entreprise ?? c?.nom}
            buildPdf={() => generateDevisPDFBlob(sendTarget, {
              clientNom:   sendTarget.client_nom ?? c?.entreprise ?? c?.nom,
              clientEmail: c?.email ?? undefined,
            })}
          />
        )
      })()}
    </div>
  )
}
