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
import { formatDate, getInitials } from '@/lib/utils'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { clientsSchema } from '@/lib/importExportSchemas'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'
import { parseClientNotes, serializeClientNotes, daysUntil } from '@/lib/clientNotes'

/* ─── Domain / hosting cell with countdown badge ─────────────────── */
function DomainCell({
  name, expiry, icon: Icon,
}: { name?: string; expiry?: string; icon: React.ElementType }) {
  if (!name && !expiry) return <span className="text-muted-foreground/50">—</span>
  const days = daysUntil(expiry)
  let badgeCls = 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
  let BadgeIcon: React.ElementType | null = null
  let badgeTxt = ''
  if (days !== null) {
    if (days < 0) { badgeCls = 'bg-red-500/15 text-red-600 dark:text-red-400'; BadgeIcon = AlertTriangle; badgeTxt = `Expiré -${Math.abs(days)}j` }
    else if (days === 0) { badgeCls = 'bg-red-500/15 text-red-600 dark:text-red-400'; BadgeIcon = AlertTriangle; badgeTxt = `Aujourd'hui` }
    else if (days <= 7) { badgeCls = 'bg-red-500/10 text-red-600 dark:text-red-400'; BadgeIcon = AlertTriangle; badgeTxt = `${days}j` }
    else if (days <= 30) { badgeCls = 'bg-amber-500/15 text-amber-600 dark:text-amber-400'; BadgeIcon = Clock; badgeTxt = `${days}j` }
    else { BadgeIcon = Clock; badgeTxt = `${days}j` }
  }
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <Icon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
      <div className="min-w-0">
        {name && <p className="text-xs font-semibold text-foreground truncate" title={name}>{name}</p>}
        {badgeTxt && (
          <span className={`inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${badgeCls}`}>
            {BadgeIcon && <BadgeIcon className="w-2.5 h-2.5" />}
            {badgeTxt}
          </span>
        )}
      </div>
    </div>
  )
}

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
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const merged = { ...form, notes: serializeClientNotes(parsed.meta, form.notes, parsed.blocks) }
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
                  <th>Localisation</th>
                  <th>Domaine</th>
                  <th>Hébergement</th>
                  <th>Depuis</th>
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
                        {(c.ville || c.pays) ? (
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                            <MapPin className="w-3 h-3" />
                            {[c.ville, c.pays].filter(Boolean).join(', ')}
                          </div>
                        ) : <span className="text-muted-foreground/50">—</span>}
                      </td>
                      <td>
                        <DomainCell name={meta.domainName} expiry={meta.domainExpiry} icon={Globe} />
                      </td>
                      <td>
                        <DomainCell name={meta.hostingName} expiry={meta.hostingExpiry} icon={Server} />
                      </td>
                      <td className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(c.created_at)}</td>
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
                    <td colSpan={7}>
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
