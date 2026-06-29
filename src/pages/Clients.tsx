import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, User, Building2, Phone, Mail, MapPin,
  Edit2, Trash2, Loader2, Eye, Globe, Server, AlertTriangle, Clock,
} from 'lucide-react'
import { useClients, useCreateClient, useUpdateClient, useDeleteClient, type Client } from '@/hooks/useClients'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate, getInitials } from '@/lib/utils'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { clientsSchema } from '@/lib/importExportSchemas'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'
import { parseClientNotes, serializeClientNotes, daysUntil } from '@/lib/clientNotes'

/* ─── Domain / hosting cell with countdown badge (inline editable) ─────────────────── */
function DomainCell({
  name, expiry, icon: Icon, onSave,
}: {
  name?:   string
  expiry?: string
  icon:    React.ElementType
  onSave:  (patch: { name?: string; expiry?: string }) => void
}) {
  const days = daysUntil(expiry)
  let badgeCls = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  let BadgeIcon: React.ElementType | null = Clock
  let badgeTxt = ''
  if (days !== null) {
    if (days < 0) { badgeCls = 'bg-red-500/15 text-red-600 dark:text-red-400'; BadgeIcon = AlertTriangle; badgeTxt = `-${Math.abs(days)}j` }
    else if (days === 0) { badgeCls = 'bg-red-500/15 text-red-600 dark:text-red-400'; BadgeIcon = AlertTriangle; badgeTxt = `0j` }
    else if (days <= 7) { badgeCls = 'bg-red-500/10 text-red-600 dark:text-red-400'; BadgeIcon = AlertTriangle; badgeTxt = `${days}j` }
    else if (days <= 30) { badgeCls = 'bg-amber-500/15 text-amber-600 dark:text-amber-400'; BadgeIcon = Clock; badgeTxt = `${days}j` }
    else { BadgeIcon = Clock; badgeTxt = `${days}j` }
  }
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0 space-y-0.5">
        <input
          type="text"
          defaultValue={name ?? ''}
          key={`n-${name ?? ''}`}
          onBlur={e => {
            const v = e.target.value.trim()
            if (v !== (name ?? '')) onSave({ name: v || undefined })
          }}
          placeholder="—"
          className="bg-transparent border-0 hover:bg-muted/60 focus:bg-muted/80 focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-xs font-semibold text-foreground w-24 outline-none"
          title="Cliquer pour modifier"
        />
        <div className="flex items-center gap-1">
          <input
            type="date"
            defaultValue={expiry ?? ''}
            key={`e-${expiry ?? ''}`}
            onChange={e => onSave({ expiry: e.target.value || undefined })}
            className={`bg-transparent border-0 hover:bg-muted/60 focus:bg-muted/80 focus:ring-1 focus:ring-blue-400 rounded px-1 py-0.5 text-[10px] cursor-pointer outline-none ${badgeTxt && days !== null && days <= 30 ? 'text-red-600 dark:text-red-400 font-bold' : 'text-muted-foreground'}`}
            title="Date d'expiration"
          />
          {badgeTxt && (
            <span className={`inline-flex items-center gap-0.5 text-[9px] font-bold px-1 py-0.5 rounded ${badgeCls}`}>
              {BadgeIcon && <BadgeIcon className="w-2 h-2" />}
              {badgeTxt}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

const TYPE_SERVICES = ['Site web', 'Social Media', 'SEO', 'Ads', 'Identité visuelle', 'Maintenance', 'Autre'] as const
const SOUS_CATEGORIES = ['SEO', 'Ads', 'Les messages', 'Création contenu', 'Refonte', 'Autre'] as const

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
    date_debut_contrat:  client?.date_debut_contrat  || '',
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
    <form onSubmit={handleSubmit} className="space-y-4">
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
        <textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
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

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const filtered = useMemo(() =>
    clients.filter(c =>
      (!search || [c.nom, c.email, c.entreprise, c.ville].some(f => f?.toLowerCase().includes(search.toLowerCase())))
      && dateMatch(c.created_at)
    )
  , [clients, search, dateMatch])

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

      {/* Date filter */}
      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Rechercher un client..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
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
              <thead className="table-header">
                <tr className="table-header">
                  <th>Client</th>
                  <th>Contact</th>
                  <th>Type</th>
                  <th>Catégorie</th>
                  <th>Début contrat</th>
                  <th className="text-right">Montant TTC</th>
                  <th>Domaine</th>
                  <th>Hébergement</th>
                  <th className="text-right">Renouv.</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => {
                  const meta = parseClientNotes(c.notes).meta
                  return (
                    <tr key={c.id} className="table-row group">
                      <td>
                        <button
                          onClick={() => navigate(c.id)}
                          className="flex items-center gap-3 text-left"
                        >
                          <div className="avatar-initials w-9 h-9 flex-shrink-0">
                            <span className="font-bold text-xs">{getInitials(c.nom)}</span>
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-foreground truncate hover:text-blue-600 dark:hover:text-blue-400 transition-colors">{c.nom}</p>
                            {c.entreprise && (
                              <p className="text-xs text-muted-foreground truncate flex items-center gap-1">
                                <Building2 className="w-3 h-3" /> {c.entreprise}
                              </p>
                            )}
                          </div>
                        </button>
                      </td>
                      <td>
                        <div className="space-y-0.5 text-xs">
                          {c.email && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Mail className="w-3 h-3" />
                              <span className="truncate max-w-[180px]" title={c.email}>{c.email}</span>
                            </div>
                          )}
                          {c.telephone && (
                            <div className="flex items-center gap-1.5 text-muted-foreground">
                              <Phone className="w-3 h-3" /> {c.telephone}
                            </div>
                          )}
                          {!c.email && !c.telephone && <span className="text-muted-foreground/50">—</span>}
                        </div>
                      </td>
                      <td>
                        {c.type_service ? (
                          <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            {c.type_service}
                          </span>
                        ) : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td>
                        {c.sous_categorie ? (
                          <span className="inline-flex items-center text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                            {c.sous_categorie}
                          </span>
                        ) : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td className="text-xs whitespace-nowrap">
                        <input
                          type="date"
                          defaultValue={c.date_debut_contrat ?? ''}
                          key={`d-${c.id}-${c.date_debut_contrat ?? ''}`}
                          onChange={e => updateClient.mutate({ id: c.id, date_debut_contrat: e.target.value || null })}
                          className="bg-transparent border-0 hover:bg-muted/60 focus:bg-muted/80 focus:ring-1 focus:ring-blue-400 rounded px-1.5 py-1 text-xs cursor-pointer w-32 outline-none"
                          title="Cliquer pour modifier"
                        />
                      </td>
                      <td className="text-xs text-right whitespace-nowrap">
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
                          className="bg-transparent border-0 hover:bg-muted/60 focus:bg-muted/80 focus:ring-1 focus:ring-blue-400 rounded px-1.5 py-1 text-xs cursor-pointer w-24 text-right font-semibold outline-none"
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
                      <td>
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
                      <td className="text-xs text-right whitespace-nowrap">
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
                          className="bg-transparent border-0 hover:bg-muted/60 focus:bg-muted/80 focus:ring-1 focus:ring-emerald-400 rounded px-1.5 py-1 text-xs cursor-pointer w-24 text-right font-semibold text-emerald-600 dark:text-emerald-400 outline-none"
                          title="Cliquer pour modifier (Tab/Entrée pour sauvegarder)"
                        />
                      </td>
                      <td>
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-blue-600 dark:text-blue-400" onClick={() => navigate(c.id)} title="Voir détails">
                            <Eye className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => { setEditingClient(c); setShowForm(true) }} title="Modifier">
                            <Edit2 className="w-3.5 h-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400 hover:bg-red-500/10"
                            onClick={() => { if (confirm(`Supprimer ${c.nom} ?`)) deleteClient.mutate(c.id) }}
                            title="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={10}>
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
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Modifier le client' : 'Nouveau client'}</DialogTitle>
          </DialogHeader>
          <ClientForm client={editingClient} onClose={() => { setShowForm(false); setEditingClient(undefined) }} />
        </DialogContent>
      </Dialog>
    </div>
  )
}
