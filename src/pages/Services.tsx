/**
 * Services — Catalogue dédié aux services (prestations) réutilisables.
 *
 * Partage la même table `produits` que la page Produits, filtrée à
 * type='service'. Toute prestation enregistrée ici apparaît dans le
 * sélecteur 📑 (BookMarked) des wizards Devis & Facture.
 */
import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Sparkles, Search, Trash2, Edit2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { produitsApi } from '@/lib/api'
import { toast } from 'sonner'

interface Service {
  id:          string
  created_at:  string
  nom:         string
  description: string
  prix_ht:     number
  tva:         number
  type:        'produit' | 'service'
  unite:       string
}

const EMPTY = {
  nom:         '',
  description: '',
  prix_ht:     0,
  tva:         20,
  type:        'service' as const,
  unite:       'projet',
}

export default function Services() {
  const qc = useQueryClient()
  const { data: allProduits = [], isLoading } = useQuery<Service[]>({
    queryKey: ['produits'],
    queryFn:  () => produitsApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<Service[]>,
  })

  /* Ne montrer que les services (la table `produits` mélange produits + services). */
  const services = useMemo(
    () => allProduits.filter(p => p.type === 'service'),
    [allProduits]
  )

  const create = useMutation({
    mutationFn: (data: typeof EMPTY) => produitsApi.create(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['produits'] })
      toast.success('Service ajouté')
      setShowForm(false)
      setEditing(null)
      setForm(EMPTY)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const update = useMutation({
    mutationFn: ({ id, ...data }: typeof EMPTY & { id: string }) =>
      produitsApi.update(id, data) as Promise<Service>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['produits'] })
      toast.success('Service mis à jour')
      setShowForm(false)
      setEditing(null)
      setForm(EMPTY)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => produitsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produits'] }); toast.success('Supprimé') },
    onError:   (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [search,   setSearch]   = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<Service | null>(null)
  const [form,     setForm]     = useState<typeof EMPTY>(EMPTY)

  const filtered = useMemo(() => services.filter(s => {
    if (!search) return true
    const q = search.toLowerCase()
    return s.nom.toLowerCase().includes(q) || (s.description ?? '').toLowerCase().includes(q)
  }), [services, search])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY)
    setShowForm(true)
  }

  function openEdit(s: Service) {
    setEditing(s)
    setForm({
      nom:         s.nom,
      description: s.description ?? '',
      prix_ht:     s.prix_ht,
      tva:         s.tva,
      type:        'service',
      unite:       s.unite ?? 'projet',
    })
    setShowForm(true)
  }

  function handleSubmit() {
    if (!form.nom.trim()) { toast.error('Le nom est requis'); return }
    if (editing) update.mutate({ id: editing.id, ...form })
    else         create.mutate(form)
  }

  const busy = create.isPending || update.isPending

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Services</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {services.length} service{services.length !== 1 ? 's' : ''} réutilisable{services.length !== 1 ? 's' : ''} ·
            disponibles dans le sélecteur 📑 des devis & factures
          </p>
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="w-4 h-4" /> Nouveau service</Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Rechercher par nom ou description..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="card-premium p-8 text-center text-muted-foreground text-sm">Chargement...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Sparkles className="empty-state-icon" />
          <p className="empty-state-title">Aucun service dans le catalogue</p>
          <p className="empty-state-desc">
            Crée un service réutilisable pour gagner du temps à chaque devis/facture.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              className="card-premium p-4 group hover:border-blue-500/30 transition-all"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-blue-500/15 flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-foreground text-sm truncate">{s.nom}</p>
                    <p className="text-xs text-muted-foreground">{s.unite || 'projet'}</p>
                  </div>
                </div>
                <p className="text-sm font-bold text-foreground flex-shrink-0">
                  {formatCurrency(s.prix_ht)}
                </p>
              </div>

              {s.description && (
                <p className="text-xs text-muted-foreground line-clamp-3 whitespace-pre-wrap mb-3">
                  {s.description}
                </p>
              )}

              <div className="flex items-center justify-between pt-3 border-t border-border text-xs text-muted-foreground">
                <span>TVA {s.tva}% · {formatCurrency(s.prix_ht * (1 + s.tva / 100))} TTC</span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7"
                    onClick={() => openEdit(s)}
                    title="Modifier"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="w-7 h-7 text-red-500"
                    onClick={() => {
                      if (confirm(`Supprimer "${s.nom}" ?`)) remove.mutate(s.id)
                    }}
                    title="Supprimer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={v => { if (!v) { setShowForm(false); setEditing(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? `Modifier « ${editing.nom} »` : 'Nouveau service'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="form-label">Nom du service *</label>
              <Input
                value={form.nom}
                onChange={e => setForm(p => ({ ...p, nom: e.target.value }))}
                placeholder="ex: Création site vitrine"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Description</label>
              <textarea
                value={form.description}
                onChange={e => setForm(p => ({ ...p, description: e.target.value }))}
                className="input-field resize-none h-32"
                placeholder="Détaille ce que comprend le service : livrables, durée, garantie..."
              />
              <p className="text-[11px] text-muted-foreground">
                Cette description sera pré-remplie dans le devis / la facture lors de la réutilisation.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">Prix HT (MAD) *</label>
                <Input
                  type="number"
                  step="0.01"
                  value={form.prix_ht}
                  onChange={e => setForm(p => ({ ...p, prix_ht: +e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">TVA (%)</label>
                <Select value={String(form.tva)} onValueChange={v => setForm(p => ({ ...p, tva: +v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['0', '7', '10', '14', '20'].map(v => (
                      <SelectItem key={v} value={v}>{v}%</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Unité</label>
                <Input
                  value={form.unite}
                  onChange={e => setForm(p => ({ ...p, unite: e.target.value }))}
                  placeholder="projet, mois, heure..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="secondary" onClick={() => { setShowForm(false); setEditing(null) }}>
                Annuler
              </Button>
              <Button onClick={handleSubmit} disabled={busy || !form.nom.trim()}>
                {editing ? 'Enregistrer' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
