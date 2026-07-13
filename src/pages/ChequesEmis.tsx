import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Wallet, Trash2, CheckCircle2, Clock, TrendingDown } from 'lucide-react'
import {
  DateRangeFilter, DEFAULT_RANGE, makeDatePredicate, type DateRange,
} from '@/components/ui/DateRangeFilter'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { chequesEmisApi } from '@/lib/api'
import { toast } from 'sonner'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { chequesEmisSchema } from '@/lib/importExportSchemas'

interface ChequeEmis {
  id: string; created_at: string; reference: string; montant: number
  beneficiaire: string; banque: string; date_emission: string
  statut: 'emis' | 'encaisse' | 'refuse' | 'annule'
}

const STATUT = {
  emis:     { label: 'Émis',     variant: 'default'     as const },
  encaisse: { label: 'Encaissé', variant: 'success'     as const },
  refuse:   { label: 'Refusé',   variant: 'destructive' as const },
  annule:   { label: 'Annulé',   variant: 'secondary'   as const },
}

const EMPTY_FORM = { reference: '', montant: 0, beneficiaire: '', banque: 'CIH Bank', date_emission: new Date().toISOString().slice(0, 10), statut: 'emis' as ChequeEmis['statut'] }

export default function ChequesEmis() {
  const qc = useQueryClient()
  const { data: cheques = [], isLoading } = useQuery<ChequeEmis[]>({
    queryKey: ['cheques_emis'],
    queryFn: () => chequesEmisApi.list({ orderBy: 'date_emission', order: 'desc' }) as Promise<ChequeEmis[]>,
  })

  const create = useMutation({
    mutationFn: (data: typeof EMPTY_FORM) => chequesEmisApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cheques_emis'] }); toast.success('Chèque enregistré'); setShowForm(false); setForm(EMPTY_FORM) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const remove = useMutation({
    mutationFn: (id: string) => chequesEmisApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['cheques_emis'] }); toast.success('Supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [dateRange, setDateRange] = useState<DateRange>(DEFAULT_RANGE)

  const dateMatch = useMemo(() => makeDatePredicate(dateRange), [dateRange])
  const filteredCheques = useMemo(() => cheques.filter(c => dateMatch(c.date_emission)), [cheques, dateMatch])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Chèques émis</h1>
          <p className="text-muted-foreground text-sm mt-1">{filteredCheques.length} chèques · {formatCurrency(filteredCheques.reduce((s, c) => s + c.montant, 0))}</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={chequesEmisSchema}
            data={cheques}
            onImport={async (row) => { await create.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Enregistrer</Button>
        </div>
      </div>

      <div className="card-premium p-3">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-red-50 dark:bg-red-900/20 flex items-center justify-center flex-shrink-0">
            <TrendingDown className="w-5 h-5 text-red-600 dark:text-red-400" />
          </div>
          <div><p className="text-xl font-extrabold text-red-600 dark:text-red-400">{formatCurrency(filteredCheques.reduce((s, c) => s + c.montant, 0))}</p><p className="text-xs text-muted-foreground mt-0.5">Total émis</p></div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div><p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{filteredCheques.filter(c => c.statut === 'encaisse').length}</p><p className="text-xs text-muted-foreground mt-0.5">Encaissés</p></div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
            <Clock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div><p className="text-xl font-extrabold text-amber-600 dark:text-amber-400">{filteredCheques.filter(c => c.statut === 'emis').length}</p><p className="text-xs text-muted-foreground mt-0.5">En attente</p></div>
        </div>
      </div>

      <div className="card-premium overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Chargement...</div>
        ) : (
          <div className="table-scroll">
          <table className="w-full">
            <thead className="table-header">
              <tr><th>Référence</th><th>Bénéficiaire</th><th>Banque</th><th>Date émission</th><th>Montant</th><th>Statut</th><th></th></tr>
            </thead>
            <tbody>
              {filteredCheques.map(c => (
                <tr key={c.id} className="table-row group">
                  <td className="font-mono text-foreground">{c.reference}</td>
                  <td className="text-muted-foreground">{c.beneficiaire}</td>
                  <td className="text-muted-foreground">{c.banque}</td>
                  <td className="text-muted-foreground">{formatDate(c.date_emission)}</td>
                  <td className="font-semibold text-red-600 dark:text-red-400">{formatCurrency(c.montant)}</td>
                  <td><Badge variant={STATUT[c.statut].variant}>{STATUT[c.statut].label}</Badge></td>
                  <td>
                    <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400 opacity-0 group-hover:opacity-100"
                      onClick={() => remove.mutate(c.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
        {!isLoading && filteredCheques.length === 0 && (
          <div className="empty-state"><Wallet className="empty-state-icon" /><p className="empty-state-title">Aucun chèque émis</p></div>
        )}
      </div>

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>Enregistrer un chèque émis</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5"><label className="form-label">Référence</label><Input value={form.reference} onChange={e => setForm(p => ({ ...p, reference: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Montant (MAD)</label><Input type="number" value={form.montant} onChange={e => setForm(p => ({ ...p, montant: +e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Bénéficiaire</label><AutocorrectInput value={form.beneficiaire} onChange={e => setForm(p => ({ ...p, beneficiaire: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Banque</label><AutocorrectInput value={form.banque} onChange={e => setForm(p => ({ ...p, banque: e.target.value }))} /></div>
              <div className="space-y-1.5 col-span-2"><label className="form-label">Date émission</label><Input type="date" value={form.date_emission} onChange={e => setForm(p => ({ ...p, date_emission: e.target.value }))} /></div>
              <div className="space-y-1.5 col-span-2"><label className="form-label">Statut</label>
                <Select value={form.statut} onValueChange={v => setForm(p => ({ ...p, statut: v as ChequeEmis['statut'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.entries(STATUT).map(([k, v]) => <SelectItem key={k} value={k}>{v.label}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button disabled={create.isPending || !form.beneficiaire} onClick={() => create.mutate(form)}>
                {create.isPending ? 'Enregistrement...' : 'Enregistrer'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
