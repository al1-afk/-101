/**
 * 7aty — saisie / correction d'un bloc de temps.
 *
 * C'est ici que se joue la règle centrale du module : la nature du bloc
 * (haute valeur / neutre / repos planifié / temps perdu) est PROPOSÉE
 * automatiquement en croisant la catégorie et le niveau de contrôle,
 * mais reste modifiable. La proposition suit la saisie tant que la
 * personne n'a pas tranché elle-même — dès qu'elle choisit une nature à
 * la main, on cesse de la corriger.
 */
import { useEffect, useMemo, useState } from 'react'
import { Loader2, Clock, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { cn } from '@/lib/utils'
import {
  TIME_CATEGORIES, CATEGORY_GROUPS, CONTROL_LEVELS, TIME_KINDS,
  getCategory, suggestKind,
  type CategoryGroup, type ControlLevel, type TimeKind,
} from '@/lib/timeCategories'
import {
  formatMinutes, toDateInput, toTimeInput, fromInputs, type TimeEntry,
} from '@/lib/timeAnalytics'
import { useCreateTimeEntry, useUpdateTimeEntry, useDeleteTimeEntry } from '@/hooks/useTimeTracking'

const GROUP_ORDER: CategoryGroup[] = ['distraction', 'valeur', 'vie']

interface FormState {
  label:        string
  category_key: string
  date:         string
  start:        string
  end:          string
  control:      ControlLevel | ''
  kind:         TimeKind
  notes:        string
}

function initialForm(entry?: TimeEntry | null, presetCategory?: string): FormState {
  if (entry) {
    const start = new Date(entry.started_at)
    const end   = entry.ended_at ? new Date(entry.ended_at) : new Date()
    return {
      label: entry.label,
      category_key: entry.category_key,
      date:  toDateInput(start),
      start: toTimeInput(start),
      end:   toTimeInput(end),
      control: entry.control_level ?? '',
      kind:  entry.kind,
      notes: entry.notes ?? '',
    }
  }
  const now = new Date()
  /* Par défaut : un bloc d'une heure qui vient de se terminer — le cas
     le plus fréquent est « je viens de perdre une heure, je l'enregistre ». */
  const start = new Date(now.getTime() - 60 * 60000)
  const category = presetCategory ?? 'social'
  return {
    label: '',
    category_key: category,
    date:  toDateInput(start),
    start: toTimeInput(start),
    end:   toTimeInput(now),
    control: '',
    kind:  suggestKind(category, null),
    notes: '',
  }
}

export function TimeEntryDialog({
  open, entry, presetCategory, onClose,
}: {
  open: boolean
  entry?: TimeEntry | null
  presetCategory?: string
  onClose: () => void
}) {
  const create = useCreateTimeEntry()
  const update = useUpdateTimeEntry()
  const remove = useDeleteTimeEntry()

  const [form, setForm] = useState<FormState>(() => initialForm(entry, presetCategory))
  /* Tant que la nature n'a pas été choisie à la main, elle suit la
     proposition. Sinon on n'écrase jamais une décision explicite. */
  const [kindTouched, setKindTouched] = useState(false)

  useEffect(() => {
    if (open) {
      setForm(initialForm(entry, presetCategory))
      setKindTouched(Boolean(entry))
    }
  }, [open, entry, presetCategory])

  const category = getCategory(form.category_key)
  const suggested = suggestKind(form.category_key, form.control || null)
  const kind = kindTouched ? form.kind : suggested

  const startedAt = fromInputs(form.date, form.start)
  const endedAt   = startedAt ? fromInputs(form.date, form.end, startedAt) : null
  const minutes   = startedAt && endedAt ? (endedAt.getTime() - startedAt.getTime()) / 60000 : 0

  const tooLong = minutes > 24 * 60
  const canSave = Boolean(form.label.trim()) && Boolean(startedAt) && minutes > 0 && !tooLong

  const busy = create.isPending || update.isPending || remove.isPending

  const submit = () => {
    if (!canSave || !startedAt || !endedAt) return
    const payload = {
      label: form.label.trim(),
      category_key: form.category_key,
      kind,
      control_level: form.control || null,
      started_at: startedAt.toISOString(),
      ended_at:   endedAt.toISOString(),
      notes: form.notes.trim() || null,
      source: 'manual' as const,
    }
    const done = () => onClose()
    if (entry) update.mutate({ id: entry.id, ...payload }, { onSuccess: done })
    else       create.mutate(payload, { onSuccess: done })
  }

  const suggestions = useMemo(() => category.activities.slice(0, 8), [category])

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-xl">{category.emoji}</span>
            {entry ? 'Modifier le bloc' : 'Enregistrer une activité'}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* ── Catégorie ─────────────────────────────────────────── */}
          <Field label="Catégorie">
            <div className="space-y-3">
              {GROUP_ORDER.map(group => (
                <div key={group}>
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                    {CATEGORY_GROUPS[group].emoji} {CATEGORY_GROUPS[group].label}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {TIME_CATEGORIES.filter(c => c.group === group).map(c => (
                      <button
                        key={c.key}
                        type="button"
                        onClick={() => setForm(f => ({ ...f, category_key: c.key }))}
                        className={cn(
                          'px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all',
                          form.category_key === c.key
                            ? 'text-white border-transparent shadow-sm'
                            : 'border-border bg-[var(--surface-input)] text-foreground hover:border-electric-500/40',
                        )}
                        style={form.category_key === c.key ? { backgroundColor: c.color } : undefined}
                      >
                        {c.emoji} {c.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Field>

          {/* ── Nom de l'activité ─────────────────────────────────── */}
          <Field label="Nom de l'activité">
            <Input
              autoFocus
              placeholder="Ex. Instagram, Film en famille, Appel prospect…"
              value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
            />
            {suggestions.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {suggestions.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, label: s }))}
                    className="px-2 py-1 rounded-md text-[11px] border border-border text-muted-foreground hover:text-foreground hover:border-electric-500/40 transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}
          </Field>

          {/* ── Quand ─────────────────────────────────────────────── */}
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <Field label="Date" className="sm:col-span-2">
              <Input type="date" value={form.date}
                     onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </Field>
            <Field label="Début">
              <Input type="time" value={form.start}
                     onChange={e => setForm(f => ({ ...f, start: e.target.value }))} />
            </Field>
            <Field label="Fin">
              <Input type="time" value={form.end}
                     onChange={e => setForm(f => ({ ...f, end: e.target.value }))} />
            </Field>
          </div>

          <div className={cn(
            'flex items-center gap-2 rounded-xl px-3 py-2 text-sm border',
            tooLong
              ? 'border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-800/50 dark:bg-rose-950/20 dark:text-rose-300'
              : 'border-border bg-muted/50 text-foreground',
          )}>
            <Clock className="w-4 h-4 shrink-0" />
            {tooLong
              ? <span>Un bloc ne peut pas dépasser 24 heures — vérifie les heures.</span>
              : <span>Durée calculée : <strong>{formatMinutes(minutes)}</strong>
                  {endedAt && startedAt && endedAt.getDate() !== startedAt.getDate() && (
                    <span className="text-muted-foreground"> (se termine le lendemain)</span>
                  )}
                </span>}
          </div>

          {/* ── Niveau de contrôle ────────────────────────────────── */}
          <Field
            label="Niveau de contrôle"
            hint="C'est ce choix qui distingue un repos assumé d'un temps réellement perdu."
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(Object.keys(CONTROL_LEVELS) as ControlLevel[]).map(key => {
                const c = CONTROL_LEVELS[key]
                const active = form.control === key
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setForm(f => ({ ...f, control: active ? '' : key }))}
                    className={cn(
                      'text-left px-3 py-2 rounded-xl border transition-all',
                      active
                        ? 'border-transparent shadow-sm ring-2'
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
          </Field>

          {/* ── Nature (proposée, modifiable) ─────────────────────── */}
          <Field
            label="Nature de ce temps"
            hint={kindTouched
              ? 'Choix manuel — la proposition automatique ne s\'applique plus.'
              : `Proposé automatiquement d'après « ${category.label} »${form.control ? ` + « ${CONTROL_LEVELS[form.control].label} »` : ''}.`}
          >
            <div className="flex flex-wrap gap-2">
              {(Object.keys(TIME_KINDS) as TimeKind[]).map(k => {
                const meta = TIME_KINDS[k]
                const active = kind === k
                return (
                  <button
                    key={k}
                    type="button"
                    onClick={() => { setKindTouched(true); setForm(f => ({ ...f, kind: k })) }}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                      active ? 'text-white border-transparent shadow-sm'
                             : 'border-border bg-[var(--surface-input)] text-foreground hover:border-electric-500/40',
                    )}
                    style={active ? { backgroundColor: meta.color } : undefined}
                  >
                    {meta.emoji} {meta.short}
                  </button>
                )
              })}
              {kindTouched && (
                <button
                  type="button"
                  onClick={() => setKindTouched(false)}
                  className="px-2 py-1.5 rounded-lg text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  revenir à la proposition
                </button>
              )}
            </div>
          </Field>

          {/* ── Raison ────────────────────────────────────────────── */}
          <Field label="Raison / commentaire" hint="Facultatif — mais c'est ce qui rend le rapport utile.">
            <AutocorrectTextarea
              className="block w-full rounded-lg px-3 py-2 text-sm border border-border bg-[var(--surface-input)] text-foreground min-h-[70px] resize-y focus-visible:outline-none focus-visible:border-[#378ADD]"
              placeholder="Ex. J'ai ouvert Instagram pour 5 min entre deux tâches, et j'y suis resté une heure."
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-2 pt-4 border-t border-border mt-2">
          <div>
            {entry && (
              <Button
                variant="destructive" size="sm" disabled={busy}
                onClick={() => remove.mutate(entry.id, { onSuccess: onClose })}
              >
                <Trash2 className="w-4 h-4" /> Supprimer
              </Button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onClose} disabled={busy}>Annuler</Button>
            <Button onClick={submit} disabled={!canSave || busy}>
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}
              {entry ? 'Enregistrer' : 'Ajouter le bloc'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Field({
  label, hint, className, children,
}: {
  label: string
  hint?: string
  className?: string
  children: React.ReactNode
}) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-foreground mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground mt-1.5">{hint}</p>}
    </div>
  )
}
