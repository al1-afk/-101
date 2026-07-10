import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import {
  TrendingUp, Users, FileText, Receipt, DollarSign, AlertTriangle,
  Clock, CheckCircle2, Globe, Server, ArrowUpRight, ArrowDownRight,
  UserCheck, ChevronRight, Repeat, Activity, X, Sparkles,
  CreditCard, Target, Zap, TrendingDown, Lightbulb, Wallet, Plus,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts'
import { useQuery } from '@tanstack/react-query'
import { useProspects } from '@/hooks/useProspects'
import { useClients }   from '@/hooks/useClients'
import { useFactures }  from '@/hooks/useFactures'
import { useDevis }     from '@/hooks/useDevis'
import { useDepenses }  from '@/hooks/useDepenses'
import { useAlerts }    from '@/hooks/useAlerts'
import { useCountUp }   from '@/hooks/useCountUp'
import { useClientSubscriptions, computeMrrMetrics } from '@/hooks/useClientSubscriptions'
import { abonnementsApi, domainesApi, hebergementsApi } from '@/lib/api'
import { computeCashFlowProjection, detectAnomalies } from '@/lib/intelligence'
import { formatCurrency, formatCurrencyCompact, formatDate, getDaysUntil, useIsMobileViewport } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import VisionWidgets from '@/components/VisionWidgets'
import TeamPipelinePanel from '@/components/equipe/TeamPipelinePanel'

/* ─── Helpers ─────────────────────────────────────────────────────── */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1)  return "À l'instant"
  if (h < 24) return `il y a ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Hier'
  return `il y a ${d}j`
}

type RenewalKind = 'Abonnement' | 'Domaine' | 'Hébergement'
interface RenewalRow { key: string; nom: string; type: RenewalKind; expiration: string; jours: number; prix: number; cycle?: string }
interface AbonnementRow { id: string; nom: string; fournisseur?: string; montant: number; cycle: 'mensuel' | 'annuel' | 'trimestriel'; date_renouvellement: string; statut: 'actif' | 'pause' | 'annule' }
interface DomaineRow    { id: string; nom: string; date_expiration: string; prix_renouvellement: number }
interface HebergementRow{ id: string; nom: string; date_expiration: string; prix_mensuel: number }

function abonnementMensuel(a: AbonnementRow): number {
  if (a.cycle === 'mensuel')     return a.montant
  if (a.cycle === 'annuel')      return a.montant / 12
  if (a.cycle === 'trimestriel') return a.montant / 3
  return 0
}

/* ─── Sparkline (single line, no fill for cleanness) ──────────────── */
function Sparkline({ data, color }: { data: { v: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={44}>
      <LineChart data={data} margin={{ top: 6, right: 2, bottom: 2, left: 2 }}>
        <Line
          type="monotone" dataKey="v"
          stroke={color} strokeWidth={1.8}
          dot={false} activeDot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* ─── Executive KPI Card (Linear/Attio inspiration) ───────────────── */
interface KpiCardProps {
  label:      string
  rawValue:   number
  formatter:  (n: number) => string
  sub:        string
  icon:       React.ElementType
  iconTint:   string   // like 'electric' 'cyan' 'violet' 'emerald' 'amber' 'red'
  trend?:     { pct: string; up: boolean }
  sparkData:  { v: number }[]
  sparkColor: string
  delay?:     number
}

const TINT_MAP: Record<string, { bg: string; text: string; icon: string; ring: string }> = {
  electric: { bg: 'bg-electric-500/10', text: 'text-foreground', icon: 'text-electric-600', ring: 'ring-electric-500/15' },
  cyan:     { bg: 'bg-cyan-500/10',     text: 'text-foreground', icon: 'text-cyan-600',     ring: 'ring-cyan-500/15' },
  violet:   { bg: 'bg-violet-500/10',   text: 'text-foreground', icon: 'text-violet-600',   ring: 'ring-violet-500/15' },
  emerald:  { bg: 'bg-emerald-500/10',  text: 'text-foreground', icon: 'text-emerald-600',  ring: 'ring-emerald-500/15' },
  amber:    { bg: 'bg-amber-500/10',    text: 'text-foreground', icon: 'text-amber-600',    ring: 'ring-amber-500/15' },
  red:      { bg: 'bg-red-500/10',      text: 'text-foreground', icon: 'text-red-600',      ring: 'ring-red-500/15' },
}

function KpiCard({
  label, rawValue, formatter, sub, icon: Icon,
  iconTint, trend, sparkData, sparkColor, delay = 0,
}: KpiCardProps) {
  const animated = useCountUp(rawValue, 900, delay)
  const display  = rawValue === 0 ? '—' : formatter(animated)
  const tint = TINT_MAP[iconTint] ?? TINT_MAP.electric

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000, duration: 0.35, ease: 'easeOut' }}
      className="card-premium p-5 flex flex-col gap-4 group hover:-translate-y-[2px]"
    >
      <div className="flex items-start justify-between">
        <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ring-4', tint.bg, tint.ring)}>
          <Icon className={cn('w-4 h-4', tint.icon)} />
        </div>
        {trend && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-[10.5px] font-bold px-2 py-0.5 rounded-full border',
              trend.up
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/25'
                : 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/25',
            )}
          >
            {trend.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend.pct}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5">{label}</p>
        <p className="text-[26px] leading-none font-black tracking-[-0.02em] text-foreground truncate">{display}</p>
        <p className="text-[12px] text-muted-foreground mt-1.5 truncate">{sub}</p>
      </div>

      <div className="-mx-1 -mb-1 opacity-70 group-hover:opacity-100 transition-opacity">
        <Sparkline data={sparkData} color={sparkColor} />
      </div>
    </motion.div>
  )
}

/* ─── Chart tooltip ───────────────────────────────────────────────── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="card-glass p-3 text-xs">
      <p className="font-semibold text-foreground mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-muted-foreground">{p.name === 'ca' ? 'CA' : 'Dépenses'} :</span>
          <span className="font-bold text-foreground">
            {Number(p.value).toLocaleString('fr-FR')} MAD
          </span>
        </div>
      ))}
    </div>
  )
}

/* ─── Dashboard ───────────────────────────────────────────────────── */
export default function Dashboard() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const basePath = tenantSlug ? `/${tenantSlug}` : ''
  const { data: prospects = [] } = useProspects()
  const { data: clients   = [] } = useClients()
  const { data: factures  = [] } = useFactures()
  const { data: devis     = [] } = useDevis()
  const { data: depenses  = [] } = useDepenses()
  const { data: subs      = [] } = useClientSubscriptions()
  const { data: abonnements = [] } = useQuery<AbonnementRow[]>({
    queryKey: ['abonnements'],
    queryFn: () => abonnementsApi.list({ orderBy: 'date_renouvellement', order: 'asc' }) as Promise<AbonnementRow[]>,
  })
  const { data: domaines = [] } = useQuery<DomaineRow[]>({
    queryKey: ['domaines'],
    queryFn: () => domainesApi.list({ orderBy: 'date_expiration', order: 'asc' }) as Promise<DomaineRow[]>,
  })
  const { data: hebergements = [] } = useQuery<HebergementRow[]>({
    queryKey: ['hebergements'],
    queryFn: () => hebergementsApi.list({ orderBy: 'date_expiration', order: 'asc' }) as Promise<HebergementRow[]>,
  })
  const { alerts, criticalCount } = useAlerts()
  const [alertDismissed, setAlertDismissed] = useState(false)
  const [period, setPeriod] = useState<'weekly' | 'monthly'>('monthly')

  const cashflow   = useMemo(() => computeCashFlowProjection(factures, depenses), [factures, depenses])
  const anomalies  = useMemo(() => detectAnomalies(factures, prospects, depenses), [factures, prospects, depenses])
  const mrrMetrics = useMemo(() => computeMrrMetrics(subs), [subs])
  const isMobile   = useIsMobileViewport()
  const fmtMoney   = isMobile ? formatCurrencyCompact : formatCurrency

  const kpis = useMemo(() => {
    const totalCA         = factures.filter(f => f.statut === 'payee').reduce((s, f) => s + f.montant_ttc, 0)
    const factImpayees    = factures.filter(f => f.statut === 'impayee')
    const totalImpaye     = factImpayees.reduce((s, f) => s + (f.montant_ttc - f.montant_paye), 0)
    const prospectsActifs = prospects.filter(p => !['gagne', 'perdu'].includes(p.statut))
    const valeurPipeline  = prospectsActifs.reduce((s, p) => s + (p.valeur_estimee || 0), 0)
    const devisPending    = devis.filter(d => d.statut === 'envoye')
    return {
      totalCA, totalImpaye,
      clients:          clients.length,
      prospectsActifs:  prospectsActifs.length,
      valeurPipeline,
      devisPending:     devisPending.length,
      facturesImpayees: factImpayees.length,
      profitEstime:     totalCA * 0.65,
    }
  }, [prospects, clients, factures, devis])

  const monthlyData = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (7 - i), 1)
      const y = d.getFullYear(), m = d.getMonth()
      const ca = factures
        .filter(f => f.statut === 'payee' && new Date(f.created_at).getFullYear() === y && new Date(f.created_at).getMonth() === m)
        .reduce((s, f) => s + f.montant_ttc, 0)
      const dep = depenses
        .filter(d2 => { const dd = new Date(d2.created_at); return dd.getFullYear() === y && dd.getMonth() === m })
        .reduce((s, d2) => s + d2.montant, 0)
      return { mois: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', ''), ca, depenses: dep }
    })
  }, [factures, depenses])

  const weeklyData = useMemo(() => {
    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam']
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - (6 - i))
      const ds = d.toISOString().slice(0, 10)
      const ca = factures
        .filter(f => f.statut === 'payee' && f.created_at.slice(0, 10) === ds)
        .reduce((s, f) => s + f.montant_ttc, 0)
      const dep = depenses
        .filter(d2 => d2.created_at.slice(0, 10) === ds)
        .reduce((s, d2) => s + d2.montant, 0)
      return { mois: days[d.getDay()], ca, depenses: dep }
    })
  }, [factures, depenses])

  const spCA       = monthlyData.map(d => ({ v: d.ca }))
  const spClients  = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (7 - i), 1)
      const count = clients.filter(c => new Date(c.created_at) <= d).length
      return { v: count }
    })
  }, [clients])
  const spDevis    = monthlyData.map((_, i) => ({ v: i + 3 }))
  const spPipeline = useMemo(() => {
    const base = kpis.valeurPipeline
    return Array.from({ length: 8 }, (_, i) => ({ v: Math.round(base * (0.7 + i * 0.05)) }))
  }, [kpis.valeurPipeline])

  const activityLog = useMemo(() => {
    const entries: { action: string; detail: string; date: string; dot: string }[] = []
    for (const f of factures) {
      if (f.statut === 'payee')
        entries.push({ action: 'Facture payée', detail: `${f.numero} — ${f.montant_paye.toLocaleString('fr-MA')} MAD`, date: f.created_at, dot: '#10B981' })
      else if (f.statut === 'impayee')
        entries.push({ action: 'Facture émise', detail: `${f.numero} — ${f.client_nom ?? 'Client'}`, date: f.created_at, dot: '#F59E0B' })
    }
    for (const p of prospects)
      entries.push({
        action: p.statut === 'gagne' ? 'Prospect converti' : p.statut === 'nouveau' ? 'Nouveau prospect' : 'Prospect mis à jour',
        detail: `${p.nom}${p.entreprise ? ' — ' + p.entreprise : ''}`,
        date: p.created_at, dot: p.statut === 'gagne' ? '#10B981' : '#2563EB',
      })
    for (const d of devis)
      if (d.statut === 'accepte' || d.statut === 'refuse')
        entries.push({
          action: d.statut === 'accepte' ? 'Devis accepté' : 'Devis refusé',
          detail: `${d.numero} — ${d.client_nom ?? 'Client'}`,
          date: d.created_at, dot: d.statut === 'accepte' ? '#10B981' : '#EF4444',
        })
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 6)
  }, [factures, prospects, devis])

  const renewals = useMemo<RenewalRow[]>(() => {
    const rows: RenewalRow[] = []
    for (const a of abonnements) {
      if (a.statut !== 'actif' || !a.date_renouvellement) continue
      rows.push({
        key: `abo-${a.id}`, nom: a.nom, type: 'Abonnement',
        expiration: a.date_renouvellement, jours: getDaysUntil(a.date_renouvellement),
        prix: a.montant, cycle: a.cycle,
      })
    }
    for (const d of domaines) {
      if (!d.date_expiration) continue
      rows.push({
        key: `dom-${d.id}`, nom: d.nom, type: 'Domaine',
        expiration: d.date_expiration, jours: getDaysUntil(d.date_expiration),
        prix: d.prix_renouvellement,
      })
    }
    for (const h of hebergements) {
      if (!h.date_expiration) continue
      rows.push({
        key: `heb-${h.id}`, nom: h.nom, type: 'Hébergement',
        expiration: h.date_expiration, jours: getDaysUntil(h.date_expiration),
        prix: h.prix_mensuel,
      })
    }
    return rows.sort((a, b) => a.jours - b.jours).slice(0, 8)
  }, [abonnements, domaines, hebergements])

  const totalMensuelAbo = useMemo(
    () => abonnements.filter(a => a.statut === 'actif').reduce((s, a) => s + abonnementMensuel(a), 0),
    [abonnements],
  )
  const renouvellementsUrgents = renewals.filter(r => r.jours <= 15).length

  const userName = (() => { try { return localStorage.getItem('gestiq_fullname') || 'NEXT GITAL' } catch { return 'NEXT GITAL' } })()
  const showAlert    = !alertDismissed && (kpis.facturesImpayees > 0 || kpis.devisPending > 0)
  const topAnomalies = anomalies.filter(a => a.severity === 'critical').slice(0, 2)
  void criticalCount; void alerts
  const chartData = period === 'monthly' ? monthlyData : weeklyData

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="space-y-6 animate-fade-in pb-8 max-w-[1600px] mx-auto">

      {/* ══ HERO — deep navy + cyan grid ══════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
        className="hero-card p-6 sm:p-8 relative"
      >
        <div className="relative z-10 flex flex-col lg:flex-row lg:items-end justify-between gap-8">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center gap-1.5 h-6 px-2.5 rounded-full bg-white/10 border border-white/15 backdrop-blur-sm">
                <Sparkles className="w-3 h-3 text-cyan-300" />
                <span className="text-white/85 text-[10.5px] font-semibold uppercase tracking-[0.12em]">
                  {today.charAt(0).toUpperCase() + today.slice(1)}
                </span>
              </span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-black text-white tracking-[-0.03em] leading-[1.05]">
              Bonjour, <span className="bg-gradient-to-r from-cyan-200 via-white to-cyan-300 bg-clip-text text-transparent">{userName}</span>
            </h1>
            <p className="text-white/60 text-sm sm:text-[15px] mt-3 max-w-lg">
              Voici l'état de votre entreprise en un coup d'œil. {kpis.facturesImpayees > 0 ? `${kpis.facturesImpayees} facture${kpis.facturesImpayees > 1 ? 's' : ''} en attente d'encaissement.` : 'Aucun encours critique aujourd\'hui.'}
            </p>

            {/* Inline stats */}
            <div className="flex flex-wrap gap-x-8 gap-y-4 mt-7">
              {[
                { label: 'CA encaissé',    value: fmtMoney(kpis.totalCA),        icon: TrendingUp, positive: true },
                { label: 'Clients actifs', value: String(kpis.clients),           icon: Users,      positive: true },
                { label: 'Pipeline',       value: fmtMoney(kpis.valeurPipeline),  icon: Target,     positive: true },
                { label: 'À encaisser',    value: fmtMoney(kpis.totalImpaye),     icon: Clock,      positive: false },
              ].map(stat => {
                const StatIcon = stat.icon
                return (
                  <div key={stat.label} className="min-w-[110px]">
                    <div className="flex items-center gap-1.5 mb-1">
                      <StatIcon className="w-3 h-3 text-white/50" />
                      <span className="text-white/55 text-[10.5px] font-semibold uppercase tracking-wider">{stat.label}</span>
                    </div>
                    <p className="text-white font-bold text-xl tracking-tight leading-none">{stat.value}</p>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right — quick actions */}
          <div className="flex flex-col gap-2 flex-shrink-0 lg:min-w-[220px]">
            <Link
              to={`${basePath}/factures?new=1`}
              className="inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl font-semibold text-[13.5px]
                         bg-white text-navy-800 hover:bg-cyan-50 transition-all
                         shadow-[0_10px_28px_-8px_rgba(6,182,212,0.5)]"
            >
              <Plus className="w-4 h-4" /> Nouvelle facture
            </Link>
            <Link
              to={`${basePath}/devis?new=1`}
              className="inline-flex items-center justify-center gap-2 h-10 px-5 rounded-xl font-medium text-[13px]
                         bg-white/10 text-white border border-white/15 hover:bg-white/15 backdrop-blur-sm transition-all"
            >
              <FileText className="w-3.5 h-3.5" /> Nouveau devis
            </Link>
            <Link
              to={`${basePath}/conseiller-ia`}
              className="inline-flex items-center justify-center gap-2 h-9 px-5 rounded-xl font-medium text-[12.5px]
                         text-cyan-200 hover:text-white transition-all"
            >
              <Sparkles className="w-3.5 h-3.5" /> Demander à Nexi IA →
            </Link>
          </div>
        </div>
      </motion.div>

      {/* ── Vision widgets ── */}
      <VisionWidgets />

      {/* ══ Executive KPI grid ═══════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <KpiCard
          label="CA Encaissé" rawValue={kpis.totalCA} formatter={fmtMoney}
          sub="Total encaissé ce mois"
          icon={TrendingUp} iconTint="electric"
          trend={{ pct: '+12%', up: true }}
          sparkData={spCA} sparkColor="#2563EB" delay={0}
        />
        <KpiCard
          label="Clients" rawValue={kpis.clients} formatter={String}
          sub={`${kpis.prospectsActifs} prospects en pipeline`}
          icon={Users} iconTint="cyan"
          trend={{ pct: '+2', up: true }}
          sparkData={spClients} sparkColor="#06B6D4" delay={80}
        />
        <KpiCard
          label="Devis envoyés" rawValue={kpis.devisPending} formatter={String}
          sub="En attente de réponse"
          icon={FileText} iconTint="violet"
          trend={{ pct: '+3', up: true }}
          sparkData={spDevis} sparkColor="#8B5CF6" delay={160}
        />
        <KpiCard
          label="Pipeline" rawValue={kpis.valeurPipeline} formatter={fmtMoney}
          sub="Valeur estimée des opportunités"
          icon={Target} iconTint="emerald"
          trend={{ pct: '+8%', up: true }}
          sparkData={spPipeline} sparkColor="#10B981" delay={240}
        />
      </div>

      {/* ── Alerts row ── */}
      {(showAlert || topAnomalies.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {showAlert && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/25"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-500/15 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
              </div>
              <div className="flex-1 text-[13px] min-w-0">
                <span className="font-semibold text-amber-800 dark:text-amber-300">Attention · </span>
                {kpis.facturesImpayees > 0 && (
                  <Link to={`${basePath}/factures`} className="text-amber-700 dark:text-amber-300 hover:underline mr-3">
                    {kpis.facturesImpayees} facture{kpis.facturesImpayees > 1 ? 's' : ''} impayée{kpis.facturesImpayees > 1 ? 's' : ''}
                  </Link>
                )}
                {kpis.devisPending > 0 && (
                  <Link to={`${basePath}/devis`} className="text-amber-700 dark:text-amber-300 hover:underline">
                    {kpis.devisPending} devis en attente
                  </Link>
                )}
              </div>
              <button onClick={() => setAlertDismissed(true)} className="p-1 rounded hover:bg-amber-500/15 flex-shrink-0">
                <X className="w-3.5 h-3.5 text-amber-600" />
              </button>
            </motion.div>
          )}
          {topAnomalies.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25"
            >
              <div className="w-8 h-8 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-red-500" />
              </div>
              <div className="flex-1 min-w-0 text-[13px] truncate">
                <span className="font-semibold text-red-700 dark:text-red-400">{topAnomalies[0].title}</span>
                <span className="text-red-600/80 dark:text-red-400/70"> — {topAnomalies[0].recommendation}</span>
              </div>
              <Link to={`${basePath}/statistiques`} className="text-[12px] font-semibold text-red-700 dark:text-red-400 hover:underline flex-shrink-0">
                Analyser →
              </Link>
            </motion.div>
          )}
        </div>
      )}

      {/* ══ Pipeline équipe ══ */}
      <TeamPipelinePanel basePath={basePath} />

      {/* ══ Main chart + activity ═══════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Revenue chart */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.24, duration: 0.4 }}
          className="lg:col-span-2 card-premium p-6"
        >
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground tracking-[-0.01em]">Performance financière</h2>
              <p className="text-[12px] text-muted-foreground mt-0.5">
                {period === 'monthly' ? '8 derniers mois' : '7 derniers jours'}
              </p>
            </div>
            <div className="flex items-center gap-0.5 rounded-lg p-1 bg-black/[0.04] dark:bg-white/[0.04]">
              {(['weekly', 'monthly'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'text-[12px] px-3 py-1 rounded-md font-semibold transition-all',
                    period === p
                      ? 'bg-white dark:bg-navy-700 text-electric-700 dark:text-cyan-300 shadow-sm'
                      : 'text-slate-500 hover:text-foreground',
                  )}
                >
                  {p === 'weekly' ? 'Semaine' : 'Mois'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-6 mb-5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-electric-500" />
              <span className="text-[12px] text-foreground font-medium">Chiffre d'affaires</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm bg-cyan-500" />
              <span className="text-[12px] text-foreground font-medium">Dépenses</span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={240}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="gCA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#2563EB" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gDep" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor="#06B6D4" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#06B6D4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke="currentColor" className="text-slate-200 dark:text-white/[0.06]" vertical={false} />
              <XAxis dataKey="mois" tick={{ fill: 'currentColor', fontSize: 11 }} className="text-slate-400" axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'currentColor', fontSize: 11 }} className="text-slate-400" tickFormatter={v => `${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#2563EB', strokeWidth: 1, strokeDasharray: '3 3', opacity: 0.4 }} />
              <Area type="monotone" dataKey="ca"       stroke="#2563EB" strokeWidth={2.5} fill="url(#gCA)"  dot={false} activeDot={{ r: 5, fill: '#2563EB', strokeWidth: 3, stroke: '#fff' }} />
              <Area type="monotone" dataKey="depenses" stroke="#06B6D4" strokeWidth={2}   fill="url(#gDep)" dot={false} activeDot={{ r: 4, fill: '#06B6D4', strokeWidth: 3, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Activity */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.4 }}
          className="card-premium p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-electric-500" />
              <h2 className="text-[15px] font-semibold text-foreground tracking-[-0.01em]">Activité récente</h2>
            </div>
            <Link to={`${basePath}/activite`} className="text-[11.5px] text-electric-600 dark:text-cyan-400 hover:underline font-medium flex items-center gap-0.5">
              Tout <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="relative">
            {/* Timeline line */}
            <span className="absolute left-[13px] top-2 bottom-2 w-px bg-gradient-to-b from-electric-500/20 via-cyan-500/10 to-transparent" />
            <div className="space-y-4">
              {activityLog.map((item, i) => (
                <div key={i} className="flex items-start gap-3 relative">
                  <div className="w-[27px] h-[27px] rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 relative bg-white dark:bg-navy-800" style={{ boxShadow: `0 0 0 2px ${item.dot}30` }}>
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: item.dot }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-foreground leading-tight">{item.action}</p>
                    <p className="text-[11.5px] text-muted-foreground mt-0.5 truncate">{item.detail}</p>
                  </div>
                  <span className="text-[10.5px] text-muted-foreground whitespace-nowrap flex-shrink-0 pt-0.5">{relativeTime(item.date)}</span>
                </div>
              ))}
              {activityLog.length === 0 && (
                <div className="text-center py-8">
                  <p className="text-sm text-muted-foreground">Aucune activité récente</p>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </div>

      {/* ══ MRR / ARR / Tréso / Churn ═══════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'MRR', value: formatCurrency(mrrMetrics.mrr),
            sub: 'Revenus récurrents / mois', icon: Repeat, tint: 'violet',
            link: '/abonnements-clients',
          },
          {
            label: 'ARR', value: formatCurrency(mrrMetrics.arr),
            sub: 'Revenus annuels projetés', icon: TrendingUp, tint: 'emerald',
            link: '/abonnements-clients',
          },
          {
            label: 'Tréso J+30', value: formatCurrency(cashflow.next30Days),
            sub: cashflow.next30Days >= 0 ? 'Projection positive' : 'Attention : déficit',
            icon: cashflow.next30Days >= 0 ? Wallet : TrendingDown,
            tint: cashflow.next30Days >= 0 ? 'cyan' : 'red',
            link: '/finances',
          },
          {
            label: 'Churn', value: `${mrrMetrics.churnRate}%`,
            sub: mrrMetrics.atRisk > 0 ? `${formatCurrency(mrrMetrics.atRisk)} à risque` : 'Aucun impayé',
            icon: mrrMetrics.atRisk > 0 ? AlertTriangle : CheckCircle2,
            tint: mrrMetrics.atRisk > 0 ? 'amber' : 'emerald',
            link: '/abonnements-clients',
          },
        ].map((w, i) => {
          const Icon = w.icon
          const tint = TINT_MAP[w.tint] ?? TINT_MAP.electric
          return (
            <motion.div
              key={w.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.32 + i * 0.05, duration: 0.35 }}
              className="card-premium p-5"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', tint.bg)}>
                  <Icon className={cn('w-4 h-4', tint.icon)} />
                </div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{w.label}</p>
              </div>
              <p className="text-[20px] font-black tracking-[-0.02em] text-foreground leading-none">{w.value}</p>
              <p className="text-[11.5px] text-muted-foreground mt-1.5">{w.sub}</p>
              <Link to={`${basePath}${w.link}`} className="text-[11.5px] text-electric-600 dark:text-cyan-400 font-medium flex items-center gap-0.5 mt-3 hover:underline">
                Détails <ChevronRight className="w-3 h-3" />
              </Link>
            </motion.div>
          )
        })}
      </div>

      {/* ══ Renouvellements + Impayees ═════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

        {/* Renouvellements (2 cols) */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38, duration: 0.4 }}
          className="lg:col-span-2 card-premium p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-violet-500" />
              <h2 className="text-[15px] font-semibold text-foreground tracking-[-0.01em]">Renouvellements à venir</h2>
              {renouvellementsUrgents > 0 && (
                <Badge variant="destructive" size="sm">{renouvellementsUrgents} urgent{renouvellementsUrgents > 1 ? 's' : ''}</Badge>
              )}
            </div>
            <Link to={`${basePath}/abonnements`} className="text-[11.5px] text-electric-600 dark:text-cyan-400 hover:underline font-medium flex items-center gap-0.5">
              Voir tous <ChevronRight className="w-3 h-3" />
            </Link>
          </div>

          <div className="flex items-center justify-between mb-4 px-3 py-2.5 rounded-xl border border-violet-500/20 bg-violet-500/[0.06]">
            <div>
              <p className="text-[10.5px] text-violet-700 dark:text-violet-300 font-bold uppercase tracking-widest">Coût mensuel abonnements</p>
              <p className="text-[15px] font-bold text-foreground mt-0.5">{formatCurrency(totalMensuelAbo)}</p>
            </div>
            <p className="text-[11.5px] text-muted-foreground">{abonnements.filter(a => a.statut === 'actif').length} actifs</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {renewals.map(r => {
              const urgent  = r.jours <= 15
              const warning = r.jours <= 30
              const linkTo = r.type === 'Domaine' ? '/domaines' : r.type === 'Hébergement' ? '/hebergements' : '/abonnements'
              const typeTint = r.type === 'Domaine' ? 'electric' : r.type === 'Hébergement' ? 'violet' : 'amber'
              const t = TINT_MAP[typeTint]
              const Icon = r.type === 'Domaine' ? Globe : r.type === 'Hébergement' ? Server : Repeat
              return (
                <Link
                  key={r.key} to={`${basePath}${linkTo}`}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] hover:bg-electric-500/[0.06] transition-colors border border-transparent hover:border-electric-500/20"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', t.bg)}>
                      <Icon className={cn('w-4 h-4', t.icon)} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-foreground truncate">{r.nom}</p>
                      <p className="text-[11px] text-muted-foreground truncate">
                        {formatDate(r.expiration)}
                        {r.prix > 0 && <> · {formatCurrency(r.prix)}{r.cycle ? `/${r.cycle}` : ''}</>}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={r.jours <= 0 || urgent ? 'destructive' : warning ? 'warning' : 'success'}
                    size="sm"
                    className="flex-shrink-0"
                  >
                    {r.jours <= 0 ? 'Expiré' : `${r.jours}j`}
                  </Badge>
                </Link>
              )
            })}
            {renewals.length === 0 && (
              <div className="md:col-span-2 flex flex-col items-center justify-center py-8 gap-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                </div>
                <p className="text-[13px] text-muted-foreground font-medium">Aucun renouvellement à venir</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Impayees */}
        <motion.div
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.4 }}
          className="card-premium p-6"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h2 className="text-[15px] font-semibold text-foreground tracking-[-0.01em]">Impayées</h2>
            </div>
            <Link to={`${basePath}/factures`} className="text-[11.5px] text-electric-600 dark:text-cyan-400 hover:underline font-medium flex items-center gap-0.5">
              Voir tout <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2">
            {factures.filter(f => f.statut !== 'payee' && f.statut !== 'annulee').slice(0, 5).map(f => (
              <Link
                key={f.id}
                to={`${basePath}/factures`}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-black/[0.02] dark:bg-white/[0.02] hover:bg-electric-500/[0.06] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-foreground truncate">{f.numero}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{f.client_nom || 'Client'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[12.5px] font-bold text-foreground leading-tight">
                    {f.montant_ttc - f.montant_paye > 0 ? formatCurrency(f.montant_ttc - f.montant_paye) : '—'}
                  </p>
                  <Badge
                    variant={f.statut === 'partielle' ? 'warning' : 'destructive'}
                    size="sm"
                    className="mt-1"
                  >
                    {f.statut === 'partielle' ? 'Partielle' : 'Impayée'}
                  </Badge>
                </div>
              </Link>
            ))}
            {factures.filter(f => f.statut !== 'payee' && f.statut !== 'annulee').length === 0 && (
              <div className="flex flex-col items-center justify-center py-8 gap-2">
                <div className="w-12 h-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                </div>
                <p className="text-[13px] text-muted-foreground font-medium">Tout est à jour !</p>
              </div>
            )}
          </div>
        </motion.div>
      </div>

      {/* ══ Secondary cards ═════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          {
            label: 'À encaisser',
            value: kpis.totalImpaye > 0 ? formatCurrency(kpis.totalImpaye) : '—',
            sub: `${kpis.facturesImpayees} facture${kpis.facturesImpayees !== 1 ? 's' : ''} en attente`,
            icon: DollarSign, tint: 'amber', link: '/factures',
          },
          {
            label: 'Profit estimé',
            value: kpis.profitEstime > 0 ? formatCurrency(kpis.profitEstime) : '—',
            sub: 'Marge estimée 65%', icon: TrendingUp, tint: 'emerald', link: '/finances',
          },
          {
            label: 'Brouillons',
            value: String(devis.filter(d => d.statut === 'brouillon').length),
            sub: 'Devis à finaliser', icon: FileText, tint: 'violet', link: '/devis',
          },
          {
            label: 'Paiements',
            value: String(factures.filter(f => f.statut === 'payee').length),
            sub: 'Factures encaissées', icon: CreditCard, tint: 'electric', link: '/paiements',
          },
        ].map((w, i) => {
          const Icon = w.icon
          const tint = TINT_MAP[w.tint] ?? TINT_MAP.electric
          return (
            <motion.div
              key={w.label}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.46 + i * 0.04, duration: 0.35 }}
              className="card-premium p-5"
            >
              <div className="flex items-center gap-2.5 mb-3">
                <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', tint.bg)}>
                  <Icon className={cn('w-4 h-4', tint.icon)} />
                </div>
                <p className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{w.label}</p>
              </div>
              <p className="text-[22px] font-black tracking-[-0.02em] text-foreground leading-none">{w.value}</p>
              <p className="text-[11.5px] text-muted-foreground mt-1.5">{w.sub}</p>
              <Link to={`${basePath}${w.link}`} className="text-[11.5px] text-electric-600 dark:text-cyan-400 font-medium flex items-center gap-0.5 mt-3 hover:underline">
                Détails <ChevronRight className="w-3 h-3" />
              </Link>
            </motion.div>
          )
        })}
      </div>

      {/* ── Intelligence insights ── */}
      {anomalies.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="card-premium p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-electric-500" />
              <h2 className="text-[15px] font-semibold text-foreground tracking-[-0.01em]">Nexi IA · Alertes détectées</h2>
              <Badge variant="purple" size="sm">IA ✦</Badge>
            </div>
            <Link to={`${basePath}/statistiques`} className="text-[11.5px] text-electric-600 dark:text-cyan-400 font-medium hover:underline flex items-center gap-0.5">
              Voir analyse <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {anomalies.slice(0, 3).map(a => {
              const t = a.severity === 'critical' ? TINT_MAP.red : a.severity === 'warning' ? TINT_MAP.amber : TINT_MAP.electric
              return (
                <div key={a.id} className={cn('rounded-xl border p-3', t.bg, 'border-' + (a.severity === 'critical' ? 'red' : a.severity === 'warning' ? 'amber' : 'electric') + '-500/20')}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn('w-4 h-4 flex-shrink-0 mt-0.5', t.icon)} />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-semibold text-foreground leading-tight">{a.title}</p>
                      <p className="text-[11.5px] text-muted-foreground mt-1 line-clamp-2">{a.recommendation}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

    </div>
  )
}
