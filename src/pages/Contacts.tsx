import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import { Plus, Search, Phone, Mail, Edit2, Trash2, MapPin, BadgeCheck, Users } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getInitials } from '@/lib/utils'
import {
  useContacts, useCreateContact, useUpdateContact, useDeleteContact,
  type Contact, type ContactType, type ContactStatut,
} from '@/hooks/useContacts'

const EMPTY: Omit<Contact, 'id' | 'created_at'> = {
  nom: '', telephone: '', email: '', profession: '',
  type: 'autre', statut: 'contact', ville: '', notes: '', tags: null,
}

const TYPE_LABELS: Record<ContactType, string> = {
  freelance:   'Freelance',
  artisan:     'Artisan',
  candidat:    'Candidat',
  partenaire:  'Partenaire',
  autre:       'Autre',
}

const TYPE_COLORS: Record<ContactType, string> = {
  freelance:  'bg-purple-500/15 text-purple-700 dark:text-purple-300',
  artisan:    'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  candidat:   'bg-blue-500/15 text-blue-700 dark:text-blue-300',
  partenaire: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300',
  autre:      'bg-slate-500/15 text-slate-700 dark:text-slate-300',
}

export default function Contacts() {
  const { data: contacts = [], isLoading } = useContacts()
  const createM = useCreateContact()
  const updateM = useUpdateContact()
  const removeM = useDeleteContact()

  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | ContactType>('all')
  const [statutFilter, setStatutFilter] = useState<'all' | ContactStatut>('all')
  const [showForm, setShowForm]     = useState(false)
  const [editing, setEditing]       = useState<Contact | undefined>()
  const [form, setForm]             = useState<Omit<Contact, 'id' | 'created_at'>>(EMPTY)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return contacts.filter(c => {
      if (typeFilter   !== 'all' && c.type   !== typeFilter)   return false
      if (statutFilter !== 'all' && c.statut !== statutFilter) return false
      if (!q) return true
      return [c.nom, c.telephone, c.email, c.profession, c.ville]
        .some(x => x?.toLowerCase().includes(q))
    })
  }, [contacts, search, typeFilter, statutFilter])

  const stats = useMemo(() => ({
    total:   contacts.length,
    actifs:  contacts.filter(c => c.statut === 'actif').length,
    contacts: contacts.filter(c => c.statut === 'contact').length,
  }), [contacts])

  const openCreate = () => {
    setEditing(undefined)
    setForm(EMPTY)
    setShowForm(true)
  }
  const openEdit = (c: Contact) => {
    setEditing(c)
    setForm({
      nom: c.nom, telephone: c.telephone ?? '', email: c.email ?? '',
      profession: c.profession ?? '', type: c.type, statut: c.statut,
      ville: c.ville ?? '', notes: c.notes ?? '', tags: c.tags,
    })
    setShowForm(true)
  }
  const submit = async () => {
    if (!form.nom.trim()) return
    if (editing) {
      await updateM.mutateAsync({ id: editing.id, ...form })
    } else {
      await createM.mutateAsync(form)
    }
    setShowForm(false)
    setEditing(undefined)
    setForm(EMPTY)
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Contacts</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Carnet d'adresses — freelances, candidats, artisans, partenaires
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Ajouter
        </Button>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-slate-500/15 flex items-center justify-center">
            <Users className="w-5 h-5 text-slate-600 dark:text-slate-300" />
          </div>
          <div>
            <p className="text-xl font-extrabold text-foreground">{stats.total}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Total contacts</p>
          </div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-500/15 flex items-center justify-center">
            <BadgeCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{stats.actifs}</p>
            <p className="text-xs text-muted-foreground mt-0.5">Actifs (on travaille avec)</p>
          </div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-500/15 flex items-center justify-center">
            <Phone className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-xl font-extrabold text-blue-600 dark:text-blue-400">{stats.contacts}</p>
            <p className="text-xs text-muted-foreground mt-0.5">En réserve (numéro seul)</p>
          </div>
        </div>
      </div>

      {/* ── Filtres ── */}
      <div className="card-premium p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher nom, téléphone, métier..."
            className="pl-9"
          />
        </div>
        <Select value={typeFilter} onValueChange={v => setTypeFilter(v as any)}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les types</SelectItem>
            <SelectItem value="freelance">Freelance</SelectItem>
            <SelectItem value="artisan">Artisan</SelectItem>
            <SelectItem value="candidat">Candidat</SelectItem>
            <SelectItem value="partenaire">Partenaire</SelectItem>
            <SelectItem value="autre">Autre</SelectItem>
          </SelectContent>
        </Select>
        <Select value={statutFilter} onValueChange={v => setStatutFilter(v as any)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous statuts</SelectItem>
            <SelectItem value="actif">Actif (on travaille avec)</SelectItem>
            <SelectItem value="contact">Contact (numéro seul)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── Liste ── */}
      {isLoading ? (
        <div className="text-center text-muted-foreground text-sm py-10">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Users className="empty-state-icon" />
          <p className="empty-state-title">Aucun contact</p>
          <p className="empty-state-description">
            Ajoutez vos freelances, artisans, candidats — toute personne qui n'est ni client ni fournisseur.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((c, i) => (
            <motion.div
              key={c.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
              className="card-premium p-4 group hover:border-blue-500/30 transition-all"
            >
              <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 flex items-center justify-center font-semibold text-sm text-blue-700 dark:text-blue-300 flex-shrink-0">
                  {getInitials(c.nom)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-foreground text-sm truncate">{c.nom}</p>
                    {c.statut === 'actif' ? (
                      <span className="badge-pill badge-success">Actif</span>
                    ) : (
                      <span className="badge-pill bg-slate-500/15 text-slate-600 dark:text-slate-400">Contact</span>
                    )}
                  </div>
                  {c.profession && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{c.profession}</p>
                  )}
                  <span className={`inline-block mt-2 text-[10px] px-2 py-0.5 rounded-full font-medium ${TYPE_COLORS[c.type]}`}>
                    {TYPE_LABELS[c.type]}
                  </span>
                </div>
              </div>

              <div className="mt-3 space-y-1.5 text-xs">
                {c.telephone && (
                  <a href={`tel:${c.telephone}`} className="flex items-center gap-2 text-foreground hover:text-blue-600 dark:hover:text-blue-400">
                    <Phone className="w-3.5 h-3.5 text-muted-foreground" />
                    {c.telephone}
                  </a>
                )}
                {c.email && (
                  <a href={`mailto:${c.email}`} className="flex items-center gap-2 text-foreground hover:text-blue-600 dark:hover:text-blue-400 truncate">
                    <Mail className="w-3.5 h-3.5 text-muted-foreground" />
                    {c.email}
                  </a>
                )}
                {c.ville && (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <MapPin className="w-3.5 h-3.5" />
                    {c.ville}
                  </div>
                )}
                {c.notes && (
                  <p className="text-muted-foreground line-clamp-2 mt-2">{c.notes}</p>
                )}
              </div>

              <div className="mt-3 pt-2 border-t border-border flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="w-7 h-7" onClick={() => openEdit(c)}>
                  <Edit2 className="w-3.5 h-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="w-7 h-7 text-red-500" onClick={() => removeM.mutate(c.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* ── Dialog ajouter/modifier ── */}
      <Dialog open={showForm} onOpenChange={(o) => { if (!o) { setShowForm(false); setEditing(undefined) } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader className="relative">
            <DialogTitle>{editing ? 'Modifier le contact' : 'Nouveau contact'}</DialogTitle>
            {/* Bouton primaire centré horizontalement dans le header */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-0.5">
              <Button
                type="button"
                size="sm"
                className="h-8 px-5 text-xs font-semibold shadow-sm"
                disabled={!form.nom.trim() || createM.isPending || updateM.isPending}
                onClick={submit}
              >
                {editing ? '💾 Enregistrer' : '➕ Créer'}
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <label className="form-label">Nom complet *</label>
                <AutocorrectInput value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Téléphone</label>
                <Input value={form.telephone ?? ''} onChange={e => setForm(p => ({ ...p, telephone: e.target.value }))} placeholder="+212 6 ..." />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Email</label>
                <Input type="email" value={form.email ?? ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Métier / Spécialité</label>
                <AutocorrectInput value={form.profession ?? ''} onChange={e => setForm(p => ({ ...p, profession: e.target.value }))} placeholder="ex: Plombier, Designer..." />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Ville</label>
                <AutocorrectInput value={form.ville ?? ''} onChange={e => setForm(p => ({ ...p, ville: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Type</label>
                <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as ContactType }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="freelance">Freelance</SelectItem>
                    <SelectItem value="artisan">Artisan</SelectItem>
                    <SelectItem value="candidat">Candidat (employé potentiel)</SelectItem>
                    <SelectItem value="partenaire">Partenaire</SelectItem>
                    <SelectItem value="autre">Autre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Statut</label>
                <Select value={form.statut} onValueChange={v => setForm(p => ({ ...p, statut: v as ContactStatut }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actif">Actif — on travaille avec lui</SelectItem>
                    <SelectItem value="contact">Contact — juste un numéro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <label className="form-label">Notes</label>
                <AutocorrectInput value={form.notes ?? ''} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Tarif, disponibilité, recommandé par..." />
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(undefined) }}>
                Annuler
              </Button>
              <Button
                disabled={!form.nom.trim() || createM.isPending || updateM.isPending}
                onClick={submit}
              >
                {(createM.isPending || updateM.isPending)
                  ? '...'
                  : (editing ? 'Enregistrer' : 'Ajouter')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
