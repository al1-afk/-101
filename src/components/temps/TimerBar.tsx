/**
 * 7aty — barre de chronomètre, Quick Log et alerte intelligente.
 *
 * L'enjeu est la VITESSE de saisie : un module de suivi du temps qui
 * demande un formulaire à chaque distraction n'est jamais utilisé. D'où
 * trois gestes seulement :
 *
 *   ▶️  un clic sur une source fréquente → le chronomètre tourne ;
 *   ⏹️  un clic pour arrêter → une seule question, honnête : « c'était
 *       choisi ou subi ? », qui décide repos planifié vs temps perdu ;
 *   ⏱️  « déjà écoulées 15 / 30 / 60 min » pour ce qu'on enregistre après
 *       coup, sans toucher aux heures.
 *
 * L'alerte (« 45 min sur Instagram pendant ton temps de travail ») ne
 * se déclenche que dans les heures déclarées comme travaillées : hors
 * de ces heures, une longue session n'est pas une dérive.
 */
import { useState } from 'react'
import { Play, Square, X, Plus, ChevronDown, AlertTriangle, Timer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import {
  QUICK_LOG, CONTROL_LEVELS, TIME_KINDS, getCategory, suggestKind,
  type ControlLevel,
} from '@/lib/timeCategories'
import {
  entryMinutes, distractionAlert, formatMinutes,
  type TimeEntry, type TimeSettings,
} from '@/lib/timeAnalytics'
import {
  useStartTimer, useStopTimer, useCancelTimer, useCreateTimeEntry, useNow,
} from '@/hooks/useTimeTracking'

/** « 00:47:12 » — le format qui donne envie d'arrêter le chronomètre. */
function formatClock(minutes: number): string {
  const total = Math.max(0, Math.floor(minutes * 60))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

const QUICK_DURATIONS = [15, 30, 60]

export function TimerBar({
  running, settings, onOpenEntry,
}: {
  running: TimeEntry | null
  settings: TimeSettings
  onOpenEntry: (presetCategory?: string) => void
}) {
  const now = useNow(1000)
  const start  = useStartTimer()
  const cancel = useCancelTimer()
  const create = useCreateTimeEntry()

  const [stopOpen, setStopOpen] = useState(false)
  /* Une alerte ignorée ne doit pas revenir toutes les secondes : on
     mémorise le bloc concerné jusqu'à ce qu'il change. */
  const [dismissedId, setDismissedId] = useState<string | null>(null)

  const alert = distractionAlert(running, settings, now)
  const showAlert = alert && running && dismissedId !== running.id

  const startQuick = (label: string, categoryKey: string) => {
    start.mutate({
      label,
      category_key: categoryKey,
      kind: suggestKind(categoryKey, null),
      source: 'quick',
    })
  }

  /* Bloc déjà écoulé : on le pose à rebours depuis maintenant. Le niveau
     de contrôle n'est pas demandé ici (Quick Log = un clic) ; il reste
     modifiable dans le journal. */
  const logPast = (label: string, categoryKey: string, minutes: number) => {
    const end = new Date()
    const startAt = new Date(end.getTime() - minutes * 60000)
    create.mutate({
      label,
      category_key: categoryKey,
      kind: suggestKind(categoryKey, null),
      started_at: startAt.toISOString(),
      ended_at:   end.toISOString(),
      source: 'quick',
    })
  }

  return (
    <div className="space-y-3">
      {/* ── Alerte intelligente ─────────────────────────────────── */}
      {showAlert && alert && (
        <div className="rounded-2xl border border-amber-300 dark:border-amber-800/50 bg-amber-50 dark:bg-amber-950/20 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900 dark:text-amber-100">
                Tu es sur « {alert.label} » depuis {formatMinutes(alert.minutes)}, pendant ton temps de travail.
              </p>
              <p className="text-xs text-amber-800 dark:text-amber-300/90 mt-1">
                Veux-tu enregistrer ce temps comme <strong>temps perdu</strong> et reprendre le travail ?
              </p>
              <div className="flex flex-wrap gap-2 mt-3">
                <Button size="sm" onClick={() => setStopOpen(true)}>Enregistrer</Button>
                <Button size="sm" variant="secondary" onClick={() => setDismissedId(running!.id)}>
                  Ignorer
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Chronomètre en cours / Démarrage ────────────────────── */}
      {running ? (
        <RunningCard
          running={running}
          minutes={entryMinutes(running, now)}
          onStop={() => setStopOpen(true)}
          onCancel={() => cancel.mutate()}
          canceling={cancel.isPending}
        />
      ) : (
        <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Timer className="w-4 h-4" />
              <span>Aucun chronomètre en cours — un clic suffit pour en démarrer un.</span>
            </div>
            <Button variant="secondary" size="sm" onClick={() => onOpenEntry()}>
              <Plus className="w-4 h-4" /> Enregistrer une distraction
            </Button>
          </div>

          <div className="mt-3 pt-3 border-t border-border">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Quick Log
            </p>
            <div className="flex flex-wrap gap-2">
              {QUICK_LOG.map(q => {
                const cat = getCategory(q.categoryKey)
                return (
                  <div key={q.label} className="flex items-stretch rounded-xl overflow-hidden border border-border">
                    <button
                      type="button"
                      disabled={start.isPending}
                      onClick={() => startQuick(q.label, q.categoryKey)}
                      className="px-3 py-2 text-xs font-semibold text-foreground bg-[var(--surface-input)] hover:brightness-95 transition-all inline-flex items-center gap-1.5 disabled:opacity-50"
                      style={{ boxShadow: `inset 3px 0 0 ${cat.color}` }}
                    >
                      <Play className="w-3 h-3" /> {q.emoji} {q.label}
                    </button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          className="px-1.5 border-l border-border bg-[var(--surface-input)] text-muted-foreground hover:text-foreground transition-colors"
                          aria-label={`Enregistrer ${q.label} déjà écoulé`}
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuLabel className="text-[11px]">Déjà écoulé</DropdownMenuLabel>
                        {QUICK_DURATIONS.map(d => (
                          <DropdownMenuItem key={d} onClick={() => logPast(q.label, q.categoryKey, d)}>
                            {formatMinutes(d)}
                          </DropdownMenuItem>
                        ))}
                        <DropdownMenuItem onClick={() => onOpenEntry(q.categoryKey)}>
                          Autre durée…
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {running && (
        <StopDialog
          open={stopOpen}
          running={running}
          minutes={entryMinutes(running, now)}
          onClose={() => setStopOpen(false)}
        />
      )}
    </div>
  )
}

function RunningCard({
  running, minutes, onStop, onCancel, canceling,
}: {
  running: TimeEntry
  minutes: number
  onStop: () => void
  onCancel: () => void
  canceling: boolean
}) {
  const cat = getCategory(running.category_key)
  return (
    <div
      className="rounded-2xl border p-4 flex flex-wrap items-center justify-between gap-4"
      style={{ borderColor: `${cat.color}66`, backgroundColor: `${cat.color}12` }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <span
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-xl shrink-0"
          style={{ backgroundColor: `${cat.color}22` }}
        >
          {cat.emoji}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-foreground truncate">{running.label}</p>
          <p className="text-xs text-muted-foreground">
            {cat.label} · démarré à {new Date(running.started_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-2xl font-bold tabular-nums" style={{ color: cat.color }}>
          {formatClock(minutes)}
        </span>
        <Button size="sm" onClick={onStop}>
          <Square className="w-4 h-4" /> Stop
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={canceling} title="Annuler sans enregistrer">
          <X className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

/**
 * L'arrêt du chronomètre est le moment de vérité du module : c'est là
 * qu'on dit si le temps était choisi ou subi. Une seule question, quatre
 * réponses, et la nature du bloc s'en déduit sous les yeux.
 */
function StopDialog({
  open, running, minutes, onClose,
}: {
  open: boolean
  running: TimeEntry
  minutes: number
  onClose: () => void
}) {
  const stop = useStopTimer()
  const [control, setControl] = useState<ControlLevel | ''>('')

  const kind = suggestKind(running.category_key, control || null)
  const meta = TIME_KINDS[kind]
  const cat  = getCategory(running.category_key)

  const submit = () => {
    stop.mutate(
      { control_level: control || null, kind },
      { onSuccess: () => { setControl(''); onClose() } },
    )
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{cat.emoji}</span>
            {running.label} — {formatMinutes(minutes)}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground -mt-2">
          Comment as-tu vécu ce temps ? C'est cette réponse qui décide s'il compte comme
          repos planifié ou comme temps perdu.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {(Object.keys(CONTROL_LEVELS) as ControlLevel[]).map(key => {
            const c = CONTROL_LEVELS[key]
            const active = control === key
            return (
              <button
                key={key}
                type="button"
                onClick={() => setControl(active ? '' : key)}
                className={cn(
                  'text-left px-3 py-2 rounded-xl border transition-all',
                  active ? 'border-transparent shadow-sm'
                         : 'border-border bg-[var(--surface-input)] hover:border-electric-500/30',
                )}
                style={active ? { backgroundColor: `${c.color}14`, borderColor: c.color, boxShadow: `0 0 0 1px ${c.color}` } : undefined}
              >
                <span className="block text-sm font-semibold text-foreground">{c.emoji} {c.label}</span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">{c.hint}</span>
              </button>
            )
          })}
        </div>

        <div className="mt-4 rounded-xl border border-border bg-muted/40 px-3 py-2 text-sm">
          Ce bloc sera compté comme{' '}
          <strong style={{ color: meta.color }}>{meta.emoji} {meta.label}</strong>.
        </div>

        <div className="flex items-center justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={onClose} disabled={stop.isPending}>Annuler</Button>
          <Button onClick={submit} disabled={stop.isPending}>Arrêter et enregistrer</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
