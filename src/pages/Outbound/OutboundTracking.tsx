import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  Activity, Eye, MousePointerClick, Reply, AlertTriangle, Send,
  Building2, Loader2, ExternalLink, Clock, Mail,
} from 'lucide-react'
import { useTrackingStats, useTrackingProspectEvents } from '@/hooks/useOutbound'
import { useAuth } from '@/hooks/useAuth'
import { isOutboundManager } from './utils'

export default function OutboundTracking() {
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const { role } = useAuth()
  const canManageAll = isOutboundManager(role)

  const { data, isLoading } = useTrackingStats()
  const [openProspectId, setOpenProspectId] = useState<string | null>(null)
  const { data: events } = useTrackingProspectEvents(openProspectId)

  if (!canManageAll) {
    return (
      <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-5">
        <p className="text-sm text-amber-700 dark:text-amber-400">
          Le tracking email est réservé aux admins et managers.
        </p>
      </div>
    )
  }

  const g = data?.global
  const openRate    = g?.sent    ? Math.round((g.opened  / g.sent)   * 100) : 0
  const clickRate   = g?.opened  ? Math.round((g.clicked / g.opened) * 100) : 0
  const bounceRate  = g?.sent    ? Math.round((g.bounced / g.sent)   * 100) : 0
  const replyRate   = g?.sent    ? Math.round((g.replied / g.sent)   * 100) : 0

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div className="flex-1">
          <h1 className="page-title flex items-center gap-2">
            <Activity className="w-6 h-6 text-emerald-600" />
            Tracking email
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Ouvertures, clics, bounces et réponses — mis à jour toutes les 15 secondes.
            {' '}<Link to={`/${tenantSlug}/outbound/autopilot`} className="text-sky-600 hover:underline">Retour à l'Autopilot</Link>.
          </p>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-muted-foreground text-sm p-8">
          <Loader2 className="w-4 h-4 animate-spin" /> Chargement des statistiques…
        </div>
      )}

      {!isLoading && g && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <Kpi icon={<Send className="w-4 h-4" />}             label="Envoyés" value={g.sent}    color="sky" />
            <Kpi icon={<Eye className="w-4 h-4" />}              label="Ouverts" value={g.opened}  extra={`${openRate}%`}  color="emerald" />
            <Kpi icon={<MousePointerClick className="w-4 h-4" />} label="Clics"  value={g.clicked} extra={`${clickRate}%`} color="violet" />
            <Kpi icon={<Reply className="w-4 h-4" />}            label="Réponses" value={g.replied} extra={`${replyRate}%`} color="blue" />
            <Kpi icon={<AlertTriangle className="w-4 h-4" />}    label="Bounces" value={g.bounced} extra={`${bounceRate}%`} color="red" />
          </div>

          {/* Info encart */}
          <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-4">
            <p className="text-xs text-sky-800 dark:text-sky-300 flex items-start gap-2">
              <Eye className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                <b>Comment ça marche ?</b> Un pixel invisible + des liens signés HMAC sont injectés
                dans chaque email. À l'ouverture, le pixel se charge → open enregistré. Sur un clic,
                l'utilisateur passe par une redirection courte qui logge puis renvoie vers le lien réel.
                <br/><span className="text-sky-600">Note :</span> les clients mail qui bloquent les images (Outlook desktop, mode sombre agressif) ne remontent pas les ouvertures — le taux réel peut être plus élevé.
              </span>
            </p>
          </div>

          {/* Top prospects */}
          <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-4">
            <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4 text-sky-600" /> Prospects engagés
              <span className="text-xs font-normal text-muted-foreground">({data.top_prospects.length})</span>
            </h2>
            {!data.top_prospects.length && (
              <p className="text-xs text-muted-foreground py-8 text-center">
                Aucune ouverture ni clic pour l'instant. Reviens dans quelques minutes après l'envoi.
              </p>
            )}
            <div className="space-y-1">
              {data.top_prospects.map(p => {
                const state =
                  p.email_replied_at    ? 'replied'  :
                  p.email_bounced       ? 'bounced'  :
                  p.email_clicked_at    ? 'clicked'  :
                  p.email_opened_at     ? 'opened'   :
                                          'sent'
                return (
                  <button
                    key={p.id}
                    onClick={() => setOpenProspectId(id => id === p.id ? null : p.id)}
                    className={`w-full text-left rounded-lg px-3 py-2.5 border transition-colors ${
                      openProspectId === p.id
                        ? 'border-sky-500/40 bg-sky-500/5'
                        : 'border-transparent hover:border-border hover:bg-muted/40'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <StateBadge state={state} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{p.entreprise}</p>
                        <p className="text-[11px] text-muted-foreground truncate">
                          {p.ville ?? ''}{p.ville && p.email ? ' · ' : ''}{p.email ?? ''}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-shrink-0">
                        {p.email_opened_count > 0 && (
                          <span className="inline-flex items-center gap-1"><Eye className="w-3 h-3 text-emerald-600" />{p.email_opened_count}</span>
                        )}
                        {p.email_clicked_count > 0 && (
                          <span className="inline-flex items-center gap-1"><MousePointerClick className="w-3 h-3 text-violet-600" />{p.email_clicked_count}</span>
                        )}
                        {p.email_replied_at && (
                          <span className="inline-flex items-center gap-1 text-blue-600"><Reply className="w-3 h-3" /> répondu</span>
                        )}
                        {p.email_bounced && (
                          <span className="inline-flex items-center gap-1 text-red-600"><AlertTriangle className="w-3 h-3" /> bounce</span>
                        )}
                      </div>
                    </div>

                    {/* Timeline détaillée */}
                    {openProspectId === p.id && (
                      <div className="mt-3 ml-1 pl-4 border-l border-border space-y-2">
                        {!events?.length && (
                          <p className="text-[11px] text-muted-foreground py-2">Chargement des événements…</p>
                        )}
                        {events?.map(e => (
                          <div key={e.id} className="flex items-start gap-2 text-xs">
                            <EventIcon type={e.event_type} />
                            <div className="flex-1 min-w-0">
                              <p className="text-foreground font-medium capitalize">{eventLabel(e.event_type)}</p>
                              {e.subject      && <p className="text-muted-foreground text-[10px] truncate">« {e.subject} »</p>}
                              {e.target_url   && (
                                <a href={e.target_url} target="_blank" rel="noreferrer" className="text-sky-600 text-[10px] truncate flex items-center gap-1 hover:underline">
                                  <ExternalLink className="w-2.5 h-2.5" /> {e.target_url}
                                </a>
                              )}
                              {e.bounce_reason && <p className="text-red-600 text-[10px]">{e.bounce_reason}</p>}
                              {e.user_agent   && <p className="text-muted-foreground text-[10px] truncate italic">{e.user_agent}</p>}
                            </div>
                            <span className="text-[10px] text-muted-foreground flex-shrink-0 flex items-center gap-0.5">
                              <Clock className="w-2.5 h-2.5" />
                              {new Date(e.created_at).toLocaleString('fr-FR', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

/* ─── UI helpers ─────────────────────────────────────────────── */

const KPI_COLORS = {
  sky:     'text-sky-600 bg-sky-500/10',
  emerald: 'text-emerald-600 bg-emerald-500/10',
  violet:  'text-violet-600 bg-violet-500/10',
  blue:    'text-blue-600 bg-blue-500/10',
  red:     'text-red-600 bg-red-500/10',
} as const

function Kpi({ icon, label, value, extra, color }: {
  icon: React.ReactNode; label: string; value: number; extra?: string
  color: keyof typeof KPI_COLORS
}) {
  return (
    <div className="rounded-xl border border-border bg-[var(--surface-card)] p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`w-7 h-7 rounded-lg flex items-center justify-center ${KPI_COLORS[color]}`}>{icon}</span>
        <p className="text-[10px] font-semibold text-muted-foreground uppercase">{label}</p>
      </div>
      <p className="text-xl font-bold text-foreground leading-none">{value}</p>
      {extra && <p className="text-[10px] text-muted-foreground mt-1">{extra} taux</p>}
    </div>
  )
}

function StateBadge({ state }: { state: 'sent' | 'opened' | 'clicked' | 'replied' | 'bounced' }) {
  const map = {
    sent:     { icon: Mail,             color: 'bg-sky-500/15 text-sky-600' },
    opened:   { icon: Eye,              color: 'bg-emerald-500/15 text-emerald-600' },
    clicked:  { icon: MousePointerClick, color: 'bg-violet-500/15 text-violet-600' },
    replied:  { icon: Reply,            color: 'bg-blue-500/15 text-blue-600' },
    bounced:  { icon: AlertTriangle,    color: 'bg-red-500/15 text-red-600' },
  }[state]
  const Icon = map.icon
  return (
    <span className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${map.color}`}>
      <Icon className="w-4 h-4" />
    </span>
  )
}

function EventIcon({ type }: { type: TrackingEventType }) {
  const map = {
    sent:    { icon: Send,             color: 'text-sky-600' },
    opened:  { icon: Eye,              color: 'text-emerald-600' },
    clicked: { icon: MousePointerClick, color: 'text-violet-600' },
    replied: { icon: Reply,            color: 'text-blue-600' },
    bounced: { icon: AlertTriangle,    color: 'text-red-600' },
  }[type]
  const Icon = map.icon
  return <Icon className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${map.color}`} />
}

type TrackingEventType = 'sent' | 'opened' | 'clicked' | 'bounced' | 'replied'

function eventLabel(t: TrackingEventType): string {
  return { sent: 'envoyé', opened: 'ouvert', clicked: 'cliqué', bounced: 'bounce', replied: 'répondu' }[t]
}
