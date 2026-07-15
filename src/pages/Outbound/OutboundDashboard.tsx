import { useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  UserCheck, Target, TrendingUp, Bell, CheckCircle2, Loader2, Users2,
  Award, Calendar, ArrowUp, Sparkles,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/utils'
import { Link, useParams } from 'react-router-dom'
import { useOutboundStats, useOutboundFollowUps } from '@/hooks/useOutbound'
import { OUTBOUND_STATUS } from '@/lib/outboundApi'
import { statusAccent, statusLabel, isOutboundManager } from './utils'
import { useAuth } from '@/hooks/useAuth'

export default function OutboundDashboard() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const { role, name } = useAuth()
  const canManageAll = isOutboundManager(role)

  const { data: stats, isLoading } = useOutboundStats()
  const { data: followUps = [] } = useOutboundFollowUps({ statut: 'a_faire' })

  const upcoming = useMemo(() => followUps.slice(0, 8), [followUps])

  if (isLoading || !stats) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const conversionRate = stats.totals.total > 0
    ? (stats.totals.conversions / stats.totals.total * 100).toFixed(1)
    : '0'

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {canManageAll ? 'Tableau de bord Outbound' : 'Mon tableau de bord'}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            {canManageAll ? 'Vue globale de la prospection sortante' : `Bienvenue ${name ?? ''}, voici votre activité`}
          </p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Kpi label="Prospects" value={stats.totals.total} icon={UserCheck} color="sky" />
        <Kpi label="À contacter" value={stats.totals.a_contacter} icon={Target} color="amber" />
        <Kpi label="Pipeline actif" value={stats.totals.pipeline} icon={TrendingUp} color="violet" subtitle={formatCurrency(stats.totals.pipeline_valeur)} />
        <Kpi label="Conversions" value={stats.totals.conversions} icon={CheckCircle2} color="emerald" subtitle={`${conversionRate}% taux`} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Par statut */}
        <div className="lg:col-span-2 card-premium p-5">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-sky-500" />
            <h3 className="text-sm font-bold text-foreground">Répartition par statut</h3>
          </div>
          <StatusBreakdown data={stats.by_statut} total={stats.totals.total} />
        </div>

        {/* Relances */}
        <div className="card-premium p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-foreground">Relances dues</h3>
            </div>
            <Link
              to={`/${tenantSlug}/outbound/follow-ups`}
              className="text-xs text-sky-600 hover:underline"
            >
              Voir tout →
            </Link>
          </div>
          {stats.relances_dues > 0 && (
            <div className="mb-3 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg p-2 border border-amber-500/20">
              <Bell className="w-3.5 h-3.5" />
              <span className="font-medium">{stats.relances_dues} relance{stats.relances_dues > 1 ? 's' : ''} en attente</span>
            </div>
          )}
          {upcoming.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Aucune relance programmée</p>
          ) : (
            <ul className="space-y-2 max-h-64 overflow-y-auto">
              {upcoming.map(f => (
                <li key={f.id} className="text-xs p-2 rounded-lg border border-border hover:border-sky-500/40 transition-colors">
                  <p className="font-medium text-foreground truncate">{f.titre}</p>
                  <p className="text-muted-foreground truncate">{f.entreprise ?? 'Prospect'}</p>
                  <p className="text-muted-foreground mt-0.5">
                    <Calendar className="w-3 h-3 inline mr-1" />
                    {formatDate(f.date_prevue)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Employés */}
      {canManageAll && stats.by_owner.length > 0 && (
        <div className="card-premium p-5">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-bold text-foreground">Performances par employé</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground border-b border-border">
                  <th className="px-3 py-2">Employé</th>
                  <th className="px-3 py-2">Prospects</th>
                  <th className="px-3 py-2">Conversions</th>
                  <th className="px-3 py-2">Taux</th>
                </tr>
              </thead>
              <tbody>
                {stats.by_owner.map((o, i) => {
                  const rate = o.total > 0 ? (o.conversions / o.total * 100).toFixed(1) : '0'
                  return (
                    <motion.tr
                      key={o.user_id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.03 }}
                      className="border-b border-border/50 hover:bg-muted/30"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center text-white text-xs font-bold">
                            {(o.name ?? '?').charAt(0).toUpperCase()}
                          </div>
                          <span className="text-sm text-foreground">{o.name ?? '—'}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-sm text-foreground">{o.total}</td>
                      <td className="px-3 py-2 text-sm text-emerald-600">{o.conversions}</td>
                      <td className="px-3 py-2 text-xs">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600">
                          <ArrowUp className="w-3 h-3" /> {rate}%
                        </span>
                      </td>
                    </motion.tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Activité 30 jours */}
      {stats.by_day.length > 0 && (
        <div className="card-premium p-5">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-4 h-4 text-sky-500" />
            <h3 className="text-sm font-bold text-foreground">Activité 30 derniers jours</h3>
          </div>
          <div className="flex items-end gap-1 h-32">
            {stats.by_day.map(d => {
              const max = Math.max(...stats.by_day.map(x => x.count), 1)
              const height = (d.count / max) * 100
              return (
                <div
                  key={d.jour}
                  className="flex-1 flex flex-col items-center gap-1 group cursor-pointer"
                  title={`${d.jour}: ${d.count} prospects`}
                >
                  <div className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                    {d.count}
                  </div>
                  <div
                    className="w-full bg-sky-500/50 hover:bg-sky-500 rounded-t transition-colors"
                    style={{ height: `${Math.max(height, 4)}%` }}
                  />
                </div>
              )
            })}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-muted-foreground">
            <span>{stats.by_day[0]?.jour}</span>
            <span>{stats.by_day[stats.by_day.length - 1]?.jour}</span>
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({
  label, value, icon: Icon, color, subtitle,
}: {
  label: string; value: number | string; icon: React.ElementType
  color: 'sky' | 'amber' | 'violet' | 'emerald'; subtitle?: string
}) {
  const bg = {
    sky:     'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400',
    amber:   'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    violet:  'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
  }[color]
  return (
    <div className="card-premium p-5 flex items-center gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-2xl font-extrabold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{label}</p>
        {subtitle && <p className="text-[10px] text-muted-foreground opacity-70">{subtitle}</p>}
      </div>
    </div>
  )
}

function StatusBreakdown({ data, total }: { data: { statut: string; count: number }[]; total: number }) {
  const byStatus = new Map(data.map(d => [d.statut, d.count]))
  return (
    <div className="space-y-2">
      {OUTBOUND_STATUS.map(s => {
        const count = byStatus.get(s.id) ?? 0
        const pct = total > 0 ? (count / total * 100) : 0
        if (count === 0) return null
        const accent = statusAccent(s.id)
        return (
          <div key={s.id} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-foreground">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: accent }} />
                {statusLabel(s.id)}
              </span>
              <span className="font-semibold text-foreground">{count} <span className="text-muted-foreground font-normal">({pct.toFixed(0)}%)</span></span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full transition-all"
                style={{ width: `${pct}%`, backgroundColor: accent }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
