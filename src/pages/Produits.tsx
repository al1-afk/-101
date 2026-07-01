import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Package, Search, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency } from '@/lib/utils'
import { produitsApi } from '@/lib/api'
import { toast } from 'sonner'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { produitsSchema } from '@/lib/importExportSchemas'

interface Produit { id: string; created_at: string; nom: string; description: string; prix_ht: number; tva: number; type: 'produit' | 'service'; unite: string }

const EMPTY = { nom: '', description: '', prix_ht: 0, tva: 20, type: 'service' as 'produit' | 'service', unite: 'projet' }

export default function Produits() {
  const qc = useQueryClient()
  const { data: produits = [], isLoading } = useQuery<Produit[]>({
    queryKey: ['produits'],
    queryFn: () => produitsApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<Produit[]>,
  })

  const create = useMutation({
    mutationFn: (data: typeof EMPTY) => produitsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produits'] }); toast.success('Produit ajouté'); setShowForm(false); setForm(EMPTY) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => produitsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['produits'] }); toast.success('Supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)

  const filtered = produits.filter(p => !search || p.nom.toLowerCase().includes(search.toLowerCase()))

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Produits & Services</h1>
          <p className="text-muted-foreground text-sm mt-1">{produits.length} articles dans le catalogue</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={produitsSchema}
            data={produits}
            onImport={async (row) => { await create.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Ajouter</Button>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="Rechercher..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
      </div>

      <div className="card-premium overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div> : (
          <div className="table-scroll">
          <table className="w-full">
            <thead className="table-header"><tr><th>Nom</th><th>Description</th><th>Type</th><th>Prix HT</th><th>TVA</th><th>Prix TTC</th><th></th></tr></thead>
            <tbody>
              {filtered.map((p, i) => (
                <motion.tr key={p.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.03 }} className="table-row group">
                  <td className="font-medium text-foreground">{p.nom}</td>
                  <td className="text-muted-foreground text-sm max-w-xs truncate">{p.description}</td>
                  <td><Badge variant={p.type === 'service' ? 'default' : 'secondary'}>{p.type}</Badge></td>
                  <td className="text-muted-foreground">{formatCurrency(p.prix_ht)}</td>
                  <td className="text-muted-foreground">{p.tva}%</td>
                  <td className="font-semibold text-foreground">{formatCurrency(p.prix_ht * (1 + p.tva / 100))}</td>
                  <td>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => remove.mutate(p.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </motion.tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {!isLoading && filtered.length === 0 && <div className="empty-state"><Package className="empty-state-icon" /><p className="empty-state-title">Aucun produit</p></div>}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader className="relative">
            <DialogTitle>Nouveau produit / service</DialogTitle>
            {/* Bouton primaire centré horizontalement dans le header */}
            <div className="absolute left-1/2 -translate-x-1/2 -top-0.5">
              <Button
                type="button"
                size="sm"
                className="h-8 px-5 text-xs font-semibold shadow-sm"
                disabled={create.isPending || !form.nom}
                onClick={() => create.mutate(form)}
              >
                ➕ Créer
              </Button>
            </div>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5"><label className="form-label">Nom *</label><AutocorrectInput value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} /></div>
            <div className="space-y-1.5"><label className="form-label">Description</label><AutocorrectTextarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} className="input-field resize-none h-16" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="form-label">Prix HT (MAD)</label><Input type="number" step="0.01" value={form.prix_ht} onChange={e => setForm(p => ({ ...p, prix_ht: +e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">TVA (%)</label>
                <Select value={String(form.tva)} onValueChange={v => setForm(p => ({ ...p, tva: +v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{['0','7','10','14','20'].map(v => <SelectItem key={v} value={v}>{v}%</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><label className="form-label">Type</label>
                <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as 'produit' | 'service' }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="service">Service</SelectItem><SelectItem value="produit">Produit</SelectItem></SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><label className="form-label">Unité</label><AutocorrectInput value={form.unite} onChange={e => setForm(p => ({ ...p, unite: e.target.value }))} placeholder="projet, mois, heure..." /></div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button disabled={create.isPending || !form.nom} onClick={() => create.mutate(form)}>
                {create.isPending ? 'Ajout...' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
