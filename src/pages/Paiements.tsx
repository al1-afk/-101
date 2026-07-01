import { useState, useMemo, useRef, useEffect } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, Folder, ChevronRight, ChevronDown, Trash2, Pencil,
  TrendingUp, TrendingDown, CheckCircle2, Clock,
  CreditCard, Banknote, Receipt, FileText, Wallet,
  Trophy, Calendar, Crown, BarChart3, Minus, FileSignature, Printer, Send,
} from 'lucide-react'
import { contratsApi } from '@/lib/api'
import { toast } from 'sonner'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

function PaiementsChartTooltip({ active, payload, label, year }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-3 text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">{label} {year}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-slate-400">{p.name === 'encaisse' ? 'Encaissé' : 'En attente'} :</span>
          <span className="font-bold text-slate-700 dark:text-slate-200">
            {Number(p.value).toLocaleString('fr-FR')} MAD
          </span>
        </div>
      ))}
    </div>
  )
}
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { usePaiements, useCreatePaiement, useDeletePaiement, type Paiement, type PaiementMethode, type PaiementStatus, type PaiementType } from '@/hooks/usePaiements'
import { useClients, useCreateClient } from '@/hooks/useClients'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { paiementsSchema, contratsSchema } from '@/lib/importExportSchemas'
import { generatePaiementReceiptPDF, generatePaiementReceiptPDFBlob } from '@/lib/generatePaiementReceiptPDF'
import { SendDocumentDialog } from '@/components/SendDocumentDialog'

function ClientCombobox({
  value, onChange, clients, onCreate, placeholder = 'Sélectionner un client',
}: {
  value: string
  onChange: (id: string) => void
  clients: { id: string; nom: string }[]
  onCreate?: (nom: string) => Promise<{ id: string; nom: string } | null>
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [creating, setCreating] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const selected = clients.find(c => c.id === value)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return clients
    return clients.filter(c => c.nom.toLowerCase().includes(q))
  }, [clients, query])

  const trimmed = query.trim()
  const exactExists = trimmed && clients.some(c => c.nom.toLowerCase() === trimmed.toLowerCase())
  const showCreate = !!onCreate && trimmed.length > 0 && !exactExists

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  const handleCreate = async () => {
    if (!onCreate || !trimmed || creating) return
    setCreating(true)
    try {
      const created = await onCreate(trimmed)
      if (created) {
        onChange(created.id)
        setOpen(false)
        setQuery('')
      }
    } finally {
      setCreating(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div
        role="combobox"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(true) }}
        className="flex items-center justify-between w-full h-10 px-3 rounded-md border border-input bg-background text-sm cursor-pointer hover:border-ring/60 transition-colors"
      >
        <span className={selected ? '' : 'text-muted-foreground'}>
          {selected?.nom ?? placeholder}
        </span>
        <ChevronDown className="w-4 h-4 text-muted-foreground" />
      </div>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-popover border border-border rounded-md shadow-lg overflow-hidden">
          <div className="p-2 border-b border-border">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && showCreate && filtered.length === 0) {
                    e.preventDefault()
                    handleCreate()
                  }
                }}
                placeholder="Rechercher ou créer..."
                className="pl-7 h-8 text-sm"
              />
            </div>
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            {filtered.length === 0 && !showCreate && (
              <div className="px-3 py-2 text-sm text-muted-foreground">Aucun client</div>
            )}
            {filtered.map(c => (
              <div
                key={c.id}
                onClick={() => { onChange(c.id); setOpen(false); setQuery('') }}
                className={`px-3 py-1.5 text-sm cursor-pointer hover:bg-accent ${c.id === value ? 'bg-accent/60 font-medium' : ''}`}
              >
                {c.nom}
              </div>
            ))}
            {showCreate && (
              <div
                onClick={handleCreate}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-accent border-t border-border flex items-center gap-2 text-blue-600 dark:text-blue-400"
              >
                <Plus className="w-3.5 h-3.5" />
                {creating ? 'Création...' : <>Créer « <span className="font-medium">{trimmed}</span> »</>}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────────────────────
   Revenus prévisionnels du mois — saisie libre (titre + montant)
   Stocké localement par tenant + mois (YYYY-MM).
   ───────────────────────────────────────────────────────────── */
type PrevisionItem = { id: string; titre: string; montant: number }

function PrevisionsRevenus() {
  const monthKey = new Date().toISOString().slice(0, 7) // YYYY-MM
  const storageKey = `gestiq_previsions_revenus_${monthKey}`

  const [items, setItems] = useState<PrevisionItem[]>(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      return raw ? JSON.parse(raw) : []
    } catch { return [] }
  })
  const [titre, setTitre]   = useState('')
  const [montant, setMontant] = useState('')

  useEffect(() => {
    try { localStorage.setItem(storageKey, JSON.stringify(items)) } catch { /* ignore */ }
  }, [items, storageKey])

  const total = items.reduce((s, i) => s + i.montant, 0)

  const add = () => {
    const m = Number(montant)
    if (!titre.trim() || !Number.isFinite(m) || m <= 0) return
    setItems(p => [...p, { id: crypto.randomUUID(), titre: titre.trim(), montant: m }])
    setTitre('')
    setMontant('')
  }

  const remove = (id: string) => setItems(p => p.filter(i => i.id !== id))

  const monthLabel = new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })

  return (
    <div className="card-premium p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Revenus prévisionnels — {monthLabel}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Ce que vous attendez d'encaisser ce mois-ci (hors contrats)
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider">Total prévu</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatCurrency(total)}
          </p>
        </div>
      </div>

      <div className="flex gap-2 mb-3">
        <AutocorrectInput
          value={titre}
          onChange={e => setTitre(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="Titre (ex: Client X, Devis Y...)"
          className="flex-1"
        />
        <Input
          type="number"
          value={montant}
          onChange={e => setMontant(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') add() }}
          placeholder="Montant"
          className="w-32"
        />
        <Button size="sm" onClick={add} disabled={!titre.trim() || !Number(montant)}>
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      {items.length === 0 ? (
        <p className="text-center text-xs text-muted-foreground py-4">
          Aucune prévision ce mois. Ajoutez une ligne au-dessus ↑
        </p>
      ) : (
        <div className="space-y-1.5">
          {items.map(i => (
            <div key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 rounded-md bg-muted/40 hover:bg-muted/60 transition-colors group">
              <span className="text-sm text-foreground flex-1 truncate">{i.titre}</span>
              <span className="text-sm font-medium text-emerald-600 dark:text-emerald-400 tabular-nums">
                {formatCurrency(i.montant)}
              </span>
              <Button
                variant="ghost" size="icon"
                className="w-6 h-6 text-red-500 opacity-0 group-hover:opacity-100"
                onClick={() => remove(i.id)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const REF_PREFIX: Record<PaiementMethode, string> = {
  virement: 'VRS', especes: 'ESP', cheque: 'CHQ', carte_bancaire: 'CRT', paypal: 'PPL', prelevement: 'PRL',
}
const genRef = (methode: PaiementMethode) => {
  const y = new Date().getFullYear()
  const n = Math.floor(Math.random() * 900000) + 100000
  return `${REF_PREFIX[methode]}-${y}-${n}`
}

type PaiementForm = {
  client_id:     string
  reference:     string
  date:          string
  montant:       number
  type_paiement: PaiementType
  methode:       PaiementMethode
  status:        PaiementStatus
  notes:         string
}

const EMPTY_PAIEMENT: PaiementForm & { contrat_id: string } = {
  client_id:     '',
  reference:     '',
  date:          new Date().toISOString().slice(0, 10),
  montant:       0,
  type_paiement: 'autre',
  methode:       'virement',
  status:        'paye',
  notes:         '',
  contrat_id:    '',
}

interface Contrat {
  id: string; created_at: string; numero: string; client: string; objet: string
  montant: number; date_debut: string; date_fin: string
  statut: 'actif' | 'expire' | 'resilie' | 'brouillon'
}

const EMPTY_CONTRAT = {
  numero:     '',
  client:     '',
  objet:      'Site web',
  montant:    0,
  date_debut: new Date().toISOString().slice(0, 10),
  date_fin:   '',
  statut:     'actif' as Contrat['statut'],
}
const genContratNumero = () => {
  const y = new Date().getFullYear()
  const n = String(Math.floor(Math.random() * 9000) + 1000).padStart(4, '0')
  return `CTR-${y}-${n}`
}

const getInitials = (name: string) => {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '—'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

const AVATAR_PALETTE = [
  'bg-blue-500', 'bg-emerald-500', 'bg-purple-500',
  'bg-amber-500', 'bg-rose-500', 'bg-cyan-500', 'bg-indigo-500', 'bg-pink-500',
]
const avatarColor = (name: string) => {
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) | 0
  return AVATAR_PALETTE[Math.abs(h) % AVATAR_PALETTE.length]
}

const METHODE_CONFIG: Record<string, { label: string; icon: React.FC<any>; color: string; bg: string }> = {
  virement:       { label: 'Virement',    icon: Wallet,     color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-50 dark:bg-blue-500/10' },
  especes:        { label: 'Espèces',     icon: Banknote,   color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/10' },
  cheque:         { label: 'Chèque',      icon: Receipt,    color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-500/10' },
  carte_bancaire: { label: 'Carte',       icon: CreditCard, color: 'text-purple-600 dark:text-purple-400',   bg: 'bg-purple-50 dark:bg-purple-500/10' },
  paypal:         { label: 'PayPal',      icon: CreditCard, color: 'text-sky-600 dark:text-sky-400',         bg: 'bg-sky-50 dark:bg-sky-500/10' },
  prelevement:    { label: 'Prélèvement', icon: FileText,   color: 'text-indigo-600 dark:text-indigo-400',   bg: 'bg-indigo-50 dark:bg-indigo-500/10' },
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.FC<any> }> = {
  paye:       { label: 'Payé',       color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-500/15', icon: CheckCircle2 },
  en_attente: { label: 'En attente', color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-500/15',     icon: Clock },
}

export default function Paiements() {
  const qc = useQueryClient()
  const { data: paiements = [], isLoading } = usePaiements()
  const { data: clients   = [] } = useClients()
  const createClient = useCreateClient()
  const { data: contrats  = [] } = useQuery<Contrat[]>({
    queryKey: ['contrats'],
    queryFn: () => contratsApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<Contrat[]>,
  })
  const deleteP = useDeletePaiement()
  const createP = useCreatePaiement()

  const createContrat = useMutation({
    mutationFn: (data: typeof EMPTY_CONTRAT) => contratsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contrats'] })
      toast.success('Contrat créé')
      setShowContratForm(false)
      setEditingContratId(null)
      setContratForm(EMPTY_CONTRAT)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const updateContrat = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & typeof EMPTY_CONTRAT) =>
      (contratsApi as any).update(id, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['contrats'] })
      toast.success('Contrat modifié')
      setShowContratForm(false)
      setEditingContratId(null)
      setContratForm(EMPTY_CONTRAT)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const removeContrat = useMutation({
    mutationFn: (id: string) => contratsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contrats'] }); toast.success('Contrat supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [view, setView] = useState<'paiements' | 'contrats'>('paiements')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<PaiementForm & { contrat_id: string }>(EMPTY_PAIEMENT)
  const [showContratForm, setShowContratForm] = useState(false)
  const [contratForm, setContratForm] = useState(EMPTY_CONTRAT)
  const [editingContratId, setEditingContratId] = useState<string | null>(null)
  const [expandedContrats, setExpandedContrats] = useState<Set<string>>(() => new Set())
  const [sendTarget, setSendTarget] = useState<{ p: Paiement; nom: string; email: string | null } | null>(null)

  const openContratForm = () => {
    setEditingContratId(null)
    setContratForm({ ...EMPTY_CONTRAT, numero: genContratNumero() })
    setShowContratForm(true)
  }

  const openEditContrat = (c: Contrat) => {
    setEditingContratId(c.id)
    setContratForm({
      numero:     c.numero ?? '',
      client:     c.client ?? '',
      objet:      c.objet ?? 'Site web',
      montant:    Number(c.montant) || 0,
      date_debut: c.date_debut ?? new Date().toISOString().slice(0, 10),
      date_fin:   c.date_fin ?? '',
      statut:     c.statut ?? 'actif',
    })
    setShowContratForm(true)
  }

  const toggleContrat = (id: string) => {
    setExpandedContrats(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const contratsWithProgress = useMemo(() => {
    return contrats.map(c => {
      const linked = paiements.filter(p => p.contrat_id === c.id && p.status === 'paye')
      const paid   = linked.reduce((s, p) => s + Number(p.montant), 0)
      const total  = Number(c.montant) || 0
      const remaining = Math.max(0, total - paid)
      const status: 'attente' | 'partiel' | 'paye' =
        paid === 0 ? 'attente'
          : paid >= total && total > 0 ? 'paye'
          : 'partiel'
      return { ...c, montant: total, paiements: linked, paid, remaining, progressStatus: status }
    })
  }, [contrats, paiements])

  const openForm = (contratId?: string) => {
    const pre: typeof EMPTY_PAIEMENT = { ...EMPTY_PAIEMENT, reference: genRef('virement') }
    if (contratId) {
      const c = contrats.find(x => x.id === contratId)
      if (c) {
        pre.contrat_id = contratId
        const matchClient = clients.find(cl => cl.nom === c.client)
        if (matchClient) pre.client_id = matchClient.id
      }
    }
    setForm(pre)
    setShowForm(true)
  }

  const submitForm = () => {
    if (!form.client_id || !form.montant) return
    createP.mutate(
      {
        client_id:     form.client_id,
        reference:     form.reference || genRef(form.methode),
        date:          form.date,
        montant:       Number(form.montant),
        type_paiement: form.type_paiement,
        methode:       form.methode,
        status:        form.status,
        notes:         form.notes || null,
        facture_id:    null,
        contrat_id:    form.contrat_id || null,
      },
      { onSuccess: () => { setShowForm(false); setForm(EMPTY_PAIEMENT) } },
    )
  }

  const [search,      setSearch]      = useState('')
  const [methodeFilter, setMethodeFilter] = useState<string>('all')
  const [statusFilter,  setStatusFilter]  = useState<string>('all')
  const [clientFilter,  setClientFilter]  = useState<string>('all')
  const [dateRange,     setDateRange]     = useState<DateRange>(DEFAULT_RANGE)
  const [expandedYears, setExpandedYears] = useState<Set<number>>(() => new Set([new Date().getFullYear()]))
  const [chartYear, setChartYear] = useState<number>(() => new Date().getFullYear())

  const clientMap = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach(c => m.set(c.id, c.nom))
    return m
  }, [clients])

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    return paiements.filter(p => {
      const clientNom = clientMap.get(p.client_id) ?? ''
      if (q && !p.reference.toLowerCase().includes(q) && !clientNom.toLowerCase().includes(q)) return false
      if (methodeFilter !== 'all' && p.methode !== methodeFilter) return false
      if (statusFilter  !== 'all' && p.status  !== statusFilter)  return false
      if (clientFilter  !== 'all' && p.client_id !== clientFilter) return false
      if (!dateMatch(p.date)) return false
      return true
    })
  }, [paiements, search, methodeFilter, statusFilter, clientFilter, clientMap, dateMatch])

  const stats = useMemo(() => {
    const paye = filtered.filter(p => p.status === 'paye')

    const contratsInRange = contratsWithProgress.filter(c => dateMatch(c.date_debut))
    const activeRemaining = contratsInRange.filter(
      c => c.remaining > 0 && c.statut !== 'resilie' && c.statut !== 'expire',
    )
    const contratsRemaining = activeRemaining.reduce((s, c) => s + c.remaining, 0)

    const today = new Date(); today.setHours(0, 0, 0, 0)
    const futureDeadlines = activeRemaining
      .map(c => (c.date_fin ? new Date(c.date_fin) : null))
      .filter((d): d is Date => !!d && !isNaN(d.getTime()))
      .sort((a, b) => a.getTime() - b.getTime())
    const nextDeadline =
      futureDeadlines.find(d => d.getTime() >= today.getTime()) ??
      futureDeadlines[futureDeadlines.length - 1] ??
      null
    const daysLeft = nextDeadline
      ? Math.round((nextDeadline.getTime() - today.getTime()) / 86_400_000)
      : null

    return {
      totalEncaisse:          paye.reduce((s, p) => s + Number(p.montant), 0),
      countPaye:              paye.length,
      totalEnAttente:         contratsRemaining,
      countAttente:           activeRemaining.length,
      count:                  filtered.length,
      contratsRemaining,
      contratsRemainingCount: activeRemaining.length,
      nextDeadline,
      daysLeft,
    }
  }, [filtered, contratsWithProgress, dateMatch])

  const MOIS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

  const analytics = useMemo(() => {
    const paye = filtered.filter(p => p.status === 'paye')

    const byClient = new Map<string, { total: number; count: number }>()
    paye.forEach(p => {
      const cur = byClient.get(p.client_id) ?? { total: 0, count: 0 }
      cur.total += Number(p.montant)
      cur.count += 1
      byClient.set(p.client_id, cur)
    })
    const topClients = [...byClient.entries()]
      .map(([id, v]) => ({ id, nom: clientMap.get(id) ?? '—', ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    const byMonth = new Map<string, { total: number; count: number; year: number; month: number }>()
    paye.forEach(p => {
      const d = new Date(p.date)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      const cur = byMonth.get(key) ?? { total: 0, count: 0, year: d.getFullYear(), month: d.getMonth() }
      cur.total += Number(p.montant)
      cur.count += 1
      byMonth.set(key, cur)
    })
    const topMonths = [...byMonth.values()]
      .sort((a, b) => b.total - a.total)
      .slice(0, 5)

    const now = new Date()
    const curY = now.getFullYear()
    const curM = now.getMonth()
    const prevM = curM === 0 ? 11 : curM - 1
    const prevMY = curM === 0 ? curY - 1 : curY
    const totalCurMonth = byMonth.get(`${curY}-${curM}`)?.total ?? 0
    const totalPrevMonth = byMonth.get(`${prevMY}-${prevM}`)?.total ?? 0
    const deltaMonth = totalPrevMonth === 0
      ? (totalCurMonth > 0 ? 100 : 0)
      : ((totalCurMonth - totalPrevMonth) / totalPrevMonth) * 100

    let totalCurYear = 0
    let totalPrevYear = 0
    byMonth.forEach(v => {
      if (v.year === curY) totalCurYear += v.total
      else if (v.year === curY - 1) totalPrevYear += v.total
    })
    const deltaYear = totalPrevYear === 0
      ? (totalCurYear > 0 ? 100 : 0)
      : ((totalCurYear - totalPrevYear) / totalPrevYear) * 100

    const topClientTotal = topClients[0]?.total ?? 0
    const topMonthTotal = topMonths[0]?.total ?? 0

    return {
      topClients, topMonths,
      totalCurMonth, totalPrevMonth, deltaMonth,
      totalCurYear, totalPrevYear, deltaYear,
      topClientTotal, topMonthTotal,
      curY, curM,
    }
  }, [filtered, clientMap])

  const MOIS_SHORT = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc']

  const yearlyChart = useMemo(() => {
    const availableYears = [...new Set(filtered.map(p => new Date(p.date).getFullYear()))].sort((a, b) => b - a)

    const monthly = Array.from({ length: 12 }, (_, m) => ({
      mois: MOIS_SHORT[m],
      monthIdx: m,
      encaisse: 0,
      attente: 0,
      count: 0,
    }))

    filtered.forEach(p => {
      const d = new Date(p.date)
      if (d.getFullYear() !== chartYear) return
      const m = d.getMonth()
      const amt = Number(p.montant)
      if (p.status === 'paye')       monthly[m].encaisse += amt
      if (p.status === 'en_attente') monthly[m].attente  += amt
      monthly[m].count += 1
    })

    const totalYear = monthly.reduce((s, m) => s + m.encaisse, 0)
    const bestMonth = monthly.reduce((best, m) => m.encaisse > best.encaisse ? m : best, monthly[0])
    const activeMonths = monthly.filter(m => m.encaisse > 0).length
    const avgMonth = activeMonths > 0 ? totalYear / activeMonths : 0

    return { availableYears, monthly, totalYear, bestMonth, avgMonth, activeMonths }
  }, [filtered, chartYear])

  const grouped = useMemo(() => {
    const g = new Map<number, Map<number, Paiement[]>>()
    filtered.forEach(p => {
      const d = new Date(p.date)
      const y = d.getFullYear()
      const m = d.getMonth()
      if (!g.has(y)) g.set(y, new Map())
      const ym = g.get(y)!
      if (!ym.has(m)) ym.set(m, [])
      ym.get(m)!.push(p)
    })
    return [...g.entries()]
      .sort((a, b) => b[0] - a[0])
      .map(([year, months]) => ({
        year,
        total: [...months.values()].flat().reduce((s, p) => s + Number(p.montant), 0),
        count: [...months.values()].flat().length,
        months: [...months.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([m, list]) => ({ month: m, list, total: list.reduce((s, p) => s + Number(p.montant), 0) })),
      }))
  }, [filtered])

  const toggleYear = (y: number) => {
    setExpandedYears(prev => {
      const next = new Set(prev)
      next.has(y) ? next.delete(y) : next.add(y)
      return next
    })
  }

  if (isLoading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Chargement…</div>
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Paiements</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {view === 'paiements'
              ? `${paiements.length} paiement${paiements.length > 1 ? 's' : ''} enregistré${paiements.length > 1 ? 's' : ''}`
              : `${contrats.length} contrat${contrats.length > 1 ? 's' : ''}`}
          </p>
        </div>
        {view === 'paiements' ? (
          <div className="flex items-center gap-2">
            <ImportExportButtons
              schema={paiementsSchema}
              data={paiements}
              onImport={async (row) => { await createP.mutateAsync(row as any) }}
            />
            <Button size="sm" onClick={() => openForm()}>
              <Plus className="w-4 h-4" /> Nouveau paiement
            </Button>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <ImportExportButtons
              schema={contratsSchema}
              data={contrats}
              onImport={async (row) => { await createContrat.mutateAsync(row as any) }}
            />
            <Button size="sm" onClick={openContratForm}>
              <Plus className="w-4 h-4" /> Nouveau contrat
            </Button>
          </div>
        )}
      </div>

      {/* ── Tabs : Paiements / Contrats ── */}
      <div className="inline-flex items-center gap-1 bg-muted/50 rounded-xl p-1">
        <button
          onClick={() => setView('paiements')}
          className={`inline-flex items-center gap-2 text-sm px-4 py-1.5 rounded-lg font-semibold transition-all ${
            view === 'paiements'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          Paiements
        </button>
        <button
          onClick={() => setView('contrats')}
          className={`inline-flex items-center gap-2 text-sm px-4 py-1.5 rounded-lg font-semibold transition-all ${
            view === 'contrats'
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <FileSignature className="w-4 h-4" />
          Contrats
        </button>
      </div>

      {view === 'paiements' && <>
      {/* ── Date filter (en haut) ── */}
      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* ── Revenus prévisionnels du mois (saisie libre) ── */}
      <PrevisionsRevenus />

      {/* ── Volume total (CA) ── */}
      <div className="card-premium p-5 bg-gradient-to-br from-slate-900 to-slate-800 dark:from-slate-800 dark:to-slate-900 border-0 text-white">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-1">Volume total des transactions</p>
            <p className="text-3xl font-bold tabular-nums">
              {formatCurrency(stats.totalEncaisse + stats.totalEnAttente)}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              {stats.count + stats.contratsRemainingCount} transaction(s) · {new Set(filtered.map(p => p.client_id)).size} client(s)
            </p>
          </div>
          <div className="flex items-center gap-2 text-right flex-wrap">
            <div className="px-4 border-l border-slate-700">
              <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium">Encaissé</p>
              <p className="text-base font-bold text-emerald-400 tabular-nums">{formatCurrency(stats.totalEncaisse)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">{stats.countPaye} paiement(s)</p>
            </div>
            <div className="px-4 border-l border-slate-700">
              <p className="text-[10px] text-amber-400 uppercase tracking-wider font-medium">En attente</p>
              <p className="text-base font-bold text-amber-400 tabular-nums">{formatCurrency(stats.totalEnAttente)}</p>
              <p className="text-[10px] text-slate-500 mt-0.5">
                {stats.countAttente} contrat(s)
                {stats.nextDeadline && (
                  <>
                    {' · '}
                    <span className={
                      stats.daysLeft !== null && stats.daysLeft < 0
                        ? 'text-red-400'
                        : stats.daysLeft !== null && stats.daysLeft <= 30
                        ? 'text-amber-400'
                        : 'text-slate-500'
                    }>
                      {stats.daysLeft !== null && stats.daysLeft < 0
                        ? `en retard · ${formatDate(stats.nextDeadline.toISOString())}`
                        : stats.daysLeft !== null && stats.daysLeft === 0
                        ? `échéance aujourd'hui`
                        : `${stats.daysLeft}j · ${formatDate(stats.nextDeadline.toISOString())}`}
                    </span>
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Filtres ── */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-52">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher référence, client..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Select value={methodeFilter} onValueChange={setMethodeFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Méthode" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Toutes méthodes</SelectItem>
            <SelectItem value="virement">Virement</SelectItem>
            <SelectItem value="especes">Espèces</SelectItem>
            <SelectItem value="cheque">Chèque</SelectItem>
            <SelectItem value="carte_bancaire">Carte</SelectItem>
            <SelectItem value="paypal">PayPal</SelectItem>
            <SelectItem value="prelevement">Prélèvement</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="paye">Payé</SelectItem>
            <SelectItem value="en_attente">En attente</SelectItem>
          </SelectContent>
        </Select>
        <Select value={clientFilter} onValueChange={setClientFilter}>
          <SelectTrigger className="w-56"><SelectValue placeholder="Client" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les clients</SelectItem>
            {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nom}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* ── Liste groupée par année / mois ── */}
      {grouped.length === 0 ? (
        <div className="card p-12 text-center text-muted-foreground">
          Aucun paiement trouvé avec ces filtres.
        </div>
      ) : (
        <div className="space-y-2">
          {grouped.map(({ year, total, count, months }) => {
            const open = expandedYears.has(year)
            return (
              <div key={year} className="card-premium overflow-hidden">
                <button
                  onClick={() => toggleYear(year)}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {open ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                    <Folder className="w-5 h-5 text-blue-500" />
                    <span className="text-lg font-bold text-foreground">{year}</span>
                    <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">{count} paiement{count > 1 ? 's' : ''}</span>
                  </div>
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(total)}</span>
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-border"
                    >
                      {months.map(({ month, list, total: mTotal }) => (
                        <div key={month} className="border-b border-border last:border-0">
                          <div className="flex items-center justify-between px-5 py-2.5 bg-muted/20">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">{MOIS_FR[month]}</span>
                            <span className="text-xs font-semibold text-foreground tabular-nums">{formatCurrency(mTotal)} · {list.length}</span>
                          </div>
                          <div className="divide-y divide-border">
                            {list.map(p => {
                              const methConf = METHODE_CONFIG[p.methode] ?? METHODE_CONFIG.autre
                              const statConf = STATUS_CONFIG[p.status] ?? STATUS_CONFIG.paye
                              const MethIcon = methConf.icon
                              const StatIcon = statConf.icon
                              const nom = clientMap.get(p.client_id) ?? '—'
                              return (
                                <div key={p.id} className="flex items-center gap-4 px-5 py-3 hover:bg-muted/20 transition-colors">
                                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${methConf.bg}`}>
                                    <MethIcon className={`w-4 h-4 ${methConf.color}`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-sm font-semibold text-foreground truncate">{nom}</span>
                                      <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${statConf.bg} ${statConf.color}`}>
                                        <StatIcon className="w-2.5 h-2.5" />{statConf.label}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                                      <span className="font-mono">{p.reference}</span>
                                      <span>·</span>
                                      <span>{formatDate(p.date)}</span>
                                      <span>·</span>
                                      <span>{methConf.label}</span>
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(Number(p.montant))}</p>
                                  </div>
                                  <button
                                    type="button"
                                    title="Envoyer le reçu au client"
                                    aria-label={`Envoyer le reçu ${p.reference} au client`}
                                    onClick={() => {
                                      const c = clients.find(cl => cl.id === p.client_id)
                                      setSendTarget({ p, nom, email: c?.email ?? null })
                                    }}
                                    className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                  >
                                    <Send className="w-4 h-4" />
                                  </button>
                                  <button
                                    type="button"
                                    title="Imprimer le reçu"
                                    aria-label={`Imprimer le reçu ${p.reference}`}
                                    onClick={() => generatePaiementReceiptPDF(p, nom)}
                                    className="p-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-500/10 text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                                  >
                                    <Printer className="w-4 h-4" />
                                  </button>
                                  <button
                                    onClick={() => {
                                      if (confirm(`Supprimer le paiement ${p.reference} ?`)) deleteP.mutate(p.id)
                                    }}
                                    title="Supprimer"
                                    className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
        </div>
      )}

      {/* ── Analytics : Progression / Top clients / Top mois ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {/* Progression */}
        <div className="card-premium p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                <BarChart3 className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <span className="text-sm font-bold text-foreground">Progression</span>
            </div>
          </div>
          <div className="space-y-3">
            {(() => {
              const d = analytics.deltaMonth
              const Icon = d > 0 ? TrendingUp : d < 0 ? TrendingDown : Minus
              const color = d > 0 ? 'text-emerald-600 dark:text-emerald-400'
                : d < 0 ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground'
              const bg = d > 0 ? 'bg-emerald-50 dark:bg-emerald-500/10'
                : d < 0 ? 'bg-red-50 dark:bg-red-500/10'
                : 'bg-muted'
              return (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Ce mois</p>
                    <p className="text-base font-bold text-foreground tabular-nums">{formatCurrency(analytics.totalCurMonth)}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${bg} ${color}`}>
                    <Icon className="w-3 h-3" />
                    {d > 0 ? '+' : ''}{d.toFixed(1)}%
                  </span>
                </div>
              )
            })()}
            {(() => {
              const d = analytics.deltaYear
              const Icon = d > 0 ? TrendingUp : d < 0 ? TrendingDown : Minus
              const color = d > 0 ? 'text-emerald-600 dark:text-emerald-400'
                : d < 0 ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground'
              const bg = d > 0 ? 'bg-emerald-50 dark:bg-emerald-500/10'
                : d < 0 ? 'bg-red-50 dark:bg-red-500/10'
                : 'bg-muted'
              return (
                <div className="flex items-center justify-between pt-3 border-t border-border">
                  <div>
                    <p className="text-xs text-muted-foreground">Cette année</p>
                    <p className="text-base font-bold text-foreground tabular-nums">{formatCurrency(analytics.totalCurYear)}</p>
                  </div>
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${bg} ${color}`}>
                    <Icon className="w-3 h-3" />
                    {d > 0 ? '+' : ''}{d.toFixed(1)}%
                  </span>
                </div>
              )
            })()}
            <p className="text-[10px] text-muted-foreground">
              vs mois précédent ({formatCurrency(analytics.totalPrevMonth)}) · vs année préc. ({formatCurrency(analytics.totalPrevYear)})
            </p>
          </div>
        </div>

        {/* Top Clients */}
        <div className="card-premium p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                <Crown className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <span className="text-sm font-bold text-foreground">Top clients</span>
            </div>
            <span className="text-[10px] text-muted-foreground">Payé</span>
          </div>
          {analytics.topClients.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Aucun client payé</p>
          ) : (
            <div className="space-y-2">
              {analytics.topClients.map((c, i) => {
                const pct = analytics.topClientTotal > 0 ? (c.total / analytics.topClientTotal) * 100 : 0
                const medal = i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                  : i === 1 ? 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300'
                  : i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300'
                  : 'bg-muted text-muted-foreground'
                return (
                  <div key={c.id} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center ${medal}`}>{i + 1}</span>
                        <span className="text-xs font-medium text-foreground truncate">{c.nom}</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">{formatCurrency(c.total)}</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-400 to-amber-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Top Mois */}
        <div className="card-premium p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center">
                <Trophy className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              </div>
              <span className="text-sm font-bold text-foreground">Meilleurs mois</span>
            </div>
            <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
          </div>
          {analytics.topMonths.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Aucune donnée</p>
          ) : (
            <div className="space-y-2">
              {analytics.topMonths.map((m, i) => {
                const pct = analytics.topMonthTotal > 0 ? (m.total / analytics.topMonthTotal) * 100 : 0
                const medal = i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300'
                  : i === 1 ? 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300'
                  : i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-300'
                  : 'bg-muted text-muted-foreground'
                return (
                  <div key={`${m.year}-${m.month}`} className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className={`text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center ${medal}`}>{i + 1}</span>
                        <span className="text-xs font-medium text-foreground truncate">{MOIS_FR[m.month]} {m.year}</span>
                        <span className="text-[10px] text-muted-foreground">· {m.count}</span>
                      </div>
                      <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">{formatCurrency(m.total)}</span>
                    </div>
                    <div className="h-1 bg-muted rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Graphique annuel ── */}
      <div className="card-premium p-6">
        <div className="flex items-center justify-between mb-5 flex-wrap gap-3">
          <div>
            <h2 className="section-title">Évolution des paiements</h2>
            <p className="text-xs text-slate-400 mt-0.5">Année {chartYear}</p>
          </div>
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1 flex-wrap">
            {yearlyChart.availableYears.length === 0 ? (
              <span className="text-xs text-slate-400 px-3 py-1.5">Aucune donnée</span>
            ) : (
              yearlyChart.availableYears.map(y => (
                <button
                  key={y}
                  onClick={() => setChartYear(y)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-semibold transition-all ${
                    y === chartYear
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {y}
                </button>
              ))
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-5 mb-4">
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#10B981]" />
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Encaissé</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-[#F59E0B]" />
            <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">En attente</span>
          </div>
        </div>

        <ResponsiveContainer width="100%" height={230}>
          <AreaChart data={yearlyChart.monthly} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
            <defs>
              <linearGradient id="gPayEnc" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#10B981" stopOpacity={0.22} />
                <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gPayAtt" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#F59E0B" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 89% / 0.7)" vertical={false} />
            <XAxis dataKey="mois" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
            <Tooltip content={<PaiementsChartTooltip year={chartYear} />} />
            <Area type="monotone" dataKey="encaisse" stroke="#10B981" strokeWidth={2.5} fill="url(#gPayEnc)" dot={false} activeDot={{ r: 5, fill: '#10B981', strokeWidth: 2, stroke: '#fff' }} />
            <Area type="monotone" dataKey="attente"  stroke="#F59E0B" strokeWidth={2}   fill="url(#gPayAtt)" dot={false} activeDot={{ r: 4, fill: '#F59E0B', strokeWidth: 2, stroke: '#fff' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      </>}

      {/* ── Vue Contrats ── */}
      {view === 'contrats' && (() => {
        const filteredContrats = contratsWithProgress.filter(c => dateMatch(c.date_debut))
        const totals = filteredContrats.reduce(
          (acc, c) => {
            acc.total += Number(c.montant) || 0
            acc.paid += c.paid
            acc.remaining += c.remaining
            return acc
          },
          { total: 0, paid: 0, remaining: 0 },
        )
        return (
        <div className="space-y-4">
          <div className="card-premium p-3">
            <DateRangeFilter value={dateRange} onChange={setDateRange} />
          </div>

          {filteredContrats.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="card-premium p-4 border border-red-200 dark:border-red-500/20 bg-red-50/50 dark:bg-red-500/5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-red-600 dark:text-red-400 uppercase tracking-wide">Reste à encaisser</span>
                  <Clock className="w-4 h-4 text-red-500" />
                </div>
                <p className="text-xl font-bold text-red-600 dark:text-red-400 tabular-nums">{formatCurrency(totals.remaining)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">à entrer dans le compte</p>
              </div>

              <div className="card-premium p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Progression</span>
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                </div>
                <p className="text-xl font-bold text-foreground tabular-nums">
                  {totals.total > 0 ? ((totals.paid / totals.total) * 100).toFixed(0) : 0}%
                </p>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-2">
                  <div
                    className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full"
                    style={{ width: `${totals.total > 0 ? (totals.paid / totals.total) * 100 : 0}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {filteredContrats.length === 0 ? (
            <div className="card p-12 text-center text-muted-foreground">
              {contratsWithProgress.length === 0
                ? 'Aucun contrat. Créez-en un pour suivre les paiements échelonnés.'
                : 'Aucun contrat dans cette période.'}
            </div>
          ) : (
          <div className="space-y-1.5">
          {filteredContrats.map(c => {
            const open = expandedContrats.has(c.id)
            const badge =
              c.progressStatus === 'paye'    ? { label: 'Payé',              bg: 'bg-emerald-50 dark:bg-emerald-500/15', color: 'text-emerald-600 dark:text-emerald-400' } :
              c.progressStatus === 'partiel' ? { label: 'Partiel',            bg: 'bg-amber-50 dark:bg-amber-500/15',     color: 'text-amber-600 dark:text-amber-400' } :
                                               { label: 'En attente',        bg: 'bg-muted',                              color: 'text-muted-foreground' }
            const pct = Number(c.montant) > 0 ? Math.min(100, (c.paid / Number(c.montant)) * 100) : 0
            const barClass =
              c.progressStatus === 'paye'    ? 'bg-gradient-to-r from-emerald-400 to-emerald-600' :
              c.progressStatus === 'partiel' ? 'bg-gradient-to-r from-amber-400 to-amber-500' :
                                               'bg-muted-foreground/20'
            return (
              <div key={c.id} className="card-premium overflow-hidden">
                <button
                  onClick={() => toggleContrat(c.id)}
                  className="w-full px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    {open
                      ? <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                      : <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />}

                    <div className={`w-9 h-9 rounded-full ${avatarColor(c.client || '')} text-white flex items-center justify-center text-[11px] font-bold flex-shrink-0 shadow-sm`}>
                      {getInitials(c.client || '')}
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-foreground truncate">{c.client || '—'}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{c.numero}</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-0.5">
                        <span>{c.objet || '—'}</span>
                        <span>·</span>
                        <span>{formatDate(c.date_debut)}</span>
                      </div>
                    </div>

                    <div className="hidden sm:block text-right tabular-nums min-w-[90px]">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Montant</p>
                      <p className="text-sm font-bold text-foreground">{formatCurrency(Number(c.montant))}</p>
                    </div>

                    <div className="text-right tabular-nums min-w-[90px]">
                      <p className="text-[9px] text-muted-foreground uppercase tracking-wider font-medium">Reste</p>
                      {c.remaining > 0 ? (
                        <p className="text-sm font-bold text-red-500">{formatCurrency(c.remaining)}</p>
                      ) : (
                        <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">Payé ✓</p>
                      )}
                    </div>

                    <span className={`text-[10px] font-semibold px-2 py-1 rounded-full whitespace-nowrap flex-shrink-0 ${badge.bg} ${badge.color}`}>{badge.label}</span>
                  </div>

                  <div className="mt-2.5 flex items-center gap-2">
                    <div className="h-1 bg-muted rounded-full overflow-hidden flex-1">
                      <div
                        className={`h-full rounded-full transition-all ${barClass}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-semibold text-muted-foreground tabular-nums min-w-[32px] text-right">{pct.toFixed(0)}%</span>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {open && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-border"
                    >
                      <div className="px-5 py-4 space-y-3">
                        <div>
                          <div className="flex items-center justify-between text-xs mb-1.5">
                            <span className="text-muted-foreground">Progression : {pct.toFixed(0)}%</span>
                            <span className="text-muted-foreground">{formatCurrency(c.paid)} / {formatCurrency(Number(c.montant))}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full" style={{ width: `${pct}%` }} />
                          </div>
                        </div>

                        {c.paiements.length === 0 ? (
                          <p className="text-xs text-muted-foreground text-center py-3">Aucun paiement encore. Ajoutez-en un pour commencer.</p>
                        ) : (
                          <div className="divide-y divide-border rounded-lg border border-border bg-muted/20">
                            {c.paiements.map(p => {
                              const mc = METHODE_CONFIG[p.methode] ?? METHODE_CONFIG.autre
                              const MI = mc.icon
                              return (
                                <div key={p.id} className="flex items-center gap-3 px-3 py-2">
                                  <div className={`w-7 h-7 rounded-md flex items-center justify-center ${mc.bg}`}>
                                    <MI className={`w-3.5 h-3.5 ${mc.color}`} />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-mono text-foreground">{p.reference}</p>
                                    <p className="text-[10px] text-muted-foreground">{formatDate(p.date)} · {mc.label}</p>
                                  </div>
                                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(Number(p.montant))}</span>
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <div className="flex justify-between items-center pt-1">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => openEditContrat(c)}
                              className="text-xs text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
                            >
                              <Pencil className="w-3 h-3" /> Modifier
                            </button>
                            <button
                              onClick={() => {
                                if (confirm(`Supprimer le contrat ${c.numero} ?`)) removeContrat.mutate(c.id)
                              }}
                              className="text-xs text-red-500 hover:text-red-600 inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" /> Supprimer
                            </button>
                          </div>
                          {c.remaining > 0 && (
                            <Button size="sm" onClick={() => openForm(c.id)}>
                              <Plus className="w-3.5 h-3.5" /> Ajouter un paiement
                            </Button>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )
          })}
          </div>
          )}
        </div>
        )
      })()}

      {/* ── Dialog : nouveau paiement ── */}
      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-xl">
          <DialogHeader className="relative">
            <DialogTitle>Nouveau paiement</DialogTitle>
            {/* Bouton primaire centré horizontalement dans le header */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-0.5">
              <Button
                type="button"
                size="sm"
                className="h-8 px-5 text-xs font-semibold shadow-sm"
                disabled={createP.isPending || !form.client_id || !form.montant}
                onClick={submitForm}
              >
                ➕ Créer
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <label className="form-label">Client *</label>
                <ClientCombobox
                  value={form.client_id}
                  onChange={(id) => setForm(p => ({ ...p, client_id: id }))}
                  clients={clients}
                  onCreate={async (nom) => {
                    try {
                      const c: any = await createClient.mutateAsync({ nom } as any)
                      return c ? { id: c.id, nom: c.nom } : null
                    } catch { return null }
                  }}
                />
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Référence</label>
                <Input value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Montant (MAD) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.montant || ''}
                  onChange={e => setForm(p => ({ ...p, montant: Number(e.target.value) }))}
                />
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Date</label>
                <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Méthode</label>
                <Select
                  value={form.methode}
                  onValueChange={v => setForm(p => ({
                    ...p,
                    methode: v as PaiementMethode,
                    reference: p.reference && !Object.values(REF_PREFIX).some(px => p.reference.startsWith(px + '-'))
                      ? p.reference
                      : genRef(v as PaiementMethode),
                  }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="virement">Virement</SelectItem>
                    <SelectItem value="especes">Espèces</SelectItem>
                    <SelectItem value="cheque">Chèque</SelectItem>
                    <SelectItem value="carte_bancaire">Carte</SelectItem>
                    <SelectItem value="paypal">PayPal</SelectItem>
                    <SelectItem value="prelevement">Prélèvement</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Type</label>
                <Select value={form.type_paiement} onValueChange={v => setForm(p => ({ ...p, type_paiement: v as PaiementType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="site_web">Site web</SelectItem>
                    <SelectItem value="domaine">Domaine</SelectItem>
                    <SelectItem value="hebergement">Hébergement</SelectItem>
                    <SelectItem value="seo">SEO</SelectItem>
                    <SelectItem value="ads">Ads</SelectItem>
                    <SelectItem value="renouvellement">Renouvellement</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Statut</label>
                <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v as PaiementStatus }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="paye">Payé</SelectItem>
                    <SelectItem value="en_attente">En attente</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 col-span-2">
                <label className="form-label">Contrat (optionnel)</label>
                <Select
                  value={form.contrat_id || 'none'}
                  onValueChange={v => {
                    if (v === 'none') {
                      setForm(p => ({ ...p, contrat_id: '' }))
                    } else {
                      const c = contrats.find(x => x.id === v)
                      setForm(p => ({
                        ...p,
                        contrat_id: v,
                        client_id: p.client_id || (clients.find(cl => cl.nom === c?.client)?.id ?? p.client_id),
                      }))
                    }
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Lier à un contrat" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Aucun</SelectItem>
                    {contrats.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.numero} — {c.client}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 col-span-2">
                <label className="form-label">Notes</label>
                <AutocorrectInput value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optionnel" />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button
                disabled={createP.isPending || !form.client_id || !form.montant}
                onClick={submitForm}
              >
                {createP.isPending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── Dialog : nouveau / modifier contrat ── */}
      <Dialog
        open={showContratForm}
        onOpenChange={(o) => {
          setShowContratForm(o)
          if (!o) { setEditingContratId(null); setContratForm(EMPTY_CONTRAT) }
        }}
      >
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingContratId ? 'Modifier le contrat' : 'Nouveau contrat'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">Numéro</label>
                <Input value={contratForm.numero} onChange={e => setContratForm(p => ({ ...p, numero: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Montant (MAD) *</label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={contratForm.montant || ''}
                  onChange={e => setContratForm(p => ({ ...p, montant: Number(e.target.value) }))}
                />
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="form-label">Client *</label>
                <Select
                  value={contratForm.client || ''}
                  onValueChange={v => setContratForm(p => ({ ...p, client: v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Sélectionner un client" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.nom}>{c.nom}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Objet</label>
                <Select value={contratForm.objet} onValueChange={v => setContratForm(p => ({ ...p, objet: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Site web">Site web</SelectItem>
                    <SelectItem value="Ads">Ads</SelectItem>
                    <SelectItem value="SEO">SEO</SelectItem>
                    <SelectItem value="Design">Design</SelectItem>
                    <SelectItem value="Autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Statut</label>
                <Select value={contratForm.statut} onValueChange={v => setContratForm(p => ({ ...p, statut: v as Contrat['statut'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actif">Actif</SelectItem>
                    <SelectItem value="brouillon">Brouillon</SelectItem>
                    <SelectItem value="expire">Expiré</SelectItem>
                    <SelectItem value="resilie">Résilié</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Date début</label>
                <Input type="date" value={contratForm.date_debut} onChange={e => setContratForm(p => ({ ...p, date_debut: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Date fin</label>
                <Input type="date" value={contratForm.date_fin} onChange={e => setContratForm(p => ({ ...p, date_fin: e.target.value }))} />
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={() => setShowContratForm(false)}>Annuler</Button>
              <Button
                disabled={createContrat.isPending || updateContrat.isPending || !contratForm.client || !contratForm.montant}
                onClick={() => {
                  if (editingContratId) {
                    updateContrat.mutate({ id: editingContratId, ...contratForm })
                  } else {
                    createContrat.mutate(contratForm)
                  }
                }}
              >
                {(createContrat.isPending || updateContrat.isPending)
                  ? 'Enregistrement…'
                  : (editingContratId ? 'Modifier' : 'Enregistrer')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Envoyer le reçu au client (PDF joint) */}
      {sendTarget && (
        <SendDocumentDialog
          open={!!sendTarget}
          onClose={() => setSendTarget(null)}
          kind="recu"
          numero={sendTarget.p.reference}
          filename={`recu-${sendTarget.p.reference}.pdf`}
          defaultEmail={sendTarget.email ?? ''}
          clientNom={sendTarget.nom}
          buildPdf={() => generatePaiementReceiptPDFBlob(sendTarget.p, sendTarget.nom)}
        />
      )}
    </div>
  )
}
