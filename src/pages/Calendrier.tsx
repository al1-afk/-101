import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ChevronLeft, ChevronRight, CalendarDays, Plus, Clock, User,
  Trash2, Edit2, Tag, X, Check, LayoutGrid, Rows3, AlignJustify,
  Download, ExternalLink, RefreshCw, Link2, Repeat,
} from 'lucide-react'
import { RoutineHebdo } from '@/components/RoutineHebdo'
import { Button }   from '@/components/ui/button'
import { Input }    from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge }    from '@/components/ui/badge'
import { cn }       from '@/lib/utils'
import { toast }    from 'sonner'
import { calendrierApi } from '@/lib/api'

/* ─── Types ───────────────────────────────────────────────────────── */
export type EventType =
  | 'rdv' | 'demo' | 'appel' | 'interne' | 'echeance' | 'relance' | 'autre'
  | 'sport' | 'repos' | 'apprentissage' | 'repas' | 'voyage' | 'reflexion' | 'famille' | 'routine'
type ViewMode  = 'month' | 'week' | 'day' | 'routine'
type TypeFilter = EventType | 'all'

export interface CalEvent {
  id:     string
  titre:  string
  date:   string   // YYYY-MM-DD
  heure:  string   // HH:MM
  type:   EventType
  client?: string
  notes?: string
  done:   boolean
}

export const TYPE_CONFIG: Record<EventType, { label: string; emoji: string; color: string; dot: string; bg: string }> = {
  rdv:           { label: 'RDV client',      emoji: '🤝', dot: 'bg-blue-500',    bg: 'bg-blue-500',    color: 'bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-500/20 dark:text-blue-300 dark:border-blue-500/30'         },
  demo:          { label: 'Démo',            emoji: '🎬', dot: 'bg-purple-500',  bg: 'bg-purple-500',  color: 'bg-purple-100 text-purple-700 border-purple-300 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30' },
  appel:         { label: 'Appel',           emoji: '📞', dot: 'bg-emerald-500', bg: 'bg-emerald-500', color: 'bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-500/20 dark:text-emerald-300 dark:border-emerald-500/30' },
  interne:       { label: 'Réunion interne', emoji: '👥', dot: 'bg-slate-500',   bg: 'bg-slate-500',   color: 'bg-slate-100 text-slate-700 border-slate-300 dark:bg-slate-500/20 dark:text-slate-300 dark:border-slate-500/30'     },
  echeance:      { label: 'Échéance',        emoji: '⏰', dot: 'bg-red-500',     bg: 'bg-red-500',     color: 'bg-red-100 text-red-700 border-red-300 dark:bg-red-500/20 dark:text-red-300 dark:border-red-500/30'                 },
  relance:       { label: 'Relance',         emoji: '🔁', dot: 'bg-amber-500',   bg: 'bg-amber-500',   color: 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-500/20 dark:text-amber-300 dark:border-amber-500/30'     },
  autre:         { label: 'Autre',           emoji: '📌', dot: 'bg-cyan-500',    bg: 'bg-cyan-500',    color: 'bg-cyan-100 text-cyan-700 border-cyan-300 dark:bg-cyan-500/20 dark:text-cyan-300 dark:border-cyan-500/30'           },
  // ── Life / wellbeing categories ───────────────────────────
  sport:         { label: 'Sport',           emoji: '🏃', dot: 'bg-green-500',   bg: 'bg-green-500',   color: 'bg-green-100 text-green-700 border-green-300 dark:bg-green-500/20 dark:text-green-300 dark:border-green-500/30'     },
  repos:         { label: 'Repos / Hygiène', emoji: '🛁', dot: 'bg-sky-400',     bg: 'bg-sky-400',     color: 'bg-sky-100 text-sky-700 border-sky-300 dark:bg-sky-500/20 dark:text-sky-300 dark:border-sky-500/30'                 },
  apprentissage: { label: 'Apprentissage',   emoji: '📚', dot: 'bg-indigo-500',  bg: 'bg-indigo-500',  color: 'bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-500/20 dark:text-indigo-300 dark:border-indigo-500/30' },
  repas:         { label: 'Repas',           emoji: '🍽️', dot: 'bg-orange-500',  bg: 'bg-orange-500',  color: 'bg-orange-100 text-orange-700 border-orange-300 dark:bg-orange-500/20 dark:text-orange-300 dark:border-orange-500/30' },
  voyage:        { label: 'Voyage',          emoji: '✈️', dot: 'bg-teal-500',    bg: 'bg-teal-500',    color: 'bg-teal-100 text-teal-700 border-teal-300 dark:bg-teal-500/20 dark:text-teal-300 dark:border-teal-500/30'             },
  reflexion:     { label: 'Réflexion',       emoji: '🧘', dot: 'bg-pink-500',    bg: 'bg-pink-500',    color: 'bg-pink-100 text-pink-700 border-pink-300 dark:bg-pink-500/20 dark:text-pink-300 dark:border-pink-500/30'             },
  famille:       { label: 'Famille',         emoji: '👨‍👩‍👧', dot: 'bg-rose-500', bg: 'bg-rose-500', color: 'bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-500/20 dark:text-rose-300 dark:border-rose-500/30'             },
  routine:       { label: 'Routine',         emoji: '🔄', dot: 'bg-violet-500',  bg: 'bg-violet-500',  color: 'bg-violet-100 text-violet-700 border-violet-300 dark:bg-violet-500/20 dark:text-violet-300 dark:border-violet-500/30' },
}

const DAYS_FR   = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim']
const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre']

const TODAY = new Date().toISOString().slice(0, 10)


/* ─── Google Calendar helpers ─────────────────────────────────────── */
function icsDateTime(date: string, heure: string) {
  // Returns YYYYMMDDTHHMMSS (local, no Z)
  return date.replace(/-/g, '') + 'T' + heure.replace(':', '') + '00'
}

function icsDateTimeEnd(date: string, heure: string) {
  // Default duration: 1 hour
  const [h, m] = heure.split(':').map(Number)
  const end = new Date(date + 'T' + heure)
  end.setHours(h + 1, m)
  return date.replace(/-/g, '') + 'T' + String(end.getHours()).padStart(2, '0') + String(end.getMinutes()).padStart(2, '0') + '00'
}

function generateICS(events: CalEvent[]): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GestiQ//GestiQ Calendar//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:GestiQ',
    'X-WR-TIMEZONE:Africa/Casablanca',
  ]
  for (const e of events) {
    const desc = [
      e.client ? `Client: ${e.client}` : '',
      e.notes  ? `Notes: ${e.notes}`   : '',
      `Type: ${TYPE_CONFIG[e.type].label}`,
    ].filter(Boolean).join('\\n')
    const eventLines = [
      'BEGIN:VEVENT',
      `UID:${e.id}@gestiq`,
      `DTSTART:${icsDateTime(e.date, e.heure)}`,
      `DTEND:${icsDateTimeEnd(e.date, e.heure)}`,
      `SUMMARY:${e.titre}`,
      desc ? `DESCRIPTION:${desc}` : '',
      e.done ? 'STATUS:COMPLETED' : 'STATUS:CONFIRMED',
      'END:VEVENT',
    ].filter((l): l is string => l !== '')
    lines.push(...eventLines)
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

function downloadICS(events: CalEvent[]) {
  const blob = new Blob([generateICS(events)], { type: 'text/calendar;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'gestiq-calendrier.ics'; a.click()
  URL.revokeObjectURL(url)
}

function getGCalLink(event: CalEvent): string {
  const start = icsDateTime(event.date, event.heure)
  const end   = icsDateTimeEnd(event.date, event.heure)
  const params = new URLSearchParams({
    action:  'TEMPLATE',
    text:    event.titre,
    dates:   `${start}/${end}`,
    details: [event.client ? `Client: ${event.client}` : '', event.notes ?? ''].filter(Boolean).join('\n'),
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

function getMonthGrid(year: number, month: number) {
  const firstDay    = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const startOffset = firstDay === 0 ? 6 : firstDay - 1
  return { startOffset, daysInMonth }
}

function getMondayOf(dateStr: string) {
  const d  = new Date(dateStr + 'T00:00')
  const wd = d.getDay() === 0 ? 7 : d.getDay()
  d.setDate(d.getDate() - wd + 1)
  return d.toISOString().slice(0, 10)
}

function addDays(dateStr: string, n: number) {
  const d = new Date(dateStr + 'T00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function fmtDate(dateStr: string, opts: Intl.DateTimeFormatOptions) {
  return new Date(dateStr + 'T00:00').toLocaleDateString('fr-FR', opts)
}

/* ─── Event form ──────────────────────────────────────────────────── */
const EMPTY_FORM = { titre: '', date: '', heure: '09:00', type: 'rdv' as EventType, client: '', notes: '' }

function EventForm({ initial, defaultDate, onSave, onClose }: {
  initial?:     CalEvent
  defaultDate?: string
  onSave:  (e: CalEvent) => void
  onClose: () => void
}) {
  const [form, setForm] = useState(
    initial
      ? { titre: initial.titre, date: initial.date, heure: initial.heure, type: initial.type, client: initial.client ?? '', notes: initial.notes ?? '' }
      : { ...EMPTY_FORM, date: defaultDate ?? '' }
  )

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.titre || !form.date) return
    onSave({ id: initial?.id ?? '', titre: form.titre, date: form.date, heure: form.heure,
      type: form.type, client: form.client || undefined, notes: form.notes || undefined, done: initial?.done ?? false })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label className="form-label">Titre *</label>
        <AutocorrectInput value={form.titre} onChange={e => setForm(p => ({ ...p, titre: e.target.value }))} placeholder="RDV, Démo, Appel…" autoFocus required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="form-label">Date *</label>
          <Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} required />
        </div>
        <div className="space-y-1.5">
          <label className="form-label">Heure</label>
          <Input type="time" value={form.heure} onChange={e => setForm(p => ({ ...p, heure: e.target.value }))} />
        </div>
      </div>
      <div className="space-y-1.5">
        <label className="form-label">Type</label>
        <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as EventType }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {Object.entries(TYPE_CONFIG).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                <div className="flex items-center gap-2"><div className={cn('w-2 h-2 rounded-full', v.dot)} />{v.label}</div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1.5">
        <label className="form-label">Client / Participants</label>
        <AutocorrectInput value={form.client} onChange={e => setForm(p => ({ ...p, client: e.target.value }))} placeholder="Nom du client ou participants" />
      </div>
      <div className="space-y-1.5">
        <label className="form-label">Notes</label>
        <AutocorrectTextarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
          className="input-field resize-none h-16" placeholder="Ordre du jour, contexte…" />
      </div>
      <div className="flex justify-end gap-3 pt-1">
        <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
        <Button type="submit" disabled={!form.titre || !form.date}>{initial ? 'Mettre à jour' : 'Créer'}</Button>
      </div>
    </form>
  )
}

/* ─── Event Popover ───────────────────────────────────────────────── */
function EventPopover({ event, anchorRect, onClose, onEdit, onDelete, onToggleDone }: {
  event:       CalEvent
  anchorRect:  DOMRect
  onClose:     () => void
  onEdit:      () => void
  onDelete:    () => void
  onToggleDone:() => void
}) {
  const tc = TYPE_CONFIG[event.type]
  const top  = Math.min(anchorRect.bottom + 8, window.innerHeight - 260)
  const left = Math.min(Math.max(anchorRect.left, 8), window.innerWidth - 272)

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: -6 }}
        animate={{ opacity: 1, scale: 1,    y: 0   }}
        exit={{    opacity: 0, scale: 0.94, y: -6  }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
        style={{ top, left }}
        className="fixed z-50 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-border overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* color bar */}
        <div className={cn('h-1 w-full', tc.bg)} />
        <div className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <p className={cn('font-semibold text-sm leading-tight flex-1', event.done && 'line-through opacity-60')}>{event.titre}</p>
            <button onClick={onClose} className="p-0.5 rounded-lg hover:bg-muted flex-shrink-0">
              <X className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          </div>

          <div className="space-y-1.5 text-xs text-muted-foreground mb-4">
            <div className="flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              <span>{fmtDate(event.date, { weekday: 'long', day: 'numeric', month: 'long' })} · {event.heure}</span>
            </div>
            {event.client && (
              <div className="flex items-center gap-2">
                <User className="w-3.5 h-3.5" />
                <span>{event.client}</span>
              </div>
            )}
            <div className="flex items-center gap-2">
              <Tag className="w-3.5 h-3.5" />
              <Badge variant="secondary" className="text-[10px] py-0">{tc.label}</Badge>
            </div>
          </div>

          {event.notes && (
            <p className="text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2 mb-4 line-clamp-3">{event.notes}</p>
          )}

          <div className="flex items-center gap-2">
            <button
              onClick={() => { onToggleDone(); onClose() }}
              className={cn(
                'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border transition-colors flex-1 justify-center font-medium',
                event.done
                  ? 'border-slate-200 dark:border-slate-600 hover:bg-muted text-muted-foreground'
                  : 'border-emerald-200 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-100 dark:hover:bg-emerald-500/20',
              )}
            >
              <Check className="w-3.5 h-3.5" />
              {event.done ? 'Rouvrir' : 'Terminé'}
            </button>
            <button
              onClick={() => { onEdit(); onClose() }}
              className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground transition-colors"
              title="Modifier"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { onDelete(); onClose() }}
              className="p-1.5 rounded-lg border border-red-200 dark:border-red-800/50 hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 transition-colors"
              title="Supprimer"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Google Calendar link */}
          <a
            href={getGCalLink(event)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            <img src="https://www.gstatic.com/calendar/images/dynamiclogo_2020q4/calendar_20_2x.png"
              alt="" className="w-3.5 h-3.5 object-contain" onError={e => (e.currentTarget.style.display = 'none')} />
            <ExternalLink className="w-3 h-3" />
            Ajouter à Google Calendar
          </a>
        </div>
      </motion.div>
    </>
  )
}

/* ─── Week view ───────────────────────────────────────────────────── */
function WeekView({ weekStart, events, today, onDayClick, onEventClick, openFormFor }: {
  weekStart:   string
  events:      CalEvent[]
  today:       string
  onDayClick:  (date: string) => void
  onEventClick:(event: CalEvent, rect: DOMRect) => void
  openFormFor: (date: string) => void
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  return (
    <div className="grid grid-cols-7 gap-1 h-full">
      {days.map(ds => {
        const dayEvs = events.filter(e => e.date === ds).sort((a, b) => a.heure.localeCompare(b.heure))
        const isToday = ds === today
        const d = new Date(ds + 'T00:00')
        return (
          <div key={ds} className="flex flex-col min-h-[280px]">
            {/* day header */}
            <div
              className={cn(
                'text-center pb-2 mb-2 border-b border-border cursor-pointer',
              )}
              onClick={() => openFormFor(ds)}
            >
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {DAYS_FR[d.getDay() === 0 ? 6 : d.getDay() - 1]}
              </div>
              <div className={cn(
                'w-7 h-7 rounded-full flex items-center justify-center mx-auto mt-0.5 text-sm font-bold transition-colors',
                isToday ? 'bg-blue-600 text-white' : 'text-foreground hover:bg-muted',
              )}>
                {d.getDate()}
              </div>
            </div>
            {/* events */}
            <div className="flex-1 space-y-1 px-0.5 overflow-y-auto" onClick={() => openFormFor(ds)}>
              {dayEvs.map(ev => {
                const tc = TYPE_CONFIG[ev.type]
                return (
                  <div
                    key={ev.id}
                    onClick={e => { e.stopPropagation(); onEventClick(ev, (e.currentTarget as HTMLElement).getBoundingClientRect()) }}
                    className={cn(
                      'text-[10px] px-1.5 py-1 rounded-lg border cursor-pointer hover:brightness-95 transition-all leading-tight',
                      tc.color,
                      ev.done && 'opacity-40 line-through',
                    )}
                  >
                    <div className="font-semibold truncate">{ev.titre}</div>
                    <div className="opacity-70 flex items-center gap-0.5 mt-0.5">
                      <Clock className="w-2.5 h-2.5" /> {ev.heure}
                    </div>
                  </div>
                )
              })}
              {dayEvs.length === 0 && (
                <div className="flex items-center justify-center h-10 opacity-0 hover:opacity-100 transition-opacity">
                  <Plus className="w-3.5 h-3.5 text-muted-foreground/50" />
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ─── Day view ────────────────────────────────────────────────────── */
function DayView({ date, events, onEventClick, openFormFor }: {
  date:        string
  events:      CalEvent[]
  onEventClick:(event: CalEvent, rect: DOMRect) => void
  openFormFor: (date: string) => void
}) {
  const dayEvs = events.filter(e => e.date === date).sort((a, b) => a.heure.localeCompare(b.heure))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm font-semibold text-foreground">
          {fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
        <button onClick={() => openFormFor(date)}
          className="flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 hover:underline">
          <Plus className="w-3.5 h-3.5" /> Ajouter
        </button>
      </div>

      {dayEvs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <CalendarDays className="w-10 h-10 text-muted-foreground/20 mb-3" />
          <p className="text-sm text-muted-foreground">Aucun événement ce jour</p>
          <button onClick={() => openFormFor(date)} className="text-xs text-blue-500 hover:underline mt-2">
            + Créer un événement
          </button>
        </div>
      ) : (
        dayEvs.map(ev => {
          const tc = TYPE_CONFIG[ev.type]
          return (
            <motion.div
              key={ev.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              className={cn(
                'flex items-start gap-3 p-4 rounded-xl border cursor-pointer hover:brightness-95 transition-all',
                tc.color, ev.done && 'opacity-40',
              )}
              onClick={e => onEventClick(ev, (e.currentTarget as HTMLElement).getBoundingClientRect())}
            >
              <div className="flex flex-col items-center gap-1 flex-shrink-0 text-xs font-bold opacity-80">
                <span>{ev.heure}</span>
                <div className={cn('w-0.5 h-6 rounded-full opacity-40', tc.dot)} />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn('font-semibold text-sm', ev.done && 'line-through')}>{ev.titre}</p>
                {ev.client && (
                  <p className="text-xs opacity-70 flex items-center gap-1 mt-0.5">
                    <User className="w-3 h-3" />{ev.client}
                  </p>
                )}
                {ev.notes && <p className="text-xs opacity-60 mt-1 line-clamp-2">{ev.notes}</p>}
              </div>
              <Badge variant="secondary" className="text-[10px] flex-shrink-0">{tc.label}</Badge>
            </motion.div>
          )
        })
      )}
    </div>
  )
}

/* ─── Main page ───────────────────────────────────────────────────── */
export default function Calendrier() {
  const qc  = useQueryClient()
  const now = new Date()

  const { data: events = [] } = useQuery<CalEvent[]>({
    queryKey: ['calendrier_events'],
    queryFn:  () => calendrierApi.list({ orderBy: 'date', order: 'asc' }) as Promise<CalEvent[]>,
  })

  const createMut = useMutation({
    mutationFn: (data: Omit<CalEvent, 'id'>) => calendrierApi.create(data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['calendrier_events'] }); toast.success('Événement créé') },
    onError:    (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const updateMut = useMutation({
    mutationFn: ({ id, ...data }: CalEvent) => calendrierApi.update(id, data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['calendrier_events'] }); toast.success('Événement mis à jour') },
    onError:    (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
  const deleteMut = useMutation({
    mutationFn: (id: string) => calendrierApi.remove(id),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['calendrier_events'] }); toast.success('Événement supprimé') },
    onError:    (e: any) => toast.error(e?.message ?? 'Erreur'),
  })

  const [year,        setYear]        = useState(now.getFullYear())
  const [month,       setMonth]       = useState(now.getMonth())
  const [selected,    setSelected]    = useState<string>(TODAY)
  const [view,        setView]        = useState<ViewMode>('month')
  const [typeFilter,  setTypeFilter]  = useState<TypeFilter>('all')
  const [showForm,    setShowForm]    = useState(false)
  const [editing,     setEditing]     = useState<CalEvent | undefined>()
  const [popover,     setPopover]     = useState<{ event: CalEvent; rect: DOMRect } | null>(null)

  /* navigation */
  const prevPeriod = () => {
    if (view === 'month') {
      if (month === 0) { setMonth(11); setYear(y => y - 1) } else setMonth(m => m - 1)
    } else if (view === 'week') {
      setSelected(s => addDays(getMondayOf(s), -7))
    } else {
      setSelected(s => addDays(s, -1))
    }
  }
  const nextPeriod = () => {
    if (view === 'month') {
      if (month === 11) { setMonth(0); setYear(y => y + 1) } else setMonth(m => m + 1)
    } else if (view === 'week') {
      setSelected(s => addDays(getMondayOf(s), 7))
    } else {
      setSelected(s => addDays(s, 1))
    }
  }
  const goToday = () => {
    setYear(now.getFullYear()); setMonth(now.getMonth()); setSelected(TODAY)
  }

  const { startOffset, daysInMonth } = getMonthGrid(year, month)
  const dateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`

  const filteredEvents = useMemo(
    () => typeFilter === 'all' ? events : events.filter(e => e.type === typeFilter),
    [events, typeFilter],
  )

  const eventsForDay = (day: number) =>
    filteredEvents.filter(e => e.date === dateStr(day)).sort((a, b) => a.heure.localeCompare(b.heure))

  const selectedEvents = useMemo(() =>
    filteredEvents.filter(e => e.date === selected).sort((a, b) => a.heure.localeCompare(b.heure)),
    [filteredEvents, selected],
  )

  const upcomingEvents = useMemo(() =>
    events
      .filter(e => e.date >= TODAY && !e.done && (typeFilter === 'all' || e.type === typeFilter))
      .sort((a, b) => a.date.localeCompare(b.date) || a.heure.localeCompare(b.heure))
      .slice(0, 6),
    [events, typeFilter],
  )

  const statsThisMonth = useMemo(() => {
    const prefix = `${year}-${String(month + 1).padStart(2, '0')}`
    const me = events.filter(e => e.date.startsWith(prefix))
    return { total: me.length, done: me.filter(e => e.done).length }
  }, [events, year, month])

  const saveEvent = (e: CalEvent) => {
    const exists = events.find(x => x.id === e.id)
    if (exists) {
      updateMut.mutate(e)
    } else {
      const { id: _id, ...data } = e
      createMut.mutate(data)
    }
    setShowForm(false); setEditing(undefined)
  }
  const deleteEvent = (id: string) => deleteMut.mutate(id)
  const toggleDone  = (id: string) => {
    const ev = events.find(e => e.id === id)
    if (ev) updateMut.mutate({ ...ev, done: !ev.done })
  }

  const openFormFor = (date: string) => {
    setSelected(date); setEditing(undefined); setShowForm(true)
  }

  const handleEventClick = (event: CalEvent, rect: DOMRect) => {
    setPopover({ event, rect })
  }

  /* nav label */
  const navLabel = view === 'month'
    ? `${MONTHS_FR[month]} ${year}`
    : view === 'week'
    ? (() => {
        const mon = getMondayOf(selected)
        const sun = addDays(mon, 6)
        return `${fmtDate(mon, { day: 'numeric', month: 'short' })} – ${fmtDate(sun, { day: 'numeric', month: 'short', year: 'numeric' })}`
      })()
    : fmtDate(selected, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            Calendrier
          </h1>
          <p className="page-sub">{statsThisMonth.total} événement(s) ce mois · {statsThisMonth.done} terminé(s)</p>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl gap-0.5">
            {([
              { id: 'month',   icon: LayoutGrid,    label: 'Mois'    },
              { id: 'week',    icon: Rows3,         label: 'Semaine' },
              { id: 'day',     icon: AlignJustify,  label: 'Jour'    },
              { id: 'routine', icon: Repeat,        label: 'Routine' },
            ] as const).map(({ id, icon: Icon, label }) => {
              const isRoutine = id === 'routine'
              return (
                <button
                  key={id}
                  onClick={() => setView(id)}
                  title={label}
                  className={cn(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    view === id
                      ? isRoutine
                        ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-400 shadow-sm'
                        : 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                      : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
                  )}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{label}</span>
                </button>
              )
            })}
          </div>
          {view !== 'routine' && (
            <Button size="sm" onClick={() => { setEditing(undefined); setShowForm(true) }}>
              <Plus className="w-4 h-4" /> Nouvel événement
            </Button>
          )}
        </div>
      </div>

      {view === 'routine' && <RoutineHebdo existingEvents={events} />}

      {view !== 'routine' && (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* ── Main calendar area ── */}
        <div className="lg:col-span-2 card-premium p-5">
          {/* Navigation bar */}
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-bold text-foreground capitalize">{navLabel}</h2>
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="icon" onClick={prevPeriod}><ChevronLeft className="w-4 h-4" /></Button>
              <Button variant="ghost" size="sm" onClick={goToday} className="text-xs px-3">Aujourd'hui</Button>
              <Button variant="ghost" size="icon" onClick={nextPeriod}><ChevronRight className="w-4 h-4" /></Button>
            </div>
          </div>

          {/* ── Month view ── */}
          {view === 'month' && (
            <>
              <div className="grid grid-cols-7 gap-1 mb-1">
                {DAYS_FR.map(d => (
                  <div key={d} className="text-center text-[11px] font-bold text-muted-foreground py-1 uppercase tracking-wide">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: startOffset }).map((_, i) => <div key={`e${i}`} className="aspect-square" />)}
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const day     = i + 1
                  const ds      = dateStr(day)
                  const evs     = eventsForDay(day)
                  const isToday = ds === TODAY
                  const isSel   = ds === selected

                  return (
                    <motion.div
                      key={day}
                      whileHover={{ scale: 1.03 }}
                      onClick={() => {
                        setSelected(ds)
                        if (evs.length === 0) openFormFor(ds)
                      }}
                      className={cn(
                        'relative aspect-square p-1 rounded-xl text-xs flex flex-col cursor-pointer transition-all select-none',
                        isSel   ? 'bg-blue-50 dark:bg-blue-500/10 ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-slate-900' :
                        isToday ? 'bg-blue-50 dark:bg-blue-500/10' :
                                  'hover:bg-muted',
                      )}
                    >
                      {/* day number — circle for today/selected */}
                      <span className={cn(
                        'w-5 h-5 flex items-center justify-center rounded-full text-[11px] font-bold leading-none flex-shrink-0',
                        isSel   ? 'bg-blue-600 text-white' :
                        isToday ? 'bg-blue-600 text-white' :
                                  'text-muted-foreground',
                      )}>{day}</span>

                      <div className="flex-1 mt-0.5 space-y-0.5 overflow-hidden">
                        {evs.slice(0, 2).map(e => (
                          <div
                            key={e.id}
                            onClick={ev => { ev.stopPropagation(); handleEventClick(e, (ev.currentTarget as HTMLElement).getBoundingClientRect()) }}
                            className={cn(
                              'text-[8px] rounded-md px-0.5 truncate leading-tight border hover:brightness-95 transition-all cursor-pointer',
                              TYPE_CONFIG[e.type].color,
                              e.done && 'opacity-40 line-through',
                            )}
                          >
                            {e.titre}
                          </div>
                        ))}
                        {evs.length > 2 && (
                          <div className="text-[8px] font-semibold px-0.5 text-muted-foreground">
                            +{evs.length - 2} autre{evs.length - 2 > 1 ? 's' : ''}
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )
                })}
              </div>

              {/* Type legend + filter */}
              <div className="mt-4 pt-4 border-t border-border">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Filtrer par type</p>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setTypeFilter('all')}
                    className={cn(
                      'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all cursor-pointer',
                      typeFilter === 'all'
                        ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent shadow-sm'
                        : 'border-border text-muted-foreground hover:bg-muted hover:border-slate-300',
                    )}
                  >
                    Tous
                  </button>
                  {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                    <button
                      key={k}
                      onClick={() => setTypeFilter(prev => prev === k ? 'all' : k as EventType)}
                      className={cn(
                        'flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-full border font-medium transition-all cursor-pointer',
                        typeFilter === k
                          ? `${v.color} shadow-sm`
                          : 'border-border text-muted-foreground hover:bg-muted hover:border-slate-300',
                      )}
                    >
                      <div className={cn('w-2 h-2 rounded-full flex-shrink-0', v.dot)} />
                      {v.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ── Week view ── */}
          {view === 'week' && (
            <WeekView
              weekStart={getMondayOf(selected)}
              events={filteredEvents}
              today={TODAY}
              onDayClick={setSelected}
              onEventClick={handleEventClick}
              openFormFor={openFormFor}
            />
          )}

          {/* ── Day view ── */}
          {view === 'day' && (
            <DayView
              date={selected}
              events={filteredEvents}
              onEventClick={handleEventClick}
              openFormFor={openFormFor}
            />
          )}
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4">

          {/* Type filter chips (mobile / week/day view) */}
          {view !== 'month' && (
            <div className="card-premium p-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">Filtrer par type</p>
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => setTypeFilter('all')}
                  className={cn(
                    'text-[11px] px-2.5 py-1 rounded-full border transition-all',
                    typeFilter === 'all' ? 'bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 border-transparent' : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >Tous</button>
                {Object.entries(TYPE_CONFIG).map(([k, v]) => (
                  <button
                    key={k}
                    onClick={() => setTypeFilter(prev => prev === k ? 'all' : k as EventType)}
                    className={cn(
                      'flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border transition-all',
                      typeFilter === k ? `${v.color} font-semibold` : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <div className={cn('w-1.5 h-1.5 rounded-full', v.dot)} />{v.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Selected day events (month view) */}
          {view === 'month' && (
            <div className="card-premium p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="section-title text-sm">
                  {selected
                    ? fmtDate(selected, { weekday: 'long', day: 'numeric', month: 'long' })
                    : 'Sélectionnez un jour'}
                </h3>
                {selected && (
                  <Button size="icon" variant="ghost" className="w-6 h-6" onClick={() => openFormFor(selected)}>
                    <Plus className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>

              {selectedEvents.length === 0 ? (
                <div className="text-center py-6">
                  <CalendarDays className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Aucun événement</p>
                  {selected && (
                    <button onClick={() => openFormFor(selected)} className="text-xs text-blue-500 hover:underline mt-1">
                      + Ajouter un événement
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <AnimatePresence>
                    {selectedEvents.map(e => {
                      const tc = TYPE_CONFIG[e.type]
                      return (
                        <motion.div
                          key={e.id}
                          initial={{ opacity: 0, x: 8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: -8 }}
                          className={cn(
                            'p-3 rounded-xl border text-sm group cursor-pointer transition-all hover:brightness-95',
                            tc.color, e.done && 'opacity-40',
                          )}
                          onClick={ev => handleEventClick(e, (ev.currentTarget as HTMLElement).getBoundingClientRect())}
                        >
                          <p className={cn('font-semibold leading-tight', e.done && 'line-through')}>{e.titre}</p>
                          <div className="flex items-center gap-3 mt-1.5 text-xs opacity-80">
                            <div className="flex items-center gap-1"><Clock className="w-3 h-3" />{e.heure}</div>
                            {e.client && <div className="flex items-center gap-1"><User className="w-3 h-3" /><span className="truncate max-w-[90px]">{e.client}</span></div>}
                          </div>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                </div>
              )}
            </div>
          )}

          {/* Upcoming */}
          <div className="card-premium p-4">
            <h3 className="section-title text-sm mb-3">À venir</h3>
            {upcomingEvents.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-4">Aucun événement à venir</p>
            ) : (
              <div className="space-y-2.5">
                {upcomingEvents.map(e => {
                  const tc = TYPE_CONFIG[e.type]
                  return (
                    <div key={e.id} className="flex items-start gap-2.5 cursor-pointer group"
                      onClick={() => { setSelected(e.date); if (view === 'month') { const d = new Date(e.date + 'T00:00'); setYear(d.getFullYear()); setMonth(d.getMonth()) } }}>
                      <div className={cn('w-2 h-2 rounded-full mt-1.5 flex-shrink-0', tc.dot)} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground truncate font-medium group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">{e.titre}</p>
                        <p className="text-xs text-muted-foreground">
                          {fmtDate(e.date, { day: 'numeric', month: 'short' })} · {e.heure}
                        </p>
                      </div>
                      <Badge variant="secondary" className="text-[10px] flex-shrink-0">{tc.label}</Badge>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Google Calendar integration */}
          <div className="card-premium p-4">
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-8 h-8 rounded-lg bg-white dark:bg-slate-700 border border-border flex items-center justify-center shadow-sm">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none">
                  <rect x="3" y="4" width="18" height="17" rx="2" fill="#fff" stroke="#e2e8f0"/>
                  <path d="M3 9h18" stroke="#e2e8f0" strokeWidth="1.5"/>
                  <rect x="7" y="13" width="4" height="4" rx="1" fill="#4285F4"/>
                  <path d="M8 4V2M16 4V2" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">Google Calendar</p>
                <p className="text-[11px] text-muted-foreground">Sync & Export</p>
              </div>
            </div>

            <div className="space-y-2">
              {/* Export ICS */}
              <button
                onClick={() => { downloadICS(events); toast.success('Fichier .ics téléchargé — importez-le dans Google Calendar') }}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border hover:bg-muted transition-all text-left group"
              >
                <div className="w-7 h-7 rounded-lg bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center flex-shrink-0">
                  <Download className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">Exporter en .ics</p>
                  <p className="text-[10px] text-muted-foreground">{events.length} événement(s) · importable partout</p>
                </div>
                <Download className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>

              {/* Open Google Calendar */}
              <a
                href="https://calendar.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-border hover:bg-muted transition-all text-left group"
              >
                <div className="w-7 h-7 rounded-lg bg-red-50 dark:bg-red-500/10 flex items-center justify-center flex-shrink-0">
                  <ExternalLink className="w-3.5 h-3.5 text-red-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground">Ouvrir Google Calendar</p>
                  <p className="text-[10px] text-muted-foreground">Voir dans un nouvel onglet</p>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </a>

              {/* Sync (coming soon) */}
              <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl border border-dashed border-border opacity-60 cursor-not-allowed">
                <div className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-xs font-medium text-foreground">Synchronisation auto</p>
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-500/20 text-violet-600 dark:text-violet-400">Bientôt</span>
                  </div>
                  <p className="text-[10px] text-muted-foreground">OAuth2 · sync bidirectionnel</p>
                </div>
              </div>
            </div>

            <p className="text-[10px] text-muted-foreground mt-3 flex items-center gap-1">
              <Link2 className="w-3 h-3" />
              Cliquez sur un événement pour l'ajouter directement
            </p>
          </div>
        </div>
      </div>
      )}

      {/* ── Event Popover ── */}
      <AnimatePresence>
        {popover && (
          <EventPopover
            event={popover.event}
            anchorRect={popover.rect}
            onClose={() => setPopover(null)}
            onEdit={() => { setEditing(popover.event); setShowForm(true) }}
            onDelete={() => deleteEvent(popover.event.id)}
            onToggleDone={() => toggleDone(popover.event.id)}
          />
        )}
      </AnimatePresence>

      {/* ── Form dialog ── */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) setEditing(undefined) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="w-5 h-5 text-blue-500" />
              {editing ? "Modifier l'événement" : 'Nouvel événement'}
            </DialogTitle>
          </DialogHeader>
          <EventForm
            initial={editing}
            defaultDate={selected ?? undefined}
            onSave={saveEvent}
            onClose={() => { setShowForm(false); setEditing(undefined) }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
