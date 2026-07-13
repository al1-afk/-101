import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, User, Building2, Phone, Mail, MapPin,
  Edit2, Trash2, Loader2, Eye, Globe, Server, AlertTriangle, Clock, X,
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
  /* Couleur de la date selon expiration. Pas de badge séparé : la couleur de
     la date suffit (rouge = imminent, ambre = bientôt, neutre = OK). */
  let dateCls = 'text-muted-foreground'
  let badgeIcon: React.ElementType | null = null
  if (days !== null) {
    if (days < 30) {
      dateCls = 'text-red-600 dark:text-red-400 font-semibold'
      badgeIcon = AlertTriangle
    } else if (days <= 90) {
      dateCls = 'text-amber-600 dark:text-amber-400'
      badgeIcon = Clock
    } else {
      dateCls = 'text-blue-600 dark:text-blue-400'
      badgeIcon = Clock
    }
  }
  return (
    <div className="flex items-center gap-0.5 min-w-0">
      <input
        type="date"
        defaultValue={(expiry ?? '').slice(0, 10)}
        key={`e-${expiry ?? ''}`}
        onChange={e => onSave({ expiry: e.target.value || undefined })}
        className={`bg-transparent border-0 hover:bg-muted/60 focus:bg-muted/80 focus:ring-1 focus:ring-blue-400 rounded px-1 py-0 text-[10px] cursor-pointer w-20 outline-none ${dateCls}`}
        title="Cliquer pour modifier"
      />
      {badgeIcon && expiry && (() => {
        const I = badgeIcon
        return <I className={`w-2.5 h-2.5 flex-shrink-0 ${dateCls}`} />
      })()}
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
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const merged: any = {
      ...form,
      notes: serializeClientNotes(parsed.meta, form.notes, parsed.blocks),
      type_service:        form.type_service        || null,
      sous_categorie:      form.sous_categorie      || null,
      date_debut_contrat:  form.date_debut_contrat  || null,
      montant_ttc_annuel:  form.montant_ttc_annuel  === '' ? null : Number(form.montant_ttc_annuel),
      prix_renouvellement: form.prix_renouvellement === '' ? null : Number(form.prix_renouvellement),
    }
    if (client) await update.mutateAsync({ id: client.id, ...merged })
    else await create.mutateAsync(merged as any)
    onClose()
  }

  return (
    <form id="client-form" onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
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

      {/* ── Bloc Contrat / Prestation ───────────────────────────── */}
      <div className="rounded-xl border border-dashed border-blue-300 dark:border-blue-700/50 bg-blue-50/30 dark:bg-blue-950/10 p-3 space-y-3">
        <p className="text-xs font-bold text-blue-700 dark:text-blue-300 uppercase tracking-widest">💼 Contrat / Prestation</p>
        <div className="grid grid-cols-2 gap-4">
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
            onImport={async (row) => { await createClient.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={() => { setEditingClient(undefined); setShowForm(true) }}>
            <Plus className="w-4 h-4" />
            Nouveau client
          </Button>
        </div>
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
                            <p className="text-[12px] font-semibold text-foreground truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{c.nom}</p>
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
