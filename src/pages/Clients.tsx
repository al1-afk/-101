import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Plus, Search, User, Building2, Phone, Mail, MapPin,
  Edit2, Trash2, Loader2, Eye, Globe, Server, X, RotateCw, Crown,
} from 'lucide-react'
import { toast } from 'sonner'
import { useClients, useCreateClient, useUpdateClient, useDeleteClient, type Client } from '@/hooks/useClients'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate, getInitials } from '@/lib/utils'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { clientsSchema } from '@/lib/importExportSchemas'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'
import { parseClientNotes, serializeClientNotes, daysUntil } from '@/lib/clientNotes'

/* ─── Domain / hosting cell — single line (Notion-style) ─────────────────── */
function DomainCell({
  expiry, onSave,
}: {
  /** name field is kept in the schema but not rendered here to stay tight.
      The full edit (with name) is available via the row's edit dialog. */
  name?:   string
  expiry?: string
  icon:    React.ElementType
  onSave:  (patch: { name?: string; expiry?: string }) => void
}) {
  const days = daysUntil(expiry)
  /* Couleur + libellé du delta (jours restants ou dépassés).
       - rouge : déjà expiré OU expire dans moins de 30j
       - ambre : 30-90j
       - bleu  : > 90j (calme) */
  let dateCls = 'text-muted-foreground'
  let deltaLabel = ''
  let deltaCls   = 'text-muted-foreground'
  if (days !== null) {
    if (days < 0) {
      /* Expiré : "+15j" = 15 jours de retard */
      dateCls    = 'text-red-600 dark:text-red-400 font-semibold'
      deltaLabel = `+${Math.abs(days)}j`
      deltaCls   = 'text-red-600 dark:text-red-400 font-bold'
    } else if (days < 30) {
      dateCls    = 'text-red-600 dark:text-red-400 font-semibold'
      deltaLabel = `J-${days}`
      deltaCls   = 'text-red-600 dark:text-red-400 font-bold'
    } else if (days <= 90) {
      dateCls    = 'text-amber-600 dark:text-amber-400'
      deltaLabel = `J-${days}`
      deltaCls   = 'text-amber-600 dark:text-amber-400 font-semibold'
    } else {
      dateCls    = 'text-blue-600 dark:text-blue-400'
      deltaLabel = `J-${days}`
      deltaCls   = 'text-blue-600 dark:text-blue-400'
    }
  }
  /* Renouveler d'un an : prend la date actuelle (ou today si vide),
     ajoute 365 jours, sauvegarde. Un clic = un an de plus. */
  const renewOneYear = () => {
    const base = expiry ? new Date(expiry) : new Date()
    if (isNaN(base.getTime())) return
    const next = new Date(base)
    next.setFullYear(next.getFullYear() + 1)
    const iso = next.toISOString().slice(0, 10)
    onSave({ expiry: iso })
  }

  return (
    <div className="flex items-center gap-1 min-w-0">
      <input
        type="date"
        defaultValue={(expiry ?? '').slice(0, 10)}
        key={`e-${expiry ?? ''}`}
        onChange={e => onSave({ expiry: e.target.value || undefined })}
        className={`bg-transparent border-0 hover:bg-muted/60 focus:bg-muted/80 focus:ring-1 focus:ring-blue-400 rounded px-1 py-0 text-[10px] cursor-pointer w-20 outline-none ${dateCls}`}
        title={days !== null && days < 0
          ? `Expiré depuis ${Math.abs(days)} jour${Math.abs(days) > 1 ? 's' : ''}`
          : days !== null
            ? `Expire dans ${days} jour${days > 1 ? 's' : ''}`
            : 'Cliquer pour modifier'}
      />
      {deltaLabel && (
        <span className={`text-[9px] leading-none whitespace-nowrap ${deltaCls}`}>
          {deltaLabel}
        </span>
      )}
      <button
        type="button"
        onClick={renewOneYear}
        className="flex-shrink-0 w-4 h-4 rounded flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15 transition-colors"
        title="Renouveler d'un an — ajoute 365 jours à la date"
        aria-label="Renouveler d'un an"
      >
        <RotateCw className="w-2.5 h-2.5" />
      </button>
    </div>
  )
}

const TYPE_SERVICES = [
  'Site web', 'social media', 'maps', 'application',
  'Identité visuelle', 'Maintenance', 'Autre',
] as const
const SOUS_CATEGORIES = [
  'SEO', 'ads', 'bouchori', 'les message', 'client', 'deplacment',
  'Création contenu', 'Refonte', 'Autre',
] as const

function ClientForm({ client, onClose }: { client?: Client; onClose: () => void }) {
  const create = useCreateClient()
  const update = useUpdateClient()
  const parsed = parseClientNotes(client?.notes)
  const [form, setForm] = useState({
    nom: client?.nom || '',
    email: client?.email || '',
    telephone: client?.telephone || '',
    entreprise: client?.entreprise || '',
    adresse: client?.adresse || '',
    ville: client?.ville || '',
    pays: client?.pays || 'Maroc',
    notes: parsed.text,
    type_service:        client?.type_service        || '',
    sous_categorie:      client?.sous_categorie      || '',
    date_debut_contrat:  (client?.date_debut_contrat || '').slice(0, 10),
    montant_ttc_annuel:  client?.montant_ttc_annuel  ?? '',
    prix_renouvellement: client?.prix_renouvellement ?? '',
    is_premium:          client?.is_premium ?? false,
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const { is_premium, ...formRest } = form
    const merged: any = {
      ...formRest,
      notes: serializeClientNotes(parsed.meta, form.notes, parsed.blocks),
      type_service:        form.type_service        || null,
      sous_categorie:      form.sous_categorie      || null,
      date_debut_contrat:  form.date_debut_contrat  || null,
      montant_ttc_annuel:  form.montant_ttc_annuel  === '' ? null : Number(form.montant_ttc_annuel),
      prix_renouvellement: form.prix_renouvellement === '' ? null : Number(form.prix_renouvellement),
    }
    /* N'envoie `is_premium` que s'il est activé (création) ou modifié (édition),
       pour que la gestion normale des clients continue de fonctionner même si la
       migration 079 n'est pas encore appliquée. */
    const prevPremium = client?.is_premium ?? false
    if (client ? prevPremium !== is_premium : is_premium) merged.is_premium = is_premium
    if (client) await update.mutateAsync({ id: client.id, ...merged })
    else await create.mutateAsync(merged as any)
    onClose()
  }

  return (
    <form id="client-form" onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5 col-span-2 sm:col-span-1">
          <label className="form-label">Nom complet *</label>
          <Input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} required />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Entreprise</label>
          <Input value={form.entreprise} onChange={e => setForm(p => ({ ...p, entreprise: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Email</label>
          <Input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Téléphone</label>
          <Input value={form.telephone} onChange={e => setForm(p => ({ ...p, telephone: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Adresse</label>
          <Input value={form.adresse} onChange={e => setForm(p => ({ ...p, adresse: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Ville</label>
          <Input value={form.ville} onChange={e => setForm(p => ({ ...p, ville: e.target.value }))} />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Pays</label>
          <Input value={form.pays} onChange={e => setForm(p => ({ ...p, pays: e.target.value }))} />
        </div>
      </div>

      {/* ── Type de client (Standard / Premium) ─────────────────── */}
      <div className="space-y-1.5">
        <label className="form-label">Type de client</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setForm(p => ({ ...p, is_premium: false }))}
            className={`flex-1 h-9 rounded-lg border text-sm font-medium transition-colors ${
              !form.is_premium ? 'bg-blue-600 text-white border-blue-600' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            Standard
          </button>
          <button
            type="button"
            onClick={() => setForm(p => ({ ...p, is_premium: true }))}
            className={`flex-1 h-9 rounded-lg border text-sm font-medium transition-colors inline-flex items-center justify-center gap-1.5 ${
              form.is_premium ? 'bg-amber-500 text-white border-amber-500' : 'border-border text-muted-foreground hover:bg-muted'
            }`}
          >
            <Crown className="w-3.5 h-3.5" /> Premium
          </button>
        </div>
      </div>

      {/* ── Bloc Contrat / Prestation ───────────────────────────── */}
      <div className="rounded-xl border border-dashed border-blue-300 dark:border-blue-700/50 bg-blue-50/30 dark:bg-blue-950/10 p-3 space-y-3">
        <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-widest">💼 Contrat / Prestation</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="form-label">Type de service</label>
            <Select value={form.type_service || 'none'} onValueChange={v => setForm(p => ({ ...p, type_service: v === 'none' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {TYPE_SERVICES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="form-label">Sous-catégorie</label>
            <Select value={form.sous_categorie || 'none'} onValueChange={v => setForm(p => ({ ...p, sous_categorie: v === 'none' ? '' : v }))}>
              <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">—</SelectItem>
                {SOUS_CATEGORIES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="form-label">Date de début</label>
            <Input type="date" value={form.date_debut_contrat} onChange={e => setForm(p => ({ ...p, date_debut_contrat: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="form-label">Montant TTC annuel</label>
            <Input type="number" step="0.01" value={form.montant_ttc_annuel} onChange={e => setForm(p => ({ ...p, montant_ttc_annuel: e.target.value }))} placeholder="0,00" />
          </div>
          <div className="space-y-1.5 col-span-2 sm:col-span-1">
            <label className="form-label">Prix renouvellement (annuel)</label>
            <Input type="number" step="0.01" value={form.prix_renouvellement} onChange={e => setForm(p => ({ ...p, prix_renouvellement: e.target.value }))} placeholder="0,00" />
          </div>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="form-label">Notes</label>
        <AutocorrectTextarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          className="input-field resize-none h-20" placeholder="Notes internes..." />
      </div>
      <div className="flex items-center justify-end gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" disabled={create.isPending || update.isPending}>
          {(create.isPending || update.isPending) && <Loader2 className="w-4 h-4 animate-spin" />}
          {client ? 'Mettre à jour' : 'Créer client'}
        </Button>
      </div>
    </form>
  )
}

/* ─── Toggle switch style iOS — Actif (vert) ↔ Inactif (rouge) ── */
function StatusBadge({ statut, onClick }: { statut: string; onClick: () => void }) {
  /* Nouveau = état par défaut, traité comme "pas encore Actif" (gris) */
  const isActif = statut === 'Actif'
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick() }}
      className={`relative inline-flex items-center h-5 w-9 rounded-full transition-colors ${
        isActif ? 'bg-emerald-500' : statut === 'Inactif' ? 'bg-red-500' : 'bg-slate-300 dark:bg-slate-600'
      }`}
      title={isActif ? 'Client actif — cliquer pour désactiver' : 'Client inactif — cliquer pour activer'}
      aria-label={`Statut : ${statut}`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${
          isActif ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  )
}

export default function Clients() {
  const navigate = useNavigate()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const base = tenantSlug ? `/${tenantSlug}` : ''
  const { data: clients = [], isLoading } = useClients()
  const createClient = useCreateClient()
  /* Silent update — used for inline cell edits (date + montants) to
     éviter de spammer un toast à chaque keystroke. */
  const updateClient = useUpdateClient({ silent: true })
  const deleteClient = useDeleteClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingClient, setEditingClient] = useState<Client | undefined>()
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [bulkDeleting, setBulkDeleting] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'Actif' | 'Inactif' | 'Nouveau'>('all')

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const filtered = useMemo(() =>
    clients.filter(c => {
      const statusMatch = statusFilter === 'all' || (c.statut ?? 'Nouveau') === statusFilter
      const searchMatch = !search || [c.nom, c.email, c.entreprise, c.ville].some(f => f?.toLowerCase().includes(search.toLowerCase()))
      return statusMatch && searchMatch && dateMatch(c.created_at)
    })
    /* Clients Premium en tête (tri stable : l'ordre par date est conservé
       à l'intérieur de chaque groupe). */
    .sort((a, b) => (b.is_premium ? 1 : 0) - (a.is_premium ? 1 : 0))
  , [clients, search, dateMatch, statusFilter])

  const statusCounts = useMemo(() => ({
    all:     clients.length,
    Actif:   clients.filter(c => c.statut === 'Actif').length,
    Inactif: clients.filter(c => c.statut === 'Inactif').length,
    Nouveau: clients.filter(c => !c.statut || c.statut === 'Nouveau').length,
  }), [clients])

  const toggleStatut = (c: Client) => {
    /* Cycle : Nouveau → Actif → Inactif → Actif (le cycle reste sur Actif/Inactif
       une fois qu'on a quitté Nouveau, pour éviter de revenir à Nouveau par erreur). */
    const current = c.statut ?? 'Nouveau'
    const next = current === 'Actif' ? 'Inactif' : 'Actif'
    updateClient.mutate({ id: c.id, statut: next } as any)
  }

  const allSelected = filtered.length > 0 && filtered.every(c => selected.has(c.id))
  const someSelected = filtered.some(c => selected.has(c.id)) && !allSelected

  const toggleOne = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleAll = () => setSelected(prev => {
    if (allSelected) {
      const next = new Set(prev)
      filtered.forEach(c => next.delete(c.id))
      return next
    }
    const next = new Set(prev)
    filtered.forEach(c => next.add(c.id))
    return next
  })
  const clearSelection = () => setSelected(new Set())

  /* Totaux — calculés UNIQUEMENT sur les clients ACTIFS, quel que soit
     le filtre courant. Le business veut voir en permanence combien
     rapportent les contrats en cours, pas les Nouveau/Inactif. */
  const totals = useMemo(() => {
    let ca = 0
    let renew = 0
    let count = 0
    for (const c of clients) {
      if (c.statut !== 'Actif') continue
      count++
      ca    += Number(c.montant_ttc_annuel  ?? 0)
      renew += Number(c.prix_renouvellement ?? 0)
    }
    return { ca, renew, count }
  }, [clients])

  /* Le breakdown mensuel a été déplacé sur sa propre page :
     /clients/renewals — voir src/pages/RenewalsBreakdown.tsx */

  const bulkDelete = async () => {
    const ids = [...selected]
    if (ids.length === 0) return
    if (!confirm(`Supprimer définitivement ${ids.length} client${ids.length > 1 ? 's' : ''} ?\n\nCette action est irréversible.`)) return
    setBulkDeleting(true)
    try {
      const results = await Promise.allSettled(ids.map(id => deleteClient.mutateAsync(id)))
      const ok   = results.filter(r => r.status === 'fulfilled').length
      const fail = results.length - ok
      if (fail === 0) toast.success(`${ok} client${ok > 1 ? 's' : ''} supprimé${ok > 1 ? 's' : ''}`)
      else if (ok === 0) toast.error(`Échec : aucune suppression n'a réussi`)
      else toast.warning(`${ok} supprimé${ok > 1 ? 's' : ''} · ${fail} échec${fail > 1 ? 's' : ''}`)
      clearSelection()
    } finally { setBulkDeleting(false) }
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Clients</h1>
          <p className="text-muted-foreground text-sm mt-1">{clients.length} clients au total</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={clientsSchema}
            data={clients}
            onImport={async (row) => {
              /* Import idempotent : match par nom (insensible à la casse).
                 Si trouvé → UPDATE partiel : seules les colonnes non vides
                 du CSV écrasent les valeurs existantes (une cellule vide
                 ne détruit PAS la donnée en base).
                 Sinon → CREATE avec statut 'Actif' par défaut. */
              const nom = String((row as any).nom ?? '').trim()
              const existing = nom
                ? clients.find(c => c.nom?.toLowerCase() === nom.toLowerCase())
                : undefined
              if (existing) {
                const nonEmpty = Object.fromEntries(
                  Object.entries(row as any).filter(([, v]) => v != null && v !== ''),
                )
                await updateClient.mutateAsync({ id: existing.id, ...nonEmpty })
              } else {
                await createClient.mutateAsync({ statut: 'Actif', ...(row as any) })
              }
            }}
          />
          <Button size="sm" onClick={() => { setEditingClient(undefined); setShowForm(true) }}>
            <Plus className="w-4 h-4" />
            Nouveau client
          </Button>
        </div>
      </div>

      {/* KPI bar — chiffres calculés sur les clients ACTIFS uniquement */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card-premium p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">Clients actifs</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">{totals.count}</p>
          <p className="text-[11px] text-muted-foreground">sur {clients.length} au total</p>
        </div>
        <div className="card-premium p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">CA annuel (actifs)</p>
          <p className="text-xl font-bold text-blue-600 dark:text-blue-400 mt-0.5">
            {new Intl.NumberFormat('fr-FR').format(Math.round(totals.ca))} MAD
          </p>
          <p className="text-[11px] text-muted-foreground">contrats en cours</p>
        </div>
        <button
          type="button"
          onClick={() => navigate(`${base}/clients/renewals`)}
          className="card-premium p-3 text-left hover:border-emerald-500/40 hover:bg-emerald-500/5 transition-colors cursor-pointer"
          title="Voir la répartition mensuelle des revenus de renouvellement"
        >
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold flex items-center gap-1">
            Renouvellements (actifs)
            <Eye className="w-3 h-3 opacity-60" />
          </p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
            {new Intl.NumberFormat('fr-FR').format(Math.round(totals.renew))} MAD
          </p>
          <p className="text-[11px] text-muted-foreground">domaine + hébergement / an · voir le détail →</p>
        </button>
      </div>

      {/* Bulk action bar — visible only when items are selected */}
      {selected.size > 0 && (
        <div className="card-premium p-3 flex items-center gap-3 border-blue-500/30 bg-blue-500/5">
          <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">
            {selected.size} client{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
          </span>
          <div className="flex-1" />
          <Button size="sm" variant="secondary" onClick={clearSelection}>
            <X className="w-3.5 h-3.5 mr-1" /> Annuler
          </Button>
          <Button
            size="sm"
            onClick={bulkDelete}
            disabled={bulkDeleting}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {bulkDeleting ? <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 mr-1" />}
            Supprimer {selected.size}
          </Button>
        </div>
      )}

      {/* Date filter */}
      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Search + status filter */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Rechercher un client..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            { key: 'all',     label: 'Tous',    dot: 'bg-slate-400' },
            { key: 'Actif',   label: 'Actif',   dot: 'bg-emerald-500' },
            { key: 'Inactif', label: 'Inactif', dot: 'bg-red-500' },
            { key: 'Nouveau', label: 'Nouveau', dot: 'bg-blue-500' },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setStatusFilter(f.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                statusFilter === f.key
                  ? 'bg-blue-500/10 border-blue-500/40 text-blue-700 dark:text-blue-300'
                  : 'bg-transparent border-border hover:bg-muted/40'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${f.dot}`} />
              {f.label}
              <span className="text-[10px] opacity-70">{statusCounts[f.key]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600 dark:text-blue-400" />
        </div>
      ) : (
        <div className="card-premium overflow-hidden">
          <div className="table-scroll">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border bg-muted/40 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <th className="w-8 text-center py-1.5 px-2">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={el => { if (el) el.indeterminate = someSelected }}
                      onChange={toggleAll}
                      className="w-3.5 h-3.5 rounded border-border cursor-pointer accent-blue-600"
                      title={allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                    />
                  </th>
                  <th className="w-8 text-center py-1.5 px-2">#</th>
                  <th className="text-left py-1.5 px-2">Client</th>
                  <th className="text-center py-1.5 px-2">Statut</th>
                  <th className="text-left py-1.5 px-2">Contact</th>
                  <th className="text-left py-1.5 px-2">Type</th>
                  <th className="text-left py-1.5 px-2">Catégorie</th>
                  <th className="text-left py-1.5 px-2">Début</th>
                  <th className="text-right py-1.5 px-2">Montant</th>
                  <th className="text-left py-1.5 px-2">Domaine</th>
                  <th className="text-left py-1.5 px-2">Hébergement</th>
                  <th className="text-right py-1.5 px-2">Renouv.</th>
                  <th className="text-right py-1.5 px-2 w-20">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, idx) => {
                  const meta = parseClientNotes(c.notes).meta
                  const isSelected = selected.has(c.id)
                  return (
                    <tr key={c.id} className={`border-b border-border hover:bg-muted/30 group ${isSelected ? 'bg-blue-500/5' : ''}`}>
                      <td className="text-center py-1 px-2">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleOne(c.id)}
                          className="w-3.5 h-3.5 rounded border-border cursor-pointer accent-blue-600"
                          aria-label={`Sélectionner ${c.nom}`}
                        />
                      </td>
                      <td className="text-center text-[10px] font-mono text-muted-foreground py-1 px-2">{idx + 1}</td>
                      <td className="py-1 px-2">
                        <button
                          onClick={() => navigate(c.id)}
                          className="flex items-center gap-2 text-left"
                        >
                          <div className="avatar-initials w-6 h-6 flex-shrink-0">
                            <span className="font-bold text-[9px]">{getInitials(c.nom)}</span>
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <p className="text-[12px] font-semibold text-foreground truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{c.nom}</p>
                              {c.is_premium && (
                                <span className="inline-flex items-center gap-0.5 text-[8.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 flex-shrink-0 uppercase tracking-wide">
                                  <Crown className="w-2.5 h-2.5" /> Premium
                                </span>
                              )}
                            </div>
                            {c.entreprise && (
                              <p className="text-[10px] text-muted-foreground truncate flex items-center gap-0.5">
                                <Building2 className="w-2.5 h-2.5" /> {c.entreprise}
                              </p>
                            )}
                          </div>
                        </button>
                      </td>
                      <td className="py-1 px-2 text-center">
                        <StatusBadge statut={c.statut ?? 'Nouveau'} onClick={() => toggleStatut(c)} />
                      </td>
                      <td className="py-1 px-2">
                        <div className="text-[10px] space-y-0">
                          {c.email && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Mail className="w-2.5 h-2.5" />
                              <span className="truncate max-w-[140px]" title={c.email}>{c.email}</span>
                            </div>
                          )}
                          {c.telephone && (
                            <div className="flex items-center gap-1 text-muted-foreground">
                              <Phone className="w-2.5 h-2.5" /> {c.telephone}
                            </div>
                          )}
                          {!c.email && !c.telephone && <span className="text-muted-foreground/50">—</span>}
                        </div>
                      </td>
                      <td className="py-1 px-2">
                        {c.type_service ? (
                          <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            {c.type_service}
                          </span>
                        ) : <span className="text-muted-foreground/50 text-[10px]">—</span>}
                      </td>
                      <td className="py-1 px-2">
                        {c.sous_categorie ? (
                          <span className="inline-flex items-center text-[10px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                            {c.sous_categorie}
                          </span>
                        ) : <span className="text-muted-foreground/50 text-[10px]">—</span>}
                      </td>
                      <td className="py-1 px-2 text-[10px] whitespace-nowrap">
                        <input
                          type="date"
                          defaultValue={(c.date_debut_contrat ?? '').slice(0, 10)}
                          key={`d-${c.id}-${c.date_debut_contrat ?? ''}`}
                          onChange={e => updateClient.mutate({ id: c.id, date_debut_contrat: e.target.value || null })}
                          className="bg-transparent border-0 hover:bg-muted/60 focus:bg-muted/80 focus:ring-1 focus:ring-blue-400 rounded px-1 py-0 text-[10px] cursor-pointer w-20 outline-none"
                          title="Cliquer pour modifier"
                        />
                      </td>
                      <td className="py-1 px-2 text-[10px] text-right whitespace-nowrap">
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={c.montant_ttc_annuel ?? ''}
                          key={`m-${c.id}-${c.montant_ttc_annuel ?? ''}`}
                          onBlur={e => {
                            const v = e.target.value === '' ? null : Number(e.target.value)
                            if (v !== (c.montant_ttc_annuel ?? null))
                              updateClient.mutate({ id: c.id, montant_ttc_annuel: v })
                          }}
                          placeholder="—"
                          className="bg-transparent border-0 hover:bg-muted/60 focus:bg-muted/80 focus:ring-1 focus:ring-blue-400 rounded px-1 py-0 text-[10px] cursor-pointer w-16 text-right font-semibold outline-none"
                          title="Cliquer pour modifier (Tab/Entrée pour sauvegarder)"
                        />
                      </td>
                      <td>
                        <DomainCell
                          name={meta.domainName}
                          expiry={meta.domainExpiry}
                          icon={Globe}
                          onSave={patch => {
                            const parsed = parseClientNotes(c.notes)
                            const newMeta = {
                              ...parsed.meta,
                              ...(patch.name   !== undefined ? { domainName:   patch.name }   : {}),
                              ...(patch.expiry !== undefined ? { domainExpiry: patch.expiry } : {}),
                            }
                            updateClient.mutate({ id: c.id, notes: serializeClientNotes(newMeta, parsed.text, parsed.blocks) })
                          }}
                        />
                      </td>
                      <td className="py-1 px-2">
                        <DomainCell
                          name={meta.hostingName}
                          expiry={meta.hostingExpiry}
                          icon={Server}
                          onSave={patch => {
                            const parsed = parseClientNotes(c.notes)
                            const newMeta = {
                              ...parsed.meta,
                              ...(patch.name   !== undefined ? { hostingName:   patch.name }   : {}),
                              ...(patch.expiry !== undefined ? { hostingExpiry: patch.expiry } : {}),
                            }
                            updateClient.mutate({ id: c.id, notes: serializeClientNotes(newMeta, parsed.text, parsed.blocks) })
                          }}
                        />
                      </td>
                      <td className="py-1 px-2 text-[10px] text-right whitespace-nowrap">
                        <input
                          type="number"
                          step="0.01"
                          defaultValue={c.prix_renouvellement ?? ''}
                          key={`r-${c.id}-${c.prix_renouvellement ?? ''}`}
                          onBlur={e => {
                            const v = e.target.value === '' ? null : Number(e.target.value)
                            if (v !== (c.prix_renouvellement ?? null))
                              updateClient.mutate({ id: c.id, prix_renouvellement: v })
                          }}
                          placeholder="—"
                          className="bg-transparent border-0 hover:bg-muted/60 focus:bg-muted/80 focus:ring-1 focus:ring-emerald-400 rounded px-1 py-0 text-[10px] cursor-pointer w-16 text-right font-semibold text-emerald-600 dark:text-emerald-400 outline-none"
                          title="Cliquer pour modifier (Tab/Entrée pour sauvegarder)"
                        />
                      </td>
                      <td className="py-1 px-2">
                        <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button variant="ghost" size="icon" className="w-6 h-6 text-blue-600 dark:text-blue-400" onClick={() => navigate(c.id)} title="Voir">
                            <Eye className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-6 h-6" onClick={() => { setEditingClient(c); setShowForm(true) }} title="Modifier">
                            <Edit2 className="w-3 h-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-6 h-6 text-red-400 hover:bg-red-500/10"
                            onClick={() => { if (confirm(`Supprimer ${c.nom} ?`)) deleteClient.mutate(c.id) }}
                            title="Supprimer"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={13}>
                      <div className="empty-state">
                        <User className="empty-state-icon" />
                        <p className="empty-state-title">Aucun client trouvé</p>
                        <p className="empty-state-desc">Ajoutez votre premier client ou modifiez votre recherche</p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent className="max-w-2xl">
          <DialogHeader className="relative">
            <DialogTitle>{editingClient ? 'Modifier le client' : 'Nouveau client'}</DialogTitle>
            {/* Bouton primaire centré horizontalement dans le header */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-0.5">
              <Button
                type="submit"
                form="client-form"
                size="sm"
                className="h-8 px-5 text-xs font-semibold shadow-sm"
              >
                {editingClient ? '💾 Enregistrer' : '➕ Créer'}
              </Button>
            </div>
          </DialogHeader>
          <ClientForm client={editingClient} onClose={() => { setShowForm(false); setEditingClient(undefined) }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
