import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import { Plus, Globe, AlertTriangle, CheckCircle2, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate, getDaysUntil } from '@/lib/utils'
import { domainesApi } from '@/lib/api'
import { toast } from 'sonner'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { domainesSchema } from '@/lib/importExportSchemas'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'

interface Domaine { id: string; created_at: string; nom: string; registrar: string; date_expiration: string; prix_renouvellement: number; client?: string; notes?: string }

const EMPTY = { nom: '', registrar: '', date_expiration: '', prix_renouvellement: 120, client: '', notes: '' }

function UrgencyBadge({ days }: { days: number }) {
  if (days <= 0)  return <span className="badge-pill badge-danger">Expiré</span>
  if (days <= 15) return <span className="badge-pill badge-danger">{days}j</span>
  if (days <= 30) return <span className="badge-pill badge-warning">{days}j</span>
  if (days <= 60) return <span className="badge-pill badge-info">{days}j</span>
  return <span className="badge-pill badge-success">{days}j</span>
}

export default function Domaines() {
  const qc = useQueryClient()
  const { data: domaines = [], isLoading } = useQuery<Domaine[]>({
    queryKey: ['domaines'],
    queryFn: () => domainesApi.list({ orderBy: 'date_expiration', order: 'asc' }) as Promise<Domaine[]>,
  })

  const create = useMutation({
    mutationFn: (data: typeof EMPTY) => domainesApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domaines'] }); toast.success('Domaine ajouté'); setShowForm(false); setForm(EMPTY) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => domainesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['domaines'] }); toast.success('Supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE)

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const filteredDomaines = useMemo(
    () => domaines.filter(d => dateMatch(d.date_expiration)),
    [domaines, dateMatch]
  )

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Domaines</h1>
          <p className="text-muted-foreground text-sm mt-1">{filteredDomaines.length} domaines gérés</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={domainesSchema}
            data={domaines}
            onImport={async (row) => {
              try {
                await create.mutateAsync(row as any)
              } catch (e: any) {
                console.error('[import domaine]', row, e?.message, e)
                throw e
              }
            }}
          />
          <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Ajouter</Button>
        </div>
      </div>

      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
            <Globe className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div><p className="text-xl font-extrabold text-foreground">{filteredDomaines.length}</p><p className="text-xs text-muted-foreground mt-0.5">Total domaines</p></div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div><p className="text-xl font-extrabold text-amber-600 dark:text-amber-400">{filteredDomaines.filter(d => getDaysUntil(d.date_expiration) <= 30).length}</p><p className="text-xs text-muted-foreground mt-0.5">Expirent dans 30j</p></div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div><p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{formatCurrency(filteredDomaines.reduce((s, d) => s + d.prix_renouvellement, 0))}</p><p className="text-xs text-muted-foreground mt-0.5">Budget renouvellements</p></div>
        </div>
      </div>

      {isLoading ? <div className="text-center text-muted-foreground text-sm py-10">Chargement...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filteredDomaines.map((d, i) => {
            const days = getDaysUntil(d.date_expiration)
            return (
              <motion.div key={d.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={`card-premium p-4 hover:border-blue-500/30 transition-all group ${days <= 30 ? 'border-yellow-500/30' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center">
                      <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground text-sm">{d.nom}</p>
                      <p className="text-xs text-muted-foreground">{d.registrar}</p>
                    </div>
                  </div>
                  <UrgencyBadge days={days} />
                </div>
                <div className="mt-3 space-y-1.5 text-xs text-muted-foreground">
                  <div className="flex justify-between"><span>Expiration</span><span className="text-foreground">{formatDate(d.date_expiration)}</span></div>
                  <div className="flex justify-between"><span>Renouvellement</span><span className="text-blue-600 dark:text-blue-400 font-medium">{formatCurrency(d.prix_renouvellement)}</span></div>
                  {d.client && <div className="flex justify-between"><span>Client</span><span>{d.client}</span></div>}
                </div>
                <div className="mt-3 pt-2 border-t border-border flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400" onClick={() => remove.mutate(d.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </motion.div>
            )
          })}
          {filteredDomaines.length === 0 && <div className="col-span-full empty-state"><Globe className="empty-state-icon" /><p className="empty-state-title">Aucun domaine</p></div>}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Ajouter un domaine</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2"><label className="form-label">Nom de domaine *</label>
                <Input value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder="exemple.ma" /></div>
              <div className="space-y-1.5"><label className="form-label">Registrar</label>
                <Input value={form.registrar} onChange={e => setForm(p => ({ ...p, registrar: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Date expiration</label>
                <Input type="date" value={form.date_expiration} onChange={e => setForm(p => ({ ...p, date_expiration: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Prix renouvellement (MAD)</label>
                <Input type="number" value={form.prix_renouvellement} onChange={e => setForm(p => ({ ...p, prix_renouvellement: +e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Client associé</label>
                <Input value={form.client} onChange={e => setForm(p => ({ ...p, client: e.target.value }))} /></div>
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
