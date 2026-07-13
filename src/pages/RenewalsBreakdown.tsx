import { useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ChevronRight, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useClients } from '@/hooks/useClients'
import { parseClientNotes } from '@/lib/clientNotes'

const MONTHS_FR = [
  'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
  'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

const fmt = (n: number) =>
  new Intl.NumberFormat('fr-FR').format(Math.round(n)) + ' MAD'

export default function RenewalsBreakdown() {
  const navigate = useNavigate()
  const { tenantSlug } = useParams<{ tenantSlug: string }>()
  const base = tenantSlug ? `/${tenantSlug}` : ''
  const { data: clients = [], isLoading } = useClients()

  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState<number>(currentYear)

  /* Années disponibles : de la plus ancienne date connue jusqu'à currentYear + 3.
     Permet de voir l'historique passé + projection sur les 3 prochaines années. */
  const availableYears = useMemo(() => {
    let minYear = currentYear
    for (const c of clients) {
      if (c.statut !== 'Actif') continue
      const meta = parseClientNotes(c.notes).meta
      const dateStr = meta.domainExpiry ?? meta.hostingExpiry ?? c.date_debut_contrat
      if (!dateStr) continue
      const y = new Date(dateStr).getFullYear()
      if (!isNaN(y) && y < minYear) minYear = y
    }
    const maxYear = currentYear + 3
    const years: number[] = []
    for (let y = minYear; y <= maxYear; y++) years.push(y)
    return years
  }, [clients, currentYear])

  /* Répartition pour l'année sélectionnée. Un client compte pour cette année
     s'il est Actif ET si sa date de départ (domainExpiry) est ≤ à cette année
     (on considère que les renouvellements se répètent chaque année). */
  const { months, unscheduled } = useMemo(() => {
    const months: Array<{ total: number; clients: Array<{ id: string; nom: string; montant: number; date: string }> }> =
      Array.from({ length: 12 }, () => ({ total: 0, clients: [] }))
    const unscheduled: Array<{ id: string; nom: string; montant: number }> = []
    for (const c of clients) {
      if (c.statut !== 'Actif') continue
      const price = Number(c.prix_renouvellement ?? 0)
      if (!price) continue
      const meta = parseClientNotes(c.notes).meta
      const dateStr = meta.domainExpiry ?? meta.hostingExpiry ?? c.date_debut_contrat
      const d = dateStr ? new Date(dateStr) : null
      if (!d || isNaN(d.getTime())) {
        /* Sans date : uniquement sur l'année en cours (référence par défaut) */
        if (year === currentYear) {
          unscheduled.push({ id: c.id, nom: c.nom, montant: price })
        }
        continue
      }
      /* Renouvellement récurrent : compte uniquement à partir de l'année de départ */
      if (d.getFullYear() > year) continue
      /* Date affichée = jour/mois d'origine mais dans l'année sélectionnée */
      const displayDate = `${year}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      months[d.getMonth()].total += price
      months[d.getMonth()].clients.push({ id: c.id, nom: c.nom, montant: price, date: displayDate })
    }
    return { months, unscheduled }
  }, [clients, year, currentYear])

  const scheduledTotal = months.reduce((s, m) => s + m.total, 0)
  const unscheduledTotal = unscheduled.reduce((s, c) => s + c.montant, 0)
  const grandTotal = scheduledTotal + unscheduledTotal
  const max = Math.max(1, ...months.map(m => m.total))
  const currentMonth = year === currentYear ? new Date().getMonth() : -1
  const [expanded, setExpanded] = useState<number | null>(new Date().getMonth())

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    )
  }

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Breadcrumb + retour + sélecteur d'année */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="secondary" size="sm" onClick={() => navigate(`${base}/clients`)}>
          <ArrowLeft className="w-4 h-4" /> Retour aux clients
        </Button>
        <div className="flex-1" />
        <div className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/40 border border-border">
          {availableYears.map(y => {
            const isActive  = y === year
            const isCurrent = y === currentYear
            const isFuture  = y > currentYear
            return (
              <button
                key={y}
                onClick={() => setYear(y)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-muted-foreground hover:text-foreground hover:bg-background'
                }`}
                title={
                  isCurrent ? 'Année en cours' :
                  isFuture  ? 'Projection future' :
                              'Année passée'
                }
              >
                {y}
                {isCurrent && !isActive && (
                  <span className="ml-1 inline-block w-1.5 h-1.5 rounded-full bg-blue-500" />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Header — bandeau vert avec les chiffres clés */}
      <div className="rounded-2xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white p-6 shadow-lg">
        <h1 className="text-2xl font-bold mb-1">
          Revenus renouvellements — {year}
          {year === currentYear && <span className="ml-2 text-sm font-normal opacity-80">· année en cours</span>}
          {year > currentYear && <span className="ml-2 text-sm font-normal opacity-80">· projection</span>}
          {year < currentYear && <span className="ml-2 text-sm font-normal opacity-80">· historique</span>}
        </h1>
        <p className="text-sm text-emerald-50 mb-4">Répartition mensuelle des paiements domaine + hébergement des clients actifs.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-emerald-100 font-semibold">Total annuel</p>
            <p className="text-2xl font-bold mt-1">{fmt(grandTotal)}</p>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-emerald-100 font-semibold">Moyenne mensuelle</p>
            <p className="text-2xl font-bold mt-1">{fmt(grandTotal / 12)}</p>
          </div>
          <div className="bg-white/15 backdrop-blur-sm rounded-xl p-3">
            <p className="text-[10px] uppercase tracking-wider text-emerald-100 font-semibold">Clients actifs</p>
            <p className="text-2xl font-bold mt-1">
              {months.reduce((s, m) => s + m.clients.length, 0) + unscheduled.length}
            </p>
          </div>
        </div>
      </div>

      {/* À planifier */}
      {unscheduled.length > 0 && (
        <div className="card-premium overflow-hidden border-amber-300 dark:border-amber-500/40 bg-amber-50/60 dark:bg-amber-950/20">
          <div className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-amber-800 dark:text-amber-300">À planifier — dates manquantes</p>
              <p className="text-xs text-amber-700 dark:text-amber-400">
                {unscheduled.length} client{unscheduled.length > 1 ? 's' : ''} actif{unscheduled.length > 1 ? 's' : ''} sans date d'expiration. Ajoute une date pour les répartir sur un mois.
              </p>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-lg font-bold text-amber-700 dark:text-amber-300">{fmt(unscheduledTotal)}</p>
              <p className="text-[10px] text-amber-600 dark:text-amber-400/80">non répartis</p>
            </div>
          </div>
          <div className="border-t border-amber-200 dark:border-amber-800/40 bg-white/60 dark:bg-slate-950/30 p-2 space-y-0.5">
            {unscheduled
              .sort((a, b) => b.montant - a.montant)
              .map(c => (
                <button
                  key={c.id}
                  onClick={() => navigate(`${base}/clients/${c.id}`)}
                  className="w-full flex items-center justify-between text-xs py-1.5 px-3 rounded-lg hover:bg-amber-100/60 dark:hover:bg-amber-900/20 transition-colors group"
                >
                  <span className="truncate flex-1 text-left text-slate-800 dark:text-slate-200 font-medium group-hover:text-amber-800 dark:group-hover:text-amber-300">
                    {c.nom}
                  </span>
                  <span className="font-semibold text-amber-700 dark:text-amber-400 min-w-[90px] text-right">{fmt(c.montant)}</span>
                </button>
              ))}
          </div>
        </div>
      )}

      {/* 12 mois */}
      <div className="card-premium overflow-hidden">
        <div className="p-4 border-b border-border bg-muted/30">
          <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Répartition mensuelle</h2>
        </div>
        <div className="divide-y divide-border">
          {months.map((m, i) => {
            const pct = max > 0 ? (m.total / max) * 100 : 0
            const isCurrent = i === currentMonth
            const isOpen = expanded === i
            const hasData = m.clients.length > 0
            return (
              <div key={i} className={isCurrent ? 'bg-blue-50/40 dark:bg-blue-950/10' : ''}>
                <button
                  type="button"
                  onClick={() => hasData && setExpanded(isOpen ? null : i)}
                  disabled={!hasData}
                  className={`w-full flex items-center gap-3 p-4 text-left transition-colors ${
                    hasData ? 'cursor-pointer hover:bg-muted/30' : 'cursor-default opacity-70'
                  }`}
                >
                  <div className="min-w-[130px]">
                    <div className={`text-base font-bold ${isCurrent ? 'text-blue-700 dark:text-blue-300' : 'text-foreground'}`}>
                      {MONTHS_FR[i]}
                    </div>
                    {isCurrent && (
                      <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                        mois en cours
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex items-center gap-4">
                    <div className="flex-1 h-2.5 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-emerald-400 rounded-full transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="min-w-[140px] text-right">
                      <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                        {m.total ? fmt(m.total) : '—'}
                      </div>
                      {hasData && (
                        <div className="text-[11px] text-muted-foreground">
                          {m.clients.length} client{m.clients.length > 1 ? 's' : ''}
                        </div>
                      )}
                    </div>
                  </div>
                  {hasData && (
                    <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                  )}
                </button>

                {isOpen && hasData && (
                  <div className="border-t border-border bg-muted/20 p-2 space-y-0.5">
                    {m.clients
                      .sort((a, b) => b.montant - a.montant)
                      .map(c => (
                        <button
                          key={c.id}
                          onClick={() => navigate(`${base}/clients/${c.id}`)}
                          className="w-full flex items-center justify-between text-sm py-2 px-3 rounded-lg hover:bg-background transition-colors group"
                        >
                          <span className="truncate flex-1 text-left text-foreground font-medium group-hover:text-emerald-700 dark:group-hover:text-emerald-400">
                            {c.nom}
                          </span>
                          <span className="text-muted-foreground text-xs font-mono mx-3">
                            {new Date(c.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })}
                          </span>
                          <span className="font-semibold text-emerald-600 dark:text-emerald-400 min-w-[100px] text-right">
                            {fmt(c.montant)}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      <p className="text-xs text-muted-foreground text-center">
        Le mois de renouvellement est déterminé par la date d'expiration du domaine (fallback : hébergement puis date de début du contrat).
      </p>
    </div>
  )
}
