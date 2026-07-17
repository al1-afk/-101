import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Bot, PlayCircle, Loader2, CheckCircle2, AlertCircle, XCircle,
  Mail, MessageCircle, Users2, Search, MapPin, Building2, Settings,
  Eye, MousePointerClick, Reply, Activity,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  useAutopilotRuns, useAutopilotRun, useRunAutopilotNow,
} from '@/hooks/useOutbound'

export default function OutboundAutopilotMonitor() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const { data: runs = [], isLoading } = useAutopilotRuns(30)
  const runNow = useRunAutopilotNow()

  const [selectedId, setSelectedId] = useState<string | null>(null)
  /* Auto-sélectionne le run le plus récent (généralement celui en cours). */
  const focusId = selectedId ?? runs[0]?.id ?? null
  const { data: focus } = useAutopilotRun(focusId)

  const running = runs.find(r => r.status === 'running')

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div className="flex-1">
          <h1 className="page-title flex items-center gap-2">
            <Bot className="w-6 h-6 text-violet-600" />
            Autopilot Monitor
            {running && (
              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 border border-emerald-500/30">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Run en cours
              </span>
            )}
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Historique + flux temps réel des runs Autopilot.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link to={`/${tenantSlug}/outbound/tracking`}>
            <Button variant="secondary" size="sm">
              <Activity className="w-3.5 h-3.5" /> Tracking
            </Button>
          </Link>
          <Link to={`/${tenantSlug}/outbound/autopilot`}>
            <Button variant="secondary" size="sm">
              <Settings className="w-3.5 h-3.5" /> Configuration
            </Button>
          </Link>
          <Button size="sm" onClick={() => runNow.mutate()} disabled={runNow.isPending || !!running}>
            {runNow.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
            Lancer maintenant
          </Button>
        </div>
      </div>

      {/* KPI cumulés (dernier run visible) */}
      {focus && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Kpi icon={<Search className="w-4 h-4" />}   label="Recherches"    value={focus.searches_done} color="sky" />
          <Kpi icon={<Building2 className="w-4 h-4" />} label="Places trouvées" value={focus.places_found} color="violet" />
          <Kpi icon={<Users2 className="w-4 h-4" />}    label="Prospects créés" value={focus.prospects_created} color="emerald" />
          <Kpi icon={<Mail className="w-4 h-4" />}      label="Emails envoyés"  value={focus.emails_sent} extra={focus.emails_failed ? `${focus.emails_failed} échecs` : undefined} color="blue" />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Liste runs */}
        <div className="lg:col-span-1 rounded-2xl border border-border bg-[var(--surface-card)] p-3 space-y-1 max-h-[70vh] overflow-auto">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase px-2 py-1.5">Runs récents</h3>
          {isLoading && (
            <p className="text-xs text-muted-foreground px-2 py-4">Chargement…</p>
          )}
          {!isLoading && !runs.length && (
            <div className="text-center py-8 space-y-1">
              <Bot className="w-8 h-8 text-muted-foreground mx-auto" />
              <p className="text-xs text-muted-foreground">Aucun run pour l'instant.</p>
              <Link to={`/${tenantSlug}/outbound/autopilot`}
                className="inline-block text-xs text-sky-600 hover:underline mt-1">
                Configurer l'Autopilot
              </Link>
            </div>
          )}
          {runs.map(r => (
            <button
              key={r.id}
              onClick={() => setSelectedId(r.id)}
              className={`w-full text-left rounded-lg px-2.5 py-2 border transition-colors ${
                focusId === r.id
                  ? 'border-sky-500/40 bg-sky-500/5'
                  : 'border-transparent hover:border-border hover:bg-muted/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <StatusIcon status={r.status} />
                <p className="text-xs font-semibold text-foreground truncate flex-1">
                  {r.keyword ?? 'Sans mot-clé'}
                </p>
                <span className="text-[10px] text-muted-foreground">
                  {formatShort(r.started_at)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                <span className="inline-flex items-center gap-0.5"><MapPin className="w-2.5 h-2.5" />{r.cities?.length ?? 0}</span>
                <span className="inline-flex items-center gap-0.5"><Users2 className="w-2.5 h-2.5" />{r.prospects_created}</span>
                <span className="inline-flex items-center gap-0.5"><Mail className="w-2.5 h-2.5" />{r.emails_sent}</span>
                <span className="inline-flex items-center gap-0.5"><MessageCircle className="w-2.5 h-2.5" />{r.whatsapp_sent}</span>
              </div>
            </button>
          ))}
        </div>

        {/* Détail (logs) */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-[var(--surface-card)] p-4">
          {!focus && (
            <p className="text-sm text-muted-foreground text-center py-12">
              Sélectionne un run pour voir les détails.
            </p>
          )}
          {focus && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <StatusIcon status={focus.status} />
                  <p className="text-sm font-bold">
                    {focus.keyword ?? 'Sans mot-clé'}
                  </p>
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(focus.started_at).toLocaleString('fr-FR')}
                  </span>
                </div>
                <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${statusColor(focus.status)}`}>
                  {focus.status}
                </span>
              </div>

              {focus.error_message && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/5 p-3 mb-3">
                  <p className="text-xs text-red-600 flex items-start gap-2">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                    {focus.error_message}
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <MiniKpi label="Recherches"  value={focus.searches_done} />
                <MiniKpi label="Places"      value={focus.places_found} />
                <MiniKpi label="Créés"       value={focus.prospects_created} />
                <MiniKpi label="Ignorés"     value={focus.prospects_skipped} />
                <MiniKpi label="Emails ✓"    value={focus.emails_sent}   variant="ok" />
                <MiniKpi label="Emails ✗"    value={focus.emails_failed} variant={focus.emails_failed ? 'err' : undefined} />
                <MiniKpi label="WA ✓"        value={focus.whatsapp_sent}   variant="ok" />
                <MiniKpi label="WA ✗"        value={focus.whatsapp_failed} variant={focus.whatsapp_failed ? 'err' : undefined} />
              </div>

              {/* Tracking KPIs (migration 072) */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
                <TrackingMiniKpi icon={<Eye className="w-3.5 h-3.5" />}              label="Ouverts"   value={focus.emails_opened ?? 0}  base={focus.emails_sent} color="emerald" />
                <TrackingMiniKpi icon={<MousePointerClick className="w-3.5 h-3.5" />} label="Clics"     value={focus.emails_clicked ?? 0} base={focus.emails_opened ?? 0} color="violet" />
                <TrackingMiniKpi icon={<Reply className="w-3.5 h-3.5" />}             label="Réponses"  value={focus.emails_replied ?? 0} base={focus.emails_sent} color="blue" />
                <TrackingMiniKpi icon={<AlertCircle className="w-3.5 h-3.5" />}       label="Bounces"   value={focus.emails_bounced ?? 0} base={focus.emails_sent} color="red" />
              </div>

              <h4 className="text-xs font-semibold text-muted-foreground uppercase mb-2">Flux d'événements</h4>
              <div className="rounded-lg bg-black/90 dark:bg-black/60 text-slate-100 font-mono text-[11px] p-3 max-h-[50vh] overflow-auto space-y-0.5">
                {(focus.logs ?? []).length === 0 && (
                  <p className="text-slate-500 italic">Aucun événement pour l'instant.</p>
                )}
                {(focus.logs ?? []).map((l, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-slate-500">{new Date(l.ts).toLocaleTimeString('fr-FR')}</span>
                    <span className={
                      l.level === 'error' ? 'text-red-400' :
                      l.level === 'warn'  ? 'text-amber-300' :
                                            'text-emerald-300'
                    }>[{l.level}]</span>
                    <span className="flex-1">{l.msg}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── UI helpers ───────────────────────────────────────────────── */

const KPI_COLORS = {
  sky:     'text-sky-600 bg-sky-500/10',
  violet:  'text-violet-600 bg-violet-500/10',
  emerald: 'text-emerald-600 bg-emerald-500/10',
  blue:    'text-blue-600 bg-blue-500/10',
} as const

function Kpi({ icon, label, value, extra, color }: {
  icon: React.ReactNode; label: string; value: number; extra?: string
  color: keyof typeof KPI_COLORS
}) {
  return (
    <div className="rounded-xl border border-border bg-[var(--surface-card)] p-3">
      <div className="flex items-center gap-2">
        <span className={`w-8 h-8 rounded-lg flex items-center justify-center ${KPI_COLORS[color]}`}>
          {icon}
        </span>
        <div>
          <p className="text-xl font-bold text-foreground leading-none">{value}</p>
          <p className="text-[10px] text-muted-foreground uppercase font-semibold mt-1">{label}</p>
        </div>
      </div>
      {extra && <p className="text-[10px] text-red-600 mt-1.5">{extra}</p>}
    </div>
  )
}

function MiniKpi({ label, value, variant }: { label: string; value: number; variant?: 'ok' | 'err' }) {
  const color = variant === 'ok'  ? 'text-emerald-600' :
                variant === 'err' ? 'text-red-600'     :
                                    'text-foreground'
  return (
    <div className="rounded-lg border border-border p-2 text-center">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-muted-foreground uppercase">{label}</p>
    </div>
  )
}

function TrackingMiniKpi({ icon, label, value, base, color }: {
  icon: React.ReactNode; label: string; value: number; base: number
  color: 'emerald' | 'violet' | 'blue' | 'red'
}) {
  const rate = base > 0 ? Math.round((value / base) * 100) : 0
  const colorMap = {
    emerald: 'text-emerald-600 bg-emerald-500/10 border-emerald-500/20',
    violet:  'text-violet-600 bg-violet-500/10 border-violet-500/20',
    blue:    'text-blue-600 bg-blue-500/10 border-blue-500/20',
    red:     'text-red-600 bg-red-500/10 border-red-500/20',
  }
  return (
    <div className={`rounded-lg border p-2 text-center ${colorMap[color]}`}>
      <div className="flex items-center justify-center gap-1 mb-0.5">
        {icon}
        <p className="text-lg font-bold">{value}</p>
      </div>
      <p className="text-[10px] uppercase font-semibold opacity-80">{label} {base > 0 && <span className="font-normal">· {rate}%</span>}</p>
    </div>
  )
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'running') return <Loader2 className="w-3.5 h-3.5 text-sky-500 animate-spin" />
  if (status === 'ok')      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
  if (status === 'partial') return <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
  if (status === 'error')   return <XCircle className="w-3.5 h-3.5 text-red-600" />
  return <XCircle className="w-3.5 h-3.5 text-slate-400" />
}

function statusColor(status: string): string {
  if (status === 'running') return 'bg-sky-500/15 text-sky-600'
  if (status === 'ok')      return 'bg-emerald-500/15 text-emerald-600'
  if (status === 'partial') return 'bg-amber-500/15 text-amber-600'
  if (status === 'error')   return 'bg-red-500/15 text-red-600'
  return 'bg-slate-500/15 text-slate-500'
}

function formatShort(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const sameDay = d.toDateString() === today.toDateString()
  if (sameDay) return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}
