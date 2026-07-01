import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Repeat, Trash2, AlertTriangle, DollarSign, CalendarClock, History, Search } from 'lucide-react'
import { motion } from 'framer-motion'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCurrency, formatDate, getDaysUntil } from '@/lib/utils'
import { abonnementsApi } from '@/lib/api'
import { toast } from 'sonner'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { abonnementsSchema } from '@/lib/importExportSchemas'

interface Abonnement {
  id: string; created_at: string; nom: string; fournisseur: string; montant: number
  cycle: 'mensuel' | 'annuel' | 'trimestriel'; date_debut: string; date_renouvellement: string
  statut: 'actif' | 'pause' | 'annule'
}

const today = () => new Date().toISOString().slice(0, 10)

const EMPTY = {
  nom: '', fournisseur: '', montant: 0,
  cycle: 'mensuel' as Abonnement['cycle'],
  date_debut: today(),
  date_renouvellement: '',
  statut: 'actif' as Abonnement['statut'],
}

function toMensuel(a: Pick<Abonnement, 'cycle' | 'montant'>) {
  if (a.cycle === 'mensuel')     return a.montant
  if (a.cycle === 'annuel')      return a.montant / 12
  if (a.cycle === 'trimestriel') return a.montant / 3
  return 0
}

/* Combien on a déjà dépensé sur cet abonnement depuis date_debut */
function totalCumule(a: Abonnement): number {
  if (!a.date_debut) return 0
  const debut = new Date(a.date_debut)
  const now   = new Date()
  if (debut > now) return 0
  const months = Math.max(
    1,
    (now.getFullYear() - debut.getFullYear()) * 12 + (now.getMonth() - debut.getMonth()) + 1
  )
  return toMensuel(a) * months
}

export default function Abonnements() {
  const qc = useQueryClient()
  const { data: abonnements = [], isLoading } = useQuery<Abonnement[]>({
    queryKey: ['abonnements'],
    queryFn: () => abonnementsApi.list({ orderBy: 'date_renouvellement', order: 'asc' }) as Promise<Abonnement[]>,
  })

  const create = useMutation({
    mutationFn: (data: typeof EMPTY) => abonnementsApi.create({
      ...data,
      date_debut: data.date_debut || today(),
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['abonnements'] }); toast.success('Abonnement ajouté'); setShowForm(false); setForm(EMPTY) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const remove = useMutation({
    mutationFn: (id: string) => abonnementsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['abonnements'] }); toast.success('Supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY)
  const [search, setSearch] = useState('')

  const actifs = abonnements.filter(a => a.statut === 'actif')
  const totalMensuel = actifs.reduce((s, a) => s + toMensuel(a), 0)
  const prochains = actifs.filter(a => getDaysUntil(a.date_renouvellement) <= 30).length
  const totalCumuleAll = abonnements.reduce((s, a) => s + totalCumule(a), 0)

  /* Détection de doublons : même nom (insensible casse/espaces) */
  const duplicate = useMemo(() => {
    const target = form.nom.trim().toLowerCase()
    if (!target) return null
    return abonnements.find(a => a.nom.trim().toLowerCase() === target) ?? null
  }, [form.nom, abonnements])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return abonnements
    return abonnements.filter(a =>
      [a.nom, a.fournisseur].some(x => x?.toLowerCase().includes(q))
    )
  }, [abonnements, search])

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Abonnements</h1>
          <p className="text-muted-foreground text-sm mt-1">{actifs.length} actifs · {formatCurrency(totalMensuel)}/mois</p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={abonnementsSchema}
            data={abonnements}
            onImport={async (row) => { await create.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={() => setShowForm(true)}><Plus className="w-4 h-4" /> Ajouter</Button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center flex-shrink-0">
            <DollarSign className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div><p className="text-xl font-extrabold text-foreground">{formatCurrency(totalMensuel)}</p><p className="text-xs text-muted-foreground mt-0.5">Coût mensuel</p></div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-purple-50 dark:bg-purple-900/20 flex items-center justify-center flex-shrink-0">
            <Repeat className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div><p className="text-xl font-extrabold text-purple-600 dark:text-purple-400">{formatCurrency(totalMensuel * 12)}</p><p className="text-xs text-muted-foreground mt-0.5">Coût annuel</p></div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center flex-shrink-0">
            <History className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div><p className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCumuleAll)}</p><p className="text-xs text-muted-foreground mt-0.5">Total dépensé (cumul)</p></div>
        </div>
        <div className="card-premium p-5 flex items-center gap-4">
          <div className="w-11 h-11 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center flex-shrink-0">
            <CalendarClock className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div><p className="text-xl font-extrabold text-amber-600 dark:text-amber-400">{prochains}</p><p className="text-xs text-muted-foreground mt-0.5">À renouveler (30j)</p></div>
        </div>
      </div>

      <div className="card-premium p-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher un abonnement (Netflix, Adobe, OVH...)"
            className="pl-9"
          />
        </div>
      </div>

      {isLoading ? <div className="text-center text-muted-foreground text-sm py-10">Chargement...</div> : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((a, i) => {
            const days   = getDaysUntil(a.date_renouvellement)
            const cumul  = totalCumule(a)
            return (
              <motion.div key={a.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.04 }}
                className={`card-premium p-4 hover:border-blue-500/30 transition-all group ${days <= 15 ? 'border-yellow-500/20' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center flex-shrink-0">
                      <Repeat className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <p className="font-medium text-foreground text-sm">{a.nom}</p>
                      <p className="text-xs text-muted-foreground">{a.fournisseur}</p>
                    </div>
                  </div>
                  {days <= 15 && <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-yellow-400 flex-shrink-0" />}
                </div>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <p className="text-lg font-bold text-foreground">{formatCurrency(a.montant)}</p>
                    <p className="text-xs text-muted-foreground capitalize">/ {a.cycle}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Renouvellement</p>
                    <p className="text-xs font-medium text-foreground">{formatDate(a.date_renouvellement)}</p>
                    <span className={`badge-pill mt-0.5 ${days <= 15 ? 'badge-warning' : days <= 30 ? 'badge-info' : 'badge-success'}`}>{days}j</span>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-border space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Depuis le</span>
                    <span className="text-foreground">{a.date_debut ? formatDate(a.date_debut) : '—'}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Total dépensé</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">{formatCurrency(cumul)}</span>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-end">
                  <Button variant="ghost" size="icon" className="w-7 h-7 text-red-400 opacity-0 group-hover:opacity-100" onClick={() => remove.mutate(a.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </motion.div>
            )
          })}
          {filtered.length === 0 && (
            <div className="col-span-full empty-state">
              <Repeat className="empty-state-icon" />
              <p className="empty-state-title">{search ? 'Aucun résultat' : 'Aucun abonnement'}</p>
            </div>
          )}
        </div>
      )}

      <Dialog open={showForm} onOpenChange={setShowForm}>
        <DialogContent>
          <DialogHeader className="relative">
            <DialogTitle>Nouvel abonnement</DialogTitle>
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
              <div className="space-y-1.5 col-span-2">
                <label className="form-label">Nom *</label>
                <AutocorrectInput value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} placeholder="Netflix, Adobe, OVH..." />
                {duplicate && (
                  <div className="flex items-start gap-2 mt-1.5 px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-xs">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
                    <span className="text-amber-700 dark:text-amber-300">
                      Existe déjà : <strong>{duplicate.nom}</strong>
                      {duplicate.fournisseur && ` (${duplicate.fournisseur})`} —
                      depuis le {duplicate.date_debut ? formatDate(duplicate.date_debut) : '?'}
                    </span>
                  </div>
                )}
              </div>
              <div className="space-y-1.5"><label className="form-label">Fournisseur</label><AutocorrectInput value={form.fournisseur} onChange={e => setForm(p => ({ ...p, fournisseur: e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Montant (MAD)</label><Input type="number" value={form.montant} onChange={e => setForm(p => ({ ...p, montant: +e.target.value }))} /></div>
              <div className="space-y-1.5"><label className="form-label">Cycle</label>
                <Select value={form.cycle} onValueChange={v => setForm(p => ({ ...p, cycle: v as Abonnement['cycle'] }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensuel">Mensuel</SelectItem>
                    <SelectItem value="trimestriel">Trimestriel</SelectItem>
                    <SelectItem value="annuel">Annuel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><label className="form-label">Date de début</label><Input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))} /></div>
              <div className="space-y-1.5 col-span-2"><label className="form-label">Prochain renouvellement / fin</label><Input type="date" value={form.date_renouvellement} onChange={e => setForm(p => ({ ...p, date_renouvellement: e.target.value }))} /></div>
            </div>
            <div className="flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setShowForm(false)}>Annuler</Button>
              <Button disabled={create.isPending || !form.nom} onClick={() => create.mutate(form)}>
                {create.isPending ? 'Ajout...' : (duplicate ? 'Ajouter quand même' : 'Ajouter')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
