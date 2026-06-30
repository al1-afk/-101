import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  Plus, Repeat, Trash2, AlertTriangle, DollarSign, TrendingUp,
  TrendingDown, Users, ArrowUpRight, ChevronRight, Edit2,
  CheckCircle2, XCircle, PauseCircle, Clock, BarChart3,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar,
} from 'recharts'
import { Button }  from '@/components/ui/button'
import { Input }   from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Badge }   from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { formatCurrency, formatDate } from '@/lib/utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import {
  useClientSubscriptions,
  useCreateSubscription,
  useUpdateSubscription,
  useDeleteSubscription,
  type ClientSubscription,
} from '@/hooks/useClientSubscriptions'
import { ImportExportButtons } from '@/components/ImportExportButtons'
import { abonnementsClientsSchema } from '@/lib/importExportSchemas'

/* ─── Types ──────────────────────────────────────────────────────── */
type Cycle  = 'mensuel' | 'trimestriel' | 'annuel'
type Statut = 'actif' | 'pause' | 'annule' | 'impaye'
type ClientSub = ClientSubscription

const MRR_HISTORY = [
  { mois: 'Oct', mrr: 2800, new_mrr: 500,  churn: 0    },
  { mois: 'Nov', mrr: 3100, new_mrr: 300,  churn: 0    },
  { mois: 'Déc', mrr: 3100, new_mrr: 0,    churn: 0    },
  { mois: 'Jan', mrr: 3400, new_mrr: 300,  churn: 0    },
  { mois: 'Fév', mrr: 3580, new_mrr: 180,  churn: 0    },
  { mois: 'Mar', mrr: 3580, new_mrr: 0,    churn: 200  },
  { mois: 'Avr', mrr: 3580, new_mrr: 500,  churn: 500  },
]

/* ─── Status config ──────────────────────────────────────────────── */
const STATUT_CFG: Record<Statut, { label: string; icon: React.ElementType; color: string; bg: string }> = {
  actif:   { label: 'Actif',    icon: CheckCircle2, color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20'  },
  impaye:  { label: 'Impayé',   icon: AlertTriangle,color: 'text-red-600 dark:text-red-400',         bg: 'bg-red-50 dark:bg-red-900/20'           },
  pause:   { label: 'En pause', icon: PauseCircle,  color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-50 dark:bg-amber-900/20'       },
  annule:  { label: 'Annulé',   icon: XCircle,      color: 'text-slate-500 dark:text-slate-400',     bg: 'bg-slate-100 dark:bg-slate-800'         },
}

const CYCLE_LABELS: Record<Cycle, string> = {
  mensuel:     'Mensuel',
  trimestriel: 'Trimestriel',
  annuel:      'Annuel',
}

function toMensuel(montant: number, cycle: Cycle): number {
  if (cycle === 'mensuel')     return montant
  if (cycle === 'trimestriel') return montant / 3
  return montant / 12
}

function daysUntil(dateStr: string): number {
  return Math.ceil((new Date(dateStr).getTime() - new Date().getTime()) / 86_400_000)
}

/* ─── Page ───────────────────────────────────────────────────────── */
export default function AbonnementsClients() {
  const { data: subs = [] }   = useClientSubscriptions()
  const createSub             = useCreateSubscription()
  const updateSub             = useUpdateSubscription()
  const deleteSub             = useDeleteSubscription()
  const [showNew, setShowNew] = useState(false)
  const [editing, setEditing] = useState<ClientSub | null>(null)
  const [tab,     setTab]     = useState<'liste' | 'mrr' | 'renouvellements'>('liste')
  const [form,    setForm]    = useState({
    client_nom: '', nom: '', montant: 0, cycle: 'mensuel' as Cycle,
    date_debut: '', date_prochaine_facturation: '', facture_auto: true,
  })

  const metrics = useMemo(() => {
    const active    = subs.filter(s => s.statut === 'actif')
    const mrr       = active.reduce((s, sub) => s + sub.montant_mensuel, 0)
    const arr       = mrr * 12
    const impaye    = subs.filter(s => s.statut === 'impaye')
    const atRisk    = impaye.reduce((s, sub) => s + sub.montant_mensuel, 0)
    const cancelled = subs.filter(s => s.statut === 'annule')
    const closed    = [...active, ...cancelled]
    const churnRate = closed.length > 0 ? (cancelled.length / closed.length * 100).toFixed(1) : '0'

    const renewalsSoon = subs.filter(s => s.statut === 'actif' && daysUntil(s.date_prochaine_facturation) <= 30)
    const renewalValue = renewalsSoon.reduce((s, sub) => s + sub.montant, 0)

    return { mrr, arr, atRisk, churnRate, active: active.length, renewalsSoon, renewalValue }
  }, [subs])

  function changeStatut(id: string, statut: Statut) {
    updateSub.mutate({ id, statut }, { onSuccess: () => toast.success('Statut mis à jour') })
  }

  function handleDelete(id: string) {
    deleteSub.mutate(id, { onSuccess: () => toast.success('Abonnement supprimé') })
  }

  function saveSub() {
    if (!form.nom || !form.client_nom) { toast.error('Nom requis'); return }
    const mm = toMensuel(form.montant, form.cycle)
    const payload = {
      client_id:   null,
      client_nom:  form.client_nom,
      nom:         form.nom,
      montant:     form.montant,
      cycle:       form.cycle,
      montant_mensuel: mm,
      date_debut:  form.date_debut || new Date().toISOString().slice(0, 10),
      date_prochaine_facturation: form.date_prochaine_facturation || new Date().toISOString().slice(0, 10),
      statut:      'actif' as Statut,
      facture_auto: form.facture_auto,
    }
    if (editing) {
      updateSub.mutate({ id: editing.id, ...payload }, {
        onSuccess: () => { setEditing(null); toast.success('Abonnement mis à jour') },
      })
    } else {
      createSub.mutate(payload as any, {
        onSuccess: () => { setShowNew(false); toast.success('Abonnement créé') },
      })
    }
  }

  function openEdit(sub: ClientSub) {
    setEditing(sub)
    setForm({ client_nom: sub.client_nom, nom: sub.nom, montant: sub.montant, cycle: sub.cycle, date_debut: sub.date_debut, date_prochaine_facturation: sub.date_prochaine_facturation, facture_auto: sub.facture_auto })
  }

  const TABS = [
    { id: 'liste',           label: 'Abonnements',       icon: Repeat   },
    { id: 'mrr',             label: 'MRR & Croissance',  icon: BarChart3 },
    { id: 'renouvellements', label: 'Renouvellements',   icon: Clock    },
  ] as const

  return (
    <div className="space-y-6 animate-fade-in">

      {/* ── Header ── */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Repeat className="w-6 h-6 text-violet-500" />
            Revenus récurrents clients
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            MRR · Churn · Cycle de vie des abonnements
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ImportExportButtons
            schema={abonnementsClientsSchema}
            data={subs}
            onImport={async (row) => { await createSub.mutateAsync(row as any) }}
          />
          <Button size="sm" onClick={() => { setForm({ client_nom: '', nom: '', montant: 0, cycle: 'mensuel', date_debut: '', date_prochaine_facturation: '', facture_auto: true }); setShowNew(true) }}>
            <Plus className="w-4 h-4" /> Nouvel abonnement
          </Button>
        </div>
      </div>

      {/* ── KPI row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'MRR',          value: formatCurrency(metrics.mrr),  icon: Repeat,       color: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-50 dark:bg-violet-900/20', sub: `${metrics.active} actifs`                },
          { label: 'ARR',          value: formatCurrency(metrics.arr),   icon: TrendingUp,   color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-900/20', sub: 'Projection annuelle'                     },
          { label: 'Churn',        value: `${metrics.churnRate}%`,      icon: TrendingDown, color: 'text-amber-600 dark:text-amber-400',   bg: 'bg-amber-50 dark:bg-amber-900/20',   sub: 'Taux résiliation'                         },
          { label: 'Revenu à risque', value: formatCurrency(metrics.atRisk), icon: AlertTriangle, color: metrics.atRisk > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400', bg: metrics.atRisk > 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20', sub: 'Abonnements impayés' },
        ].map((k, i) => {
          const Icon = k.icon
          return (
            <motion.div key={k.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} className="card-premium p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs text-muted-foreground uppercase tracking-wider">{k.label}</p>
                <div className={cn('w-9 h-9 rounded-lg flex items-center justify-center', k.bg)}>
                  <Icon className={cn('w-4 h-4', k.color)} />
                </div>
              </div>
              <p className={cn('text-xl font-bold', k.color)}>{k.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
            </motion.div>
          )
        })}
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl w-fit">
        {TABS.map(t => {
          const Icon = t.icon
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                tab === t.id ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
              )}>
              <Icon className="w-4 h-4" />
              <span className="hidden sm:inline">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* ── Tab: Liste ── */}
      {tab === 'liste' && (
        <div className="space-y-3">
          {['actif', 'impaye', 'pause', 'annule'].map(statut => {
            const items = subs.filter(s => s.statut === statut)
            if (!items.length) return null
            const cfg = STATUT_CFG[statut as Statut]
            const Icon = cfg.icon
            return (
              <div key={statut} className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-widest">
                  <Icon className={cn('w-3.5 h-3.5', cfg.color)} />
                  {cfg.label} ({items.length})
                </div>
                {items.map(sub => <SubCard key={sub.id} sub={sub} onEdit={openEdit} onDelete={handleDelete} onStatut={changeStatut} />)}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Tab: MRR ── */}
      {tab === 'mrr' && (
        <div className="space-y-6">
          <div className="card-premium p-5">
            <h2 className="section-title mb-4">Évolution MRR</h2>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={MRR_HISTORY}>
                <defs>
                  <linearGradient id="gradMRR" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#8b5cf6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}    />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mois" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `${v.toLocaleString('fr-MA')}`} />
                <Tooltip formatter={(v: any) => [`${v.toLocaleString('fr-MA')} MAD`]} contentStyle={{ borderRadius: 8 }} />
                <Area type="monotone" dataKey="mrr" stroke="#8b5cf6" strokeWidth={2.5} fill="url(#gradMRR)" name="MRR" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          <div className="card-premium p-5">
            <h2 className="section-title mb-4">MRR Net (Nouveau − Churn)</h2>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={MRR_HISTORY}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="mois" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip formatter={(v: any) => [`${v.toLocaleString('fr-MA')} MAD`]} contentStyle={{ borderRadius: 8 }} />
                <Bar dataKey="new_mrr" fill="#10b981" radius={[4, 4, 0, 0]} name="Nouveau MRR" />
                <Bar dataKey="churn"   fill="#ef4444" radius={[4, 4, 0, 0]} name="Churn MRR"   />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown by client */}
          <div className="card-premium p-5">
            <h2 className="section-title mb-4">Contribution MRR par client</h2>
            <div className="space-y-3">
              {subs.filter(s => s.statut === 'actif')
                .sort((a, b) => b.montant_mensuel - a.montant_mensuel)
                .map(sub => {
                  const share = metrics.mrr > 0 ? (sub.montant_mensuel / metrics.mrr * 100) : 0
                  return (
                    <div key={sub.id} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <div>
                          <span className="font-medium text-slate-700 dark:text-slate-200">{sub.client_nom}</span>
                          <span className="text-muted-foreground text-xs ml-2">{sub.nom}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground">{share.toFixed(0)}%</span>
                          <span className="font-semibold text-violet-600 dark:text-violet-400">{formatCurrency(sub.montant_mensuel)}/m</span>
                        </div>
                      </div>
                      <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${share}%` }}
                          transition={{ duration: 0.6, ease: 'easeOut' }}
                          className="h-full rounded-full bg-violet-500"
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </div>
        </div>
      )}

      {/* ── Tab: Renouvellements ── */}
      {tab === 'renouvellements' && (
        <div className="space-y-4">
          {metrics.renewalsSoon.length === 0 ? (
            <div className="card-premium p-10 text-center">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Aucun renouvellement dans les 30 prochains jours</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">
                  {metrics.renewalsSoon.length} renouvellement{metrics.renewalsSoon.length > 1 ? 's' : ''} · {formatCurrency(metrics.renewalValue)} à facturer
                </p>
              </div>
              {metrics.renewalsSoon
                .sort((a, b) => new Date(a.date_prochaine_facturation).getTime() - new Date(b.date_prochaine_facturation).getTime())
                .map(sub => {
                  const days  = daysUntil(sub.date_prochaine_facturation)
                  const urgency = days <= 7 ? 'critical' : days <= 15 ? 'warning' : 'normal'
                  return (
                    <div key={sub.id} className="card-premium p-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                          urgency === 'critical' ? 'bg-red-50 dark:bg-red-900/20'
                          : urgency === 'warning' ? 'bg-amber-50 dark:bg-amber-900/20'
                          : 'bg-blue-50 dark:bg-blue-900/20'
                        )}>
                          <Clock className={cn('w-5 h-5',
                            urgency === 'critical' ? 'text-red-500'
                            : urgency === 'warning' ? 'text-amber-500'
                            : 'text-blue-500'
                          )} />
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-slate-700 dark:text-slate-200 text-sm">{sub.client_nom}</p>
                          <p className="text-xs text-muted-foreground truncate">{sub.nom}</p>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="font-bold text-slate-700 dark:text-slate-200">{formatCurrency(sub.montant)}</p>
                        <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full',
                          urgency === 'critical' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                          : urgency === 'warning' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                          : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
                        )}>
                          Dans {days}j
                        </span>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {sub.facture_auto ? (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Auto
                          </span>
                        ) : (
                          <Button size="sm" variant="outline" className="h-8 text-xs">
                            Facturer
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })}
            </>
          )}
        </div>
      )}

      {/* ── Dialog Nouveau/Edit ── */}
      <Dialog open={showNew || !!editing} onOpenChange={v => { if (!v) { setShowNew(false); setEditing(null) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Modifier l\'abonnement' : 'Nouvel abonnement client'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Client</label>
              <AutocorrectInput placeholder="Nom du client" value={form.client_nom} onChange={e => setForm(p => ({ ...p, client_nom: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Nom de l'abonnement</label>
              <AutocorrectInput placeholder="Ex: Pack Site + Maintenance" value={form.nom} onChange={e => setForm(p => ({ ...p, nom: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Montant (MAD)</label>
                <Input type="number" min={0} value={form.montant} onChange={e => setForm(p => ({ ...p, montant: +e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Cycle</label>
                <Select value={form.cycle} onValueChange={v => setForm(p => ({ ...p, cycle: v as Cycle }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensuel">Mensuel</SelectItem>
                    <SelectItem value="trimestriel">Trimestriel</SelectItem>
                    <SelectItem value="annuel">Annuel</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Date début</label>
                <Input type="date" value={form.date_debut} onChange={e => setForm(p => ({ ...p, date_debut: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Prochaine facturation</label>
                <Input type="date" value={form.date_prochaine_facturation} onChange={e => setForm(p => ({ ...p, date_prochaine_facturation: e.target.value }))} />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => setForm(p => ({ ...p, facture_auto: !p.facture_auto }))}
                className={cn('relative w-10 h-6 rounded-full transition-colors', form.facture_auto ? 'bg-blue-500' : 'bg-slate-300 dark:bg-slate-600')}
              >
                <span className={cn('absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all', form.facture_auto ? 'left-[18px]' : 'left-0.5')} />
              </button>
              <label className="text-sm text-muted-foreground cursor-pointer" onClick={() => setForm(p => ({ ...p, facture_auto: !p.facture_auto }))}>
                Facturation automatique
              </label>
            </div>
            {form.montant > 0 && (
              <div className="text-xs text-muted-foreground bg-slate-50 dark:bg-slate-800 px-3 py-2 rounded-lg">
                MRR contribution: <span className="font-semibold text-violet-600 dark:text-violet-400">{formatCurrency(toMensuel(form.montant, form.cycle))}/mois</span>
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" size="sm" onClick={() => { setShowNew(false); setEditing(null) }}>Annuler</Button>
              <Button size="sm" onClick={saveSub}>{editing ? 'Enregistrer' : 'Créer'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── SubCard ────────────────────────────────────────────────────── */
function SubCard({ sub, onEdit, onDelete, onStatut }: {
  sub:      ClientSub
  onEdit:   (s: ClientSub) => void
  onDelete: (id: string) => void
  onStatut: (id: string, s: Statut) => void
}) {
  const cfg  = STATUT_CFG[sub.statut]
  const Icon = cfg.icon
  const days = daysUntil(sub.date_prochaine_facturation)

  return (
    <motion.div layout initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
      className="card-premium p-4 flex items-center gap-4"
    >
      <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0', cfg.bg)}>
        <Icon className={cn('w-5 h-5', cfg.color)} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm text-slate-700 dark:text-slate-200">{sub.client_nom}</span>
          <span className="text-xs text-muted-foreground">·</span>
          <span className="text-xs text-muted-foreground truncate">{sub.nom}</span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-muted-foreground">
            {CYCLE_LABELS[sub.cycle]}
          </span>
        </div>
        <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
          <span className="font-semibold text-violet-600 dark:text-violet-400">
            {formatCurrency(sub.montant_mensuel)}/m
          </span>
          {sub.statut !== 'annule' && (
            <span className={cn(days <= 7 ? 'text-red-500' : days <= 14 ? 'text-amber-500' : '')}>
              Prochaine: {new Date(sub.date_prochaine_facturation).toLocaleDateString('fr-FR')} ({days > 0 ? `dans ${days}j` : `dépassé de ${Math.abs(days)}j`})
            </span>
          )}
          {sub.annulation_raison && (
            <span className="text-slate-400">Motif: {sub.annulation_raison}</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <Select value={sub.statut} onValueChange={v => onStatut(sub.id, v as Statut)}>
          <SelectTrigger className="h-8 text-xs w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="actif">Actif</SelectItem>
            <SelectItem value="pause">En pause</SelectItem>
            <SelectItem value="impaye">Impayé</SelectItem>
            <SelectItem value="annule">Annulé</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => onEdit(sub)}>
          <Edit2 className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(sub.id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
    </motion.div>
  )
}
