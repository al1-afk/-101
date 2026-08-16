/**
 * 7aty — rapport hebdomadaire, schémas et rapport CEO.
 *
 * Un tableau de bord dit ce qui s'est passé ; ce rapport dit QUOI FAIRE.
 * Il se termine donc toujours par les quatre questions du module —
 * qu'est-ce que j'arrête, ce que je délègue, ce que j'augmente, et
 * combien d'heures j'ai récupérées — avec une réponse calculée, jamais
 * une formule creuse.
 */
import { Crown, Lightbulb, CalendarClock, ArrowRight } from 'lucide-react'
import { getCategory, TIME_KINDS } from '@/lib/timeCategories'
import {
  formatMinutes, formatHours, minutesByHour, minutesByDay, SCORE_LEVELS,
  type WeeklyReport, type TimeEntry,
} from '@/lib/timeAnalytics'

/* Catégories qu'on délègue en priorité : nécessaires à l'entreprise,
   mais qui n'ont pas besoin du dirigeant pour être faites. */
const DELEGABLE = ['admin_task', 'deplacement', 'production']
/* Catégories qu'un dirigeant devrait augmenter en premier. */
const GROWABLE  = ['sales', 'strategy', 'management']

export function TimeReport({
  report, weekEntries, now,
}: {
  report: WeeklyReport
  weekEntries: TimeEntry[]
  now: Date
}) {
  const { totals } = report
  const hours = minutesByHour(weekEntries, now)
  const days  = minutesByDay(weekEntries, now)
  const maxHour = Math.max(...hours.map(h => h.total), 1)
  const maxDay  = Math.max(...days.map(d => d.total), 1)

  const toStop = report.topLost[0] ?? null

  const toDelegate = report.usefulByCategory
    .filter(c => DELEGABLE.includes(c.category_key))
    .sort((a, b) => b.minutes - a.minutes)[0] ?? null

  const toGrow = GROWABLE
    .map(key => ({
      category_key: key,
      minutes: report.byCategory.find(c => c.category_key === key)?.minutes ?? 0,
    }))
    .sort((a, b) => a.minutes - b.minutes)[0]

  if (totals.total < 1) {
    return (
      <div className="rounded-2xl border border-dashed border-border p-10 text-center">
        <p className="text-3xl mb-2">📋</p>
        <p className="text-sm font-semibold text-foreground">Pas encore de rapport pour cette semaine</p>
        <p className="text-xs text-muted-foreground mt-1">
          Le rapport se construit tout seul dès que des blocs sont enregistrés.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-5">
      {/* ── Rapport CEO ─────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-violet-200 dark:border-violet-800/50">
        <div className="h-1.5 bg-gradient-to-r from-violet-500 via-blue-500 to-emerald-500" />
        <div className="bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-950/30 dark:to-blue-950/30 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Crown className="w-5 h-5 text-violet-600 dark:text-violet-400" />
            <h3 className="text-base font-extrabold text-slate-900 dark:text-white">🎯 CEO Time Report</h3>
            <span className="text-xs text-muted-foreground">
              {report.weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
              {' → '}
              {new Date(report.weekEnd.getTime() - 86400000).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Temps total"    value={formatMinutes(totals.total)}  color="#334155" />
            <Stat label="Haute valeur"   value={formatMinutes(totals.valeur)} color={TIME_KINDS.valeur.color} />
            <Stat label="Repos planifié" value={formatMinutes(totals.repos)}  color={TIME_KINDS.repos.color} />
            <Stat label="Temps perdu"    value={formatMinutes(totals.perdu)}  color={TIME_KINDS.perdu.color} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-5">
            <div>
              <p className="text-xs font-bold text-rose-700 dark:text-rose-300 mb-2">
                🔴 Les 3 plus grosses pertes
              </p>
              {report.topLost.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucune perte enregistrée. 🟢</p>
              ) : (
                <ol className="space-y-1.5">
                  {report.topLost.map((l, i) => (
                    <li key={l.label} className="flex items-center justify-between text-xs">
                      <span className="text-slate-800 dark:text-slate-200 truncate">
                        {i + 1}. {getCategory(l.category_key).emoji} {l.label}
                        <span className="text-muted-foreground"> ({l.count} bloc{l.count > 1 ? 's' : ''})</span>
                      </span>
                      <strong className="tabular-nums text-rose-700 dark:text-rose-300 shrink-0 ml-2">
                        {formatMinutes(l.minutes)}
                      </strong>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <div>
              <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 mb-2">
                🟢 Le meilleur usage de mon temps
              </p>
              {report.topValue.length === 0 ? (
                <p className="text-xs text-muted-foreground">Aucun temps à haute valeur enregistré.</p>
              ) : (
                <ol className="space-y-1.5">
                  {report.topValue.map((c, i) => (
                    <li key={c.category_key} className="flex items-center justify-between text-xs">
                      <span className="text-slate-800 dark:text-slate-200 truncate">
                        {i + 1}. {getCategory(c.category_key).emoji} {getCategory(c.category_key).label}
                      </span>
                      <strong className="tabular-nums text-emerald-700 dark:text-emerald-300 shrink-0 ml-2">
                        {formatMinutes(c.minutes)}
                      </strong>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          </div>

          {report.decision && (
            <div className="mt-5 rounded-xl border border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-3.5">
              <p className="text-xs font-bold text-amber-900 dark:text-amber-200 mb-1">⚠️ La décision de la semaine</p>
              <p className="text-sm text-amber-900 dark:text-amber-100 leading-relaxed">{report.decision}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Les quatre questions ────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-5">
        <h3 className="text-sm font-bold text-foreground mb-4">
          Est-ce que j'utilise mon temps comme un CEO ?
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <Question
            emoji="🛑" title="Ce que je dois arrêter"
            answer={toStop
              ? `${toStop.label} — ${formatMinutes(toStop.minutes)}`
              : 'Rien de significatif cette semaine.'}
            detail={toStop ? `${formatHours(toStop.minutes * 52)} par an au rythme actuel.` : undefined}
          />
          <Question
            emoji="🤝" title="Ce que je dois déléguer"
            answer={toDelegate
              ? `${getCategory(toDelegate.category_key).label} — ${formatMinutes(toDelegate.minutes)}`
              : 'Rien à déléguer pour l\'instant.'}
            detail={toDelegate ? 'Nécessaire à l\'entreprise, mais pas forcément par toi.' : undefined}
          />
          <Question
            emoji="📈" title="Ce que je dois augmenter"
            answer={`${getCategory(toGrow.category_key).label} — ${formatMinutes(toGrow.minutes)}`}
            detail="La catégorie à haute valeur la plus faible de ta semaine."
          />
          <Question
            emoji="⏱️" title="Heures récupérées"
            answer={report.recoveredMin > 0
              ? `+${formatMinutes(report.recoveredMin)}`
              : report.recoveredMin < 0
                ? `−${formatMinutes(-report.recoveredMin)}`
                : '—'}
            detail={report.previous.total > 0
              ? 'De temps perdu en moins (ou en plus) qu\'à la semaine précédente.'
              : 'Pas de semaine précédente à comparer.'}
            good={report.recoveredMin > 0}
            bad={report.recoveredMin < 0}
          />
        </div>
      </div>

      {/* ── Rapport des distractions ────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-5">
        <h3 className="text-sm font-bold text-foreground mb-3">📋 Rapport des distractions</h3>

        <div className="space-y-2 text-sm">
          <Line label="Temps total perdu cette semaine"
                value={formatMinutes(totals.perdu)} strong color={TIME_KINDS.perdu.color} />
          <Line label="Distraction Score"
                value={`${report.score.score}/100 — ${SCORE_LEVELS[report.score.level].label}`}
                color={SCORE_LEVELS[report.score.level].color} />
          {totals.perdu > 0 && (
            <Line label="Au même rythme, sur un an (× 52 semaines)"
                  value={formatHours(report.yearlyLostHours * 60)} strong />
          )}
        </div>

        {report.topLostLabel && report.monthlyGainIfHalved > 0 && (
          <div className="mt-4 rounded-xl border border-emerald-300 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-950/20 p-3.5 flex items-start gap-2.5">
            <Lightbulb className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-sm text-emerald-900 dark:text-emerald-100 leading-relaxed">
              Si tu réduis « {report.topLostLabel} » de 50 %, tu récupères{' '}
              <strong>{formatHours(report.monthlyGainIfHalved * 60)} par mois</strong> —
              soit {formatHours(report.monthlyGainIfHalved * 12 * 60)} par an.
            </p>
          </div>
        )}
      </div>

      {/* ── Schémas détectés ────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-5">
        <h3 className="text-sm font-bold text-foreground mb-3">🔍 Ce que révèlent tes semaines</h3>
        {report.patterns.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Pas encore assez de matière pour dégager un schéma. Continue d'enregistrer :
            les tendances apparaissent au bout de quelques jours.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {report.patterns.map(p => (
              <li
                key={p.key}
                className={`flex items-start gap-2.5 text-sm rounded-xl px-3 py-2.5 border ${
                  p.severity === 'warn'
                    ? 'border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 text-amber-900 dark:text-amber-100'
                    : 'border-border bg-muted/40 text-foreground'
                }`}
              >
                <span className="shrink-0">{p.emoji}</span>
                <span className="leading-relaxed">{p.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Quand ? ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground">Par jour</h3>
          </div>
          <div className="space-y-2">
            {days.map(d => (
              <div key={d.day} className="flex items-center gap-2">
                <span className="text-[11px] text-muted-foreground w-16 shrink-0">{d.label.slice(0, 3)}</span>
                <div className="flex-1 h-4 rounded-md bg-muted overflow-hidden flex">
                  <div style={{ width: `${(d.valeur / maxDay) * 100}%`, backgroundColor: TIME_KINDS.valeur.color }} />
                  <div style={{ width: `${((d.total - d.valeur - d.lost) / maxDay) * 100}%`, backgroundColor: TIME_KINDS.repos.color }} />
                  <div style={{ width: `${(d.lost / maxDay) * 100}%`, backgroundColor: TIME_KINDS.perdu.color }} />
                </div>
                <span className="text-[11px] tabular-nums text-muted-foreground w-14 text-right shrink-0">
                  {formatMinutes(d.total)}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-5">
          <div className="flex items-center gap-2 mb-4">
            <CalendarClock className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-bold text-foreground">Par heure de la journée</h3>
          </div>
          <div className="flex items-end gap-[3px] h-32">
            {hours.map(h => (
              <div key={h.hour} className="flex-1 flex flex-col justify-end h-full group relative">
                <div
                  className="w-full rounded-t-sm"
                  style={{ height: `${((h.total - h.lost) / maxHour) * 100}%`, backgroundColor: '#94A3B8' }}
                />
                <div
                  className="w-full rounded-t-sm"
                  style={{ height: `${(h.lost / maxHour) * 100}%`, backgroundColor: TIME_KINDS.perdu.color }}
                />
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[9px] text-muted-foreground">
                  {h.hour % 6 === 0 ? h.hour : ''}
                </span>
                <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-1 hidden group-hover:block whitespace-nowrap rounded-md bg-slate-900 text-white text-[10px] px-1.5 py-0.5 z-10">
                  {String(h.hour).padStart(2, '0')}h — {formatMinutes(h.total)}
                  {h.lost > 0 && ` (dont ${formatMinutes(h.lost)} perdu)`}
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-7 flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ backgroundColor: TIME_KINDS.perdu.color }} />
            Temps perdu
            <ArrowRight className="w-3 h-3" />
            repère l'heure où tu décroches.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ── Petits blocs ────────────────────────────────────────────────── */

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-xl bg-white/70 dark:bg-slate-900/40 px-3 py-2.5 border border-white/60 dark:border-white/5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-lg font-extrabold tabular-nums mt-0.5" style={{ color }}>{value}</p>
    </div>
  )
}

function Question({
  emoji, title, answer, detail, good, bad,
}: {
  emoji: string
  title: string
  answer: string
  detail?: string
  good?: boolean
  bad?: boolean
}) {
  return (
    <div className="rounded-xl border border-border bg-muted/30 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {emoji} {title}
      </p>
      <p className={`text-sm font-bold mt-1.5 ${
        good ? 'text-emerald-600 dark:text-emerald-400'
        : bad ? 'text-rose-600 dark:text-rose-400'
        : 'text-foreground'
      }`}>
        {answer}
      </p>
      {detail && <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{detail}</p>}
    </div>
  )
}

function Line({
  label, value, strong, color,
}: {
  label: string
  value: string
  strong?: boolean
  color?: string
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 border-b border-border last:border-0">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span
        className={`tabular-nums shrink-0 ${strong ? 'font-bold' : 'font-semibold'}`}
        style={color ? { color } : undefined}
      >
        {value}
      </span>
    </div>
  )
}
