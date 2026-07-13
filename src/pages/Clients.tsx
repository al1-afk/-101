import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, Search, User, Building2, Phone, Mail, MapPin,
  Edit2, Trash2, Loader2, Eye, Globe, Server, X, RotateCw,
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

/* ─── Modal : répartition mensuelle des revenus de renouvellement ── */
const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]
function RenewalBreakdownModal({
  months, unscheduled, onClose,
}: {
  months: Array<{ total: number; clients: Array<{ nom: string; montant: number; date: string }> }>
  unscheduled: Array<{ nom: string; montant: number }>
  onClose: () => void
}) {
  const scheduledTotal = months.reduce((s, m) => s + m.total, 0)
  const unscheduledTotal = unscheduled.reduce((s, c) => s + c.montant, 0)
  const grandTotal = scheduledTotal + unscheduledTotal
  const max = Math.max(1, ...months.map(m => m.total))
  const currentMonth = new Date().getMonth()
  const fmt = (n: number) => new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' MAD'
  const [expanded, setExpanded] = useState<number | null>(currentMonth)

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/70"
      onClick={onClose}
    >
      <div
        className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col ring-1 ring-slate-200 dark:ring-slate-800"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — bandeau vert dégradé, sans flou */}
        <div className="relative bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6 flex-shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-lg bg-white/15 hover:bg-white/25 flex items-center justify-center transition-colors"
            aria-label="Fermer"
          >
            <X className="w-4 h-4" />
          </button>
          <h2 className="text-xl font-bold mb-1">Revenus renouvellements — mois par mois</h2>
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 text-sm text-emerald-50">
            <span>
              Total annuel : <strong className="text-white text-base">{fmt(grandTotal)}</strong>
            </span>
            <span>
              Moyenne mensuelle : <strong className="text-white">{fmt(grandTotal / 12)}</strong>
            </span>
          </div>
        </div>

        {/* Body — grille 12 mois compacte */}
        <div className="overflow-y-auto p-4 space-y-1.5 flex-1 bg-slate-50 dark:bg-slate-950/50">
          {/* Section "À planifier" — clients actifs avec revenu mais sans date d'expiration */}
          {unscheduled.length > 0 && (
            <div className="rounded-xl overflow-hidden border border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20 mb-2">
              <div className="p-3 flex items-center gap-3">
                <div className="min-w-[110px]">
                  <div className="text-sm font-bold text-amber-800 dark:text-amber-300">À planifier</div>
                  <div className="text-[9px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                    dates manquantes
                  </div>
                </div>
                <div className="flex-1 text-[11px] text-amber-800 dark:text-amber-200">
                  {unscheduled.length} client{unscheduled.length > 1 ? 's' : ''} actif{unscheduled.length > 1 ? 's' : ''} sans date d'expiration — ajoute une date pour les répartir sur un mois
                </div>
                <div className="min-w-[120px] text-right">
                  <div className="text-sm font-bold text-amber-700 dark:text-amber-300">{fmt(unscheduledTotal)}</div>
                  <div className="text-[10px] text-amber-600 dark:text-amber-400/80">non répartis</div>
                </div>
              </div>
              <div className="border-t border-amber-200 dark:border-amber-800/40 bg-white/50 dark:bg-slate-950/40 p-2 space-y-0.5">
                {unscheduled
                  .sort((a, b) => b.montant - a.montant)
                  .map((c, j) => (
                    <div key={j} className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg">
                      <span className="truncate flex-1 text-slate-800 dark:text-slate-200 font-medium">{c.nom}</span>
                      <span className="font-semibold text-amber-700 dark:text-amber-400 min-w-[90px] text-right">{fmt(c.montant)}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {months.map((m, i) => {
            const pct = max > 0 ? (m.total / max) * 100 : 0
            const isCurrent = i === currentMonth
            const isOpen = expanded === i
            const hasData = m.clients.length > 0
            return (
              <div
                key={i}
                className={`rounded-xl overflow-hidden border transition-colors ${
                  isCurrent
                    ? 'border-blue-400 dark:border-blue-500/60 bg-blue-50/40 dark:bg-blue-950/20'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900'
                }`}
              >
                <button
                  type="button"
                  onClick={() => hasData && setExpanded(isOpen ? null : i)}
                  disabled={!hasData}
                  className={`w-full flex items-center gap-3 p-3 text-left transition-colors ${
                    hasData ? 'cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50' : 'cursor-default opacity-70'
                  }`}
                >
                  {/* Nom du mois */}
                  <div className="min-w-[110px]">
                    <div className={`text-sm font-bold ${isCurrent ? 'text-blue-700 dark:text-blue-300' : 'text-slate-900 dark:text-slate-100'}`}>
                      {MONTHS_FR[i]}
                    </div>
                    {isCurrent && (
                      <div className="text-[9px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        mois en cours
                      </div>
                    )}
                  </div>

                  {/* Barre + chiffre */}
                  <div className="flex-1 flex items-center gap-3">
                    <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="min-w-[120px] text-right">
                      <div className="text-sm font-bold text-emerald-600 dark:text-emerald-400">
                        {m.total ? fmt(m.total) : '—'}
                      </div>
                      {hasData && (
                        <div className="text-[10px] text-slate-500 dark:text-slate-400">
                          {m.clients.length} client{m.clients.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>

                  {hasData && (
                    <div className={`w-5 h-5 flex items-center justify-center text-slate-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}>
                      ›
                    </div>
                  )}
                </button>

                {/* Détail clients — visible quand déplié */}
                {isOpen && hasData && (
                  <div className="border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50 p-2 space-y-0.5">
                    {m.clients
                      .sort((a, b) => b.montant - a.montant)
                      .map((c, j) => (
                        <div
                          key={j}
                          className="flex items-center justify-between text-xs py-1.5 px-3 rounded-lg hover:bg-white dark:hover:bg-slate-800/60 transition-colors"
                        >
                          <span className="truncate flex-1 text-slate-800 dark:text-slate-200 font-medium">
                            {c.nom}
                          </span>
                          <span className="text-slate-500 text-[11px] font-mono mx-3">
                            {new Date(c.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                          </span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 min-w-[90px] text-right">
                            {fmt(c.montant)}
                          </span>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-[11px] text-slate-500 dark:text-slate-400 flex-shrink-0">
          Le mois de renouvellement est déterminé par la date d'expiration du domaine (fallback : hébergement puis date de début).
        </div>
      </div>
    </div>
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
  const [showBreakdown, setShowBreakdown] = useState(false)

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

  /* Répartition mensuelle des revenus de renouvellement.
     Chaque client actif compte au mois où tombe sa date de renouvellement
     domaine (fallback : hébergement, puis date début contrat).
     Les clients actifs SANS date sont placés dans "unscheduled" pour que
     le total du modal corresponde exactement à la KPI carte. */
  const monthlyBreakdown = useMemo(() => {
    const months: Array<{ total: number; clients: Array<{ nom: string; montant: number; date: string }> }> =
      Array.from({ length: 12 }, () => ({ total: 0, clients: [] }))
    const unscheduled: Array<{ nom: string; montant: number }> = []
    for (const c of clients) {
      if (c.statut !== 'Actif') continue
      const price = Number(c.prix_renouvellement ?? 0)
      if (!price) continue
      const meta = parseClientNotes(c.notes).meta
      const dateStr = meta.domainExpiry ?? meta.hostingExpiry ?? c.date_debut_contrat
      const d = dateStr ? new Date(dateStr) : null
      if (!d || isNaN(d.getTime())) {
        unscheduled.push({ nom: c.nom, montant: price })
        continue
      }
      const m = d.getMonth()
      months[m].total += price
      months[m].clients.push({ nom: c.nom, montant: price, date: dateStr! })
    }
    return { months, unscheduled }
  }, [clients])

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
          onClick={() => setShowBreakdown(true)}
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
          <p className="text-[11px] text-muted-foreground">domaine + hébergement / an · cliquer pour le détail</p>
        </button>
      </div>

      {/* Modal : répartition mensuelle des renouvellements */}
      {showBreakdown && (
        <RenewalBreakdownModal
          months={monthlyBreakdown.months}
          unscheduled={monthlyBreakdown.unscheduled}
          onClose={() => setShowBreakdown(false)}
        />
      )}

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
