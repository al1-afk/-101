/**
 * 7aty — « 📊 Où va mon temps ? »
 *
 * L'écran répond à une seule question, dans cet ordre : combien de temps
 * ai-je suivi, comment se répartit-il entre haute valeur / neutre /
 * repos assumé / temps perdu, et où part précisément ce qui est perdu.
 *
 * Aucun chiffre n'est affiché sans son dénominateur : un « 3h25 sur
 * Instagram » ne veut rien dire tant qu'on ne sait pas si la semaine
 * suivie fait 12 h ou 60 h.
 */
import { TrendingUp, Target } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getCategory, TIME_KINDS, type TimeKind } from '@/lib/timeCategories'
import {
  formatMinutes, SCORE_LEVELS,
  type WeeklyReport, type TimeSettings, type KindTotals,
} from '@/lib/timeAnalytics'

export function TimeDashboard({
  report, settings,
}: {
  report: WeeklyReport
  settings: TimeSettings
}) {
  const { totals, previous } = report
  const nothing = totals.total < 1

  return (
    <div className="space-y-5">
      {/* ── Les quatre chiffres de la semaine ────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Kpi
          label="Temps total suivi" emoji="⏱️" value={formatMinutes(totals.total)}
          delta={delta(totals.total, previous.total)} color="#334155"
        />
        <Kpi
          label="Haute valeur" emoji="💰" value={formatMinutes(totals.valeur)}
          delta={delta(totals.valeur, previous.valeur)} color={TIME_KINDS.valeur.color}
          sub={totals.total > 0 ? `${Math.round(report.highValueShare * 100)} % du temps suivi` : undefined}
        />
        <Kpi
          label="Temps neutre" emoji="🟡" value={formatMinutes(totals.neutre)}
          delta={delta(totals.neutre, previous.neutre)} color={TIME_KINDS.neutre.color}
        />
        <Kpi
          label="Repos planifié" emoji="🟢" value={formatMinutes(totals.repos)}
          delta={delta(totals.repos, previous.repos)} color={TIME_KINDS.repos.color}
          sub="Assumé — jamais compté comme perdu"
        />
        <Kpi
          label="Temps perdu" emoji="🔴" value={formatMinutes(totals.perdu)}
          delta={delta(totals.perdu, previous.perdu)} invertDelta color={TIME_KINDS.perdu.color}
        />
      </div>

      {/* Un plafond dépassé se dit tout de suite, chiffré : c'est le
          seul rappel que le module se permet en dehors de l'alerte. */}
      {report.goals.filter(g => g.over > 0).map(g => (
        <div
          key={g.category_key}
          className="rounded-xl border border-rose-300 dark:border-rose-800/50 bg-rose-50 dark:bg-rose-950/20 px-4 py-2.5 text-sm text-rose-900 dark:text-rose-100"
        >
          ⚠️ Objectif hebdomadaire dépassé — <strong>{getCategory(g.category_key).label}</strong> :
          {' '}{formatMinutes(g.spent)} consommés sur {formatMinutes(g.max)}, soit{' '}
          <strong>{formatMinutes(g.over)} de trop</strong>.
        </div>
      ))}

      {nothing ? (
        <EmptyWeek />
      ) : (
        <>
          {/* ── Répartition + Score ────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 rounded-2xl border border-border bg-[var(--surface-card)] p-5">
              <h3 className="text-sm font-bold text-foreground mb-3">Répartition de la semaine</h3>
              <KindBar totals={totals} />

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-4">
                {(Object.keys(TIME_KINDS) as TimeKind[]).map(k => (
                  <div key={k} className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ backgroundColor: TIME_KINDS[k].color }} />
                    <span className="text-xs text-muted-foreground truncate">
                      {TIME_KINDS[k].short} — <strong className="text-foreground">
                        {totals.total > 0 ? Math.round((totals[k] / totals.total) * 100) : 0} %
                      </strong>
                    </span>
                  </div>
                ))}
              </div>

              {/* Objectif d'heures à haute valeur */}
              <div className="mt-5 pt-4 border-t border-border">
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="flex items-center gap-1.5 font-semibold text-foreground">
                    <Target className="w-3.5 h-3.5" />
                    Objectif haute valeur — {settings.weekly_high_value_hours} h/semaine
                  </span>
                  <span className="text-muted-foreground">
                    {formatMinutes(totals.valeur)} / {settings.weekly_high_value_hours} h
                  </span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${Math.min(100, report.highValueGoalRatio * 100)}%`,
                      backgroundColor: TIME_KINDS.valeur.color,
                    }}
                  />
                </div>
              </div>
            </div>

            <ScoreCard report={report} />
          </div>

          {/* ── Où part le temps perdu ─────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <CategoryBreakdown
              title="Où part mon temps perdu"
              emptyText="Aucun temps perdu enregistré cette semaine."
              rows={report.lostByCategory.map(c => ({ key: c.category_key, minutes: c.minutes }))}
              total={totals.perdu}
            />
            <CategoryBreakdown
              title="Où part mon temps utile"
              emptyText="Aucun temps de travail enregistré cette semaine."
              rows={report.usefulByCategory.map(c => ({ key: c.category_key, minutes: c.minutes }))}
              total={totals.valeur + totals.neutre}
            />
          </div>

          {/* ── Tableau de comparaison (§5 du cahier des charges) ──── */}
          <ComparisonTable report={report} />
        </>
      )}
    </div>
  )
}

/* ── Blocs ───────────────────────────────────────────────────────── */

function delta(current: number, prev: number): number | null {
  if (prev <= 0) return null
  return current - prev
}

function Kpi({
  label, emoji, value, sub, delta: d, color, invertDelta,
}: {
  label: string
  emoji: string
  value: string
  sub?: string
  delta: number | null
  color: string
  invertDelta?: boolean
}) {
  /* Sur le temps perdu, « en baisse » est une bonne nouvelle : la
     couleur de la variation est inversée pour ne pas lire un -2 h comme
     un recul. */
  const good = d === null ? null : invertDelta ? d < 0 : d > 0
  return (
    <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-4">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {emoji} {label}
      </p>
      <p className="text-xl font-extrabold mt-1.5 tabular-nums" style={{ color }}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground mt-1">{sub}</p>}
      {d !== null && Math.abs(d) >= 1 && (
        <p className={cn(
          'text-[11px] mt-1 font-medium',
          good ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400',
        )}>
          {d > 0 ? '+' : '−'}{formatMinutes(Math.abs(d))} vs semaine dernière
        </p>
      )}
    </div>
  )
}

function KindBar({ totals }: { totals: KindTotals }) {
  const kinds: TimeKind[] = ['valeur', 'neutre', 'repos', 'perdu']
  return (
    <div className="flex h-8 rounded-xl overflow-hidden bg-muted">
      {kinds.map(k => {
        const pct = totals.total > 0 ? (totals[k] / totals.total) * 100 : 0
        if (pct <= 0) return null
        return (
          <div
            key={k}
            className="h-full flex items-center justify-center text-[10px] font-bold text-white transition-all"
            style={{ width: `${pct}%`, backgroundColor: TIME_KINDS[k].color }}
            title={`${TIME_KINDS[k].label} — ${formatMinutes(totals[k])}`}
          >
            {pct >= 8 && `${Math.round(pct)}%`}
          </div>
        )
      })}
    </div>
  )
}

function ScoreCard({ report }: { report: WeeklyReport }) {
  const { score } = report
  const meta = SCORE_LEVELS[score.level]
  /* Jauge circulaire : 2πr avec r = 52 → 326,7 de circonférence. */
  const R = 52
  const C = 2 * Math.PI * R
  const filled = (score.score / 100) * C

  return (
    <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-5 flex flex-col items-center text-center">
      <h3 className="text-sm font-bold text-foreground self-start mb-2">🔴 Distraction Score</h3>

      <div className="relative w-32 h-32">
        <svg viewBox="0 0 120 120" className="w-32 h-32 -rotate-90">
          <circle cx="60" cy="60" r={R} fill="none" strokeWidth="12" className="stroke-muted" />
          <circle
            cx="60" cy="60" r={R} fill="none" strokeWidth="12" strokeLinecap="round"
            stroke={meta.color}
            strokeDasharray={`${filled} ${C - filled}`}
          />
        </svg>
        <p
          className="absolute inset-0 flex items-center justify-center gap-0.5 text-3xl font-extrabold tabular-nums"
          style={{ color: meta.color }}
        >
          {score.score}
          <span className="text-base text-muted-foreground font-semibold">/100</span>
        </p>
      </div>

      <p className="text-sm font-bold" style={{ color: meta.color }}>{meta.emoji} {meta.label}</p>
      <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">{meta.message}</p>

      <details className="mt-3 text-left w-full">
        <summary className="text-[11px] text-muted-foreground cursor-pointer hover:text-foreground">
          Comment est-il calculé ?
        </summary>
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">
          {formatMinutes(score.lostMin)} perdus sur {formatMinutes(score.trackedMin)} suivis
          → <strong>{Math.round(score.base)}</strong> points (les blocs « perte de contrôle » pèsent 25 % de plus).
          {score.penalty > 0 && <> + <strong>{score.penalty}</strong> points pour {score.exceededGoals.length} objectif
            {score.exceededGoals.length > 1 ? 's' : ''} hebdomadaire{score.exceededGoals.length > 1 ? 's' : ''} dépassé
            {score.exceededGoals.length > 1 ? 's' : ''}.</>}
        </p>
      </details>
    </div>
  )
}

function CategoryBreakdown({
  title, rows, total, emptyText,
}: {
  title: string
  rows: { key: string; minutes: number }[]
  total: number
  emptyText: string
}) {
  return (
    <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-5">
      <h3 className="text-sm font-bold text-foreground mb-3">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        <div className="space-y-2.5">
          {rows.slice(0, 8).map(r => {
            const cat = getCategory(r.key)
            const pct = total > 0 ? (r.minutes / total) * 100 : 0
            return (
              <div key={r.key}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-foreground font-medium truncate">{cat.emoji} {cat.label}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0 ml-2">
                    {formatMinutes(r.minutes)}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cat.color }} />
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * Le tableau de comparaison : toutes les catégories de la semaine sur
 * une même échelle, la nature en couleur. C'est la vue qui met côte à
 * côte « 8 h de Sales » et « 3 h d'Instagram ».
 */
function ComparisonTable({ report }: { report: WeeklyReport }) {
  const max = Math.max(...report.byCategory.map(c => c.minutes), 1)
  return (
    <div className="rounded-2xl border border-border bg-[var(--surface-card)] overflow-hidden">
      <div className="px-5 py-4 border-b border-border flex items-center gap-2">
        <TrendingUp className="w-4 h-4 text-muted-foreground" />
        <h3 className="text-sm font-bold text-foreground">Comparaison — toutes catégories</h3>
      </div>
      <div className="divide-y divide-border">
        {report.byCategory.map(c => {
          const cat = getCategory(c.category_key)
          return (
            <div key={c.category_key} className="px-5 py-2.5 flex items-center gap-3">
              <span className="text-sm w-6 shrink-0">{cat.emoji}</span>
              <span className="text-sm text-foreground font-medium w-44 shrink-0 truncate">{cat.label}</span>
              <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden min-w-[60px]">
                <div className="h-full rounded-full" style={{ width: `${(c.minutes / max) * 100}%`, backgroundColor: cat.color }} />
              </div>
              <span className="text-sm tabular-nums font-semibold text-foreground w-20 text-right shrink-0">
                {formatMinutes(c.minutes)}
              </span>
              <span className="text-[11px] text-muted-foreground w-12 text-right shrink-0 tabular-nums">
                {Math.round(c.share * 100)} %
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function EmptyWeek() {
  return (
    <div className="rounded-2xl border border-dashed border-border p-10 text-center">
      <p className="text-3xl mb-2">⏱️</p>
      <p className="text-sm font-semibold text-foreground">Aucun bloc enregistré cette semaine</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
        Démarre un chronomètre ou utilise le Quick Log. Le but n'est pas de tout tracer :
        enregistre d'abord ce qui te fait perdre le plus de temps, la semaine parlera d'elle-même.
      </p>
    </div>
  )
}
