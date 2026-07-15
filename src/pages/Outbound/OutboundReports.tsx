import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { Loader2, FileDown, Users2, Target, TrendingUp, CheckCircle2, Building2, Award } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/utils'
import { useOutboundStats, useOutboundProspects, useOutboundTeam } from '@/hooks/useOutbound'
import { OUTBOUND_STATUS } from '@/lib/outboundApi'
import { statusAccent, statusLabel, isOutboundManager } from './utils'
import { useAuth } from '@/hooks/useAuth'

export default function OutboundReports() {
  const { role } = useAuth()
  const canManageAll = isOutboundManager(role)

  const { data: stats, isLoading: statsL } = useOutboundStats()
  const { data: prospects = [], isLoading: prosL } = useOutboundProspects({ converted: 'false' })
  const { data: team = [] } = useOutboundTeam()

  const exportCSV = () => {
    const headers = ['Entreprise','Contact','Fonction','Email','Téléphone','WhatsApp','Ville','Statut','Priorité','Valeur','Source','Créé le']
    const rows = prospects.map(p => [
      p.entreprise,
      [p.prenom_contact, p.nom_contact].filter(Boolean).join(' '),
      p.fonction ?? '',
      p.email ?? '',
      p.telephone ?? '',
      p.whatsapp ?? '',
      p.ville ?? '',
      p.statut,
      p.priorite,
      String(p.valeur_potentielle ?? 0),
      p.source_libre ?? '',
      formatDate(p.created_at),
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
    const csv = [headers.join(','), ...rows].join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `outbound_prospects_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (statsL || prosL || !stats) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Rapports Outbound</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Analyse de la performance de prospection sortante
          </p>
        </div>
        <Button size="sm" onClick={exportCSV}>
          <FileDown className="w-4 h-4" /> Exporter CSV
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Kpi icon={Users2} label="Prospects" value={stats.totals.total} color="sky" />
        <Kpi icon={Target} label="À contacter" value={stats.totals.a_contacter} color="amber" />
        <Kpi icon={TrendingUp} label="Pipeline actif" value={stats.totals.pipeline} color="violet" />
        <Kpi icon={CheckCircle2} label="Conversions" value={stats.totals.conversions} color="emerald" />
        <Kpi icon={Building2} label="Valeur pipeline" value={formatCurrency(stats.totals.pipeline_valeur)} color="pink" small />
      </div>

      {/* Répartition */}
      <div className="card-premium p-5">
        <h3 className="text-sm font-bold text-foreground mb-4">Répartition par statut</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {OUTBOUND_STATUS.map(s => {
            const count = stats.by_statut.find(x => x.statut === s.id)?.count ?? 0
            return (
              <div key={s.id} className="p-3 rounded-lg border border-border">
                <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: s.accent }} />
                  {s.label}
                </p>
                <p className="text-2xl font-bold text-foreground mt-1">{count}</p>
              </div>
            )
          })}
        </div>
      </div>

      {/* Classement employés */}
      {canManageAll && stats.by_owner.length > 0 && (
        <div className="card-premium p-5">
          <div className="flex items-center gap-2 mb-4">
            <Award className="w-4 h-4 text-violet-500" />
            <h3 className="text-sm font-bold text-foreground">Classement employés</h3>
          </div>
          <div className="space-y-2">
            {stats.by_owner.slice(0, 10).map((o, i) => {
              const rate = o.total > 0 ? (o.conversions / o.total * 100).toFixed(1) : '0'
              return (
                <motion.div
                  key={o.user_id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="flex items-center gap-3 p-3 rounded-lg border border-border"
                >
                  <span className={`text-lg font-bold ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-slate-400' : i === 2 ? 'text-orange-500' : 'text-muted-foreground'}`}>
                    #{i + 1}
                  </span>
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center text-white text-sm font-bold">
                    {(o.name ?? '?').charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{o.name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground">{o.total} prospects · {o.conversions} conversions ({rate}%)</p>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-foreground">{o.total}</p>
                  </div>
                </motion.div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function Kpi({
  icon: Icon, label, value, color, small = false,
}: {
  icon: React.ElementType; label: string; value: number | string; color: string; small?: boolean
}) {
  const bgMap: Record<string, string> = {
    sky:     'bg-sky-50 dark:bg-sky-900/20 text-sky-600 dark:text-sky-400',
    amber:   'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
    violet:  'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
    pink:    'bg-pink-50 dark:bg-pink-900/20 text-pink-600 dark:text-pink-400',
  }
  const bg = bgMap[color] ?? bgMap.sky
  return (
    <div className="card-premium p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${bg}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className={`${small ? 'text-base' : 'text-xl'} font-extrabold text-foreground`}>{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5 uppercase">{label}</p>
      </div>
    </div>
  )
}
