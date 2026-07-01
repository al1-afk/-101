import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { Link, useParams } from 'react-router-dom'
import {
  TrendingUp, Users, FileText, Receipt, DollarSign, AlertTriangle,
  Clock, CheckCircle2, Globe, Server, ArrowUpRight, ArrowDownRight,
  UserCheck, ChevronRight, Repeat, Activity, X, Sparkles,
  CreditCard, Target, Zap, TrendingDown, Lightbulb,
} from 'lucide-react'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts'
import { useProspects } from '@/hooks/useProspects'
import { useClients }   from '@/hooks/useClients'
import { useFactures }  from '@/hooks/useFactures'
import { useDevis }     from '@/hooks/useDevis'
import { useDepenses }  from '@/hooks/useDepenses'
import { useAlerts }    from '@/hooks/useAlerts'
import { useCountUp }   from '@/hooks/useCountUp'
import { useClientSubscriptions, computeMrrMetrics } from '@/hooks/useClientSubscriptions'
import { computeCashFlowProjection, detectAnomalies } from '@/lib/intelligence'
import { formatCurrency, formatCurrencyCompact, formatDate, useIsMobileViewport } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import VisionWidgets from '@/components/VisionWidgets'
import TeamPipelinePanel from '@/components/equipe/TeamPipelinePanel'

/* ─── Helpers ─────────────────────────────────────────────────────── */
function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3600000)
  if (h < 1)  return 'À l\'instant'
  if (h < 24) return `Il y a ${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return 'Hier'
  return `Il y a ${d}j`
}

const RENEWALS = [
  { nom: 'nextgital.com',  type: 'Domaine',     expiration: '2026-05-15', jours: 33, prix: 120 },
  { nom: 'nextgital.com', type: 'Domaine',     expiration: '2026-06-01', jours: 50, prix: 150 },
  { nom: 'VPS Contabo',   type: 'Hébergement', expiration: '2026-04-30', jours: 18, prix: 350 },
  { nom: 'Canva Pro',     type: 'Abonnement',  expiration: '2026-04-25', jours: 13, prix: 130 },
]

/* ─── Sparkline ───────────────────────────────────────────────────── */
function Sparkline({ data, color }: { data: { v: number }[]; color: string }) {
  return (
    <ResponsiveContainer width="100%" height={48}>
      <LineChart data={data} margin={{ top: 4, right: 2, bottom: 2, left: 2 }}>
        <defs>
          <linearGradient id={`sp-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity={0.3} />
            <stop offset="100%" stopColor={color} stopOpacity={0}   />
          </linearGradient>
        </defs>
        <Line
          type="monotone" dataKey="v"
          stroke={color} strokeWidth={2}
          dot={false} activeDot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}

/* ─── KPI Card (pastel) ───────────────────────────────────────────── */
interface KpiCardProps {
  label:       string
  rawValue:    number
  formatter:   (n: number) => string
  sub:         string
  icon:        React.ElementType
  variant:     'kpi-blue' | 'kpi-purple' | 'kpi-pink' | 'kpi-teal'
  iconColor:   string
  trend?:      { pct: string; up: boolean }
  sparkData:   { v: number }[]
  sparkColor:  string
  delay?:      number
}

function KpiCard({
  label, rawValue, formatter, sub, icon: Icon,
  variant, iconColor, trend, sparkData, sparkColor, delay = 0,
}: KpiCardProps) {
  const animated = useCountUp(rawValue, 900, delay)
  const display  = rawValue === 0 ? '—' : formatter(animated)

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: delay / 1000, duration: 0.38, ease: 'easeOut' }}
      className={cn('card-pastel p-5 flex flex-col gap-3', variant)}
    >
      <div className="flex items-start justify-between">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: iconColor + '22' }}
        >
          <Icon className="w-5 h-5" style={{ color: iconColor }} />
        </div>
        {trend && (
          <span
            className={cn(
              'flex items-center gap-0.5 text-[11px] font-bold px-2 py-0.5 rounded-full',
              trend.up
                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                : 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400',
            )}
          >
            {trend.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
            {trend.pct}
          </span>
        )}
      </div>

      <div className="min-w-0">
        <p className="text-xl sm:text-2xl font-extrabold tracking-tight truncate" style={{ color: iconColor }}>{display}</p>
        <p className="text-[11px] font-semibold uppercase tracking-wide mt-0.5 text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5 truncate">{sub}</p>
      </div>

      <div className="-mx-1">
        <Sparkline data={sparkData} color={sparkColor} />
      </div>
    </motion.div>
  )
}

/* ─── Custom Chart Tooltip ────────────────────────────────────────── */
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl p-3 text-xs">
      <p className="font-semibold text-slate-700 dark:text-slate-200 mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-slate-400">{p.name === 'ca' ? 'CA' : 'Dépenses'} :</span>
          <span className="font-bold text-slate-700 dark:text-slate-200">
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

  // ── Real monthly chart data (last 8 months from factures + depenses) ──
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

  // ── Real weekly data (last 7 days) ──
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

  // ── Sparklines from monthly data ──
  const spCA       = monthlyData.map(d => ({ v: d.ca }))
  const spClients  = useMemo(() => {
    const now = new Date()
    return Array.from({ length: 8 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (7 - i), 1)
      const count = clients.filter(c => {
        const cd = new Date(c.created_at)
        return cd <= d
      }).length
      return { v: count }
    })
  }, [clients])
  const spDevis    = monthlyData.map((_, i) => ({ v: i + 3 }))
  const spPipeline = useMemo(() => {
    const base = kpis.valeurPipeline
    return Array.from({ length: 8 }, (_, i) => ({ v: Math.round(base * (0.7 + i * 0.05)) }))
  }, [kpis.valeurPipeline])

  // ── Real activity log ──
  const activityLog = useMemo(() => {
    const entries: { action: string; detail: string; date: string; dot: string }[] = []
    for (const f of factures) {
      if (f.statut === 'payee')
        entries.push({ action: 'Facture payée', detail: `${f.numero} — ${f.montant_paye.toLocaleString('fr-MA')} MAD`, date: f.created_at, dot: '#22c55e' })
      else if (f.statut === 'impayee')
        entries.push({ action: 'Facture émise', detail: `${f.numero} — ${f.client_nom ?? 'Client'}`, date: f.created_at, dot: '#f59e0b' })
    }
    for (const p of prospects)
      entries.push({
        action: p.statut === 'gagne' ? 'Prospect converti' : p.statut === 'nouveau' ? 'Nouveau prospect' : 'Prospect mis à jour',
        detail: `${p.nom}${p.entreprise ? ' — ' + p.entreprise : ''}`,
        date: p.created_at, dot: p.statut === 'gagne' ? '#22c55e' : '#3b82f6',
      })
    for (const d of devis)
      if (d.statut === 'accepte' || d.statut === 'refuse')
        entries.push({
          action: d.statut === 'accepte' ? 'Devis accepté' : 'Devis refusé',
          detail: `${d.numero} — ${d.client_nom ?? 'Client'}`,
          date: d.created_at, dot: d.statut === 'accepte' ? '#22c55e' : '#ef4444',
        })
    return entries.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5)
  }, [factures, prospects, devis])

  // ── Greeting name ──
  const userName = (() => { try { return localStorage.getItem('gestiq_fullname') || 'NEXT GITAL' } catch { return 'NEXT GITAL' } })()

  const showAlert    = !alertDismissed && (kpis.facturesImpayees > 0 || kpis.devisPending > 0)
  const topAnomalies = anomalies.filter(a => a.severity === 'critical').slice(0, 2)
  void criticalCount
  const chartData = period === 'monthly' ? monthlyData : weeklyData

  const today = new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  return (
    <div className="space-y-6 animate-fade-in pb-8">

      {/* ══ HERO GRADIENT CARD ══════════════════════════════════════ */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: 'easeOut' }}
        className="hero-card p-5 sm:p-7 relative"
      >
        {/* Content layer above ::before pseudo */}
        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">

          {/* Left: greeting */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4 text-white/70" />
              <span className="text-white/70 text-xs font-medium uppercase tracking-widest">
                {today.charAt(0).toUpperCase() + today.slice(1)}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight leading-tight">
              Bienvenue, {userName}
            </h1>
            <p className="text-white/60 text-sm mt-1">
              Vue d'ensemble de votre activité — tout est sous contrôle.
            </p>

            {/* Inline quick stats */}
            <div className="flex flex-wrap gap-5 mt-5">
              {[
                { label: 'CA encaissé',   value: fmtMoney(kpis.totalCA) },
                { label: 'Clients actifs',value: String(kpis.clients) },
                { label: 'Pipeline',      value: fmtMoney(kpis.valeurPipeline) },
              ].map(stat => (
                <div key={stat.label}>
                  <p className="text-white font-bold text-lg leading-none">{stat.value}</p>
                  <p className="text-white/55 text-[11px] mt-0.5">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: action buttons */}
          <div className="flex flex-col sm:items-end gap-2 flex-shrink-0">
            <Link to="/factures">
              <button className="btn-primary text-[13px] py-2 px-4 bg-white/20 border border-white/30 hover:bg-white/30 backdrop-blur-sm"
                style={{ background: 'rgba(255,255,255,0.18)', boxShadow: '0 4px 14px rgba(0,0,0,0.15)' }}>
                <Receipt className="w-4 h-4" />
                Nouvelle facture
              </button>
            </Link>
            <Link to="/prospects">
              <button className="btn-ghost text-white/75 hover:text-white hover:bg-white/10 text-[13px] py-1.5 px-3">
                <UserCheck className="w-4 h-4" />
                Voir prospects
              </button>
            </Link>
          </div>
        </div>
      </motion.div>

      {/* ── Vision : Cap mensuel + Objectif du mois ── */}
      <VisionWidgets />

      {/* ── Alert banner ── */}
      {showAlert && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="alert-banner alert-banner-warning"
        >
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
          <div className="flex-1 text-sm">
            <span className="font-semibold text-slate-700 dark:text-slate-200">Alertes : </span>
            {kpis.facturesImpayees > 0 && (
              <Link to="/factures" className="underline underline-offset-2 hover:opacity-80 mr-3"
                style={{ color: 'var(--warning)' }}>
                {kpis.facturesImpayees} facture{kpis.facturesImpayees > 1 ? 's' : ''} impayée{kpis.facturesImpayees > 1 ? 's' : ''} →
              </Link>
            )}
            {kpis.devisPending > 0 && (
              <Link to="/devis" className="underline underline-offset-2 hover:opacity-80"
                style={{ color: 'var(--warning)' }}>
                {kpis.devisPending} devis en attente →
              </Link>
            )}
          </div>
          <button onClick={() => setAlertDismissed(true)} className="p-1 rounded hover:opacity-70 flex-shrink-0">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </motion.div>
      )}

      {/* ── Intelligence anomaly banner ── */}
      {topAnomalies.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-red-200 dark:border-red-800/50 bg-red-50 dark:bg-red-950/20 px-4 py-3 flex items-start gap-3"
        >
          <Zap className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 space-y-1">
            {topAnomalies.map(a => (
              <div key={a.id} className="flex items-center gap-2 text-sm">
                <span className="font-semibold text-red-700 dark:text-red-400">{a.title}</span>
                <span className="text-red-600/70 dark:text-red-400/60 text-xs hidden sm:block">— {a.recommendation}</span>
              </div>
            ))}
          </div>
          <Link to="/statistiques" className="text-xs text-red-600 dark:text-red-400 font-medium hover:underline flex-shrink-0">
            Analyser →
          </Link>
        </motion.div>
      )}

      {/* ══ PASTEL KPI CARDS ════════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard
          label="CA Encaissé"  rawValue={kpis.totalCA}       formatter={fmtMoney}
          sub="Total encaissé ce mois"
          icon={TrendingUp}    variant="kpi-blue"     iconColor="#2563EB"
          trend={{ pct: '+12%', up: true }}
          sparkData={spCA}    sparkColor="#2563EB"   delay={0}
        />
        <KpiCard
          label="Clients"      rawValue={kpis.clients}       formatter={String}
          sub="Clients actifs"
          icon={Users}         variant="kpi-purple"   iconColor="#7C3AED"
          trend={{ pct: '+2',  up: true }}
          sparkData={spClients} sparkColor="#7C3AED" delay={80}
        />
        <KpiCard
          label="Devis envoyés" rawValue={kpis.devisPending}  formatter={String}
          sub="En attente de réponse"
          icon={FileText}      variant="kpi-pink"     iconColor="#DB2777"
          trend={{ pct: '+3',  up: true }}
          sparkData={spDevis} sparkColor="#DB2777"   delay={160}
        />
        <KpiCard
          label="Pipeline"     rawValue={kpis.valeurPipeline} formatter={fmtMoney}
          sub={`${kpis.prospectsActifs} prospects actifs`}
          icon={Target}        variant="kpi-teal"     iconColor="#0F766E"
          trend={{ pct: '+8%', up: true }}
          sparkData={spPipeline} sparkColor="#0F766E" delay={240}
        />
      </div>

      {/* ══ PIPELINE ÉQUIPE — stand-up quotidien ════════════════════════ */}
      <TeamPipelinePanel basePath={basePath} />

      {/* ══ MAIN CHART + ACTIVITY ════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        {/* Revenue chart */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, duration: 0.4 }}
          className="lg:col-span-2 card-premium p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <div>
              <h2 className="section-title">Chiffre d'affaires & Dépenses</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {period === 'monthly' ? '8 derniers mois' : '7 derniers jours'}
              </p>
            </div>
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
              {(['weekly', 'monthly'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => setPeriod(p)}
                  className={cn(
                    'text-xs px-3 py-1.5 rounded-lg font-semibold transition-all',
                    period === p
                      ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300',
                  )}
                >
                  {p === 'weekly' ? 'Semaine' : 'Mois'}
                </button>
              ))}
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 mb-4">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#2563EB]" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Chiffre d'affaires</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#DB2777]" />
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">Dépenses</span>
            </div>
          </div>

          <ResponsiveContainer width="100%" height={230}>
            <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 0, left: -10 }}>
              <defs>
                <linearGradient id="gCA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#2563EB" stopOpacity={0.22} />
                  <stop offset="95%" stopColor="#2563EB" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gDep" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#DB2777" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#DB2777" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(220 20% 89% / 0.7)" vertical={false} />
              <XAxis dataKey="mois" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => `${(v/1000).toFixed(0)}k`} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} />
              <Area type="monotone" dataKey="ca"       stroke="#2563EB" strokeWidth={2.5} fill="url(#gCA)"  dot={false} activeDot={{ r: 5, fill: '#2563EB', strokeWidth: 2, stroke: '#fff' }} />
              <Area type="monotone" dataKey="depenses" stroke="#DB2777" strokeWidth={2}   fill="url(#gDep)" dot={false} activeDot={{ r: 4, fill: '#DB2777', strokeWidth: 2, stroke: '#fff' }} />
            </AreaChart>
          </ResponsiveContainer>
        </motion.div>

        {/* Activité récente */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.33, duration: 0.4 }}
          className="card-premium p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-500" />
              <h2 className="section-title">Activité récente</h2>
            </div>
            <Link to="/activite" className="text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center gap-0.5">
              Tout <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-3.5">
            {activityLog.map((item, i) => (
              <div key={i} className="flex items-start gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: item.dot + '18' }}
                >
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.dot }} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-tight">{item.action}</p>
                  <p className="text-xs text-slate-400 mt-0.5 truncate">{item.detail}</p>
                </div>
                <span className="text-[11px] text-slate-400 whitespace-nowrap flex-shrink-0 pt-0.5">{relativeTime(item.date)}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* ══ SECONDARY WIDGETS ══════════════════════════════════════ */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">

        {/* À encaisser */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38, duration: 0.38 }}
          className="card-premium p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-900/20 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-amber-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">À encaisser</p>
          </div>
          <p className="text-xl font-extrabold text-amber-500 tracking-tight">
            {kpis.totalImpaye > 0 ? formatCurrency(kpis.totalImpaye) : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-1">
            {kpis.facturesImpayees} facture{kpis.facturesImpayees !== 1 ? 's' : ''} en attente
          </p>
          <Link to="/factures" className="text-xs text-blue-500 font-medium flex items-center gap-0.5 mt-3 hover:underline">
            Voir factures <ChevronRight className="w-3 h-3" />
          </Link>
        </motion.div>

        {/* Profit estimé */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.38 }}
          className="card-premium p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Profit estimé</p>
          </div>
          <p className="text-xl font-extrabold text-emerald-500 tracking-tight">
            {kpis.profitEstime > 0 ? formatCurrency(kpis.profitEstime) : '—'}
          </p>
          <p className="text-xs text-slate-400 mt-1">Marge estimée 65%</p>
          <div className="flex items-center gap-1 mt-3">
            <ArrowUpRight className="w-3 h-3 text-emerald-500" />
            <span className="text-xs text-emerald-500 font-semibold">+15% vs mois préc.</span>
          </div>
        </motion.div>

        {/* Devis brouillon */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.46, duration: 0.38 }}
          className="card-premium p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-900/20 flex items-center justify-center">
              <FileText className="w-4 h-4 text-violet-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Brouillons</p>
          </div>
          <p className="text-xl font-extrabold text-violet-500 tracking-tight">
            {devis.filter(d => d.statut === 'brouillon').length}
          </p>
          <p className="text-xs text-slate-400 mt-1">Devis à finaliser</p>
          <Link to="/devis" className="text-xs text-blue-500 font-medium flex items-center gap-0.5 mt-3 hover:underline">
            Voir devis <ChevronRight className="w-3 h-3" />
          </Link>
        </motion.div>

        {/* Paiements récents */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.50, duration: 0.38 }}
          className="card-premium p-5"
        >
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-blue-500" />
            </div>
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Paiements</p>
          </div>
          <p className="text-xl font-extrabold text-blue-500 tracking-tight">
            {factures.filter(f => f.statut === 'payee').length}
          </p>
          <p className="text-xs text-slate-400 mt-1">Factures encaissées</p>
          <Link to="/paiements" className="text-xs text-blue-500 font-medium flex items-center gap-0.5 mt-3 hover:underline">
            Voir paiements <ChevronRight className="w-3 h-3" />
          </Link>
        </motion.div>
      </div>

      {/* ══ MRR / REVENUS RÉCURRENTS ════════════════════════════════ */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          {
            label: 'MRR',
            value: formatCurrency(mrrMetrics.mrr),
            sub:   'Revenus récurrents / mois',
            icon:  Repeat,
            color: 'text-violet-600 dark:text-violet-400',
            bg:    'bg-violet-50 dark:bg-violet-900/20',
            link:  '/abonnements-clients',
          },
          {
            label: 'ARR',
            value: formatCurrency(mrrMetrics.arr),
            sub:   'Revenus annuels projetés',
            icon:  TrendingUp,
            color: 'text-emerald-600 dark:text-emerald-400',
            bg:    'bg-emerald-50 dark:bg-emerald-900/20',
            link:  '/abonnements-clients',
          },
          {
            label: 'Tréso J+30',
            value: formatCurrency(cashflow.next30Days),
            sub:   cashflow.next30Days >= 0 ? 'Projection positive' : 'Attention : déficit',
            icon:  cashflow.next30Days >= 0 ? TrendingUp : TrendingDown,
            color: cashflow.next30Days >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400',
            bg:    cashflow.next30Days >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20',
            link:  '/finances',
          },
          {
            label: 'Churn',
            value: `${mrrMetrics.churnRate}%`,
            sub:   mrrMetrics.atRisk > 0 ? `${formatCurrency(mrrMetrics.atRisk)} à risque` : 'Aucun impayé',
            icon:  mrrMetrics.atRisk > 0 ? AlertTriangle : CheckCircle2,
            color: mrrMetrics.atRisk > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400',
            bg:    mrrMetrics.atRisk > 0 ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-emerald-50 dark:bg-emerald-900/20',
            link:  '/abonnements-clients',
          },
        ].map((w, i) => {
          const Icon = w.icon
          return (
            <motion.div
              key={w.label}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.54 + i * 0.05, duration: 0.38 }}
              className="card-premium p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <div className={cn('w-8 h-8 rounded-xl flex items-center justify-center', w.bg)}>
                  <Icon className={cn('w-4 h-4', w.color)} />
                </div>
                <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{w.label}</p>
              </div>
              <p className={cn('text-xl font-extrabold tracking-tight', w.color)}>{w.value}</p>
              <p className="text-xs text-slate-400 mt-1">{w.sub}</p>
              <Link to={w.link} className="text-xs text-blue-500 font-medium flex items-center gap-0.5 mt-3 hover:underline">
                Détails <ChevronRight className="w-3 h-3" />
              </Link>
            </motion.div>
          )
        })}
      </div>

      {/* ── Intelligence quick insights ── */}
      {anomalies.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="card-premium p-5"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Lightbulb className="w-4 h-4 text-blue-500" />
              <h2 className="section-title">Intelligence — Alertes détectées</h2>
            </div>
            <Link to="/statistiques" className="text-xs text-blue-500 font-medium flex items-center gap-0.5 hover:underline">
              Voir analyse <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {anomalies.slice(0, 3).map(a => {
              const colors = {
                critical: { bg: 'bg-red-50 dark:bg-red-950/20',    border: 'border-red-200 dark:border-red-800/40',    icon: 'text-red-500'   },
                warning:  { bg: 'bg-amber-50 dark:bg-amber-950/20', border: 'border-amber-200 dark:border-amber-800/40', icon: 'text-amber-500' },
                info:     { bg: 'bg-blue-50 dark:bg-blue-950/20',   border: 'border-blue-200 dark:border-blue-800/40',   icon: 'text-blue-500'  },
              }
              const c = colors[a.severity]
              return (
                <div key={a.id} className={cn('rounded-xl border p-3', c.bg, c.border)}>
                  <div className="flex items-start gap-2">
                    <AlertTriangle className={cn('w-4 h-4 flex-shrink-0 mt-0.5', c.icon)} />
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 leading-tight">{a.title}</p>
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{a.recommendation}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}

      {/* ══ BOTTOM ROW ══════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Factures impayées */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.42, duration: 0.4 }}
          className="card-premium p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-amber-500" />
              <h2 className="section-title">Factures impayées</h2>
            </div>
            <Link to="/factures" className="text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center gap-0.5">
              Voir tout <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {factures.filter(f => f.statut !== 'payee' && f.statut !== 'annulee').slice(0, 5).map(f => (
              <div key={f.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">{f.numero}</p>
                  <p className="text-xs text-slate-400 truncate">{f.client_nom || 'Client'}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                    {f.montant_ttc - f.montant_paye > 0 ? formatCurrency(f.montant_ttc - f.montant_paye) : '—'}
                  </p>
                  <span className={cn(
                    'badge-pill text-[10px]',
                    f.statut === 'partielle' ? 'badge-warning' : 'badge-danger',
                  )}>
                    {f.statut === 'partielle' ? 'Partielle' : 'Impayée'}
                  </span>
                </div>
              </div>
            ))}
            {factures.filter(f => f.statut !== 'payee' && f.statut !== 'annulee').length === 0 && (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                <p className="text-sm text-slate-400 font-medium">Tout est à jour !</p>
              </div>
            )}
          </div>
        </motion.div>

        {/* Renouvellements */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.47, duration: 0.4 }}
          className="card-premium p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <Repeat className="w-4 h-4 text-violet-500" />
              <h2 className="section-title">Renouvellements</h2>
            </div>
            <Link to="/domaines" className="text-xs text-blue-500 hover:text-blue-600 font-medium flex items-center gap-0.5">
              Voir tout <ChevronRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {RENEWALS.map((r, i) => {
              const urgent  = r.jours <= 15
              const warning = r.jours <= 30
              return (
                <div key={i} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={cn(
                      'w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0',
                      r.type === 'Domaine' ? 'bg-blue-100 dark:bg-blue-900/30'
                        : r.type === 'Hébergement' ? 'bg-violet-100 dark:bg-violet-900/30'
                        : 'bg-amber-100 dark:bg-amber-900/30',
                    )}>
                      {r.type === 'Domaine'
                        ? <Globe  className="w-4 h-4 text-blue-500" />
                        : r.type === 'Hébergement'
                        ? <Server className="w-4 h-4 text-violet-500" />
                        : <Repeat className="w-4 h-4 text-amber-500" />}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 truncate">{r.nom}</p>
                      <p className="text-xs text-slate-400">{formatDate(r.expiration)}</p>
                    </div>
                  </div>
                  <span className={cn(
                    'badge-pill flex-shrink-0',
                    urgent  ? 'badge-danger'
                    : warning ? 'badge-warning'
                    :            'badge-success',
                  )}>
                    {r.jours}j
                  </span>
                </div>
              )
            })}
          </div>
        </motion.div>
      </div>

    </div>
  )
}
