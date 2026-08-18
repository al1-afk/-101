/**
 * Édition de l'échéance d'une tâche — date, heure, priorité, statut, rappels.
 *
 * Séparé du reste de la fiche pour une raison précise : la description
 * (blocs, sous-tâches, commentaires) est enregistrée par un auto-save
 * différé de 700 ms, ce qui convient à de la frappe au clavier. Une
 * échéance, elle, se change d'un clic — attendre serait anxiogène, et un
 * dialogue fermé trop vite perdrait la modification. Chaque champ part
 * donc immédiatement, et l'état de l'enregistrement est affiché.
 *
 * Le composant ne connaît pas la façon dont la tâche est persistée : il
 * remonte un patch. C'est l'appelant (fiche projet, panneau admin) qui
 * choisit sa mutation.
 */
import { useEffect, useRef, useState } from 'react'
import { CalendarClock, Check, Loader2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { ReminderPicker } from '@/components/taches/ReminderPicker'
import { useTaskReminderPrefs } from '@/hooks/useTaskReminders'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export interface TaskSchedulePatch {
  due_date?:         string | null
  due_time?:         string | null
  priority?:         string
  status?:           string
  reminder_offsets?: number[] | null
}

const PRIORITIES = [
  { value: 'low',    label: 'Basse' },
  { value: 'normal', label: 'Normale' },
  { value: 'high',   label: 'Haute' },
  { value: 'urgent', label: 'Urgente' },
]

const STATUSES = [
  { value: 'todo',        label: 'À faire' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'validation',  label: 'Validation' },
  { value: 'done',        label: 'Terminée' },
  { value: 'cancelled',   label: 'Annulée' },
]

/** « 2026-08-18T00:00:00Z » ou « 2026-08-18 » → « 2026-08-18 ». */
function toDateInput(v: string | null | undefined): string {
  return v ? String(v).slice(0, 10) : ''
}

/** « 17:00:00 » → « 17:00 ». */
function toTimeInput(v: string | null | undefined): string {
  return v ? String(v).slice(0, 5) : ''
}

export function TaskScheduleEditor({
  dueDate, dueTime, priority, status, reminderOffsets,
  remindersEligible = true, onPatch, className,
}: {
  dueDate:         string | null
  dueTime:         string | null
  priority:        string
  status:          string
  reminderOffsets: number[] | null
  /** false quand la tâche est confiée à un membre ou un stagiaire : le
   *  planificateur ne les couvre pas encore, il ne faut rien promettre. */
  remindersEligible?: boolean
  onPatch:         (patch: TaskSchedulePatch) => Promise<void> | void
  className?:      string
}) {
  const { prefs, isLoading } = useTaskReminderPrefs()
  const [inFlight, setInFlight] = useState(0)
  const [savedAt, setSavedAt] = useState(0)
  /* Numéro de la dernière écriture demandée POUR CHAQUE champ : une
     réponse arrivée après une demande plus récente ne doit ni annuler
     ni ressusciter la valeur qu'elle transportait. */
  const seq = useRef<Record<string, number>>({})

  /* Le champ suit la frappe pendant que l'enregistrement part : sans
     état local, la valeur reviendrait à l'ancienne le temps de l'aller-
     retour, et le champ « sauterait » sous les doigts. */
  const [local, setLocal] = useState<TaskSchedulePatch>({})

  /* …mais cet état ne doit pas survivre à l'écriture : dès que la valeur
     du serveur rejoint la nôtre, on relâche la clé. Sans ce relâchement,
     `local` primerait pour toujours sur les props et la fiche finirait
     par afficher l'état d'une AUTRE tâche après réouverture. */
  useEffect(() => {
    setLocal(l => {
      const next = { ...l }
      if ('due_date' in next && toDateInput(next.due_date) === toDateInput(dueDate)) delete next.due_date
      if ('due_time' in next && toTimeInput(next.due_time) === toTimeInput(dueTime)) delete next.due_time
      if ('priority' in next && next.priority === priority) delete next.priority
      if ('status'   in next && next.status   === status)   delete next.status
      if ('reminder_offsets' in next
          && JSON.stringify(next.reminder_offsets ?? null) === JSON.stringify(reminderOffsets ?? null)) {
        delete next.reminder_offsets
      }
      return next
    })
  }, [dueDate, dueTime, priority, status, reminderOffsets])

  const value = <K extends keyof TaskSchedulePatch>(key: K, fallback: TaskSchedulePatch[K]) =>
    (key in local ? local[key] : fallback)

  const apply = async (patch: TaskSchedulePatch) => {
    const keys = Object.keys(patch) as (keyof TaskSchedulePatch)[]
    const ticket = keys.reduce((acc, k) => {
      seq.current[k] = (seq.current[k] ?? 0) + 1
      return { ...acc, [k]: seq.current[k] }
    }, {} as Record<string, number>)

    setLocal(l => ({ ...l, ...patch }))
    setInFlight(n => n + 1)
    try {
      await onPatch(patch)
      setSavedAt(Date.now())
    } catch {
      /* L'échec doit se voir : on relâche la valeur locale pour que le
         champ retombe sur ce qui est réellement en base — mais seulement
         si aucune écriture plus récente n'est partie entre-temps.

         Pas de toast ici : la mutation appelante en affiche déjà un, et
         deux messages identiques pour un seul échec font douter d'avoir
         cassé quelque chose deux fois. */
      setLocal(l => {
        const next = { ...l }
        for (const k of keys) if (seq.current[k] === ticket[k]) delete next[k]
        return next
      })
    } finally {
      setInFlight(n => Math.max(0, n - 1))
    }
  }

  const saving = inFlight > 0

  /* Une date n'est enregistrée que complète et plausible : « 0002-01-01 »
     est ce que produit un champ date à mi-frappe, pas une échéance. */
  const commitDate = (raw: string) => {
    const propre = toDateInput(dueDate)
    if (!raw) {
      /* Effacement assumé : l'heure part avec la date, sinon elle
         resurgirait telle quelle le jour où l'on redonne une date. */
      if (propre) apply({ due_date: null, due_time: null })
      return
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number(raw.slice(0, 4)) < 1900) {
      setLocal(l => { const n = { ...l }; delete n.due_date; return n })
      return
    }
    if (raw !== propre) apply({ due_date: raw })
  }

  const commitTime = (raw: string) => {
    const propre = toTimeInput(dueTime)
    if (raw && !/^([01]\d|2[0-3]):[0-5]\d$/.test(raw)) {
      setLocal(l => { const n = { ...l }; delete n.due_time; return n })
      return
    }
    if (raw !== propre) apply({ due_time: raw || null })
  }

  const currentDate = toDateInput(value('due_date', dueDate) as string | null)
  const currentTime = toTimeInput(value('due_time', dueTime) as string | null)

  return (
    <div className={cn(
      'rounded-2xl border border-border bg-[var(--surface-card)] p-4',
      className,
    )}>
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <CalendarClock className="w-3.5 h-3.5" /> Échéance & rappels
        </span>
        {saving ? (
          <span className="text-[11px] text-muted-foreground flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> enregistrement…
          </span>
        ) : savedAt > 0 ? (
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
            <Check className="w-3 h-3" /> enregistré
          </span>
        ) : null}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <Field label="Date">
          <Input
            type="date"
            className="h-9"
            value={currentDate}
            /* La frappe ne touche QUE l'état local. Un <input type="date">
               émet une valeur vide ou partielle à chaque caractère saisi :
               envoyer ces états intermédiaires effaçait l'échéance — et
               son heure — plusieurs fois pendant une simple correction. */
            onChange={e => setLocal(l => ({ ...l, due_date: e.target.value || null }))}
            onBlur={e => commitDate(e.target.value)}
          />
        </Field>

        <Field label="Heure" hint={!currentDate ? 'après la date' : !currentTime ? 'facultative' : undefined}>
          <Input
            type="time"
            className="h-9"
            value={currentTime}
            /* Sans date, une heure ne veut rien dire : le champ reste
               inerte plutôt que de stocker une heure orpheline. */
            disabled={!currentDate}
            onChange={e => setLocal(l => ({ ...l, due_time: e.target.value || null }))}
            onBlur={e => commitTime(e.target.value)}
          />
        </Field>

        <Field label="Priorité">
          <Select
            value={String(value('priority', priority))}
            onValueChange={v => apply({ priority: v })}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PRIORITIES.map(p => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Statut">
          <Select
            value={String(value('status', status))}
            onValueChange={v => apply({ status: v })}
          >
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUSES.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center gap-2 flex-wrap">
        <span className="text-[11px] text-muted-foreground">Me prévenir</span>
        <ReminderPicker
          compact
          value={(value('reminder_offsets', reminderOffsets) ?? null) as number[] | null}
          defaults={prefs.default_offsets}
          defaultsReady={!isLoading}
          onChange={next => apply({ reminder_offsets: next })}
          className={cn(!remindersEligible && 'opacity-50 pointer-events-none')}
        />
        {!remindersEligible ? (
          <span className="text-[11px] text-amber-600 dark:text-amber-400">
            les rappels ne couvrent pas encore les tâches confiées à un membre ou un stagiaire
          </span>
        ) : !currentDate ? (
          <span className="text-[11px] text-amber-600 dark:text-amber-400">
            sans date, aucun rappel ne peut partir
          </span>
        ) : null}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-semibold text-muted-foreground mb-1">
        {label}{hint && <span className="font-normal"> · {hint}</span>}
      </label>
      {children}
    </div>
  )
}
