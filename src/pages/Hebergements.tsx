import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Server, AlertTriangle, Trash2, DollarSign } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate, getDaysUntil } from '@/lib/utils'
import { hebergementsApi } from '@/lib/api'
import { toast } from 'sonner'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { hebergementsSchema } from '@/lib/importExportSchemas'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'

interface Hebergement { id: string; created_at: string; nom: string; fournisseur: string; date_expiration: string; prix_mensuel: number; client?: string; type: string; notes?: string }

const EMPTY = { nom: '', fournisseur: '', date_expiration: '', prix_mensuel: 0, client: '', type: 'VPS', notes: '' }

export default function Hebergements() {
  const qc = useQueryClient()
  const { data: hebergements = [], isLoading } = useQuery<Hebergement[]>({
    queryKey: ['hebergements'],
    queryFn: () => hebergementsApi.list({ orderBy: 'date_expiration', order: 'asc' }) as Promise<Hebergement[]>,
  })

  const create = useMutation({
    mutationFn: (data: typeof EMPTY) => hebergementsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hebergements'] }); toast.success('Hébergement ajouté'); setShowForm(false); setForm(EMPTY) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => hebergementsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['hebergements'] }); toast.success('Supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE)

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const filteredHebergements = useMemo(
    () => hebergements.filter(h => dateMatch(h.date_expiration)),
    [hebergements, dateMatch]
  )

  const totalMensuel = filteredHebergements.reduce((s, h) => s + h.prix_mensuel, 0)
  const expirentBientot = filteredHebergements.filter(h => getDaysUntil(h.date_expiration) <= 30).length

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Hébergements</h1>
          <p className="text-muted-foreground text-sm mt-1">{filteredHebergements.length} hébergements · {formatCurrency(totalMensuel)}/mois</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={hebergementsSchema}
            data={hebergements}
            onImport={async (row) => { await create.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Ajouter</Button>
        </div>
      </div>

      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
            <Server className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div><p className="text-xl font-extrabold text-foreground">{filteredHebergements.length}</p><p className="text-xs text-muted-foreground mt-0.5">Total hébergements</p></div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div><p className="text-xl font-extrabold text-blue-600 dark:text-blue-400">{formatCurrency(totalMensuel)}</p><p className="text-xs text-muted-foreground mt-0.5">Coût mensuel</p></div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div><p className="text-xl font-extrabold text-amber-600 dark:text-amber-400">{expirentBientot}</p><p className="text-xs text-muted-foreground mt-0.5">Expirent dans 30j</p></div>
        </div>
      </div>

      {isLoading ? <div className="text-center text-muted-foreground text-sm py-10">Chargement...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredHebergements.map((h, i) => {
            const days = getDaysUntil(h.date_expiration)
            return (
              <motion.div key={h.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={`card-premium p-4 group hover:border-blue-500/30 transition-all ${days <= 15 ? 'border-red-500/20' : days <= 30 ? 'border-yellow-500/20' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-purple-500/20 flex items-center justify-center">
                      <Server className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{h.nom}</p>
                      <p className="text-xs text-muted-foreground">{h.fournisseur} · {h.type}</p>
                    </div>
                  </div>
                  <span className={`badge-pill ${days <= 0 ? 'badge-danger' : days <= 15 ? 'badge-danger' : days <= 30 ? 'badge-warning' : 'badge-success'}`}>
                    {days <= 0 ? 'Expiré' : `${days}j`}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Expiration</span><span className="text-foreground">{formatDate(h.date_expiration)}</span></div>
                  <div className="flex justify-between"><span>Prix mensuel</span><span className="text-blue-600 dark:text-blue-400 font-medium">{formatCurrency(h.prix_mensuel)}</span></div>
                  {h.client && <div className="flex justify-between"><span>Client</span><span>{h.client}</span></div>}
                </div>
                <div className="mt-3 pt-2 border-t border-border flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400" onClick={() => remove.mutate(h.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </motion.div>
            )
          })}
          {filteredHebergements.length === 0 && <div className="col-span-full empty-state"><Server className="empty-state-icon" /><p className="empty-state-title">Aucun hébergement</p></div>}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader className="relative">
            <DialogTitle>Ajouter un hébergement</DialogTitle>
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
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><label className="form-label">Nom *</label><AutocorrectInput value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Fournisseur</label><AutocorrectInput value={form.fournisseur} onChange={e => setForm(p => ({ ...p, fournisseur: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Type</label><AutocorrectInput value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Date expiration</label><Input type="date" value={form.date_expiration} onChange={e => setForm(p => ({ ...p, date_expiration: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Prix mensuel (MAD)</label><Input type="number" value={form.prix_mensuel} onChange={e => setForm(p => ({ ...p, prix_mensuel: +e.target.value }))} /></div>
              <div className="space-y-1.5 col-span-2"><label className="form-label">Client</label><AutocorrectInput value={form.client} onChange={e => setForm(p => ({ ...p, client: e.target.value }))} /></div>
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
