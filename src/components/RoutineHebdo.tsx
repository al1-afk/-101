import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Trash2, Edit2, Repeat, Sparkles, Calendar as CalendarIcon,
  Clock, X, Check, ArrowRight, BarChart3, Lightbulb, Moon, Bell, BellOff,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { AutocorrectInput, AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { calendrierApi } from '@/lib/api'
import type { CalEvent, EventType } from '@/pages/Calendrier'
import { TYPE_CONFIG } from '@/pages/Calendrier'

const STORAGE_KEY = 'gestiq_routine_blocks'

const LIFE_TYPES: EventType[] = [
  'sport', 'repos', 'apprentissage', 'repas', 'voyage', 'reflexion', 'famille', 'routine', 'autre',
]

const DAYS = [
  { id: 1, short: 'Lun', long: 'Lundi'    },
  { id: 2, short: 'Mar', long: 'Mardi'    },
  { id: 3, short: 'Mer', long: 'Mercredi' },
  { id: 4, short: 'Jeu', long: 'Jeudi'    },
  { id: 5, short: 'Ven', long: 'Vendredi' },
  { id: 6, short: 'Sam', long: 'Samedi'   },
  { id: 7, short: 'Dim', long: 'Dimanche' },
] as const

interface RoutineBlock {
  id:        string
  titre:     string
  type:      EventType
  days:      number[]
  heure:     string
  duree_min: number
  notes?:    string
}

const EMPTY_BLOCK: Omit<RoutineBlock, 'id'> = {
  titre: '', type: 'sport', days: [1, 3, 5], heure: '18:00', duree_min: 60, notes: '',
}

const SUGGESTIONS: Array<Omit<RoutineBlock, 'id'>> = [
  { titre: 'Sport',          type: 'sport',         days: [1, 3, 5],       heure: '18:00', duree_min: 60 },
  { titre: 'Lecture',        type: 'apprentissage', days: [2, 4],          heure: '20:00', duree_min: 45 },
  { titre: 'Méditation',     type: 'reflexion',     days: [1, 2, 3, 4, 5], heure: '07:00', duree_min: 15 },
  { titre: 'Repas en famille', type: 'famille',     days: [1, 2, 3, 4, 5, 6, 7], heure: '20:30', duree_min: 60 },
  { titre: 'Coucher',        type: 'repos',         days: [1, 2, 3, 4, 5, 6, 7], heure: '23:00', duree_min: 30 },
]

/* ── Pack: 5 prières islamiques (heures moyennes — Casablanca) ─── */
const PRAYER_PACK: Array<Omit<RoutineBlock, 'id'>> = [
  { titre: '🕌 Fajr',    type: 'reflexion', days: [1, 2, 3, 4, 5, 6, 7], heure: '05:30', duree_min: 15, notes: 'Prière de l\'aube — heures moyennes Casablanca, à ajuster selon la saison.' },
  { titre: '🕌 Dhuhr',   type: 'reflexion', days: [1, 2, 3, 4, 5, 6, 7], heure: '13:00', duree_min: 15 },
  { titre: '🕌 Asr',     type: 'reflexion', days: [1, 2, 3, 4, 5, 6, 7], heure: '16:30', duree_min: 15 },
  { titre: '🕌 Maghrib', type: 'reflexion', days: [1, 2, 3, 4, 5, 6, 7], heure: '19:00', duree_min: 15 },
  { titre: '🕌 Isha',    type: 'reflexion', days: [1, 2, 3, 4, 5, 6, 7], heure: '20:30', duree_min: 15 },
]

function loadBlocks(): RoutineBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveBlocks(blocks: RoutineBlock[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(blocks)) } catch {}
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

function uid() { return Math.random().toString(36).slice(2, 10) }

export function RoutineHebdo({ existingEvents }: { existingEvents: CalEvent[] }) {
  const qc = useQueryClient()
  const [blocks, setBlocks] = useState<RoutineBlock[]>(() => loadBlocks())
  const [showForm, setShowForm] = useState(false)
  const [editing,  setEditing]  = useState<RoutineBlock | null>(null)
  const [form,     setForm]     = useState<Omit<RoutineBlock, 'id'>>(EMPTY_BLOCK)
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  )

  useEffect(() => { saveBlocks(blocks) }, [blocks])

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') {
      toast.error('Votre navigateur ne supporte pas les notifications')
      return
    }
    try {
      const result = await Notification.requestPermission()
      setNotifPerm(result)
      if (result === 'granted') {
        new Notification('GestiQ', { body: 'Les rappels sont activés ✓', icon: '/icon-192.png' })
        toast.success('Rappels activés')
      } else if (result === 'denied') {
        toast.error('Notifications bloquées dans le navigateur')
      }
    } catch {
      toast.error('Erreur lors de la demande')
    }
  }

  const createMut = useMutation({
    mutationFn: (data: Omit<CalEvent, 'id'>) => calendrierApi.create(data),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['calendrier_events'] }) },
  })

  const openNew = () => {
    setEditing(null)
    setForm(EMPTY_BLOCK)
    setShowForm(true)
  }

  const openEdit = (b: RoutineBlock) => {
    setEditing(b)
    setForm({ titre: b.titre, type: b.type, days: b.days, heure: b.heure, duree_min: b.duree_min, notes: b.notes ?? '' })
    setShowForm(true)
  }

  const saveBlock = () => {
    if (!form.titre.trim() || form.days.length === 0) {
      toast.error('Titre et au moins un jour requis')
      return
    }
    if (editing) {
      setBlocks(prev => prev.map(b => b.id === editing.id ? { ...b, ...form } : b))
      toast.success('Bloc mis à jour')
    } else {
      setBlocks(prev => [...prev, { id: uid(), ...form }])
      toast.success('Bloc ajouté')
    }
    setShowForm(false)
  }

  const deleteBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id))
    toast.success('Bloc supprimé')
  }

  const addSuggestion = (s: Omit<RoutineBlock, 'id'>) => {
    if (blocks.some(b => b.titre === s.titre)) {
      toast.error(`"${s.titre}" déjà ajouté`)
      return
    }
    setBlocks(prev => [...prev, { id: uid(), ...s }])
    toast.success(`"${s.titre}" ajouté à votre routine`)
  }

  const addPrayerPack = () => {
    const existing = new Set(blocks.map(b => b.titre))
    const toAdd = PRAYER_PACK.filter(p => !existing.has(p.titre))
    if (toAdd.length === 0) {
      toast.info('Les 5 prières sont déjà dans votre routine')
      return
    }
    setBlocks(prev => [...prev, ...toAdd.map(p => ({ id: uid(), ...p }))])
    toast.success(`${toAdd.length} prière(s) ajoutée(s)`)
  }

  const toggleDay = (dayId: number) => {
    setForm(p => ({
      ...p,
      days: p.days.includes(dayId) ? p.days.filter(d => d !== dayId) : [...p.days, dayId].sort(),
    }))
  }

  const applyToWeek = async (weekOffset: number) => {
    if (blocks.length === 0) {
      toast.error('Aucun bloc défini')
      return
    }
    const today      = new Date().toISOString().slice(0, 10)
    const weekStart  = addDays(getMondayOf(today), weekOffset * 7)
    let createdCount = 0
    let skippedCount = 0

    for (const b of blocks) {
      for (const d of b.days) {
        const date = addDays(weekStart, d - 1)
        const conflict = existingEvents.some(e => e.date === date && e.heure === b.heure && e.titre === b.titre)
        if (conflict) { skippedCount++; continue }
        const cfg = TYPE_CONFIG[b.type]
        try {
          await createMut.mutateAsync({
            titre: `${cfg.emoji} ${b.titre}`,
            date,
            heure: b.heure,
            type:  b.type,
            notes: b.notes || undefined,
            done:  false,
          })
          createdCount++
        } catch (err) {
          console.error('Failed to create event', err)
        }
      }
    }
    toast.success(`${createdCount} événement(s) créé(s)${skippedCount > 0 ? ` · ${skippedCount} déjà existant(s)` : ''}`)
  }

  const stats = useMemo(() => {
    const byType = new Map<EventType, number>()
    let totalMin = 0
    for (const b of blocks) {
      const min = b.duree_min * b.days.length
      totalMin += min
      byType.set(b.type, (byType.get(b.type) ?? 0) + min)
    }
    return {
      totalH:  Math.round(totalMin / 60 * 10) / 10,
      byType:  Array.from(byType.entries()).sort((a, b) => b[1] - a[1]),
    }
  }, [blocks])

  return (
    <div className="space-y-5">
      {/* ── Hero / actions ── */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <Repeat className="w-4 h-4 text-violet-500" />
            Routine hebdomadaire
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Définissez vos blocs récurrents une seule fois — appliquez-les à votre semaine en un clic.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            size="sm"
            variant={notifPerm === 'granted' ? 'outline' : 'default'}
            onClick={requestNotifPermission}
            disabled={notifPerm === 'denied'}
            className={cn('gap-1.5', notifPerm === 'granted' && 'text-emerald-600 border-emerald-300 dark:border-emerald-700')}
            title={notifPerm === 'denied' ? 'Notifications bloquées — activez-les dans les réglages du navigateur' : ''}
          >
            {notifPerm === 'granted' ? <Bell className="w-3.5 h-3.5" /> : <BellOff className="w-3.5 h-3.5" />}
            {notifPerm === 'granted' ? 'Rappels activés' : notifPerm === 'denied' ? 'Bloqués' : 'Activer rappels'}
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={addPrayerPack}
            className="gap-1.5"
          >
            <Moon className="w-3.5 h-3.5" />
            5 prières
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => applyToWeek(0)}
            disabled={blocks.length === 0 || createMut.isPending}
            className="gap-1.5"
          >
            <CalendarIcon className="w-3.5 h-3.5" />
            Cette semaine
          </Button>
          <Button
            size="sm"
            onClick={() => applyToWeek(1)}
            disabled={blocks.length === 0 || createMut.isPending}
            className="gap-1.5"
          >
            Semaine prochaine
            <ArrowRight className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="default" onClick={openNew} className="gap-1.5 bg-violet-600 hover:bg-violet-700">
            <Plus className="w-3.5 h-3.5" />
            Nouveau bloc
          </Button>
        </div>
      </div>

      {/* ── Stats summary ── */}
      {blocks.length > 0 && (
        <div className="card-premium p-4 bg-gradient-to-br from-violet-50 to-blue-50 dark:from-violet-500/5 dark:to-blue-500/5">
          <div className="flex items-center gap-2 mb-3">
            <BarChart3 className="w-4 h-4 text-violet-600 dark:text-violet-400" />
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Équilibre hebdomadaire</p>
            <span className="text-xs text-foreground font-semibold ml-auto">{stats.totalH}h / sem.</span>
          </div>
          <div className="space-y-1.5">
            {stats.byType.map(([type, min]) => {
              const cfg     = TYPE_CONFIG[type]
              const hours   = Math.round(min / 60 * 10) / 10
              const percent = Math.round(min / Math.max(1, stats.byType[0][1]) * 100)
              return (
                <div key={type} className="flex items-center gap-3 text-xs">
                  <span className="w-32 flex items-center gap-1.5 text-muted-foreground">
                    <span>{cfg.emoji}</span>{cfg.label}
                  </span>
                  <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${percent}%` }}
                      transition={{ duration: 0.6, ease: 'easeOut' }}
                      className={cn('h-full rounded-full', cfg.bg)}
                    />
                  </div>
                  <span className="w-12 text-right font-semibold text-foreground">{hours}h</span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Empty / suggestions ── */}
      {blocks.length === 0 && (
        <div className="card-premium p-6 text-center space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center mx-auto">
            <Sparkles className="w-7 h-7 text-violet-500" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Commencez avec une suggestion</p>
            <p className="text-xs text-muted-foreground mt-1">Cliquez sur l'une des routines ci-dessous pour l'ajouter</p>
          </div>
          <div className="flex flex-wrap gap-2 justify-center pt-2">
            {SUGGESTIONS.map(s => {
              const cfg = TYPE_CONFIG[s.type]
              return (
                <button
                  key={s.titre}
                  onClick={() => addSuggestion(s)}
                  className={cn(
                    'flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl border transition-all hover:brightness-95 cursor-pointer',
                    cfg.color,
                  )}
                >
                  <span>{cfg.emoji}</span>
                  <span className="font-medium">{s.titre}</span>
                  <span className="opacity-60 text-[10px]">{s.heure}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Blocks list ── */}
      {blocks.length > 0 && (
        <div className="space-y-2">
          <AnimatePresence>
            {blocks.map(b => {
              const cfg = TYPE_CONFIG[b.type]
              const dayLabels = b.days.map(d => DAYS.find(x => x.id === d)?.short).filter(Boolean).join(' · ')
              const endTime = (() => {
                const [h, m] = b.heure.split(':').map(Number)
                const end = new Date()
                end.setHours(h, m + b.duree_min)
                return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`
              })()
              return (
                <motion.div
                  key={b.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -8 }}
                  className="card-premium p-3 flex items-center gap-3"
                >
                  <div className={cn('w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 text-lg', cfg.color)}>
                    {cfg.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm text-foreground">{b.titre}</span>
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border', cfg.color)}>{cfg.label}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-3 flex-wrap">
                      <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{b.heure} – {endTime}</span>
                      <span>{dayLabels}</span>
                      <span className="opacity-70">{b.duree_min} min × {b.days.length}j</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(b)}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => deleteBlock(b.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>

          {/* tip */}
          <div className="flex items-start gap-2 p-3 mt-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-xs text-amber-800 dark:text-amber-200">
            <Lightbulb className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            <span>
              Cliquez sur <strong>« Cette semaine »</strong> ou <strong>« Semaine prochaine »</strong> pour générer automatiquement les événements dans votre calendrier. Les doublons sont ignorés.
            </span>
          </div>
        </div>
      )}

      {/* ── Form dialog ── */}
      <Dialog open={showForm} onOpenChange={v => { setShowForm(v); if (!v) setEditing(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Repeat className="w-5 h-5 text-violet-500" />
              {editing ? 'Modifier le bloc' : 'Nouveau bloc de routine'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-1">
            <div className="space-y-1.5">
              <label className="form-label">Titre *</label>
              <AutocorrectInput
                value={form.titre}
                onChange={e => setForm(p => ({ ...p, titre: e.target.value }))}
                placeholder="Ex: Sport, Lecture, Méditation…"
                autoFocus
              />
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Catégorie</label>
              <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v as EventType }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LIFE_TYPES.map(t => {
                    const cfg = TYPE_CONFIG[t]
                    return (
                      <SelectItem key={t} value={t}>
                        <span className="flex items-center gap-2">
                          <span>{cfg.emoji}</span>{cfg.label}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Jours de la semaine *</label>
              <div className="flex gap-1 flex-wrap">
                {DAYS.map(d => (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => toggleDay(d.id)}
                    className={cn(
                      'px-3 py-1.5 rounded-lg text-xs font-medium border transition-all',
                      form.days.includes(d.id)
                        ? 'bg-violet-600 text-white border-violet-600'
                        : 'border-border text-muted-foreground hover:bg-muted',
                    )}
                  >
                    {d.short}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="form-label">Heure de début</label>
                <Input
                  type="time"
                  value={form.heure}
                  onChange={e => setForm(p => ({ ...p, heure: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="form-label">Durée (min)</label>
                <Input
                  type="number"
                  min={5}
                  max={480}
                  step={5}
                  value={form.duree_min}
                  onChange={e => setForm(p => ({ ...p, duree_min: Math.max(5, +e.target.value) }))}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="form-label">Notes (optionnel)</label>
              <AutocorrectTextarea
                className="input-field resize-none h-16"
                value={form.notes ?? ''}
                onChange={e => setForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="Détails, rappels…"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button variant="outline" size="sm" onClick={() => setShowForm(false)}>
                <X className="w-3.5 h-3.5 mr-1" />Annuler
              </Button>
              <Button size="sm" onClick={saveBlock} className="bg-violet-600 hover:bg-violet-700">
                <Check className="w-3.5 h-3.5 mr-1" />
                {editing ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
