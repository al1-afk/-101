import { useState, useMemo } from 'react'
import { Calendar, ChevronLeft, ChevronRight, X } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

export type DatePreset = 'all' | 'today' | 'week' | 'month' | 'year' | 'custom'

export interface DateRange {
  preset: DatePreset
  from: string | null
  to:   string | null
}

export const DEFAULT_RANGE: DateRange = { preset: 'all', from: null, to: null }

/* ─── Helpers ────────────────────────────────────────────────────── */
const iso = (d: Date) => d.toISOString().slice(0, 10)

export function computeRange(preset: DatePreset, anchor = new Date()): { from: string | null; to: string | null } {
  const now = new Date(anchor)
  now.setHours(0, 0, 0, 0)
  switch (preset) {
    case 'today': {
      return { from: iso(now), to: iso(now) }
    }
    case 'week': {
      const day = now.getDay() || 7
      const mon = new Date(now); mon.setDate(now.getDate() - day + 1)
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6)
      return { from: iso(mon), to: iso(sun) }
    }
    case 'month': {
      const first = new Date(now.getFullYear(), now.getMonth(), 1)
      const last  = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { from: iso(first), to: iso(last) }
    }
    case 'year': {
      const first = new Date(now.getFullYear(), 0, 1)
      const last  = new Date(now.getFullYear(), 11, 31)
      return { from: iso(first), to: iso(last) }
    }
    default:
      return { from: null, to: null }
  }
}

function shiftRange(range: DateRange, direction: -1 | 1): DateRange {
  if (range.preset === 'all' || !range.from || !range.to) return range
  const from = new Date(range.from)
  const to   = new Date(range.to)
  switch (range.preset) {
    case 'today': {
      from.setDate(from.getDate() + direction)
      to.setDate(to.getDate() + direction)
      break
    }
    case 'week': {
      from.setDate(from.getDate() + direction * 7)
      to.setDate(to.getDate() + direction * 7)
      break
    }
    case 'month': {
      const next = new Date(from.getFullYear(), from.getMonth() + direction, 1)
      const end  = new Date(next.getFullYear(), next.getMonth() + 1, 0)
      return { preset: 'month', from: iso(next), to: iso(end) }
    }
    case 'year': {
      const y = from.getFullYear() + direction
      return { preset: 'year', from: `${y}-01-01`, to: `${y}-12-31` }
    }
    case 'custom': {
      const span = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1)
      from.setDate(from.getDate() + direction * span)
      to.setDate(to.getDate() + direction * span)
      break
    }
  }
  return { ...range, from: iso(from), to: iso(to) }
}

export function formatRangeLabel(range: DateRange): string {
  if (range.preset === 'all' || !range.from || !range.to) return 'Toute la période'
  const fmt = (d: string) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })
  if (range.preset === 'today') return `Aujourd'hui · ${fmt(range.from)}`
  if (range.preset === 'week')  return `Semaine du ${fmt(range.from)}`
  if (range.preset === 'month') {
    const d = new Date(range.from)
    return d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }).replace(/^./, c => c.toUpperCase())
  }
  if (range.preset === 'year')  return new Date(range.from).getFullYear().toString()
  return `${fmt(range.from)} — ${fmt(range.to)}`
}

/* Returns a filter predicate for a given date string. */
export function makeDatePredicate(range: DateRange) {
  if (range.preset === 'all' || !range.from || !range.to) return () => true
  const from = range.from
  const to   = range.to
  return (date: string | null | undefined) => {
    if (!date) return false
    const d = date.slice(0, 10)
    return d >= from && d <= to
  }
}

/* ─── Main Component ─────────────────────────────────────────────── */
const PRESETS: { key: Exclude<DatePreset, 'custom' | 'all'>; label: string }[] = [
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week',  label: 'Cette semaine' },
  { key: 'month', label: 'Ce mois' },
  { key: 'year',  label: 'Cette année' },
]

interface Props {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
  /* Compteurs optionnels affichés sur chaque pastille (ex. nb de prospects). */
  counts?: Partial<Record<DatePreset, number>>
}

/* Petit badge de compteur collé à la pastille. */
function CountBadge({ value, active }: { value?: number; active: boolean }) {
  if (value === undefined) return null
  return (
    <span
      className={`ml-1.5 min-w-[1.25rem] px-1 py-px rounded-full text-[10px] font-bold leading-4 text-center ${
        active
          ? 'bg-white/25 text-white'
          : 'bg-muted text-muted-foreground'
      }`}
    >
      {value}
    </span>
  )
}

export function DateRangeFilter({ value, onChange, className = '', counts }: Props) {
  const [customOpen, setCustomOpen] = useState(false)
  const [customFrom, setCustomFrom] = useState(value.from || '')
  const [customTo,   setCustomTo]   = useState(value.to   || '')

  const label = useMemo(() => formatRangeLabel(value), [value])
  const canShift = value.preset !== 'all'

  const applyPreset = (preset: DatePreset) => {
    if (preset === 'custom') {
      setCustomFrom(value.from || '')
      setCustomTo(value.to || '')
      setCustomOpen(true)
      return
    }
    const { from, to } = computeRange(preset)
    onChange({ preset, from, to })
  }

  const applyCustom = () => {
    if (!customFrom || !customTo) return
    const from = customFrom <= customTo ? customFrom : customTo
    const to   = customFrom <= customTo ? customTo   : customFrom
    onChange({ preset: 'custom', from, to })
    setCustomOpen(false)
  }

  return (
    <>
      <div className={`flex items-center gap-2 flex-wrap ${className}`}>
        {/* Navigation + current period label */}
        <div className="flex items-center gap-1 pr-2 border-r border-border">
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            disabled={!canShift}
            onClick={() => onChange(shiftRange(value, -1))}
            title="Période précédente"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="flex items-center gap-1.5 px-2 text-sm font-medium text-foreground whitespace-nowrap">
            <Calendar className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
            <span>{label}</span>
          </div>
          <Button
            variant="ghost" size="icon" className="h-8 w-8"
            disabled={!canShift}
            onClick={() => onChange(shiftRange(value, 1))}
            title="Période suivante"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Preset pills */}
        <button
          type="button"
          onClick={() => applyPreset('all')}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
            value.preset === 'all'
              ? 'bg-blue-600 text-white'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          Toute
          <CountBadge value={counts?.all} active={value.preset === 'all'} />
        </button>
        {PRESETS.map(p => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all ${
              value.preset === p.key
                ? 'bg-blue-600 text-white'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted'
            }`}
          >
            {p.label}
            <CountBadge value={counts?.[p.key]} active={value.preset === p.key} />
          </button>
        ))}
        <button
          type="button"
          onClick={() => applyPreset('custom')}
          className={`text-xs px-3 py-1.5 rounded-full font-medium transition-all inline-flex items-center gap-1.5 ${
            value.preset === 'custom'
              ? 'bg-blue-600 text-white'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
        >
          <Calendar className="w-3 h-3" /> Personnalisé
          <CountBadge value={counts?.custom} active={value.preset === 'custom'} />
        </button>
      </div>

      {/* Custom range dialog */}
      <Dialog open={customOpen} onOpenChange={setCustomOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              Période personnalisée
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-1">
            <div className="space-y-1.5">
              <label className="form-label">Du</label>
              <Input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="form-label">Au</label>
              <Input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} />
            </div>
          </div>
          <div className="flex items-center justify-between pt-1">
            <Button
              variant="ghost" size="sm"
              onClick={() => { onChange(DEFAULT_RANGE); setCustomOpen(false) }}
            >
              <X className="w-4 h-4" /> Réinitialiser
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={() => setCustomOpen(false)}>Annuler</Button>
              <Button onClick={applyCustom} disabled={!customFrom || !customTo}>Appliquer</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
