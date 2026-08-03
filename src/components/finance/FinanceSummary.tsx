import { Wallet, TrendingUp, TrendingDown, Scale, CalendarClock, CalendarX, Telescope } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { formatDH, type FinanceSummary as Summary } from '@/lib/finance/compute'

/**
 * Synthèse financière — la zone qui répond en un coup d'œil à
 * « combien j'ai » et « combien j'aurai ».
 *
 * La séparation visuelle RÉEL / PRÉVISIONNEL est le point clé : l'argent
 * possédé et l'argent espéré ne doivent jamais se lire dans le même bloc.
 */
function Tile({
  label, value, icon: Icon, tone, hint,
}: {
  label: string
  value: number
  icon: LucideIcon
  tone: 'neutral' | 'success' | 'danger' | 'info' | 'violet' | 'amber'
  hint?: string
}) {
  const tones: Record<string, { text: string; bg: string }> = {
    neutral: { text: 'text-foreground',                     bg: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
    success: { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' },
    danger:  { text: 'text-red-600 dark:text-red-400',      bg: 'bg-red-500/15 text-red-600 dark:text-red-400' },
    info:    { text: 'text-blue-600 dark:text-blue-400',    bg: 'bg-blue-500/15 text-blue-600 dark:text-blue-400' },
    violet:  { text: 'text-violet-600 dark:text-violet-400', bg: 'bg-violet-500/15 text-violet-600 dark:text-violet-400' },
    amber:   { text: 'text-amber-600 dark:text-amber-400',  bg: 'bg-amber-500/15 text-amber-600 dark:text-amber-400' },
  }
  const t = tones[tone]
  return (
    <div className="rounded-xl border border-border bg-background/60 p-3.5">
      <div className="flex items-start justify-between gap-2 mb-2">
        <p className="text-[11px] uppercase tracking-wider text-muted-foreground leading-tight">{label}</p>
        <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${t.bg}`}>
          <Icon className="w-3.5 h-3.5" />
        </div>
      </div>
      {/* Un montant ne se tronque jamais : sur petit écran la taille baisse
          d'un cran et le texte passe à la ligne plutôt que d'être coupé. */}
      <p className={`text-[15px] sm:text-lg lg:text-xl font-extrabold ${t.text} tabular-nums break-words`}>
        {formatDH(value)}
      </p>
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  )
}

export function FinanceSummary({ summary, moisLabel }: { summary: Summary; moisLabel: string }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* ── RÉEL ───────────────────────────────────────────────── */}
      <div className="card-premium p-5 border-l-4 border-l-emerald-500">
        <div className="flex items-center gap-2 mb-3">
          <span className="badge-pill badge-success">Réel</span>
          <h2 className="section-title">Argent que je possède</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Tile
            label="Argent disponible"
            value={summary.disponible}
            icon={Wallet}
            tone="neutral"
            hint="Somme des soldes réels"
          />
          <Tile
            label="Résultat net"
            value={summary.resultatNet}
            icon={Scale}
            tone={summary.resultatNet >= 0 ? 'success' : 'danger'}
            hint={moisLabel}
          />
          <Tile
            label="Revenus encaissés"
            value={summary.revenusMois}
            icon={TrendingUp}
            tone="success"
            hint={moisLabel}
          />
          <Tile
            label="Dépenses payées"
            value={summary.depensesMois}
            icon={TrendingDown}
            tone="danger"
            hint={moisLabel}
          />
        </div>
      </div>

      {/* ── PRÉVISIONNEL ───────────────────────────────────────── */}
      {/* Le liseré gauche en pointillés distingue au premier coup d'œil
          l'argent attendu de l'argent possédé (liseré plein). */}
      <div className="card-premium p-5 border-l-4 border-l-violet-500 [border-left-style:dashed]">
        <div className="flex items-center gap-2 mb-3">
          <span className="badge-pill badge-info">Prévisionnel</span>
          <h2 className="section-title">Argent attendu (pas encore là)</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Tile
            label="Revenus prévus"
            value={summary.revenusPrevus}
            icon={CalendarClock}
            tone="violet"
            hint="Prévisions actives"
          />
          <Tile
            label="Dépenses prévues"
            value={summary.depensesPrevues}
            icon={CalendarX}
            tone="amber"
            hint="Prévisions actives"
          />
          <div className="col-span-2 rounded-xl border border-dashed border-violet-300 dark:border-violet-800 bg-violet-50/50 dark:bg-violet-900/10 p-3.5">
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-[11px] uppercase tracking-wider text-muted-foreground">Solde prévisionnel</p>
              <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center flex-shrink-0">
                <Telescope className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
              </div>
            </div>
            <p className="text-2xl font-extrabold text-violet-700 dark:text-violet-300 tabular-nums break-words">
              {formatDH(summary.soldePrevisionnel)}
            </p>
            {/* La formule est affichée : aucun chiffre magique, tout est vérifiable. */}
            <p className="text-[11px] text-muted-foreground mt-1.5 tabular-nums">
              {formatDH(summary.disponible)} + {formatDH(summary.revenusPrevus)} − {formatDH(summary.depensesPrevues)}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
