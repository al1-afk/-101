import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Trophy, AlertTriangle, ArrowUpRight, ArrowDownRight,
  Calendar, BarChart3, Users, Target, Wallet, Receipt, PiggyBank, RefreshCw,
} from 'lucide-react'
import { usePaiements }  from '@/hooks/usePaiements'
import { useDepenses }   from '@/hooks/useDepenses'
import { useClients }    from '@/hooks/useClients'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'

const MOIS_FR  = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc']
const MOIS_LONG = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

type Period = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom'
type Tab    = 'overview' | 'renouvellements'

interface DevisRow {
  id: string; status: string; montant_ttc: number; date: string; client_id: string
}

function periodRange(p: Period): { from: Date | null; to: Date | null } {
  const now = new Date()
  if (p === 'all') return { from: null, to: null }
  if (p === 'today') {
    const s = new Date(now); s.setHours(0,0,0,0)
    const e = new Date(now); e.setHours(23,59,59,999)
    return { from: s, to: e }
  }
  if (p === 'week') {
    const s = new Date(now); s.setDate(now.getDate() - now.getDay()); s.setHours(0,0,0,0)
    return { from: s, to: now }
  }
  if (p === 'month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: now }
  }
  if (p === 'year') {
    return { from: new Date(now.getFullYear(), 0, 1), to: now }
  }
  return { from: null, to: null }
}

function inRange(dateStr: string, from: Date | null, to: Date | null): boolean {
  if (!from && !to) return true
  const d = new Date(dateStr)
  if (from && d < from) return false
  if (to && d > to) return false
  return true
}

export default function Statistiques() {
  const [period, setPeriod] = useState<Period>('all')
  const [tab,    setTab]    = useState<Tab>('overview')
  const [year,   setYear]   = useState(new Date().getFullYear())

  const { data: paiements = [] } = usePaiements()
  const { data: depenses  = [] } = useDepenses()
  const { data: clients   = [] } = useClients()
  const { data: devis     = [] } = useQuery<DevisRow[]>({
    queryKey: ['devis-stats'],
    queryFn:  () => api.get<DevisRow[]>('/api/devis?orderBy=date&order=desc'),
    staleTime: 1000 * 60 * 2,
  })

  const { from, to } = periodRange(period)
  const clientMap = useMemo(() => {
    const m = new Map<string, string>()
    clients.forEach(c => m.set(c.id, c.nom))
    return m
  }, [clients])

  /* ── KPIs ────────────────────────────────────────────── */
  const kpis = useMemo(() => {
    const paiementsInPeriod = paiements.filter(p => p.status === 'paye' && inRange(p.date, from, to))
    const depensesInPeriod  = depenses.filter(d => inRange(d.date_depense, from, to))

    const ca        = paiementsInPeriod.reduce((s, p) => s + Number(p.montant), 0)
    const sorties   = depensesInPeriod.reduce((s, d) => s + Number(d.montant), 0)
    const marge     = ca - sorties
    const actifs    = new Set(paiementsInPeriod.map(p => p.client_id)).size
    const countP    = paiementsInPeriod.length

    const devisAccepte = devis.filter(d => d.status === 'accepte').length
    const devisTotal   = devis.length
    const conversion   = devisTotal > 0 ? Math.round((devisAccepte / devisTotal) * 100) : 0

    return { ca, sorties, marge, actifs, countP, conversion }
  }, [paiements, depenses, devis, from, to])

  /* ── Répartition devis ───────────────────────────────── */
  const devisStats = useMemo(() => {
    const counts = { accepte: 0, envoye: 0, brouillon: 0, refuse: 0, expire: 0 }
    devis.forEach(d => {
      if (d.status in counts) (counts as any)[d.status]++
    })
    const total = devis.length || 1
    return [
      { key: 'accepte',   label: 'Acceptés',  count: counts.accepte,   pct: Math.round((counts.accepte/total)*100),   color: 'bg-emerald-500', text: 'text-emerald-600 dark:text-emerald-400' },
      { key: 'envoye',    label: 'Envoyés',   count: counts.envoye,    pct: Math.round((counts.envoye/total)*100),    color: 'bg-blue-500',    text: 'text-blue-600 dark:text-blue-400' },
      { key: 'brouillon', label: 'Brouillons',count: counts.brouillon, pct: Math.round((counts.brouillon/total)*100), color: 'bg-slate-500',   text: 'text-slate-600 dark:text-slate-400' },
      { key: 'refuse',    label: 'Refusés',   count: counts.refuse,    pct: Math.round((counts.refuse/total)*100),    color: 'bg-red-500',     text: 'text-red-600 dark:text-red-400' },
    ]
  }, [devis])

  /* ── Répartition CA ──────────────────────────────────── */
  const caRepartition = useMemo(() => {
    const y = new Date().getFullYear()
    const yearPaiements = paiements.filter(p => p.status === 'paye' && new Date(p.date).getFullYear() === y)
    const byClient = new Map<string, number>()
    yearPaiements.forEach(p => {
      if (!p.client_id) return
      byClient.set(p.client_id, (byClient.get(p.client_id) ?? 0) + Number(p.montant))
    })
    const clientsFirstPaiement = new Map<string, string>()
    paiements.forEach(p => {
      if (!p.client_id) return
      const existing = clientsFirstPaiement.get(p.client_id)
      if (!existing || new Date(p.date) < new Date(existing)) {
        clientsFirstPaiement.set(p.client_id, p.date)
      }
    })
    let nouveaux = 0, renouvs = 0
    yearPaiements.forEach(p => {
      const first = p.client_id ? clientsFirstPaiement.get(p.client_id) : null
      if (first && new Date(first).getFullYear() === y) nouveaux += Number(p.montant)
      else renouvs += Number(p.montant)
    })
    return { year: y, nouveaux, renouvs, total: nouveaux + renouvs }
  }, [paiements])

  /* ── Évolution mensuelle ─────────────────────────────── */
  const monthlyData = useMemo(() => {
    return Array.from({ length: 12 }, (_, m) => {
      const prefix = `${year}-${String(m + 1).padStart(2, '0')}`
      const ca = paiements
        .filter(p => p.status === 'paye' && p.date.startsWith(prefix))
        .reduce((s, p) => s + Number(p.montant), 0)
      const dep = depenses
        .filter(d => d.date_depense.startsWith(prefix))
        .reduce((s, d) => s + Number(d.montant), 0)
      return { mois: m, label: `${MOIS_FR[m]} ${year}`, ca, dep, net: ca - dep }
    })
  }, [paiements, depenses, year])

  /* ── Meilleur / pire mois (all-time) ─────────────────── */
  const bestWorst = useMemo(() => {
    const byMonth = new Map<string, number>()
    paiements.filter(p => p.status === 'paye').forEach(p => {
      const d = new Date(p.date)
      const key = `${d.getFullYear()}-${d.getMonth()}`
      byMonth.set(key, (byMonth.get(key) ?? 0) + Number(p.montant))
    })
    let best:  { key: string; ca: number } | null = null
    let worst: { key: string; ca: number } | null = null
    for (const [key, ca] of byMonth.entries()) {
      if (ca <= 0) continue
      if (!best  || ca > best.ca)  best  = { key, ca }
      if (!worst || ca < worst.ca) worst = { key, ca }
    }
    const fmt = (k: string | null) => {
      if (!k) return '—'
      const [y, m] = k.split('-').map(Number)
      return `${MOIS_FR[m]} ${y}`
    }
    return { best: best ? { label: fmt(best.key), ca: best.ca } : null,
             worst: worst ? { label: fmt(worst.key), ca: worst.ca } : null }
  }, [paiements])

  /* ── Revenus vs Sorties (time series) ────────────────── */
  const series = useMemo(() => {
    const byMonth = new Map<string, { ca: number; dep: number }>()
    paiements.filter(p => p.status === 'paye').forEach(p => {
      const d = new Date(p.date)
      const k = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`
      const e = byMonth.get(k) ?? { ca: 0, dep: 0 }
      e.ca += Number(p.montant); byMonth.set(k, e)
    })
    depenses.forEach(d => {
      const dt = new Date(d.date_depense)
      const k = `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}`
      const e = byMonth.get(k) ?? { ca: 0, dep: 0 }
      e.dep += Number(d.montant); byMonth.set(k, e)
    })
    return [...byMonth.entries()]
      .sort(([a],[b]) => a.localeCompare(b))
      .map(([k, v]) => {
        const [y, m] = k.split('-').map(Number)
        return { label: `${MOIS_FR[m-1]} ${String(y).slice(2)}`, revenus: v.ca, sorties: v.dep, marge: v.ca - v.dep }
      })
  }, [paiements, depenses])

  /* ── Top clients ─────────────────────────────────────── */
  const topClients = useMemo(() => {
    const byClient = new Map<string, number>()
    paiements.filter(p => p.status === 'paye').forEach(p => {
      if (!p.client_id) return
      byClient.set(p.client_id, (byClient.get(p.client_id) ?? 0) + Number(p.montant))
    })
    return [...byClient.entries()]
      .map(([id, ca]) => ({ id, nom: clientMap.get(id) ?? 'Client inconnu', ca }))
      .sort((a, b) => b.ca - a.ca)
      .slice(0, 5)
  }, [paiements, clientMap])

  const tendance = useMemo(() => {
    if (series.length < 2) return 0
    const last  = series[series.length - 1].marge
    const prev  = series[series.length - 2].marge
    if (prev === 0) return last > 0 ? 100 : 0
    return Math.round(((last - prev) / Math.abs(prev)) * 100)
  }, [series])

  return (
    <div className="space-y-5 animate-fade-in">
      {/* ── Période selector ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/40 px-3 py-1.5 rounded-lg">
          <Calendar className="w-4 h-4" />
          <span>Toute La Période</span>
        </div>
        {([
          { id: 'all',   label: 'Toute' },
          { id: 'today', label: "Aujourd'hui" },
          { id: 'week',  label: 'Cette semaine' },
          { id: 'month', label: 'Ce mois' },
          { id: 'year',  label: 'Cette année' },
        ] as { id: Period; label: string }[]).map(p => (
          <button key={p.id} onClick={() => setPeriod(p.id)}
            className={`text-sm px-4 py-1.5 rounded-lg font-medium transition-colors ${
              period === p.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'
            }`}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Header ── */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
          <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">Statistiques</h1>
          <p className="text-sm text-muted-foreground">Analysez les performances de votre agence</p>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex items-center gap-2 border-b border-border">
        {([
          { id: 'overview',        label: "Vue d'ensemble", icon: BarChart3 },
          { id: 'renouvellements', label: 'Renouvellements', icon: RefreshCw },
        ] as { id: Tab; label: string; icon: any }[]).map(t => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}>
              <Icon className="w-4 h-4" />{t.label}
            </button>
          )
        })}
      </div>

      {/* ── 6 KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <KpiCard title="CA (période)"       value={`${formatCurrency(kpis.ca)}`}        icon={<ArrowUpRight className="w-4 h-4 text-emerald-500" />} />
        <KpiCard title="Paiements"          value={String(kpis.countP)}                 icon={<BarChart3 className="w-4 h-4 text-blue-500" />} />
        <KpiCard title="Sorties (période)"  value={formatCurrency(kpis.sorties)}        icon={<ArrowDownRight className="w-4 h-4 text-red-500" />} />
        <KpiCard title="Marge nette"        value={formatCurrency(kpis.marge)}          icon={<Wallet className="w-4 h-4 text-purple-500" />} sub="+0% ce mois" />
        <KpiCard title="Clients actifs"     value={String(kpis.actifs)}                 icon={<Users className="w-4 h-4 text-amber-500" />} />
        <KpiCard title="Taux de conversion" value={`${kpis.conversion}%`}               icon={<Target className="w-4 h-4 text-indigo-500" />} />
      </div>

      {/* ── Marge banner ── */}
      <div className="card-premium p-4 border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <TrendingUp className="w-5 h-5 text-emerald-500" />
          <div>
            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-400">Marge nette (période)</p>
            <p className="text-xs text-muted-foreground">CA − Sorties</p>
          </div>
        </div>
        <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{formatCurrency(kpis.marge)}</p>
      </div>

      {/* ── 3 panels ── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Répartition CA */}
        <div className="card-premium p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Répartition du CA {caRepartition.year}</h3>
          <div className="space-y-3">
            <Row label="Nouveaux clients" value={formatCurrency(caRepartition.nouveaux)} dot="bg-blue-500" />
            <Row label="Renouvellements"  value={formatCurrency(caRepartition.renouvs)}  dot="bg-slate-300" />
            <div className="pt-2 border-t border-border flex items-center justify-between text-sm font-semibold">
              <span>Total</span>
              <span className="tabular-nums">{formatCurrency(caRepartition.total)}</span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div className="h-full bg-blue-500" style={{
                width: caRepartition.total ? `${(caRepartition.nouveaux/caRepartition.total)*100}%` : '0%'
              }} />
            </div>
          </div>
        </div>

        {/* Renouvellements stats */}
        <div className="card-premium p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Statistiques renouvellements</h3>
          <div className="space-y-3 text-sm">
            <Row label="Taux de renouvellement" value={<span className="font-bold text-blue-600 dark:text-blue-400">
              {caRepartition.total > 0 ? Math.round((caRepartition.renouvs/caRepartition.total)*100) : 0}%
            </span>} />
            <Row label="Renouvellements payés" value="0" />
            <Row label="En attente"            value="0" />
            <Row label="Nouveaux clients"      value={String(new Set(paiements.map(p => p.client_id)).size)} />
          </div>
        </div>

        {/* Devis statuses */}
        <div className="card-premium p-5">
          <h3 className="text-sm font-semibold text-foreground mb-4">Répartition des statuts de devis</h3>
          <div className="space-y-3">
            {devisStats.map(s => (
              <div key={s.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className={s.text}>{s.label}</span>
                  <span className="text-muted-foreground">{s.count} ({s.pct}%)</span>
                </div>
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className={`h-full ${s.color}`} style={{ width: `${s.pct}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── 4 smaller KPIs ── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard title="Total encaissé"    value={formatCurrency(kpis.ca)} />
        <KpiCard title="Total sorties"     value={formatCurrency(kpis.sorties)} />
        <KpiCard title="Marge nette"       value={<span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(kpis.marge)}</span>} />
        <KpiCard title="Tendance générale" value={
          <span className={tendance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}>
            {tendance >= 0 ? '+' : ''}{tendance}%
          </span>
        } />
      </div>

      {/* ── Best / Worst month ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="card-premium p-4 border border-emerald-200 dark:border-emerald-500/20 bg-emerald-50/50 dark:bg-emerald-500/5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center">
            <Trophy className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">Meilleur mois</p>
            <p className="text-sm font-bold text-foreground mt-0.5">
              {bestWorst.best ? `${bestWorst.best.label} — ${formatCurrency(bestWorst.best.ca)}` : '—'}
            </p>
          </div>
        </div>
        <div className="card-premium p-4 border border-amber-200 dark:border-amber-500/20 bg-amber-50/50 dark:bg-amber-500/5 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-amber-100 dark:bg-amber-500/20 flex items-center justify-center">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div>
            <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">Mois le plus faible</p>
            <p className="text-sm font-bold text-foreground mt-0.5">
              {bestWorst.worst ? `${bestWorst.worst.label} — ${formatCurrency(bestWorst.worst.ca)}` : '—'}
            </p>
          </div>
        </div>
      </div>

      {/* ── Évolution mensuelle ── */}
      <div className="card-premium p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-foreground">Évolution mensuelle (%)</h3>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            className="text-sm bg-background border border-border rounded-lg px-3 py-1">
            {[year+1, year, year-1, year-2, year-3].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2">
          {monthlyData.map((m, i) => {
            const prev = i > 0 ? monthlyData[i-1].ca : 0
            const pct = prev > 0 ? Math.round(((m.ca - prev) / prev) * 100) : (m.ca > 0 ? 100 : 0)
            const positive = m.net >= 0
            return (
              <div key={i} className={`rounded-lg p-3 border ${
                positive ? 'bg-emerald-50/40 dark:bg-emerald-500/5 border-emerald-200/60 dark:border-emerald-500/20'
                         : 'bg-red-50/40 dark:bg-red-500/5 border-red-200/60 dark:border-red-500/20'
              }`}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-muted-foreground">{m.label}</span>
                  <span className={`text-[10px] font-bold ${pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {pct >= 0 ? '+' : ''}{pct}%
                  </span>
                </div>
                <div className="space-y-0.5 text-[11px] text-muted-foreground">
                  <div>💰 CA: <span className="font-medium text-foreground">{m.ca.toLocaleString()}</span></div>
                  <div>📤 Dép: <span className="font-medium text-foreground">{m.dep.toLocaleString()}</span></div>
                </div>
                <div className={`text-[11px] font-bold mt-1 ${positive ? 'text-emerald-600' : 'text-red-600'}`}>
                  Net: {m.net.toLocaleString()}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Line chart ── */}
      <div className="card-premium p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Revenus vs Sorties</h3>
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip formatter={(v: any) => formatCurrency(Number(v))} />
              <Legend />
              <Line type="monotone" dataKey="revenus" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} name="Revenus" />
              <Line type="monotone" dataKey="sorties" stroke="#ef4444" strokeWidth={2} strokeDasharray="4 4" dot={{ r: 3 }} name="Sorties" />
              <Line type="monotone" dataKey="marge"   stroke="#10b981" strokeWidth={2} dot={{ r: 3 }} name="Marge nette" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Top clients ── */}
      <div className="card-premium p-5">
        <h3 className="text-sm font-semibold text-foreground mb-4">Top clients (CA total)</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {topClients.map((c, i) => (
            <div key={c.id} className="rounded-lg border border-border p-4 text-center hover:shadow-sm transition-shadow">
              <div className={`w-8 h-8 rounded-full mx-auto mb-2 flex items-center justify-center text-xs font-bold ${
                i === 0 ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400'
                : i === 1 ? 'bg-slate-100 text-slate-700 dark:bg-slate-500/20 dark:text-slate-300'
                : i === 2 ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400'
                : 'bg-muted text-muted-foreground'
              }`}>{i + 1}</div>
              <p className="text-xs font-medium text-foreground truncate" title={c.nom}>{c.nom}</p>
              <p className="text-sm font-bold text-blue-600 dark:text-blue-400 mt-1 tabular-nums">{formatCurrency(c.ca)}</p>
            </div>
          ))}
          {topClients.length === 0 && (
            <p className="col-span-5 text-center text-sm text-muted-foreground py-6">Aucun paiement enregistré</p>
          )}
        </div>
      </div>
    </div>
  )
}

function KpiCard({ title, value, icon, sub }: { title: string; value: React.ReactNode; icon?: React.ReactNode; sub?: string }) {
  return (
    <div className="card-premium p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-muted-foreground">{title}</span>
        {icon}
      </div>
      <p className="text-xl font-bold text-foreground tabular-nums">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  )
}

function Row({ label, value, dot }: { label: string; value: React.ReactNode; dot?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <div className="flex items-center gap-2">
        {dot && <span className={`w-2 h-2 rounded-full ${dot}`} />}
        <span className="text-muted-foreground">{label}</span>
      </div>
      <span className="font-semibold text-foreground tabular-nums">{value}</span>
    </div>
  )
}
