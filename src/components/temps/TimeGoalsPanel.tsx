/**
 * 7aty — objectifs hebdomadaires et réglages personnels.
 *
 * Un plafond n'interdit rien : il rend le dépassement VISIBLE (et coûte
 * 5 points de Distraction Score). C'est la différence entre « j'ai
 * l'impression d'y passer trop de temps » et « j'ai dépassé mon plafond
 * Instagram de 1 h 20 cette semaine ».
 *
 * Les heures de travail, elles, ne sont pas cosmétiques : c'est la
 * frontière qui décide si une session est du repos assumé ou du temps
 * perdu, et c'est elle qui arme l'alerte.
 */
import { useEffect, useState } from 'react'
import { Plus, Trash2, Save, Loader2, Bell, BellRing, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { TIME_CATEGORIES, getCategory } from '@/lib/timeCategories'
import { formatMinutes, type GoalStatus, type TimeSettings } from '@/lib/timeAnalytics'
import { useSaveTimeGoals, useSaveTimeSettings } from '@/hooks/useTimeTracking'
import type { TimeGoalDTO } from '@/lib/api'

const DAY_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

/* Suggestions de départ, tirées du cahier des charges : ce sont les
   quatre plafonds que la plupart des gens veulent poser en premier. */
const SUGGESTED: { category_key: string; max_minutes_week: number }[] = [
  { category_key: 'social',     max_minutes_week: 180 },
  { category_key: 'youtube',    max_minutes_week: 120 },
  { category_key: 'films',      max_minutes_week: 300 },
  { category_key: 'navigation', max_minutes_week: 60 },
]

interface DraftGoal {
  category_key: string
  hours: string
  minutes: string
}

function toDraft(g: { category_key: string; max_minutes_week: number }): DraftGoal {
  return {
    category_key: g.category_key,
    hours:   String(Math.floor(g.max_minutes_week / 60)),
    minutes: String(g.max_minutes_week % 60),
  }
}

function draftMinutes(d: DraftGoal): number {
  return Math.max(0, (Number(d.hours) || 0) * 60 + (Number(d.minutes) || 0))
}

export function TimeGoalsPanel({
  goals, status, settings,
}: {
  goals: TimeGoalDTO[]
  status: GoalStatus[]
  settings: TimeSettings
}) {
  const saveGoals = useSaveTimeGoals()
  const saveSettings = useSaveTimeSettings()

  const [drafts, setDrafts] = useState<DraftGoal[]>(() => goals.map(toDraft))
  const [form, setForm] = useState<TimeSettings>(settings)

  /* Les données serveur font autorité : à chaque rafraîchissement du
     cache, on repart d'elles plutôt que de garder un brouillon périmé. */
  useEffect(() => { setDrafts(goals.map(toDraft)) }, [goals])
  useEffect(() => { setForm(settings) }, [settings])

  const used = new Set(drafts.map(d => d.category_key))
  const available = TIME_CATEGORIES.filter(c => !used.has(c.key))

  const addGoal = (key: string) => {
    setDrafts(d => [...d, { category_key: key, hours: '2', minutes: '0' }])
  }

  const submitGoals = () => {
    saveGoals.mutate(
      drafts
        .map(d => ({ category_key: d.category_key, max_minutes_week: draftMinutes(d) }))
        .filter(g => g.max_minutes_week > 0)
    )
  }

  const toggleDay = (iso: number) => {
    setForm(f => ({
      ...f,
      work_days: f.work_days.includes(iso)
        ? f.work_days.filter(d => d !== iso)
        : [...f.work_days, iso].sort((a, b) => a - b),
    }))
  }

  return (
    <div className="space-y-5">
      {/* ── Objectifs ───────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">🎯 Objectifs hebdomadaires</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              Un plafond par catégorie. Dépassement = alerte visible + 5 points de Distraction Score.
            </p>
          </div>
          <Button size="sm" onClick={submitGoals} disabled={saveGoals.isPending}>
            {saveGoals.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </Button>
        </div>

        {drafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border p-6 text-center">
            <p className="text-sm text-foreground font-semibold">Aucun plafond défini</p>
            <p className="text-xs text-muted-foreground mt-1 mb-3">
              Commence par les quatre plus courants — tu ajusteras après une semaine de mesure.
            </p>
            <Button
              size="sm" variant="secondary"
              onClick={() => setDrafts(SUGGESTED.map(toDraft))}
            >
              Utiliser les plafonds suggérés
            </Button>
          </div>
        ) : (
          <div className="space-y-2.5">
            {drafts.map((d, i) => {
              const cat = getCategory(d.category_key)
              const st = status.find(s => s.category_key === d.category_key)
              const max = draftMinutes(d)
              const spent = st?.spent ?? 0
              const over = Math.max(0, spent - max)
              return (
                <div key={d.category_key} className="rounded-xl border border-border p-3">
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-sm font-semibold text-foreground flex items-center gap-1.5 min-w-[170px]">
                      <span>{cat.emoji}</span> {cat.label}
                    </span>

                    <div className="flex items-center gap-1.5">
                      <Input
                        type="number" min={0} max={168} className="w-16 h-9"
                        value={d.hours}
                        onChange={e => setDrafts(list => list.map((x, j) => j === i ? { ...x, hours: e.target.value } : x))}
                      />
                      <span className="text-xs text-muted-foreground">h</span>
                      <Input
                        type="number" min={0} max={59} step={5} className="w-16 h-9"
                        value={d.minutes}
                        onChange={e => setDrafts(list => list.map((x, j) => j === i ? { ...x, minutes: e.target.value } : x))}
                      />
                      <span className="text-xs text-muted-foreground">min / semaine</span>
                    </div>

                    <button
                      type="button"
                      onClick={() => setDrafts(list => list.filter((_, j) => j !== i))}
                      className="ml-auto p-1.5 rounded-lg text-muted-foreground hover:text-rose-500 hover:bg-muted transition-colors"
                      aria-label={`Retirer le plafond ${cat.label}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Consommation de la semaine affichée */}
                  <div className="mt-2.5">
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${max > 0 ? Math.min(100, (spent / max) * 100) : 0}%`,
                          backgroundColor: over > 0 ? '#DC2626' : cat.color,
                        }}
                      />
                    </div>
                    <p className={cn(
                      'text-[11px] mt-1',
                      over > 0 ? 'text-rose-600 dark:text-rose-400 font-semibold' : 'text-muted-foreground',
                    )}>
                      {over > 0
                        ? `⚠️ Plafond dépassé de ${formatMinutes(over)} — ${formatMinutes(spent)} consommés sur ${formatMinutes(max)}.`
                        : `${formatMinutes(spent)} consommés sur ${formatMinutes(max)} cette semaine.`}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {available.length > 0 && (
          <div className="mt-4 flex items-center gap-2">
            <Select onValueChange={addGoal} value="">
              <SelectTrigger className="w-full sm:w-72">
                <SelectValue placeholder="Ajouter un plafond sur une catégorie…" />
              </SelectTrigger>
              <SelectContent>
                {available.map(c => (
                  <SelectItem key={c.key} value={c.key}>{c.emoji} {c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Plus className="w-4 h-4 text-muted-foreground shrink-0" />
          </div>
        )}
      </div>

      {/* ── Réglages ────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-[var(--surface-card)] p-5">
        <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
          <div>
            <h3 className="text-sm font-bold text-foreground">⚙️ Mes heures de travail</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              C'est cette frontière qui distingue un repos assumé d'un temps perdu — et qui arme l'alerte.
            </p>
          </div>
          <Button
            size="sm" onClick={() => saveSettings.mutate(form)} disabled={saveSettings.isPending}
          >
            {saveSettings.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Enregistrer
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              <Clock className="w-3.5 h-3.5 inline mr-1" /> Journée de travail
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} max={23} className="w-20"
                value={form.work_start_hour}
                onChange={e => setForm(f => ({ ...f, work_start_hour: Number(e.target.value) }))}
              />
              <span className="text-xs text-muted-foreground">h →</span>
              <Input
                type="number" min={1} max={24} className="w-20"
                value={form.work_end_hour}
                onChange={e => setForm(f => ({ ...f, work_end_hour: Number(e.target.value) }))}
              />
              <span className="text-xs text-muted-foreground">h</span>
            </div>
            {form.work_end_hour <= form.work_start_hour && (
              <p className="text-[11px] text-rose-600 dark:text-rose-400 mt-1.5">
                La fin de journée doit être après le début.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">Jours travaillés</label>
            <div className="flex gap-1.5">
              {DAY_SHORT.map((d, i) => {
                const iso = i + 1
                const active = form.work_days.includes(iso)
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => toggleDay(iso)}
                    className={cn(
                      'w-9 h-9 rounded-lg text-xs font-bold border transition-all',
                      active
                        ? 'bg-gradient-primary text-white border-transparent'
                        : 'border-border bg-[var(--surface-input)] text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {d}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              <Bell className="w-3.5 h-3.5 inline mr-1" /> Alerte de distraction
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={5} max={240} step={5} className="w-24"
                value={form.alert_threshold_min}
                onChange={e => setForm(f => ({ ...f, alert_threshold_min: Number(e.target.value) }))}
                disabled={!form.alerts_enabled}
              />
              <span className="text-xs text-muted-foreground">min d'affilée</span>
            </div>
            <label className="flex items-center gap-2 mt-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={form.alerts_enabled}
                onChange={e => setForm(f => ({ ...f, alerts_enabled: e.target.checked }))}
                className="rounded border-border"
              />
              M'alerter pendant mes heures de travail
            </label>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              <BellRing className="w-3.5 h-3.5 inline mr-1" /> Rappel du soir
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={0} max={23} className="w-20"
                value={form.reminder_hour}
                onChange={e => setForm(f => ({ ...f, reminder_hour: Number(e.target.value) }))}
                disabled={!form.reminder_enabled}
              />
              <span className="text-xs text-muted-foreground">h — « as-tu saisi ta journée ? »</span>
            </div>
            <label className="flex items-center gap-2 mt-2 text-xs text-muted-foreground cursor-pointer">
              <input
                type="checkbox"
                checked={form.reminder_enabled}
                onChange={e => setForm(f => ({ ...f, reminder_enabled: e.target.checked }))}
                className="rounded border-border"
              />
              M'envoyer le rappel dans la cloche
            </label>
            <p className="text-[11px] text-muted-foreground mt-1.5 leading-relaxed">
              Une seule fois par jour, et <strong>uniquement si ta journée n'est pas déjà expliquée</strong> :
              au-delà de 70 % de tes heures de travail saisies, le rappel ne part pas.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-foreground mb-1.5">
              🎯 Objectif de temps à haute valeur
            </label>
            <div className="flex items-center gap-2">
              <Input
                type="number" min={1} max={168} className="w-24"
                value={form.weekly_high_value_hours}
                onChange={e => setForm(f => ({ ...f, weekly_high_value_hours: Number(e.target.value) }))}
              />
              <span className="text-xs text-muted-foreground">heures par semaine</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-1.5">
              Vente, production, management, stratégie, apprentissage.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
