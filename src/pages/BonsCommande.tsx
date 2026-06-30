import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, ShoppingCart, Trash2 } from 'lucide-react'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate } from '@/lib/utils'
import { bonsCommandeApi } from '@/lib/api'
import { toast } from 'sonner'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { bonsCommandeSchema } from '@/lib/importExportSchemas'

interface BonCommande { id: string; created_at: string; numero: string; fournisseur: string; objet: string; montant: number; date: string; statut: 'envoye' | 'recu' | 'partiel' | 'annule' }

const STATUT_CONFIG = {
  envoye:  { label: 'Envoyé',  variant: 'default'      as const },
  recu:    { label: 'Reçu',    variant: 'success'      as const },
  partiel: { label: 'Partiel', variant: 'warning'      as const },
  annule:  { label: 'Annulé',  variant: 'destructive'  as const },
}

const EMPTY = { numero: '', fournisseur: '', objet: '', montant: 0, date: new Date().toISOString().slice(0, 10), statut: 'envoye' as BonCommande['statut'] }

export default function BonsCommande() {
  const qc = useQueryClient()
  const { data: bons = [], isLoading } = useQuery<BonCommande[]>({
    queryKey: ['bons_commande'],
    queryFn: () => bonsCommandeApi.list({ orderBy: 'date', order: 'desc' }) as Promise<BonCommande[]>,
  })

  const create = useMutation({
    mutationFn: (data: typeof EMPTY) => bonsCommandeApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bons_commande'] }); toast.success('Bon de commande créé'); setShowForm(false); setForm(EMPTY) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => bonsCommandeApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bons_commande'] }); toast.success('Supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE)

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const filteredBons = useMemo(() => bons.filter(b => dateMatch(b.date)), [bons, dateMatch])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Bons de commande</h1>
          <p className="text-muted-foreground text-sm mt-1">{filteredBons.length} bons · {formatCurrency(filteredBons.reduce((s, b) => s + b.montant, 0))} total</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={bonsCommandeSchema}
            data={bons}
            onImport={async (row) => { await create.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Nouveau</Button>
        </div>
      </div>

      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div className="card-premium overflow-hidden">
        {isLoading ? <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div> : (
          <div className="table-scroll">
          <table className="w-full">
            <thead className="table-header"><tr><th>N° BC</th><th>Fournisseur</th><th>Objet</th><th>Date</th><th>Montant</th><th>Statut</th><th></th></tr></thead>
            <tbody>
              {filteredBons.map(b => (
                <tr key={b.id} className="table-row group">
                  <td className="font-mono font-medium text-foreground">{b.numero}</td>
                  <td className="text-muted-foreground">{b.fournisseur}</td>
                  <td className="text-muted-foreground text-sm">{b.objet}</td>
                  <td className="text-muted-foreground">{formatDate(b.date)}</td>
                  <td className="font-semibold text-foreground">{formatCurrency(b.montant)}</td>
                  <td>{(() => { const c = STATUT_CONFIG[b.statut] ?? STATUT_CONFIG.envoye; return <Badge variant={c.variant}>{c.label}</Badge> })()}</td>
                  <td>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400 opacity-0 group-hover:opacity-100" onClick={() => remove.mutate(b.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {!isLoading && filteredBons.length === 0 && <div className="empty-state"><ShoppingCart className="empty-state-icon" /><p className="empty-state-title">Aucun bon de commande</p></div>}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nouveau bon de commande</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="form-label">N° BC</label><Input value={form.numero} onChange={e => setForm(p => ({ ...p, numero: e.target.value }))} placeholder={`BC-${new Date().getFullYear()}-001`} /></div>
              <div className="space-y-1.5"><label className="form-label">Fournisseur *</label><AutocorrectInput value={form.fournisseur} onChange={e => setForm(p => ({ ...p, fournisseur: e.target.value }))} /></div>
              <div className="space-y-1.5 col-span-2"><label className="form-label">Objet</label><AutocorrectInput value={form.objet} onChange={e => setForm(p => ({ ...p, objet: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Montant (MAD)</label><Input type="number" value={form.montant} onChange={e => setForm(p => ({ ...p, montant: +e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Date</label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
              <div className="space-y-1.5 col-span-2"><label className="form-label">Statut</label>
                <Select value={form.statut} onValueChange={v => setForm(p => ({ ...p, statut: v as BonCommande['statut'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUT_CONFIG).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button disabled={create.isPending || !form.fournisseur} onClick={() => create.mutate(form)}>
                {create.isPending ? 'Création...' : 'Créer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
