/**
 * 7aty — « Où va mon temps ? »
 *
 * Module personnel de suivi du temps et des distractions. Il repose sur
 * une SAISIE MANUELLE : rien n'est surveillé, ni le téléphone ni les
 * applications. L'objectif n'est pas de se sentir occupé, c'est de
 * savoir honnêtement où part le temps — et de décider, chaque semaine,
 * ce qu'on arrête, ce qu'on délègue et ce qu'on augmente.
 *
 * Tout l'écran se calcule à partir d'un seul chargement (60 jours de
 * blocs) : changer de semaine ne déclenche aucune requête.
 */
import { useMemo, useState } from 'react'
import {
  Hourglass, ChevronLeft, ChevronRight, Plus, Lock,
  LayoutDashboard, ListChecks, FileBarChart, Target,
} from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { TimerBar } from '@/components/temps/TimerBar'
import { TimeDashboard } from '@/components/temps/TimeDashboard'
import { TimeJournal } from '@/components/temps/TimeJournal'
import { TimeReport } from '@/components/temps/TimeReport'
import { TimeGoalsPanel } from '@/components/temps/TimeGoalsPanel'
import { TimeEntryDialog } from '@/components/temps/TimeEntryDialog'
import {
  useTimeEntries, useRunningEntry, useTimeGoals, useTimeSettings, useNow,
} from '@/hooks/useTimeTracking'
import {
  buildWeeklyReport, startOfWeek, addDays, inRange, goalStatus,
  type TimeEntry,
} from '@/lib/timeAnalytics'

export default function MonTemps() {
  /* Horloge lente : les totaux d'un chronomètre en cours doivent avancer,
     mais pas au prix d'un recalcul complet du rapport chaque seconde.
     La barre de chronomètre a sa propre horloge à la seconde. */
  const now = useNow(30_000)

  const { data: entries = [], isLoading } = useTimeEntries()
  const { data: running = null } = useRunningEntry()
  const { data: goals = [] } = useTimeGoals()
  const { settings } = useTimeSettings()

  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()))
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<TimeEntry | null>(null)
  const [presetCategory, setPresetCategory] = useState<string | undefined>()

  const thisWeek = startOfWeek(now)
  const isCurrentWeek = weekStart.getTime() === thisWeek.getTime()

  const weekEntries = useMemo(
    () => inRange(entries, weekStart, addDays(weekStart, 7)),
    [entries, weekStart]
  )

  const report = useMemo(
    () => buildWeeklyReport(entries, goals, settings, weekStart, now),
    [entries, goals, settings, weekStart, now]
  )

  const status = useMemo(() => goalStatus(weekEntries, goals, now), [weekEntries, goals, now])

  const openNew = (category?: string) => {
    setEditing(null)
    setPresetCategory(category)
    setDialogOpen(true)
  }
  const openEdit = (entry: TimeEntry) => {
    setEditing(entry)
    setPresetCategory(undefined)
    setDialogOpen(true)
  }

  return (
    <div className="space-y-5 pb-12">
      {/* ── En-tête ─────────────────────────────────────────────── */}
      <div className="rounded-2xl overflow-hidden border border-amber-200 dark:border-amber-800/50">
        <div className="h-1.5 bg-gradient-to-r from-amber-500 via-rose-500 to-violet-500" />
        <div className="bg-gradient-to-br from-amber-50 to-rose-50 dark:from-amber-950/20 dark:to-rose-950/20 p-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="flex items-start gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center bg-gradient-to-br from-amber-500 to-rose-600 shadow-lg shadow-amber-500/25 shrink-0">
                <Hourglass className="w-6 h-6 text-white" />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <h1 className="text-2xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                    7aty — Où va mon temps ?
                  </h1>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700 inline-flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Personnel
                  </span>
                </div>
                <p className="text-sm text-slate-700 dark:text-slate-300 max-w-2xl leading-relaxed">
                  Savoir honnêtement où part mon temps — pas me sentir occupé.
                  Saisie 100 % manuelle : aucune application n'est surveillée,
                  et personne d'autre ne voit ces blocs.
                </p>
              </div>
            </div>

            <Button onClick={() => openNew()}>
              <Plus className="w-4 h-4" /> Enregistrer une distraction
            </Button>
          </div>
        </div>
      </div>

      {/* ── Chronomètre + Quick Log ─────────────────────────────── */}
      <TimerBar running={running} settings={settings} onOpenEntry={openNew} />

      {/* ── Navigation de semaine ───────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Button
            variant="secondary" size="sm"
            onClick={() => setWeekStart(w => addDays(w, -7))}
            aria-label="Semaine précédente"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <span className="text-sm font-semibold text-foreground px-2 tabular-nums">
            {weekStart.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })}
            {' → '}
            {addDays(weekStart, 6).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
          <Button
            variant="secondary" size="sm"
            disabled={isCurrentWeek}
            onClick={() => setWeekStart(w => addDays(w, 7))}
            aria-label="Semaine suivante"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
          {!isCurrentWeek && (
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(thisWeek)}>
              Cette semaine
            </Button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="h-96 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-900/50" />
      ) : (
        <Tabs defaultValue="dashboard">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="dashboard" className="gap-1.5">
              <LayoutDashboard className="w-4 h-4" /> Où va mon temps
            </TabsTrigger>
            <TabsTrigger value="journal" className="gap-1.5">
              <ListChecks className="w-4 h-4" /> Journal
              <span className="ml-1 text-[10px] text-muted-foreground">({weekEntries.length})</span>
            </TabsTrigger>
            <TabsTrigger value="report" className="gap-1.5">
              <FileBarChart className="w-4 h-4" /> Rapport CEO
            </TabsTrigger>
            <TabsTrigger value="goals" className="gap-1.5">
              <Target className="w-4 h-4" /> Objectifs
            </TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <TimeDashboard report={report} settings={settings} />
          </TabsContent>

          <TabsContent value="journal">
            <TimeJournal entries={weekEntries} now={now} onEdit={openEdit} />
          </TabsContent>

          <TabsContent value="report">
            <TimeReport report={report} weekEntries={weekEntries} now={now} />
          </TabsContent>

          <TabsContent value="goals">
            <TimeGoalsPanel goals={goals} status={status} settings={settings} />
          </TabsContent>
        </Tabs>
      )}

      <TimeEntryDialog
        open={dialogOpen}
        entry={editing}
        presetCategory={presetCategory}
        onClose={() => setDialogOpen(false)}
      />
    </div>
  )
}
