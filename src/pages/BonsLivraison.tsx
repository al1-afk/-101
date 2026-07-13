import { useState, useMemo } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Plus, Search, FileCheck, Trash2, Edit2, Eye, EyeOff, Link2,
  KeyRound, Copy, Calendar, CheckCircle2, Send,
  FileText, Briefcase, User, Printer,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import {
  useBonsLivraison, useCreateBonLivraison, useUpdateBonLivraison,
  useDeleteBonLivraison, nextBonLivraisonNumero,
  type BonLivraison, type BonLivraisonStatut,
  type BonLivraisonLien, type BonLivraisonIdentifiant, type IdentifiantType,
} from '@/hooks/useBonsLivraison'
import { useProjets } from '@/hooks/useProjets'
import { useClients } from '@/hooks/useClients'

const STATUT_CONFIG: Record<BonLivraisonStatut, { label: string; variant: 'default' | 'success' | 'warning'; icon: React.ElementType }> = {
  brouillon: { label: 'Brouillon', variant: 'default', icon: FileText },
  envoye:    { label: 'Envoyé',    variant: 'warning', icon: Send },
  confirme:  { label: 'Confirmé',  variant: 'success', icon: CheckCircle2 },
}

const IDENT_TYPES: { value: IdentifiantType; label: string }[] = [
  { value: 'user',     label: 'Utilisateur' },
  { value: 'password', label: 'Mot de passe' },
  { value: 'email',    label: 'Email' },
  { value: 'url',      label: 'URL' },
  { value: 'other',    label: 'Autre' },
]

const EMPTY_FORM = {
  numero:         '',
  projet_id:      null as string | null,
  client_id:      null as string | null,
  titre:          '',
  description:    '',
  liens:          [] as BonLivraisonLien[],
  identifiants:   [] as BonLivraisonIdentifiant[],
  date_livraison: new Date().toISOString().slice(0, 10),
  statut:         'brouillon' as BonLivraisonStatut,
  notes:          '',
}

export default function BonsLivraison() {
  const navigate = useNavigate()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const base = tenantSlug ? `/${tenantSlug}` : ''

  const { data: bons = [], isLoading } = useBonsLivraison()
  const { data: projets = [] } = useProjets()
  const { data: clients = [] } = useClients()

  const create = useCreateBonLivraison()
  const update = useUpdateBonLivraison()
  const remove = useDeleteBonLivraison()

  const [search, setSearch] = useState('')
  const [statutFilter, setStatutFilter] = useState<'all' | BonLivraisonStatut>('all')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<BonLivraison | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)

  const projetMap = useMemo(() => {
    const m = new Map<string, string>()
    projets.forEach(p => m.set(p.id, p.nom))
    return m
  }, [projets])

  const clientMap = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach(c => m.set(c.id, c.entreprise || c.nom))
    return m
  }, [clients])

  const filtered = useMemo(() => bons.filter(b => {
    if (statutFilter !== 'all' && b.statut !== statutFilter) return false
    if (!search) return true
    const q = search.toLowerCase()
    return [b.numero, b.titre, b.description ?? '',
            projetMap.get(b.projet_id ?? '') ?? '',
            clientMap.get(b.client_id ?? '') ?? '']
      .some(f => (f ?? '').toLowerCase().includes(q))
  }), [bons, search, statutFilter, projetMap, clientMap])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, numero: nextBonLivraisonNumero(bons) })
    setShowForm(true)
  }

  function openEdit(b: BonLivraison) {
    setEditing(b)
    setForm({
      numero:         b.numero,
      projet_id:      b.projet_id,
      client_id:      b.client_id,
      titre:          b.titre,
      description:    b.description ?? '',
      liens:          Array.isArray(b.liens)        ? b.liens        : [],
      identifiants:   Array.isArray(b.identifiants) ? b.identifiants : [],
      date_livraison: b.date_livraison,
      statut:         b.statut,
      notes:          b.notes ?? '',
    })
    setShowForm(true)
  }

  async function handleSubmit() {
    if (!form.titre.trim()) { toast.error('Le titre est requis'); return }
    if (!form.numero.trim()) { toast.error('Le numéro est requis'); return }
    const payload = { ...form }
    if (editing) await update.mutateAsync({ id: editing.id, ...payload })
    else         await create.mutateAsync(payload)
    setShowForm(false)
  }

  function handleProjetChange(projetId: string | null) {
    setForm(p => {
      const projet = projetId ? projets.find(pr => pr.id === projetId) : null
      return {
        ...p,
        projet_id: projetId,
        client_id: projet?.client_id ?? p.client_id,
        titre: p.titre || (projet ? `Livraison — ${projet.nom}` : ''),
      }
    })
  }

  /* ── Liens (label + url) ─────────────────────────────────────── */
  function addLien() {
    setForm(p => ({ ...p, liens: [...p.liens, { label: '', url: '' }] }))
  }
  function updateLien(i: number, patch: Partial<BonLivraisonLien>) {
    setForm(p => ({ ...p, liens: p.liens.map((l, idx) => idx === i ? { ...l, ...patch } : l) }))
  }
  function removeLien(i: number) {
    setForm(p => ({ ...p, liens: p.liens.filter((_, idx) => idx !== i) }))
  }

  /* ── Identifiants (label + valeur + type) ────────────────────── */
  function addIdent(type: IdentifiantType = 'user') {
    setForm(p => ({ ...p, identifiants: [...p.identifiants, { label: '', valeur: '', type }] }))
  }
  function updateIdent(i: number, patch: Partial<BonLivraisonIdentifiant>) {
    setForm(p => ({ ...p, identifiants: p.identifiants.map((it, idx) => idx === i ? { ...it, ...patch } : it) }))
  }
  function removeIdent(i: number) {
    setForm(p => ({ ...p, identifiants: p.identifiants.filter((_, idx) => idx !== i) }))
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bons de livraison</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {filtered.length} bon{filtered.length !== 1 ? 's' : ''} de livraison · handover projet pour le client
          </p>
        </div>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4" /> Nouveau bon de livraison
        </Button>
      </div>

      {/* ── Filters ─────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Rechercher un bon (numéro, titre, projet, client...)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={statutFilter} onValueChange={v => setStatutFilter(v as 'all' | BonLivraisonStatut)}>
          <SelectTrigger className="w-full sm:w-48"><SelectValue placeholder="Statut" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les statuts</SelectItem>
            <SelectItem value="brouillon">Brouillon</SelectItem>
            <SelectItem value="envoye">Envoyé</SelectItem>
            <SelectItem value="confirme">Confirmé</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* ── List ─────────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="text-center text-muted-foreground text-sm py-10">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <FileCheck className="empty-state-icon" />
          <p className="empty-state-title">Aucun bon de livraison</p>
          <p className="empty-state-desc">
            Crée un bon de livraison pour confirmer au client que son projet est livré.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((b, i) => {
            const cfg = STATUT_CONFIG[b.statut]
            const Icon = cfg.icon
            const projet = b.projet_id ? projetMap.get(b.projet_id) : null
            const client = b.client_id ? clientMap.get(b.client_id) : null
            return (
              <motion.div
                key={b.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className="card-premium p-4 group hover:border-emerald-500/30 transition-all cursor-pointer"
                onClick={() => navigate(`${base}/bons-livraison/${b.id}/preview`)}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
                      <FileCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-semibold text-foreground text-sm truncate">{b.numero}</p>
                      <p className="text-xs text-muted-foreground truncate">{b.titre}</p>
                    </div>
                  </div>
                  <Badge variant={cfg.variant} className="flex-shrink-0 flex items-center gap-1">
                    <Icon className="w-3 h-3" />
                    {cfg.label}
                  </Badge>
                </div>

                <div className="space-y-1.5 text-xs text-muted-foreground">
                  {projet && (
                    <div className="flex items-center gap-2">
                      <Briefcase className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{projet}</span>
                    </div>
                  )}
                  {client && (
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{client}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3 h-3 flex-shrink-0" />
                    <span>{formatDate(b.date_livraison)}</span>
                  </div>
                  <div className="flex items-center gap-3 pt-1">
                    <span className="flex items-center gap-1"><Link2 className="w-3 h-3" /> {b.liens?.length ?? 0}</span>
                    <span className="flex items-center gap-1"><KeyRound className="w-3 h-3" /> {b.identifiants?.length ?? 0}</span>
                  </div>
                </div>

                <div className="mt-3 pt-3 border-t border-border flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7"
                    onClick={e => { e.stopPropagation(); navigate(`${base}/bons-livraison/${b.id}/preview`) }}
                    title="Aperçu / PDF"
                  >
                    <Printer className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7"
                    onClick={e => { e.stopPropagation(); openEdit(b) }}
                    title="Modifier"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-red-500"
                    onClick={e => {
                      e.stopPropagation()
                      if (confirm(`Supprimer ${b.numero} ?`)) remove.mutate(b.id)
                    }}
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </motion.div>
            )
          })}
        </div>
      )}

      {/* ── Form Dialog ──────────────────────────────────────────── */}
      <Dialog open={showForm} onOpenChange={v => { if (!v) setShowForm(false) }}>
        <DialogContent className="max-w-3xl max-h-[95dvh] overflow-y-auto">
          <DialogHeader className="relative">
            <DialogTitle>
              {editing ? `Modifier ${editing.numero}` : 'Nouveau bon de livraison'}
            </DialogTitle>
            {/* Bouton primaire centré horizontalement dans le header */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-0.5">
              <Button
                type="button"
                size="sm"
                className="h-8 px-5 text-xs font-semibold shadow-sm"
                disabled={create.isPending || update.isPending || !form.titre.trim()}
                onClick={handleSubmit}
              >
                {editing ? '💾 Enregistrer' : '➕ Créer'}
              </Button>
            </div>
          </DialogHeader>

          <div className="space-y-5">
            {/* Méta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">Numéro *</label>
                <Input
                  value={form.numero}
                  onChange={e => setForm(p => ({ ...p, numero: e.target.value }))}
                  placeholder="BL-2026-0001"
                />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Date de livraison *</label>
                <Input
                  type="date"
                  value={form.date_livraison}
                  onChange={e => setForm(p => ({ ...p, date_livraison: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Titre *</label>
              <AutocorrectInput
                value={form.titre}
                onChange={e => setForm(p => ({ ...p, titre: e.target.value }))}
                placeholder="ex: Livraison site e-commerce — Atlas Boutique"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">Projet (optionnel)</label>
                <Select
                  value={form.projet_id ?? '__none'}
                  onValueChange={v => handleProjetChange(v === '__none' ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="Choisir un projet" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Aucun projet —</SelectItem>
                    {projets.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Client (optionnel)</label>
                <Select
                  value={form.client_id ?? '__none'}
                  onValueChange={v => setForm(p => ({ ...p, client_id: v === '__none' ? null : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="Choisir un client" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none">— Aucun client —</SelectItem>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.entreprise || c.nom}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <label className="form-label">Description du projet livré</label>
              <AutocorrectTextarea
                className="w-full min-h-[120px] rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                placeholder="Décris ce qui a été livré : site web, modules livrés, formation effectuée, garantie..."
              />
            </div>

            {/* Liens du projet */}
            <div className="space-y-2 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <Link2 className="w-4 h-4 text-blue-500" />
                  Liens du projet
                </p>
                <Button variant="secondary" size="sm" onClick={addLien}>
                  <Plus className="w-3.5 h-3.5" /> Ajouter
                </Button>
              </div>
              {form.liens.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Aucun lien. Ex: site live, panneau admin, GitHub...</p>
              ) : (
                <div className="space-y-2">
                  {form.liens.map((l, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2">
                      <AutocorrectInput
                        className="col-span-4"
                        placeholder="Libellé (ex: Site live)"
                        value={l.label}
                        onChange={e => updateLien(i, { label: e.target.value })}
                      />
                      <Input
                        className="col-span-7"
                        placeholder="https://..."
                        value={l.url}
                        onChange={e => updateLien(i, { url: e.target.value })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="col-span-1 w-9 h-9 text-red-500"
                        onClick={() => removeLien(i)}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Identifiants */}
            <div className="space-y-2 border border-border rounded-lg p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold flex items-center gap-2">
                  <KeyRound className="w-4 h-4 text-amber-500" />
                  Identifiants &amp; mots de passe
                </p>
                <div className="flex gap-1">
                  <Button variant="secondary" size="sm" onClick={() => addIdent('user')}>
                    <Plus className="w-3.5 h-3.5" /> User
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => addIdent('password')}>
                    <Plus className="w-3.5 h-3.5" /> Mot de passe
                  </Button>
                </div>
              </div>
              {form.identifiants.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Aucun identifiant. Ex: login admin, FTP, base de données...</p>
              ) : (
                <div className="space-y-2">
                  {form.identifiants.map((it, i) => (
                    <IdentRow
                      key={i}
                      ident={it}
                      onChange={patch => updateIdent(i, patch)}
                      onRemove={() => removeIdent(i)}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Statut + notes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">Statut</label>
                <Select
                  value={form.statut}
                  onValueChange={v => setForm(p => ({ ...p, statut: v as BonLivraisonStatut }))}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="brouillon">Brouillon</SelectItem>
                    <SelectItem value="envoye">Envoyé au client</SelectItem>
                    <SelectItem value="confirme">Confirmé par le client</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Notes internes</label>
                <AutocorrectInput
                  value={form.notes}
                  onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                  placeholder="Non affichées au client"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button
                onClick={handleSubmit}
                disabled={create.isPending || update.isPending || !form.titre.trim()}
              >
                {editing ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── Identifiant row — masque le mot de passe par défaut ─────── */
function IdentRow({
  ident, onChange, onRemove,
}: {
  ident:    BonLivraisonIdentifiant
  onChange: (patch: Partial<BonLivraisonIdentifiant>) => void
  onRemove: () => void
}) {
  const [reveal, setReveal] = useState(false)
  const isPwd = ident.type === 'password'

  function copy() {
    navigator.clipboard.writeText(ident.valeur)
    toast.success('Copié')
  }

  return (
    <div className="grid grid-cols-12 gap-2">
      <Select value={ident.type} onValueChange={v => onChange({ type: v as IdentifiantType })}>
        <SelectTrigger className="col-span-3 h-9"><SelectValue /></SelectTrigger>
        <SelectContent>
          {IDENT_TYPES.map(t => (
            <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <AutocorrectInput
        className="col-span-3"
        placeholder="Libellé (ex: Admin WP)"
        value={ident.label}
        onChange={e => onChange({ label: e.target.value })}
      />
      <div className="col-span-5 relative">
        <Input
          type={isPwd && !reveal ? 'password' : 'text'}
          placeholder="Valeur"
          value={ident.valeur}
          onChange={e => onChange({ valeur: e.target.value })}
          className="pr-16"
        />
        {isPwd && (
          <button
            type="button"
            className="absolute right-8 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            onClick={() => setReveal(r => !r)}
            tabIndex={-1}
          >
            {reveal ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
        )}
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          onClick={copy}
          tabIndex={-1}
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="col-span-1 w-9 h-9 text-red-500"
        onClick={onRemove}
      >
        <Trash2 className="w-3.5 h-3.5" />
      </Button>
    </div>
  )
}
