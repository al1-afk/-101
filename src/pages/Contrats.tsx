import { useState, useMemo, useEffect, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Plus, Search, FileSignature, Trash2, CheckCircle2, DollarSign, Clock,
  ChevronDown, ChevronRight, Edit2, FileText,
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { contratsApi } from '@/lib/api'
import { toast } from 'sonner'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { contratsSchema } from '@/lib/importExportSchemas'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'
import { useClients } from '@/hooks/useClients'

interface Contrat {
  id: string; created_at: string; numero: string; client: string; objet: string
  montant: number; date_debut: string; date_fin: string
  statut: 'actif' | 'expire' | 'resilie' | 'brouillon'
}

interface Versement {
  id: string
  date: string
  montant: number
  mode: 'virement' | 'cheque' | 'especes' | 'carte'
  note?: string
}

const STATUT_CONFIG = {
  actif:     { label: 'Actif',     variant: 'success'     as const },
  expire:    { label: 'Expiré',    variant: 'secondary'   as const },
  resilie:   { label: 'Résilié',   variant: 'destructive' as const },
  brouillon: { label: 'En attente', variant: 'secondary'  as const },
}

const MODE_LABEL: Record<Versement['mode'], string> = {
  virement: 'Virement',
  cheque:   'Chèque',
  especes:  'Espèces',
  carte:    'Carte',
}

const EMPTY = { numero: '', client: '', objet: '', montant: 0, date_debut: '', date_fin: '', statut: 'brouillon' as Contrat['statut'] }

/* ── Searchable client combobox ───────────────────────────────── */
function ClientCombobox({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { data: clients = [] } = useClients()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = [...clients].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    if (!q) return list
    return list.filter(c =>
      (c.nom ?? '').toLowerCase().includes(q) ||
      (c.entreprise ?? '').toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q)
    )
  }, [clients, query])

  const display = open ? query : value

  return (
    <div ref={wrapRef} className="relative">
      <Input
        value={display}
        placeholder="Rechercher un client..."
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true) }}
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-50 left-0 right-0 mt-1 max-h-64 overflow-auto rounded-md border border-border bg-popover shadow-lg">
          {filtered.map(c => (
            <button
              key={c.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted/60"
              onMouseDown={e => { e.preventDefault(); onChange(c.nom); setOpen(false) }}
            >
              {c.nom}
              {c.entreprise ? <span className="text-muted-foreground"> · {c.entreprise}</span> : null}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/* ── LocalStorage helpers ─────────────────────────────────────── */
const versKey = (id: string) => `contrat_versements_${id}`

function loadVersements(id: string): Versement[] {
  try { return JSON.parse(localStorage.getItem(versKey(id)) || '[]') } catch { return [] }
}
function saveVersements(id: string, list: Versement[]) {
  localStorage.setItem(versKey(id), JSON.stringify(list))
}

/* ── Contract card (expandable row) ───────────────────────────── */
function ContratCard({ contrat, onDelete, onEdit }: {
  contrat: Contrat
  onDelete: (id: string) => void
  onEdit: (c: Contrat) => void
}) {
  const [open, setOpen] = useState(false)
  const [versements, setVersements] = useState<Versement[]>(() => loadVersements(contrat.id))
  const [showVersForm, setShowVersForm] = useState(false)
  const [vers, setVers] = useState<Omit<Versement, 'id'>>({
    date: new Date().toISOString().slice(0, 10),
    montant: 0,
    mode: 'virement',
    note: '',
  })

  const totalPaye    = versements.reduce((s, v) => s + v.montant, 0)
  const soldeRestant = Math.max(0, contrat.montant - totalPaye)

  const addVersement = () => {
    if (vers.montant <= 0) return toast.error('Montant invalide')
    const list = [{ ...vers, id: Date.now().toString() }, ...versements]
    setVersements(list); saveVersements(contrat.id, list)
    setShowVersForm(false)
    setVers({ date: new Date().toISOString().slice(0, 10), montant: 0, mode: 'virement', note: '' })
    toast.success('Versement ajouté')
  }
  const removeVersement = (id: string) => {
    const list = versements.filter(v => v.id !== id)
    setVersements(list); saveVersements(contrat.id, list)
    toast.success('Versement supprimé')
  }

  const statut = STATUT_CONFIG[contrat.statut] ?? STATUT_CONFIG.brouillon

  return (
    <div className="card-premium overflow-hidden">
      {/* ── Header ── */}
      <div
        className="flex items-center gap-3 px-5 py-3.5 cursor-pointer select-none hover:bg-muted/20 transition-colors"
        onClick={() => setOpen(o => !o)}
      >
        <button className="text-muted-foreground" type="button">
          {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center flex-shrink-0">
          <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-foreground text-sm truncate">{contrat.client}</span>
            <span className="text-muted-foreground text-xs font-mono">{contrat.numero}</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
            {contrat.objet && <span>{contrat.objet}</span>}
            {contrat.objet && contrat.date_debut && <span>·</span>}
            {contrat.date_debut && <span>{formatDate(contrat.date_debut)}</span>}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm flex-shrink-0">
          <span className="font-semibold text-blue-600 dark:text-blue-400">{formatCurrency(contrat.montant)}</span>
          <span className="text-muted-foreground">=</span>
          <span className="font-semibold text-red-500">R {formatCurrency(soldeRestant)}</span>
        </div>
        <Badge variant={statut.variant}>{statut.label}</Badge>
      </div>

      {/* ── Expanded body ── */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-5 space-y-4">
              <div className="flex items-center gap-6 flex-wrap">
                <div>
                  <p className="text-xs text-muted-foreground">Total convenu</p>
                  <p className="text-base font-bold text-foreground">{formatCurrency(contrat.montant)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total payé</p>
                  <p className="text-base font-bold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalPaye)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Solde restant</p>
                  <p className="text-base font-bold text-amber-600 dark:text-amber-400">{formatCurrency(soldeRestant)}</p>
                </div>
                <div className="ml-auto flex items-center gap-2">
                  <Button size="sm" onClick={() => setShowVersForm(true)}>
                    <Plus className="w-3.5 h-3.5" /> Versement
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8" onClick={() => onEdit(contrat)}>
                    <Edit2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </Button>
                  <Button variant="ghost" size="icon" className="w-8 h-8 text-red-400 hover:bg-red-500/10" onClick={() => onDelete(contrat.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>

              {versements.length === 0 ? (
                <p className="text-center text-sm text-muted-foreground py-6">Aucun versement enregistré</p>
              ) : (
                <div className="rounded-lg border border-border divide-y divide-border">
                  {versements.map(v => (
                    <div key={v.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className="w-7 h-7 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                        <DollarSign className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">{formatCurrency(v.montant)} · {MODE_LABEL[v.mode]}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(v.date)}{v.note ? ` · ${v.note}` : ''}</p>
                      </div>
                      <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400" onClick={() => removeVersement(v.id)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Versement dialog ── */}
      <Dialog open={showVersForm} onOpenChange={setShowVersForm}>
        <DialogContent className="max-w-md">
          <DialogHeader className="relative">
            <DialogTitle>Nouveau versement · {contrat.numero}</DialogTitle>
            {/* Bouton primaire centré horizontalement dans le header */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-0.5">
              <Button
                type="button"
                size="sm"
                className="h-8 px-5 text-xs font-semibold shadow-sm"
                disabled={vers.montant <= 0}
                onClick={addVersement}
              >
                ➕ Créer
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">Date</label>
                <Input type="date" value={vers.date} onChange={e => setVers(p => ({ ...p, date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Montant (MAD)</label>
                <Input type="number" value={vers.montant} onChange={e => setVers(p => ({ ...p, montant: +e.target.value }))} />
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="form-label">Mode</label>
                <Select value={vers.mode} onValueChange={v => setVers(p => ({ ...p, mode: v as Versement['mode'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(MODE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="form-label">Note (optionnel)</label>
                <AutocorrectInput value={vers.note ?? ''} onChange={e => setVers(p => ({ ...p, note: e.target.value }))} />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowVersForm(false)}>Annuler</Button>
              <Button onClick={addVersement} disabled={vers.montant <= 0}>Enregistrer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ── Main page ────────────────────────────────────────────────── */
export default function Contrats() {
  const qc = useQueryClient()
  const { data: contrats = [], isLoading } = useQuery<Contrat[]>({
    queryKey: ['contrats'],
    queryFn: () => contratsApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<Contrat[]>,
  })

  const create = useMutation({
    mutationFn: (data: typeof EMPTY) => contratsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contrats'] }); toast.success('Contrat créé'); setShowForm(false); setEditing(null); setForm(EMPTY) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const update = useMutation({
    mutationFn: ({ id, ...data }: { id: string } & typeof EMPTY) => (contratsApi as any).update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['contrats'] }); toast.success('Contrat modifié'); setShowForm(false); setEditing(null); setForm(EMPTY) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => contratsApi.remove(id),
    onSuccess: (_: any, id: string) => {
      qc.invalidateQueries({ queryKey: ['contrats'] })
      localStorage.removeItem(versKey(id))
      toast.success('Supprimé')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Contrat | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE)
  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])

  useEffect(() => {
    if (editing) setForm({
      numero: editing.numero, client: editing.client, objet: editing.objet,
      montant: editing.montant, date_debut: editing.date_debut, date_fin: editing.date_fin,
      statut: editing.statut,
    })
  }, [editing])

  const filtered = useMemo(() =>
    contrats.filter(c =>
      (!search || [c.numero, c.client, c.objet].some(x => (x ?? '').toLowerCase().includes(search.toLowerCase())))
      && dateMatch(c.date_debut || c.created_at)
    )
  , [contrats, search, dateMatch])

  const stats = useMemo(() => ({
    actifs:  contrats.filter(c => c.statut === 'actif').length,
    valeur:  contrats.filter(c => c.statut === 'actif').reduce((s, c) => s + c.montant, 0),
    expires: contrats.filter(c => c.statut === 'expire').length,
  }), [contrats])

  const openNew  = () => { setEditing(null); setForm(EMPTY); setShowForm(true) }
  const openEdit = (c: Contrat) => { setEditing(c); setShowForm(true) }
  const submit   = () => {
    const payload = {
      ...form,
      date_debut: form.date_debut || null,
      date_fin:   form.date_fin   || null,
    } as any
    editing ? update.mutate({ id: editing.id, ...payload }) : create.mutate(payload)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contrats</h1>
          <p className="text-muted-foreground text-sm mt-1">{stats.actifs} actifs · {formatCurrency(stats.valeur)} engagés</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={contratsSchema}
            data={contrats}
            onImport={async (row) => { await create.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={openNew}><Plus className="w-4 h-4" /> Nouveau contrat</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div><p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.actifs}</p><p className="text-xs text-muted-foreground mt-0.5">Contrats actifs</p></div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div><p className="text-xl font-extrabold text-foreground">{formatCurrency(stats.valeur)}</p><p className="text-xs text-muted-foreground mt-0.5">Valeur totale</p></div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div><p className="text-xl font-extrabold text-muted-foreground">{stats.expires}</p><p className="text-xs text-muted-foreground mt-0.5">Expirés</p></div>
        </div>
      </div>

      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="card-premium p-8 text-center text-muted-foreground text-sm">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="card-premium empty-state"><FileSignature className="empty-state-icon" /><p className="empty-state-title">Aucun contrat</p></div>
      ) : (
        <div className="space-y-3">
          {filtered.map(c => (
            <ContratCard key={c.id} contrat={c} onDelete={id => remove.mutate(id)} onEdit={openEdit} />
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={(o) => { setShowForm(o); if (!o) setEditing(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader className="relative">
            <DialogTitle>{editing ? 'Modifier le contrat' : 'Nouveau contrat'}</DialogTitle>
            {/* Bouton primaire centré horizontalement dans le header */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-0.5">
              <Button
                type="button"
                size="sm"
                className="h-8 px-5 text-xs font-semibold shadow-sm"
                disabled={create.isPending || update.isPending || !form.numero || !form.client}
                onClick={submit}
              >
                {editing ? '💾 Enregistrer' : '➕ Créer'}
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="form-label">N° Contrat</label><Input value={form.numero} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Client</label><ClientCombobox value={form.client} onChange={v => setForm(p => ({ ...p, client: v }))} /></div>
              <div className="space-y-1.5 col-span-2"><label className="form-label">Objet</label><AutocorrectInput value={form.objet} onChange={e => setForm(p => ({ ...p, objet: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Montant (MAD)</label><Input type="number" value={form.montant} onChange={e => setForm(p => ({ ...p, montant: +e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Statut</label>
                <Select value={form.statut} onValueChange={v => setForm(p => ({ ...p, statut: v as Contrat['statut'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUT_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><label className="form-label">Date début</label><Input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Date fin</label><Input type="date" value={form.date_fin} onChange={e => setForm(p => ({ ...p, date_fin: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null) }}>Annuler</Button>
              <Button disabled={create.isPending || update.isPending || !form.numero || !form.client} onClick={submit}>
                {(create.isPending || update.isPending) ? 'Enregistrement...' : (editing ? 'Enregistrer' : 'Créer')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
