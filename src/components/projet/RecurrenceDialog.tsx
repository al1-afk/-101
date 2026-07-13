/**
 * RecurrenceDialog — configuration de la récurrence d'une tâche.
 *
 * Quatre modes :
 *   - Chaque jour
 *   - Jours de la semaine choisis (lun/mer/ven, etc.)
 *   - Chaque mois (même jour)
 *   - Toutes les N jours
 *
 * Option commune : date de fin.
 */
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Repeat, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  WEEKDAY_LABELS, describeRecurrence, isValidRecurrence,
  type TaskRecurrence, type RecurrenceType,
} from '@/lib/taskRecurrence'

interface Props {
  open:          boolean
  onOpenChange:  (open: boolean) => void
  value:         TaskRecurrence | null
  onSave:        (r: TaskRecurrence | null) => void
}

export default function RecurrenceDialog({ open, onOpenChange, value, onSave }: Props) {
  const [type,     setType]     = useState<RecurrenceType>(value?.type ?? 'weekly')
  const [weekdays, setWeekdays] = useState<number[]>(value?.weekdays ?? [1, 3, 5])
  const [interval, setInterval] = useState<number>(value?.interval ?? 3)
  const [endDate,  setEndDate]  = useState<string>(value?.endDate ?? '')

  const toggleDay = (d: number) => {
    setWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d])
  }

  const buildRecurrence = (): TaskRecurrence => {
    const r: TaskRecurrence = { type }
    if (type === 'weekly')       r.weekdays = weekdays
    if (type === 'every_n_days') r.interval = interval
    if (endDate)                 r.endDate  = endDate
    return r
  }

  const preview = buildRecurrence()
  const valid   = isValidRecurrence(preview)

  const submit = () => {
    if (!valid) return
    onSave(preview)
    onOpenChange(false)
  }

  const remove = () => {
    onSave(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Repeat className="w-4 h-4 text-blue-500" /> Tâche récurrente
          </DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground -mt-2">
          Quand tu marques la tâche terminée, une nouvelle occurrence est créée automatiquement.
        </p>

        {/* Type de récurrence */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {([
            { id: 'daily',        label: 'Chaque jour' },
            { id: 'weekly',       label: 'Jours choisis' },
            { id: 'monthly',      label: 'Chaque mois' },
            { id: 'every_n_days', label: 'Tous les N jours' },
          ] as const).map(opt => (
            <button
              key={opt.id}
              type="button"
              onClick={() => setType(opt.id)}
              className={cn(
                'px-3 py-2 rounded-lg border text-sm font-medium transition-colors',
                type === opt.id
                  ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-950/30 text-blue-700 dark:text-blue-300'
                  : 'border-border hover:bg-muted/50',
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {/* Détails du type weekly */}
        {type === 'weekly' && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Jours de la semaine
            </p>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAY_LABELS.map(w => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => toggleDay(w.id)}
                  className={cn(
                    'px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors',
                    weekdays.includes(w.id)
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-border hover:bg-muted/50',
                  )}
                >
                  {w.short}
                </button>
              ))}
            </div>
            {weekdays.length === 0 && (
              <p className="text-[11px] text-rose-500 mt-1.5">Sélectionne au moins un jour</p>
            )}
          </div>
        )}

        {/* Détails every_n_days */}
        {type === 'every_n_days' && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
              Intervalle
            </p>
            <div className="flex items-center gap-2">
              <span className="text-sm">Tous les</span>
              <Input
                type="number"
                min={1}
                max={365}
                value={interval}
                onChange={e => setInterval(Math.max(1, Math.min(365, Number(e.target.value) || 1)))}
                className="w-20 text-center"
              />
              <span className="text-sm">jours</span>
            </div>
          </div>
        )}

        {/* Date de fin */}
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
            Date de fin <span className="font-normal normal-case text-muted-foreground">(optionnel)</span>
          </p>
          <div className="flex items-center gap-2">
            <Input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="flex-1"
            />
            {endDate && (
              <button
                type="button"
                onClick={() => setEndDate('')}
                className="p-1.5 rounded text-muted-foreground hover:bg-muted"
                title="Retirer la date de fin"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Aperçu */}
        {valid && (
          <div className="rounded-lg border border-blue-200 dark:border-blue-800/40 bg-blue-50/40 dark:bg-blue-950/20 p-2.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">Aperçu</p>
            <p className="text-sm font-semibold mt-0.5">🔁 {describeRecurrence(preview)}</p>
            {endDate && <p className="text-[11px] text-muted-foreground">Jusqu'au {endDate}</p>}
          </div>
        )}

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div>
            {value && (
              <Button type="button" variant="ghost" size="sm" onClick={remove} className="text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30">
                Retirer la récurrence
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Annuler</Button>
            <Button type="button" size="sm" onClick={submit} disabled={!valid}>
              {value ? 'Enregistrer' : 'Activer'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
