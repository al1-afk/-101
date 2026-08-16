/**
 * 7aty — moteur d'analyse du temps.
 *
 * Fonctions PURES : elles ne lisent que leurs arguments (les blocs, les
 * objectifs, les réglages, et un « maintenant » toujours passé
 * explicitement). C'est ce qui permet de les tester sans base ni
 * navigateur — `npm run test:time` — et de garantir qu'un même jeu de
 * blocs donne toujours le même bilan.
 *
 * Toutes les durées manipulées ici sont des MINUTES.
 *
 * Les dates sont interprétées dans le fuseau LOCAL du navigateur : « ce
 * qui s'est passé entre 18 h et 21 h » doit vouloir dire 18 h chez la
 * personne, pas en UTC.
 */
import {
  getCategory, isDistraction,
  type ControlLevel, type TimeKind,
} from './timeCategories'

/* ── Formes de données (miroir des tables de la migration 087) ───── */

export interface TimeEntry {
  id:            string
  label:         string
  category_key:  string
  kind:          TimeKind
  control_level: ControlLevel | null
  started_at:    string
  /** null = chronomètre en cours. */
  ended_at:      string | null
  duration_min:  number | null
  notes:         string | null
  source?:       string
}

export interface TimeGoal {
  category_key:     string
  max_minutes_week: number
}

export interface TimeSettings {
  work_start_hour:         number
  work_end_hour:           number
  /** Convention ISO : 1 = lundi … 7 = dimanche. */
  work_days:               number[]
  alert_threshold_min:     number
  alerts_enabled:          boolean
  weekly_high_value_hours: number
  /** Rappel du soir « as-tu saisi ta journée ? » (cloche, une fois/jour). */
  reminder_enabled:        boolean
  reminder_hour:           number
}

export const DEFAULT_SETTINGS: TimeSettings = {
  work_start_hour: 9,
  work_end_hour: 18,
  work_days: [1, 2, 3, 4, 5, 6],
  alert_threshold_min: 45,
  alerts_enabled: true,
  weekly_high_value_hours: 30,
  reminder_enabled: true,
  reminder_hour: 22,
}

/* ── Dates ───────────────────────────────────────────────────────── */

export const DAY_LABELS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche']

/** Lundi 00:00 de la semaine contenant `d` (semaine à l'européenne). */
export function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  /* getDay() : 0 = dimanche. On ramène dimanche à l'index 6. */
  const offset = (out.getDay() + 6) % 7
  out.setDate(out.getDate() - offset)
  return out
}

export function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + days)
  return out
}

export function startOfDay(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  return out
}

/** Index du jour à l'européenne : 0 = lundi … 6 = dimanche. */
export function dayIndex(d: Date): number {
  return (d.getDay() + 6) % 7
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Date → « 2026-08-16 » dans le fuseau local (jamais UTC : à 01 h du
 *  matin, toISOString() renverrait la veille et le bloc changerait de jour). */
export function toDateInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** Date → « 14:35 » local. */
export function toTimeInput(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Champs de formulaire (date + heure locales) → Date.
 * `endOfDayCrossing` : une fin ANTÉRIEURE au début signifie qu'on a
 * passé minuit (« 23:00 → 01:00 ») — le lendemain est alors le bon jour.
 */
export function fromInputs(date: string, time: string, after?: Date): Date | null {
  if (!date || !time) return null
  const d = new Date(`${date}T${time}`)
  if (!Number.isFinite(d.getTime())) return null
  if (after && d.getTime() <= after.getTime()) return addDays(d, 1)
  return d
}

/* ── Durées ──────────────────────────────────────────────────────── */

/**
 * Minutes d'un bloc. Un chronomètre en cours compte le temps DÉJÀ
 * écoulé : le tableau de bord doit bouger pendant qu'on le regarde,
 * sinon on ne voit jamais la distraction grossir.
 */
export function entryMinutes(e: TimeEntry, now: Date = new Date()): number {
  const start = new Date(e.started_at).getTime()
  if (!Number.isFinite(start)) return 0

  if (!e.ended_at) {
    return Math.max(0, (now.getTime() - start) / 60000)
  }
  /* duration_min vient du trigger SQL : c'est la référence. On ne
     recalcule que s'il manque (ligne écrite avant la migration). */
  if (typeof e.duration_min === 'number') return Math.max(0, e.duration_min)

  const end = new Date(e.ended_at).getTime()
  return Number.isFinite(end) ? Math.max(0, (end - start) / 60000) : 0
}

/** Fin effective d'un bloc — l'instant présent si le chronomètre tourne. */
export function entryEnd(e: TimeEntry, now: Date = new Date()): Date {
  if (e.ended_at) return new Date(e.ended_at)
  return now
}

/** « 3h 25min », « 45min », « 2h ». */
export function formatMinutes(min: number): string {
  const total = Math.max(0, Math.round(min))
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h && m) return `${h}h ${String(m).padStart(2, '0')}min`
  if (h)      return `${h}h`
  return `${m}min`
}

/** « 9,7 h » — pour les projections annuelles / mensuelles. */
export function formatHours(min: number): string {
  const h = Math.max(0, min) / 60
  return `${h.toFixed(1).replace('.', ',')} h`
}

/* ── Sélection ───────────────────────────────────────────────────── */

/** Blocs DÉMARRÉS dans [from, to). Un bloc est rattaché à son début. */
export function inRange(entries: TimeEntry[], from: Date, to: Date): TimeEntry[] {
  const a = from.getTime(), b = to.getTime()
  return entries.filter(e => {
    const t = new Date(e.started_at).getTime()
    return Number.isFinite(t) && t >= a && t < b
  })
}

/* ── Totaux ──────────────────────────────────────────────────────── */

export interface KindTotals {
  valeur: number
  neutre: number
  repos:  number
  perdu:  number
  total:  number
}

export function totalsByKind(entries: TimeEntry[], now: Date = new Date()): KindTotals {
  const out: KindTotals = { valeur: 0, neutre: 0, repos: 0, perdu: 0, total: 0 }
  for (const e of entries) {
    const m = entryMinutes(e, now)
    if (e.kind in out) out[e.kind] += m
    out.total += m
  }
  return out
}

export interface CategoryTotal {
  category_key: string
  minutes:      number
  /** Part du temps suivi, 0 → 1. */
  share:        number
}

export function totalsByCategory(entries: TimeEntry[], now: Date = new Date()): CategoryTotal[] {
  const map = new Map<string, number>()
  let total = 0
  for (const e of entries) {
    const m = entryMinutes(e, now)
    map.set(e.category_key, (map.get(e.category_key) ?? 0) + m)
    total += m
  }
  return [...map.entries()]
    .map(([category_key, minutes]) => ({
      category_key, minutes,
      share: total > 0 ? minutes / total : 0,
    }))
    .sort((a, b) => b.minutes - a.minutes)
}

export interface LabelTotal {
  label:        string
  category_key: string
  minutes:      number
  count:        number
}

/**
 * Agrégat par NOM d'activité (« Instagram — 4h20 »), en option restreint
 * à certaines natures. Les noms sont regroupés sans tenir compte de la
 * casse ni des espaces : « instagram » et « Instagram » sont la même
 * source de perte de temps.
 */
export function totalsByLabel(
  entries: TimeEntry[],
  kinds?: TimeKind[],
  now: Date = new Date(),
): LabelTotal[] {
  const keep = kinds ? new Set(kinds) : null
  const map = new Map<string, LabelTotal>()
  for (const e of entries) {
    if (keep && !keep.has(e.kind)) continue
    const norm = e.label.trim().toLowerCase()
    const prev = map.get(norm)
    const m = entryMinutes(e, now)
    if (prev) {
      prev.minutes += m
      prev.count   += 1
    } else {
      map.set(norm, { label: e.label.trim(), category_key: e.category_key, minutes: m, count: 1 })
    }
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes)
}

/* ── Objectifs hebdomadaires ─────────────────────────────────────── */

export interface GoalStatus {
  category_key: string
  spent:        number
  max:          number
  /** Minutes au-delà du plafond (0 si dans les clous). */
  over:         number
  /** spent / max — peut dépasser 1. */
  ratio:        number
}

export function goalStatus(
  entries: TimeEntry[],
  goals: TimeGoal[],
  now: Date = new Date(),
): GoalStatus[] {
  const spentByCat = new Map<string, number>()
  for (const e of entries) {
    spentByCat.set(e.category_key, (spentByCat.get(e.category_key) ?? 0) + entryMinutes(e, now))
  }
  return goals.map(g => {
    const spent = spentByCat.get(g.category_key) ?? 0
    return {
      category_key: g.category_key,
      spent,
      max: g.max_minutes_week,
      over: Math.max(0, spent - g.max_minutes_week),
      ratio: g.max_minutes_week > 0 ? spent / g.max_minutes_week : 0,
    }
  }).sort((a, b) => b.ratio - a.ratio)
}

/* ── Distraction Score ───────────────────────────────────────────── */

export type ScoreLevel = 'bon' | 'moyen' | 'eleve' | 'critique'

export interface DistractionScore {
  score:   number          // 0 → 100
  level:   ScoreLevel
  lostMin: number
  trackedMin: number
  /** Part du temps perdu, pondérée par la perte de contrôle (0 → 100). */
  base:    number
  /** Points ajoutés par les objectifs dépassés. */
  penalty: number
  exceededGoals: string[]
}

/* Un bloc subi pèse plus lourd qu'un bloc simplement non prévu : c'est
   la perte de contrôle qu'on cherche à rendre visible, pas le fait de
   s'être détendu. */
const LOSS_OF_CONTROL_WEIGHT = 1.25
/* Chaque objectif dépassé coûte 5 points — un signal, pas une sanction. */
const GOAL_PENALTY = 5

/**
 * Indice 0 → 100 : plus le temps non maîtrisé pèse dans la semaine,
 * plus il monte.
 *
 *   base    = 100 × (minutes perdues pondérées) / (minutes suivies)
 *   pénalité= 5 points par objectif hebdomadaire dépassé
 *   score   = min(100, base + pénalité)
 *
 * Volontairement rapporté au temps SUIVI et non aux 168 h de la semaine :
 * l'indice mesure la qualité du temps qu'on a décidé de suivre, il ne
 * récompense pas le fait d'oublier d'enregistrer ses journées.
 */
export function distractionScore(
  entries: TimeEntry[],
  goals: TimeGoal[] = [],
  now: Date = new Date(),
): DistractionScore {
  let tracked = 0
  let lost = 0
  let weighted = 0

  for (const e of entries) {
    const m = entryMinutes(e, now)
    tracked += m
    if (e.kind === 'perdu') {
      lost += m
      weighted += m * (e.control_level === 'perte_controle' ? LOSS_OF_CONTROL_WEIGHT : 1)
    }
  }

  const base = tracked > 0 ? (100 * weighted) / tracked : 0
  const exceeded = goalStatus(entries, goals, now).filter(g => g.over > 0).map(g => g.category_key)
  const penalty = exceeded.length * GOAL_PENALTY
  const score = Math.max(0, Math.min(100, Math.round(base + penalty)))

  return {
    score,
    level: score < 25 ? 'bon' : score < 50 ? 'moyen' : score < 75 ? 'eleve' : 'critique',
    lostMin: lost,
    trackedMin: tracked,
    base,
    penalty,
    exceededGoals: exceeded,
  }
}

export const SCORE_LEVELS: Record<ScoreLevel, { label: string; emoji: string; color: string; message: string }> = {
  bon: {
    label: 'Excellent', emoji: '🟢', color: '#10B981',
    message: 'Ton contrôle du temps est bon. Continue comme ça.',
  },
  moyen: {
    label: 'Correct', emoji: '🟡', color: '#CA8A04',
    message: 'Correct, mais il reste des fuites à récupérer.',
  },
  eleve: {
    label: 'Élevé', emoji: '🟠', color: '#EA580C',
    message: 'Temps perdu élevé cette semaine — regarde les sources ci-dessous.',
  },
  critique: {
    label: 'Critique', emoji: '🔴', color: '#DC2626',
    message: 'La majorité du temps suivi part en non planifié. Une seule décision cette semaine suffira.',
  },
}

/* ── Répartition dans le temps ───────────────────────────────────── */

/**
 * Découpe un bloc heure par heure et appelle `add(heureLocale, minutes)`.
 * Un bloc 17 h 40 → 19 h 10 pèse 20 min sur 17 h, 60 min sur 18 h et
 * 10 min sur 19 h : sans ce découpage, « la distraction commence après
 * 18 h » serait faux dès qu'un bloc chevauche l'heure.
 */
function splitByHour(start: Date, end: Date, add: (hour: number, minutes: number) => void): void {
  if (!(end.getTime() > start.getTime())) return

  let cursor = new Date(start)
  /* Garde-fou : un bloc aberrant ne doit pas boucler indéfiniment.
     26 itérations couvrent les 24 h maximum autorisés par l'API. */
  for (let guard = 0; guard < 30 && cursor.getTime() < end.getTime(); guard++) {
    const nextHour = new Date(cursor)
    nextHour.setMinutes(0, 0, 0)
    nextHour.setHours(nextHour.getHours() + 1)

    const sliceEnd = Math.min(nextHour.getTime(), end.getTime())
    add(cursor.getHours(), (sliceEnd - cursor.getTime()) / 60000)
    cursor = new Date(sliceEnd)
  }
}

export interface HourBucket { hour: number; total: number; lost: number }

export function minutesByHour(entries: TimeEntry[], now: Date = new Date()): HourBucket[] {
  const buckets: HourBucket[] = Array.from({ length: 24 }, (_, hour) => ({ hour, total: 0, lost: 0 }))
  for (const e of entries) {
    const start = new Date(e.started_at)
    if (!Number.isFinite(start.getTime())) continue
    splitByHour(start, entryEnd(e, now), (hour, minutes) => {
      buckets[hour].total += minutes
      if (e.kind === 'perdu') buckets[hour].lost += minutes
    })
  }
  return buckets
}

export interface DayBucket { day: number; label: string; total: number; lost: number; valeur: number }

export function minutesByDay(entries: TimeEntry[], now: Date = new Date()): DayBucket[] {
  const buckets: DayBucket[] = DAY_LABELS.map((label, day) => ({ day, label, total: 0, lost: 0, valeur: 0 }))
  for (const e of entries) {
    const start = new Date(e.started_at)
    if (!Number.isFinite(start.getTime())) continue
    const b = buckets[dayIndex(start)]
    const m = entryMinutes(e, now)
    b.total += m
    if (e.kind === 'perdu')  b.lost   += m
    if (e.kind === 'valeur') b.valeur += m
  }
  return buckets
}

/** Fenêtre de N heures consécutives où le temps perdu est le plus lourd. */
export function worstHourWindow(
  buckets: HourBucket[],
  size = 3,
): { start: number; end: number; lost: number } | null {
  let best: { start: number; end: number; lost: number } | null = null
  for (let h = 0; h + size <= 24; h++) {
    const lost = buckets.slice(h, h + size).reduce((s, b) => s + b.lost, 0)
    if (lost > 0 && (!best || lost > best.lost)) best = { start: h, end: h + size, lost }
  }
  return best
}

/* ── Frontière travail / hors travail ────────────────────────────── */

/**
 * L'instant tombe-t-il dans les heures de travail déclarées ?
 * C'est cette frontière qui fait la différence entre « film du soir en
 * famille » (repos) et « YouTube à 14 h » (temps perdu), et qui décide
 * du déclenchement de l'alerte.
 */
export function isWorkTime(d: Date, settings: TimeSettings): boolean {
  const isoDay = dayIndex(d) + 1                     // 1 = lundi … 7 = dimanche
  if (!settings.work_days.includes(isoDay)) return false
  const h = d.getHours()
  return h >= settings.work_start_hour && h < settings.work_end_hour
}

/* ── Alerte intelligente ─────────────────────────────────────────── */

export interface DistractionAlert {
  minutes:  number
  label:    string
  category_key: string
}

/**
 * « Tu es sur Instagram depuis 45 minutes, pendant ton temps de travail. »
 *
 * Ne se déclenche que si les trois conditions sont réunies : chronomètre
 * en cours sur une catégorie de distraction, seuil dépassé, et heure de
 * travail. Hors de ces heures, une longue session n'est pas une dérive :
 * c'est du repos, et le module ne vient pas culpabiliser dessus.
 */
export function distractionAlert(
  running: TimeEntry | null | undefined,
  settings: TimeSettings,
  now: Date = new Date(),
): DistractionAlert | null {
  if (!running || running.ended_at) return null
  if (!settings.alerts_enabled) return null
  if (!isDistraction(running.category_key)) return null
  if (!isWorkTime(now, settings)) return null

  const minutes = entryMinutes(running, now)
  if (minutes < settings.alert_threshold_min) return null

  return { minutes, label: running.label, category_key: running.category_key }
}

/* ── Détection de schémas ────────────────────────────────────────── */

export interface Pattern {
  key:      string
  emoji:    string
  text:     string
  severity: 'info' | 'warn'
}

/** Un bloc « long » de travail — au-delà, la fatigue s'installe. */
const LONG_SESSION_MIN = 90
/** Fenêtre pendant laquelle une distraction est imputée au bloc précédent. */
const AFTERMATH_MIN = 45
/* Un bloc dure au plus 24 h (plafond posé par l'API) : au-delà de
   24 h + la fenêtre, aucun bloc antérieur ne peut plus se terminer
   assez près pour être la cause — la remontée peut s'arrêter là. */
const LOOKBACK_MIN = 24 * 60 + AFTERMATH_MIN

/**
 * Répond aux questions du module : quel jour, quelle heure, après quoi ?
 * Chaque schéma n'est renvoyé QUE s'il repose sur assez de matière —
 * annoncer « tu te disperses le mardi » sur un seul bloc de 10 min
 * serait du bruit, pas une information.
 */
export function detectPatterns(
  entries: TimeEntry[],
  settings: TimeSettings = DEFAULT_SETTINGS,
  now: Date = new Date(),
): Pattern[] {
  const out: Pattern[] = []
  const lostTotal = entries.reduce((s, e) => s + (e.kind === 'perdu' ? entryMinutes(e, now) : 0), 0)
  if (lostTotal < 30) return out

  /* 1. Le pire jour de la semaine */
  const days = minutesByDay(entries, now)
  const worstDay = [...days].sort((a, b) => b.lost - a.lost)[0]
  if (worstDay && worstDay.lost >= 30 && worstDay.lost / lostTotal >= 0.3) {
    out.push({
      key: 'worst_day', emoji: '📅', severity: 'warn',
      text: `${worstDay.label} est ton jour le plus dispersé — ${formatMinutes(worstDay.lost)} de temps perdu, `
          + `soit ${Math.round((worstDay.lost / lostTotal) * 100)} % du total.`,
    })
  }

  /* 2. Le créneau horaire critique */
  const hours = minutesByHour(entries, now)
  const window = worstHourWindow(hours, 3)
  if (window && window.lost >= 30 && window.lost / lostTotal >= 0.3) {
    out.push({
      key: 'worst_window', emoji: '⏰', severity: 'warn',
      text: `L'essentiel de ton temps perdu se joue entre ${String(window.start).padStart(2, '0')}:00 `
          + `et ${String(window.end).padStart(2, '0')}:00 — ${formatMinutes(window.lost)}.`,
    })
  }

  /* 3. Après une longue session de travail */
  const sorted = [...entries].sort(
    (a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime()
  )
  let afterLong = 0
  let afterMeeting = 0
  for (let i = 0; i < sorted.length; i++) {
    const e = sorted[i]
    if (e.kind !== 'perdu') continue
    const start = new Date(e.started_at).getTime()

    for (let j = i - 1; j >= 0; j--) {
      const prev = sorted[j]
      const prevEnd = entryEnd(prev, now).getTime()
      /* Les blocs sont triés par début : dès qu'on remonte au-delà de la
         fenêtre, les précédents sont encore plus anciens → on s'arrête. */
      if (start - new Date(prev.started_at).getTime() > LOOKBACK_MIN * 60000) break
      const gap = (start - prevEnd) / 60000
      if (gap < 0 || gap > AFTERMATH_MIN) continue

      if (prev.kind === 'valeur' && entryMinutes(prev, now) >= LONG_SESSION_MIN) {
        afterLong += entryMinutes(e, now)
        break
      }
      if (prev.category_key === 'reunion') {
        afterMeeting += entryMinutes(e, now)
        break
      }
    }
  }
  if (afterLong >= 30) {
    out.push({
      key: 'after_long_session', emoji: '🧠', severity: 'info',
      text: `${formatMinutes(afterLong)} de temps perdu suivent directement une longue session de travail `
          + `(≥ ${LONG_SESSION_MIN} min). La fatigue précède la dispersion : planifie une vraie pause à la place.`,
    })
  }
  if (afterMeeting >= 30) {
    out.push({
      key: 'after_meeting', emoji: '📞', severity: 'info',
      text: `${formatMinutes(afterMeeting)} de temps perdu arrivent juste après une réunion. `
          + `Enchaîne sur une tâche décidée À L'AVANCE en sortant de réunion.`,
    })
  }

  /* 4. Le soir */
  const evening = hours.slice(18).reduce((s, b) => s + b.lost, 0)
  if (evening / lostTotal >= 0.4) {
    out.push({
      key: 'evening', emoji: '🌙', severity: 'info',
      text: `${Math.round((evening / lostTotal) * 100)} % de ton temps perdu se produit après 18:00. `
          + `Si c'est ton repos, déclare-le comme tel : il cessera de compter comme une perte.`,
    })
  }

  /* 5. Pendant les heures de travail */
  const duringWork = entries.reduce(
    (s, e) => s + (e.kind === 'perdu' && isWorkTime(new Date(e.started_at), settings)
      ? entryMinutes(e, now) : 0),
    0
  )
  if (duringWork / lostTotal >= 0.5) {
    out.push({
      key: 'during_work', emoji: '⚠️', severity: 'warn',
      text: `${formatMinutes(duringWork)} de temps perdu tombent PENDANT tes heures de travail `
          + `(${settings.work_start_hour}h–${settings.work_end_hour}h) — c'est le temps le plus cher de ta semaine.`,
    })
  }

  /* 6. Perte de contrôle */
  const lossEntries = entries.filter(e => e.control_level === 'perte_controle')
  const lossMin = lossEntries.reduce((s, e) => s + entryMinutes(e, now), 0)
  if (lossEntries.length >= 2 && lossMin >= 45) {
    out.push({
      key: 'loss_of_control', emoji: '🔴', severity: 'warn',
      text: `${lossEntries.length} blocs déclarés « perte de contrôle » pour ${formatMinutes(lossMin)} `
          + `(${formatMinutes(lossMin / lossEntries.length)} en moyenne). C'est là qu'une règle simple aide : `
          + `poser un minuteur AVANT d'ouvrir l'application.`,
    })
  }

  return out
}

/* ── Rapport hebdomadaire / CEO ──────────────────────────────────── */

export interface WeeklyReport {
  weekStart: Date
  weekEnd:   Date
  totals:    KindTotals
  previous:  KindTotals
  /** Minutes perdues en moins par rapport à la semaine précédente (>0 = récupérées). */
  recoveredMin: number
  byCategory:   CategoryTotal[]
  /** Catégories du seul temps PERDU — un film assumé et un film subi
   *  partagent la catégorie mais ne racontent pas la même chose. */
  lostByCategory: CategoryTotal[]
  /** Catégories du temps utile (haute valeur + neutre). */
  usefulByCategory: CategoryTotal[]
  topLost:      LabelTotal[]
  topValue:     CategoryTotal[]
  score:        DistractionScore
  goals:        GoalStatus[]
  patterns:     Pattern[]
  /** Projection : le temps perdu de cette semaine, sur un an. */
  yearlyLostHours: number
  /** Heures récupérables par mois en divisant par deux la 1re source. */
  monthlyGainIfHalved: number
  /** Nom de la 1re source de perte (pour la phrase de décision). */
  topLostLabel: string | null
  decision:     string | null
  /** Part du temps à haute valeur dans le temps suivi (0 → 1). */
  highValueShare: number
  /** Progression vers l'objectif d'heures à haute valeur (0 → 1+). */
  highValueGoalRatio: number
}

/* 4,33 semaines par mois en moyenne (52 / 12) — la conversion utilisée
   pour projeter un gain hebdomadaire en gain mensuel. */
const WEEKS_PER_MONTH = 52 / 12

export function buildWeeklyReport(
  allEntries: TimeEntry[],
  goals: TimeGoal[],
  settings: TimeSettings,
  weekStart: Date,
  now: Date = new Date(),
): WeeklyReport {
  const weekEnd  = addDays(weekStart, 7)
  const week     = inRange(allEntries, weekStart, weekEnd)
  const prevWeek = inRange(allEntries, addDays(weekStart, -7), weekStart)

  const totals   = totalsByKind(week, now)
  const previous = totalsByKind(prevWeek, now)
  const byCategory = totalsByCategory(week, now)

  const topLost = totalsByLabel(week, ['perdu'], now).slice(0, 3)
  const topValue = totalsByCategory(week.filter(e => e.kind === 'valeur'), now).slice(0, 3)

  const score = distractionScore(week, goals, now)
  const first = topLost[0] ?? null

  /* « Réduis X de moitié » — la décision la plus simple qui rapporte le
     plus. On la chiffre en heures par mois pour qu'elle pèse vraiment. */
  const monthlyGainIfHalved = first ? (first.minutes * 0.5 * WEEKS_PER_MONTH) / 60 : 0

  const reinvest = ['sales', 'strategy']
    .filter(k => !topValue.some(t => t.category_key === k))
  const reinvestLabel = (reinvest.length ? reinvest : ['sales', 'strategy'])
    .map(k => getCategory(k).label).join(' et ')

  const decision = first && first.minutes >= 30
    ? `Réduis « ${first.label} » de ${formatMinutes(first.minutes)} à `
      + `${formatMinutes(first.minutes / 2)} la semaine prochaine, et réinvestis le temps récupéré `
      + `dans ${reinvestLabel} — soit ${formatHours(monthlyGainIfHalved * 60)} par mois.`
    : null

  return {
    weekStart, weekEnd,
    totals, previous,
    recoveredMin: previous.perdu - totals.perdu,
    byCategory,
    lostByCategory:   totalsByCategory(week.filter(e => e.kind === 'perdu'), now),
    usefulByCategory: totalsByCategory(week.filter(e => e.kind === 'valeur' || e.kind === 'neutre'), now),
    topLost,
    topValue,
    score,
    goals: goalStatus(week, goals, now),
    patterns: detectPatterns(week, settings, now),
    yearlyLostHours: (totals.perdu * 52) / 60,
    monthlyGainIfHalved,
    topLostLabel: first?.label ?? null,
    decision,
    highValueShare: totals.total > 0 ? totals.valeur / totals.total : 0,
    highValueGoalRatio: settings.weekly_high_value_hours > 0
      ? totals.valeur / (settings.weekly_high_value_hours * 60)
      : 0,
  }
}
