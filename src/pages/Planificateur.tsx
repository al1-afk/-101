import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import {
  Target, TrendingUp, Plus, Trash2, Edit2, Check, RotateCcw,
  Trophy, Zap, ListChecks, Sparkles, Calendar as CalendarIcon,
  ChevronLeft, ChevronRight, ArrowRight, Save, BookmarkPlus,
  CheckCircle2, MinusCircle, RotateCw, Flame, X, Bell, BellOff, Download, ExternalLink,
  AlertTriangle, Lightbulb,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input }  from '@/components/ui/input'
import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { useProspects } from '@/hooks/useProspects'
import { useFactures } from '@/hooks/useFactures'

const STORAGE_KEY      = 'gestiq_planner'
const WEEKS_KEY        = 'gestiq_planner_weeks'
const TEMPLATES_KEY    = 'gestiq_planner_templates'
const NOTIF_LEAD_KEY   = 'gestiq_planner_notif_lead'
const NOTIF_FIRED_KEY  = 'gestiq_planner_notif_fired'

/* ─── Types ──────────────────────────────────────────────────── */
type CategoryKey =
  | 'wakeup' | 'sport' | 'leads' | 'comms' | 'lunch' | 'closing'
  | 'service' | 'team' | 'outdoor' | 'rest' | 'learning' | 'review'
  | 'sleep' | 'family' | 'nature' | 'goals' | 'evening' | 'work' | 'free'

type BlockStatus = 'done' | 'skip' | 'postpone'

interface Block {
  time:     string
  emoji:    string
  title:    string
  subtitle?:string
  category: CategoryKey
}

interface DayPlan {
  day:    string
  short:  string
  weekend: boolean
  blocks: Block[]
}

interface PlannerData {
  title:    string
  subtitle: string
  goal: {
    revenue:   number
    months:    number
    avgClient: number
  }
  weeklyKpis: {
    leads:    number
    calls:    number
    closings: number
    revenue:  number
  }
  habits: string[]
  rules:  string[]
  days:   DayPlan[]
}

interface WeekState {
  blockStatus: Record<string, BlockStatus>      // `${dayIdx}_${blockIdx}` -> status
  habitChecks: Record<string, boolean>           // `${habitIdx}_${dayIdx}` -> bool
  callsManual?: number                            // manual override for calls KPI (no auto source)
}

type WeeksMap = Record<string, WeekState>        // ISO week key -> state

interface PlannerTemplate {
  id:         string
  name:       string
  createdAt:  string
  data:       Pick<PlannerData, 'days' | 'habits' | 'rules' | 'weeklyKpis' | 'goal' | 'title' | 'subtitle'>
}

/* ─── Category palette ──────────────────────────────────────── */
const CAT: Record<CategoryKey, { color: string; bg: string; ring: string; dot: string }> = {
  wakeup:   { color: 'text-amber-700  dark:text-amber-300',   bg: 'bg-amber-50  dark:bg-amber-500/10',   ring: 'border-amber-200  dark:border-amber-500/30',  dot: 'bg-amber-500'   },
  sport:    { color: 'text-emerald-700 dark:text-emerald-300', bg: 'bg-emerald-50 dark:bg-emerald-500/10', ring: 'border-emerald-200 dark:border-emerald-500/30', dot: 'bg-emerald-500' },
  leads:    { color: 'text-green-700  dark:text-green-300',   bg: 'bg-green-50  dark:bg-green-500/10',   ring: 'border-green-200  dark:border-green-500/30',  dot: 'bg-green-500'   },
  comms:    { color: 'text-cyan-700   dark:text-cyan-300',    bg: 'bg-cyan-50   dark:bg-cyan-500/10',    ring: 'border-cyan-200   dark:border-cyan-500/30',   dot: 'bg-cyan-500'    },
  lunch:    { color: 'text-orange-700 dark:text-orange-300',  bg: 'bg-orange-50 dark:bg-orange-500/10',  ring: 'border-orange-200 dark:border-orange-500/30', dot: 'bg-orange-500'  },
  closing:  { color: 'text-violet-700 dark:text-violet-300',  bg: 'bg-violet-50 dark:bg-violet-500/10',  ring: 'border-violet-200 dark:border-violet-500/30', dot: 'bg-violet-500'  },
  service:  { color: 'text-blue-700   dark:text-blue-300',    bg: 'bg-blue-50   dark:bg-blue-500/10',    ring: 'border-blue-200   dark:border-blue-500/30',   dot: 'bg-blue-500'    },
  team:     { color: 'text-pink-700   dark:text-pink-300',    bg: 'bg-pink-50   dark:bg-pink-500/10',    ring: 'border-pink-200   dark:border-pink-500/30',   dot: 'bg-pink-500'    },
  outdoor:  { color: 'text-teal-700   dark:text-teal-300',    bg: 'bg-teal-50   dark:bg-teal-500/10',    ring: 'border-teal-200   dark:border-teal-500/30',   dot: 'bg-teal-500'    },
  rest:     { color: 'text-sky-700    dark:text-sky-300',     bg: 'bg-sky-50    dark:bg-sky-500/10',     ring: 'border-sky-200    dark:border-sky-500/30',    dot: 'bg-sky-500'     },
  learning: { color: 'text-indigo-700 dark:text-indigo-300',  bg: 'bg-indigo-50 dark:bg-indigo-500/10',  ring: 'border-indigo-200 dark:border-indigo-500/30', dot: 'bg-indigo-500'  },
  review:   { color: 'text-fuchsia-700 dark:text-fuchsia-300',bg: 'bg-fuchsia-50 dark:bg-fuchsia-500/10',ring: 'border-fuchsia-200 dark:border-fuchsia-500/30', dot: 'bg-fuchsia-500' },
  sleep:    { color: 'text-slate-600  dark:text-slate-300',   bg: 'bg-slate-100 dark:bg-slate-800/40',   ring: 'border-slate-200  dark:border-slate-700',     dot: 'bg-slate-500'   },
  family:   { color: 'text-rose-700   dark:text-rose-300',    bg: 'bg-rose-50   dark:bg-rose-500/10',    ring: 'border-rose-200   dark:border-rose-500/30',   dot: 'bg-rose-500'    },
  nature:   { color: 'text-lime-700   dark:text-lime-300',    bg: 'bg-lime-50   dark:bg-lime-500/10',    ring: 'border-lime-200   dark:border-lime-500/30',   dot: 'bg-lime-500'    },
  goals:    { color: 'text-purple-700 dark:text-purple-300',  bg: 'bg-purple-50 dark:bg-purple-500/10',  ring: 'border-purple-200 dark:border-purple-500/30', dot: 'bg-purple-500'  },
  evening:  { color: 'text-stone-700  dark:text-stone-300',   bg: 'bg-stone-50  dark:bg-stone-800/30',   ring: 'border-stone-200  dark:border-stone-700',     dot: 'bg-stone-500'   },
  work:     { color: 'text-zinc-700   dark:text-zinc-300',    bg: 'bg-zinc-50   dark:bg-zinc-500/10',    ring: 'border-zinc-200   dark:border-zinc-500/30',   dot: 'bg-zinc-500'    },
  free:     { color: 'text-neutral-600 dark:text-neutral-400', bg: 'bg-neutral-50 dark:bg-neutral-800/30', ring: 'border-neutral-200 dark:border-neutral-700',  dot: 'bg-neutral-500' },
}

const CAT_LIST: { key: CategoryKey; label: string }[] = [
  { key: 'wakeup',   label: 'Réveil'              },
  { key: 'sport',    label: 'Sport'               },
  { key: 'leads',    label: 'Leads'               },
  { key: 'comms',    label: 'Communications'      },
  { key: 'lunch',    label: 'Repas'               },
  { key: 'closing',  label: 'Closing'             },
  { key: 'service',  label: 'Service client'      },
  { key: 'team',     label: 'Équipe'              },
  { key: 'outdoor',  label: 'Extérieur'           },
  { key: 'rest',     label: 'Repos / Hygiène'     },
  { key: 'learning', label: 'Apprentissage'       },
  { key: 'review',   label: 'Bilan'               },
  { key: 'sleep',    label: 'Sommeil'             },
  { key: 'family',   label: 'Famille'             },
  { key: 'nature',   label: 'Nature'              },
  { key: 'goals',    label: 'Objectifs / Vision'  },
  { key: 'evening',  label: 'Soirée'              },
  { key: 'work',     label: 'Travail (autre)'     },
  { key: 'free',     label: 'Libre'               },
]

/* Variety suggestions per category — shown when an activity repeats too often. */
const VARIETY_SUGGESTIONS: Partial<Record<CategoryKey, string[]>> = {
  sport:    ['Yoga', 'Natation', 'Vélo', 'Course à pied', 'Boxe', 'HIIT', 'Étirements', 'Pilates'],
  outdoor:  ['Randonnée', 'Photographie', 'Jardinage', 'Marche en forêt', 'Vélo en plein air', 'Course en parc'],
  learning: ['Podcast', 'Documentaire', 'Atelier pratique', 'Conférence en ligne', 'Mentor / coach', 'Étude de cas'],
  rest:     ['Sauna', 'Massage', 'Bain chaud', 'Sieste réparatrice', 'Aromathérapie', 'Marche silencieuse'],
  family:   ['Sortie au parc', 'Cuisine ensemble', 'Jeu de société', 'Visite musée', 'Promenade vélo'],
  evening:  ['Lecture papier', 'Journal écrit', 'Jeux en famille', 'Films classiques', 'Soirée musique'],
  closing:  ['Démo live', 'Webinar', 'Étude de cas client', 'Témoignages', 'Workshop offre'],
  comms:    ['Email personnalisé', 'DM LinkedIn', 'Voix WhatsApp', 'Vidéo personnalisée', 'Suivi qualifié'],
  leads:    ['Cold email', 'Cold call', 'LinkedIn outbound', 'Article SEO', 'YouTube short', 'Partenariat'],
  service:  ['Welcome call', 'Check-in trimestriel', 'Cas client', 'NPS feedback', 'Programme fidélité'],
  team:     ['1-on-1', 'Stand-up', 'Rétrospective', 'Brainstorm', 'Workshop process'],
  review:   ['Revue par rôle', 'Bilan visuel', 'Audit chiffré', 'Feedback équipe', 'Tableau de bord'],
  goals:    ['Mind mapping', 'Vision board', 'Lecture stratégique', 'Walk & think', 'Quarterly OKR'],
  nature:   ['Plage', 'Forêt', 'Montagne', 'Lac', 'Parc botanique', 'Jardin public'],
  wakeup:   ['Méditation 10min', 'Étirements doux', 'Respiration 4-7-8', 'Cold shower', 'Marche matinale'],
  lunch:    ['Repas dehors', 'Cuisine maison', 'Salade fraîche', 'Repas avec un proche'],
  work:     ['Deep work 90min', 'Pomodoro 4×25', 'Atelier créatif', 'Audit processus'],
}

/** Activity is "repetitive" when its title appears in this many days or more. */
const REPETITION_THRESHOLD = 5

/* Map categories to in-app routes (relative to tenant slug). */
const CAT_LINKS: Partial<Record<CategoryKey, { path: string; label: string }>> = {
  leads:   { path: 'prospects', label: 'Voir prospects' },
  comms:   { path: 'prospects', label: 'Voir prospects' },
  closing: { path: 'devis',     label: 'Voir devis'     },
  service: { path: 'clients',   label: 'Voir clients'   },
  team:    { path: 'taches',    label: 'Voir tâches'    },
  review:  { path: 'finances',  label: 'Voir finances'  },
  goals:   { path: 'rapports',  label: 'Voir rapports'  },
  work:    { path: 'taches',    label: 'Voir tâches'    },
}

/* ─── Default schedule ───────────────────────────────────────── */
const WEEKDAY_TEMPLATE: Block[] = [
  { time: '06:00 – 07:00', emoji: '☀️', title: 'Réveil',                  subtitle: 'Eau · méditation · planification du jour', category: 'wakeup'   },
  { time: '07:00 – 08:00', emoji: '💪', title: 'Sport',                   subtitle: 'Force / cardio',                          category: 'sport'    },
  { time: '08:00 – 10:00', emoji: '🎯', title: 'Leads (acquisition)',     subtitle: 'Pubs · messages · recherche',             category: 'leads'    },
  { time: '10:00 – 12:00', emoji: '📞', title: 'Communications',          subtitle: 'Réponse aux prospects',                   category: 'comms'    },
  { time: '12:00 – 13:00', emoji: '🍽️', title: 'Déjeuner + pause',        subtitle: 'Sans écran',                              category: 'lunch'    },
  { time: '13:00 – 15:00', emoji: '🤝', title: 'Closing',                 subtitle: 'Offres · appels · persuasion',            category: 'closing'  },
  { time: '15:00 – 16:00', emoji: '👥', title: 'Suivi clients',           subtitle: 'Service · upsell · fidélité',             category: 'service'  },
  { time: '16:00 – 17:00', emoji: '⚙️', title: 'Équipe & tâches',         subtitle: 'Distribution · supervision',              category: 'team'     },
  { time: '17:00 – 18:00', emoji: '🚶', title: 'Sport / extérieur',       subtitle: 'Marche · air frais',                      category: 'outdoor'  },
  { time: '18:00 – 19:00', emoji: '🛁', title: 'Détente',                 subtitle: 'Bain · repas léger',                      category: 'rest'     },
  { time: '19:00 – 21:00', emoji: '📚', title: 'Apprentissage',           subtitle: 'Lecture · contenus · cours',              category: 'learning' },
  { time: '21:00 – 22:00', emoji: '📊', title: 'Bilan du jour',           subtitle: 'Chiffres · améliorations',                category: 'review'   },
  { time: '22:00 – 23:00', emoji: '🌙', title: 'Écrans off · coucher',    subtitle: 'Sommeil tôt',                             category: 'sleep'    },
]

const FRIDAY_TEMPLATE: Block[] = WEEKDAY_TEMPLATE.map(b => {
  if (b.category === 'comms')   return { ...b, title: 'Closing grandes affaires', subtitle: 'Offres puissantes · négociation', category: 'closing' as CategoryKey, emoji: '⭐' }
  if (b.category === 'team')    return { ...b, title: 'Systèmes & process',       subtitle: 'Tableaux · automatisations',     category: 'work'    as CategoryKey, emoji: '⚙️' }
  if (b.category === 'review')  return { ...b, title: 'Plan de la semaine prochaine', subtitle: 'Objectifs · tâches · priorités', category: 'goals' as CategoryKey, emoji: '📋' }
  return b
})

const SATURDAY_TEMPLATE: Block[] = [
  { time: 'Matin',         emoji: '☀️', title: 'Développement personnel', subtitle: 'Lecture · contenu · formations', category: 'learning' },
  { time: 'Midi',          emoji: '👨‍👩‍👧', title: 'Famille',              subtitle: '',                              category: 'family'   },
  { time: 'Après-midi',    emoji: '📋', title: 'Préparation grande campagne', subtitle: 'Pubs · offres · idées',     category: 'goals'    },
  { time: 'Soir',          emoji: '🌙', title: 'Repos total',             subtitle: 'Aucun travail',                  category: 'evening'  },
]

const SUNDAY_TEMPLATE: Block[] = [
  { time: 'Matin',         emoji: '😴', title: 'Sommeil long',            subtitle: 'Corps & esprit',                 category: 'sleep'    },
  { time: 'Midi',          emoji: '🌳', title: 'Sortie en nature',        subtitle: 'Marche · air pur',               category: 'nature'   },
  { time: 'Après-midi',    emoji: '🎯', title: 'Méditation + objectifs',  subtitle: 'Focus · gratitude · vision',     category: 'goals'    },
  { time: 'Soir',          emoji: '📖', title: 'Lecture / film / détente', subtitle: '',                              category: 'evening'  },
]

const DEFAULT_DATA: PlannerData = {
  title:    'Plan hebdo · Objectif 1 000 000 $',
  subtitle: 'Système quotidien haute productivité pour bâtir une agence digitale rentable',
  goal:     { revenue: 1_000_000, months: 12, avgClient: 700 },
  weeklyKpis: { leads: 150, calls: 50, closings: 15, revenue: 10_000 },
  habits: [
    'Sport quotidien (20–45 min)',
    'Eau (2–2 L par jour)',
    'Lecture / apprentissage 1 h',
    "Pas d'écran après 22:00",
    'Sommeil 7–8 h',
  ],
  rules: [
    "Concentre-toi sur le résultat, pas l'effort.",
    'Chaque jour = un pas vers le grand objectif.',
    'Mesure → Analyse → Améliore → Répète.',
    'Énergie avant temps, focus avant quantité.',
    'Ta santé est ton vrai capital.',
  ],
  days: [
    { day: 'Lundi',    short: 'Lun', weekend: false, blocks: [...WEEKDAY_TEMPLATE] },
    { day: 'Mardi',    short: 'Mar', weekend: false, blocks: [...WEEKDAY_TEMPLATE] },
    { day: 'Mercredi', short: 'Mer', weekend: false, blocks: [...WEEKDAY_TEMPLATE] },
    { day: 'Jeudi',    short: 'Jeu', weekend: false, blocks: [...WEEKDAY_TEMPLATE] },
    { day: 'Vendredi', short: 'Ven', weekend: false, blocks: [...FRIDAY_TEMPLATE]  },
    { day: 'Samedi',   short: 'Sam', weekend: true,  blocks: [...SATURDAY_TEMPLATE] },
    { day: 'Dimanche', short: 'Dim', weekend: true,  blocks: [...SUNDAY_TEMPLATE]   },
  ],
}

/* ─── Time / week helpers ────────────────────────────────────── */

/** ISO week key like "2026-W18". Monday-first. */
function getISOWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7)
  return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`
}

/** JS getDay() (Sun=0..Sat=6) → Monday-first index (Mon=0..Sun=6). */
function mondayIdx(d: Date): number {
  const j = d.getDay()
  return j === 0 ? 6 : j - 1
}

/** Returns the Monday of the week that contains `d`. */
function startOfISOWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - mondayIdx(out))
  return out
}

function shiftWeek(weekKey: string, delta: number): string {
  const [y, w] = weekKey.split('-W').map(Number)
  const jan4 = new Date(Date.UTC(y, 0, 4))
  jan4.setUTCDate(jan4.getUTCDate() - ((jan4.getUTCDay() || 7) - 1))
  const ref = new Date(jan4.getTime() + (w - 1 + delta) * 7 * 86400000)
  return getISOWeek(new Date(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()))
}

function weekDateRangeLabel(weekKey: string): string {
  const [y, w] = weekKey.split('-W').map(Number)
  const jan4 = new Date(y, 0, 4)
  jan4.setDate(jan4.getDate() - mondayIdx(jan4))
  const monday = new Date(jan4.getTime() + (w - 1) * 7 * 86400000)
  const sunday = new Date(monday.getTime() + 6 * 86400000)
  const fmt = (x: Date) => x.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
  return `${fmt(monday)} → ${fmt(sunday)}`
}

/** Default ranges for named slots used on weekend days. */
const NAMED_SLOTS: Record<string, { start: number; end: number }> = {
  matin:        { start:  8 * 60, end: 12 * 60 },
  midi:         { start: 12 * 60, end: 14 * 60 },
  'apres-midi': { start: 14 * 60, end: 18 * 60 },
  'après-midi': { start: 14 * 60, end: 18 * 60 },
  soir:         { start: 18 * 60, end: 22 * 60 },
  nuit:         { start: 22 * 60, end: 24 * 60 },
}

/** Parse "06:00 – 07:00" → { start: 360, end: 420 } in minutes. Falls back to named slots. */
function parseTimeRange(time: string): { start: number; end: number } | null {
  const m = time.match(/^(\d{1,2}):(\d{2})\s*[–\-—]\s*(\d{1,2}):(\d{2})/)
  if (m) {
    const start = +m[1] * 60 + +m[2]
    const end   = +m[3] * 60 + +m[4]
    return { start, end }
  }
  const norm = time.trim().toLowerCase().replace(/\s+/g, '-')
  for (const [k, v] of Object.entries(NAMED_SLOTS)) {
    if (norm === k || norm.startsWith(k)) return v
  }
  return null
}

/** Format minutes-of-day as HH:MM. */
function toHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

/** Compose a "HH:MM – HH:MM" string from start/end minutes. */
function formatTimeRange(start: number, end: number): string {
  return `${toHHMM(start)} – ${toHHMM(end)}`
}

/** Returns the actual Date for (weekKey, dayIdx). Hours zeroed. */
function dateForWeekDay(weekKey: string, dayIdx: number): Date {
  const [y, w] = weekKey.split('-W').map(Number)
  const jan4 = new Date(y, 0, 4)
  jan4.setDate(jan4.getDate() - mondayIdx(jan4))
  const monday = new Date(jan4.getTime() + (w - 1) * 7 * 86400000)
  const target = new Date(monday)
  target.setDate(monday.getDate() + dayIdx)
  target.setHours(0, 0, 0, 0)
  return target
}

function nowMinutes(d = new Date()): number {
  return d.getHours() * 60 + d.getMinutes()
}

/* ─── Google Calendar / ICS export ──────────────────────────── */

/** Format a Date as YYYYMMDDTHHMMSSZ (UTC, used by Google Cal & ICS). */
function fmtIcsUtc(d: Date): string {
  return d.toISOString().replace(/[-:]|\.\d{3}/g, '')
}

const DOW_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const

/** Build a Google Calendar "Add event" URL with weekly recurrence. */
function googleCalendarUrl(block: Block, dayIdx: number, weekKey: string): string | null {
  const range = parseTimeRange(block.time)
  if (!range) return null
  const base = dateForWeekDay(weekKey, dayIdx)
  const startDt = new Date(base); startDt.setMinutes(range.start)
  const endDt   = new Date(base); endDt.setMinutes(range.end)
  const dow = DOW_CODES[startDt.getDay()]
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text:   `${block.emoji} ${block.title}`.trim(),
    dates:  `${fmtIcsUtc(startDt)}/${fmtIcsUtc(endDt)}`,
    details: block.subtitle || '',
    recur:  `RRULE:FREQ=WEEKLY;BYDAY=${dow}`,
  })
  return `https://calendar.google.com/calendar/render?${params.toString()}`
}

/** Build an ICS string for the entire week (one VEVENT per block, weekly recurring). */
function buildWeekICS(data: PlannerData, weekKey: string): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GestiQ//Planificateur//FR',
    'CALSCALE:GREGORIAN',
  ]
  const sanitize = (s: string) => s.replace(/\\/g, '\\\\').replace(/[\n\r]/g, ' ').replace(/[,;]/g, ' ')
  data.days.forEach((day, di) => {
    const base = dateForWeekDay(weekKey, di)
    day.blocks.forEach((b, bi) => {
      const range = parseTimeRange(b.time)
      if (!range) return
      const startDt = new Date(base); startDt.setMinutes(range.start)
      const endDt   = new Date(base); endDt.setMinutes(range.end)
      const dow = DOW_CODES[startDt.getDay()]
      const stamp = fmtIcsUtc(new Date())
      lines.push('BEGIN:VEVENT')
      lines.push(`UID:planner-${weekKey}-${di}-${bi}@gestiq`)
      lines.push(`DTSTAMP:${stamp}`)
      lines.push(`DTSTART:${fmtIcsUtc(startDt)}`)
      lines.push(`DTEND:${fmtIcsUtc(endDt)}`)
      lines.push(`SUMMARY:${sanitize(`${b.emoji} ${b.title}`)}`)
      if (b.subtitle) lines.push(`DESCRIPTION:${sanitize(b.subtitle)}`)
      lines.push(`RRULE:FREQ=WEEKLY;BYDAY=${dow}`)
      lines.push('END:VEVENT')
    })
  })
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

/** Trigger a download of the ICS file. */
function downloadICS(data: PlannerData, weekKey: string) {
  const ics = buildWeekICS(data, weekKey)
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `planificateur-${weekKey}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/* ─── Persistence ───────────────────────────────────────────── */
function loadData(): PlannerData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_DATA
    const parsed = JSON.parse(raw) as PlannerData
    if (!parsed.days || !parsed.goal || !parsed.weeklyKpis) return DEFAULT_DATA
    return parsed
  } catch { return DEFAULT_DATA }
}

function loadWeeks(): WeeksMap {
  try {
    const raw = localStorage.getItem(WEEKS_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as WeeksMap
  } catch { return {} }
}

function loadTemplates(): PlannerTemplate[] {
  try {
    const raw = localStorage.getItem(TEMPLATES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function fmtMoney(n: number) {
  return n.toLocaleString('fr-FR') + ' $'
}

const STATUS_NEXT: Record<BlockStatus | 'none', BlockStatus | 'none'> = {
  none:     'done',
  done:     'skip',
  skip:     'postpone',
  postpone: 'none',
}

const STATUS_META: Record<BlockStatus, { label: string; color: string; Icon: React.ElementType }> = {
  done:     { label: 'Terminé',   color: 'text-emerald-600 dark:text-emerald-400', Icon: CheckCircle2 },
  skip:     { label: 'Tt skipped', color: 'text-slate-500 dark:text-slate-400',    Icon: MinusCircle  },
  postpone: { label: 'Reporté',   color: 'text-amber-600 dark:text-amber-400',    Icon: RotateCw     },
}

/* ─── Page ──────────────────────────────────────────────────── */
export default function Planificateur() {
  const navigate = useNavigate()
  const [data, setData] = useState<PlannerData>(() => loadData())
  const [weeks, setWeeks] = useState<WeeksMap>(() => loadWeeks())
  const [templates, setTemplates] = useState<PlannerTemplate[]>(() => loadTemplates())
  const [editing, setEditing] = useState<{ dayIdx: number; blockIdx: number } | null>(null)

  const [weekKey, setWeekKey] = useState<string>(() => getISOWeek(new Date()))
  const [tick, setTick] = useState(0) // forces re-render every 60s for "now" line

  const [tmplDialogOpen, setTmplDialogOpen] = useState(false)
  const [newTmplName, setNewTmplName] = useState('')

  /* notification state */
  const [notifPerm, setNotifPerm] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied',
  )
  const [leadMin, setLeadMin] = useState<number>(() => {
    try {
      const v = +(localStorage.getItem(NOTIF_LEAD_KEY) ?? '10')
      return [0, 5, 10, 15, 30, 60].includes(v) ? v : 10
    } catch { return 10 }
  })
  useEffect(() => {
    try { localStorage.setItem(NOTIF_LEAD_KEY, String(leadMin)) } catch {}
  }, [leadMin])

  const requestNotifPermission = async () => {
    if (typeof Notification === 'undefined') {
      toast.error('Votre navigateur ne supporte pas les notifications')
      return
    }
    try {
      const r = await Notification.requestPermission()
      setNotifPerm(r)
      if (r === 'granted') {
        new Notification('GestiQ', { body: 'Rappels du planificateur activés ✓', icon: '/icon-192.png' })
        toast.success('Rappels activés')
      } else if (r === 'denied') {
        toast.error('Notifications bloquées dans le navigateur')
      }
    } catch {
      toast.error('Erreur lors de la demande')
    }
  }

  /* tick the clock once a minute */
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 60_000)
    return () => clearInterval(id)
  }, [])

  /* persist */
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)) } catch {}
  }, [data])
  useEffect(() => {
    try { localStorage.setItem(WEEKS_KEY, JSON.stringify(weeks)) } catch {}
  }, [weeks])
  useEffect(() => {
    try { localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates)) } catch {}
  }, [templates])

  const currentWeekKey = useMemo(() => getISOWeek(new Date()), [tick]) // changes only at week roll
  const isCurrentWeek = weekKey === currentWeekKey
  const todayIdx = isCurrentWeek ? mondayIdx(new Date()) : -1
  const nowMin = nowMinutes()

  const week = weeks[weekKey] ?? { blockStatus: {}, habitChecks: {} }

  /* ─── Schedule notifications for upcoming blocks (next 24h) ─── */
  useEffect(() => {
    if (notifPerm !== 'granted') return
    if (typeof Notification === 'undefined') return

    const fired: Set<string> = (() => {
      try { return new Set(JSON.parse(localStorage.getItem(NOTIF_FIRED_KEY) ?? '[]')) }
      catch { return new Set() }
    })()
    const persistFired = () => {
      try {
        localStorage.setItem(NOTIF_FIRED_KEY, JSON.stringify(Array.from(fired).slice(-300)))
      } catch {}
    }

    const timeouts: number[] = []
    const now      = Date.now()
    const horizon  = now + 24 * 60 * 60 * 1000

    data.days.forEach((day, di) => {
      const baseDate = dateForWeekDay(weekKey, di)
      day.blocks.forEach((b, bi) => {
        const range = parseTimeRange(b.time)
        if (!range) return
        const status = week.blockStatus[`${di}_${bi}`]
        if (status === 'done' || status === 'skip') return

        const dt = new Date(baseDate)
        dt.setMinutes(range.start)
        const fireAt = dt.getTime() - leadMin * 60_000
        if (fireAt < now - 30_000) return
        if (fireAt > horizon)      return

        const id = `${weekKey}_${di}_${bi}_${dt.getTime()}_${leadMin}`
        if (fired.has(id)) return

        const t = window.setTimeout(() => {
          if (Notification.permission !== 'granted') return
          try {
            const lead = leadMin > 0 ? `Dans ${leadMin} min · ` : ''
            new Notification(`${b.emoji} ${b.title}`, {
              body: `${lead}${b.time}${b.subtitle ? ' · ' + b.subtitle : ''}`,
              icon: '/icon-192.png',
              badge: '/icon-192.png',
              tag:   `planner-${id}`,
            })
          } catch {}
          fired.add(id)
          persistFired()
        }, Math.max(0, fireAt - now))
        timeouts.push(t)
      })
    })

    return () => { timeouts.forEach(id => clearTimeout(id)) }
  }, [data.days, weekKey, leadMin, notifPerm, week.blockStatus, tick])

  /* ─── Live KPI actuals (current week only) ─── */
  const { data: prospects = [] } = useProspects()
  const { data: factures  = [] } = useFactures()

  const kpiActual = useMemo(() => {
    const monday = (() => {
      const [y, w] = weekKey.split('-W').map(Number)
      const jan4 = new Date(y, 0, 4)
      jan4.setDate(jan4.getDate() - mondayIdx(jan4))
      const m = new Date(jan4.getTime() + (w - 1) * 7 * 86400000)
      m.setHours(0, 0, 0, 0)
      return m
    })()
    const sunday = new Date(monday.getTime() + 7 * 86400000)

    const leads = prospects.filter(p => {
      const d = new Date(p.created_at)
      return d >= monday && d < sunday
    }).length

    const closings = prospects.filter(p => {
      const d = new Date(p.date_contact ?? p.created_at)
      return p.statut === 'gagne' && d >= monday && d < sunday
    }).length

    const revenue = factures.reduce((sum, f) => {
      if (f.statut !== 'payee' && f.statut !== 'partielle') return sum
      const d = new Date(f.date_emission)
      if (d < monday || d >= sunday) return sum
      return sum + (f.montant_paye || 0)
    }, 0)

    return {
      leads,
      calls: week.callsManual ?? 0,
      closings,
      revenue,
    }
  }, [prospects, factures, weekKey, week.callsManual])

  /* ─── Repetition detection (warns when same activity ≥ N days) ─── */
  const monotony = useMemo(() => {
    type Entry = {
      title:    string
      emoji:    string
      category: CategoryKey
      days:     number[]
    }
    const map = new Map<string, Entry>()
    data.days.forEach((day, di) => {
      const seenInDay = new Set<string>()
      day.blocks.forEach(b => {
        const key = b.title.trim().toLowerCase()
        if (!key || seenInDay.has(key)) return
        seenInDay.add(key)
        const cur = map.get(key)
        if (cur) cur.days.push(di)
        else map.set(key, { title: b.title.trim(), emoji: b.emoji, category: b.category, days: [di] })
      })
    })
    return Array.from(map.values())
      .filter(e => e.days.length >= REPETITION_THRESHOLD)
      .sort((a, b) => b.days.length - a.days.length)
  }, [data.days])

  /* ─── Goal computations ─── */
  const computed = useMemo(() => {
    const perMonth      = Math.round(data.goal.revenue / data.goal.months)
    const perDay        = Math.round(perMonth / 30)
    const clientsPerDay = data.goal.avgClient > 0 ? (perDay / data.goal.avgClient).toFixed(1) : '—'
    return { perMonth, perDay, clientsPerDay }
  }, [data.goal])

  /* ─── Mutators ─── */
  const updateBlock = (dayIdx: number, blockIdx: number, patch: Partial<Block>) => {
    setData(d => {
      const days = d.days.map((day, di) => {
        if (di !== dayIdx) return day
        const blocks = day.blocks.map((b, bi) => bi === blockIdx ? { ...b, ...patch } : b)
        return { ...day, blocks }
      })
      return { ...d, days }
    })
  }

  const addBlock = (dayIdx: number) => {
    setData(d => {
      const days = d.days.map((day, di) => {
        if (di !== dayIdx) return day
        const newBlock: Block = { time: '', emoji: '✨', title: 'Nouvelle activité', subtitle: '', category: 'free' }
        return { ...day, blocks: [...day.blocks, newBlock] }
      })
      return { ...d, days }
    })
    setEditing({ dayIdx, blockIdx: data.days[dayIdx].blocks.length })
  }

  /** Create a new block with a specific time range and open the editor. */
  const addBlockAt = (dayIdx: number, startMin: number, endMin: number) => {
    const newBlockIdx = data.days[dayIdx].blocks.length
    setData(d => {
      const days = d.days.map((day, di) => {
        if (di !== dayIdx) return day
        const newBlock: Block = {
          time: formatTimeRange(startMin, endMin),
          emoji: '✨', title: 'Nouvelle activité', subtitle: '', category: 'free',
        }
        return { ...day, blocks: [...day.blocks, newBlock] }
      })
      return { ...d, days }
    })
    setEditing({ dayIdx, blockIdx: newBlockIdx })
  }

  /** Update only the time of a block (used by drag/resize). */
  const setBlockTime = (dayIdx: number, blockIdx: number, startMin: number, endMin: number) => {
    setData(d => {
      const days = d.days.map((day, di) => {
        if (di !== dayIdx) return day
        const blocks = day.blocks.map((b, bi) =>
          bi === blockIdx ? { ...b, time: formatTimeRange(startMin, endMin) } : b
        )
        return { ...day, blocks }
      })
      return { ...d, days }
    })
  }

  const deleteBlock = (dayIdx: number, blockIdx: number) => {
    setData(d => {
      const days = d.days.map((day, di) => {
        if (di !== dayIdx) return day
        return { ...day, blocks: day.blocks.filter((_, bi) => bi !== blockIdx) }
      })
      return { ...d, days }
    })
    /* clear status entries for this block */
    setWeeks(w => {
      const next = { ...w }
      const ws = next[weekKey]
      if (!ws) return w
      const { [`${dayIdx}_${blockIdx}`]: _, ...rest } = ws.blockStatus
      next[weekKey] = { ...ws, blockStatus: rest }
      return next
    })
    setEditing(null)
  }

  const cycleBlockStatus = (dayIdx: number, blockIdx: number) => {
    setWeeks(w => {
      const ws = w[weekKey] ?? { blockStatus: {}, habitChecks: {} }
      const key = `${dayIdx}_${blockIdx}`
      const cur = ws.blockStatus[key] ?? 'none'
      const nxt = STATUS_NEXT[cur]
      const blockStatus = { ...ws.blockStatus }
      if (nxt === 'none') delete blockStatus[key]
      else blockStatus[key] = nxt
      return { ...w, [weekKey]: { ...ws, blockStatus } }
    })
  }

  const toggleHabit = (habitIdx: number, dayIdx: number) => {
    setWeeks(w => {
      const ws = w[weekKey] ?? { blockStatus: {}, habitChecks: {} }
      const key = `${habitIdx}_${dayIdx}`
      const habitChecks = { ...ws.habitChecks }
      if (habitChecks[key]) delete habitChecks[key]
      else habitChecks[key] = true
      return { ...w, [weekKey]: { ...ws, habitChecks } }
    })
  }

  const setCallsManual = (n: number) => {
    setWeeks(w => {
      const ws = w[weekKey] ?? { blockStatus: {}, habitChecks: {} }
      return { ...w, [weekKey]: { ...ws, callsManual: n } }
    })
  }

  const resetData = () => {
    if (confirm('Réinitialiser tout le plan aux valeurs par défaut ?')) {
      setData(DEFAULT_DATA)
      toast.success('Plan réinitialisé')
    }
  }

  const saveTemplate = () => {
    const name = newTmplName.trim()
    if (!name) return toast.error('Nom requis')
    const tmpl: PlannerTemplate = {
      id: crypto.randomUUID?.() ?? String(Date.now()),
      name,
      createdAt: new Date().toISOString(),
      data: {
        title: data.title, subtitle: data.subtitle,
        days: data.days, habits: data.habits, rules: data.rules,
        weeklyKpis: data.weeklyKpis, goal: data.goal,
      },
    }
    setTemplates(t => [tmpl, ...t])
    setNewTmplName('')
    toast.success('Modèle enregistré')
  }

  const applyTemplate = (id: string) => {
    const t = templates.find(x => x.id === id)
    if (!t) return
    if (!confirm(`Appliquer le modèle « ${t.name} » ? Le plan actuel sera remplacé.`)) return
    setData(d => ({ ...d, ...t.data }))
    setTmplDialogOpen(false)
    toast.success('Modèle appliqué')
  }

  const deleteTemplate = (id: string) => {
    setTemplates(t => t.filter(x => x.id !== id))
  }

  const editingBlock = editing ? data.days[editing.dayIdx].blocks[editing.blockIdx] : null

  return (
    <div className="space-y-6 animate-fade-in pb-10">
      {/* ── Hero / Goal banner ── */}
      <div className="card-premium p-6 bg-gradient-to-br from-slate-900 via-blue-950 to-violet-950 text-white relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-72 h-72 bg-violet-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -left-24 w-72 h-72 bg-blue-500/20 rounded-full blur-3xl pointer-events-none" />
        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <input
              value={data.title}
              onChange={e => setData(d => ({ ...d, title: e.target.value }))}
              className="bg-transparent text-2xl md:text-3xl font-bold text-white outline-none w-full border-b border-transparent focus:border-white/30 pb-1"
            />
            <input
              value={data.subtitle}
              onChange={e => setData(d => ({ ...d, subtitle: e.target.value }))}
              className="bg-transparent text-sm text-white/70 outline-none w-full mt-1 border-b border-transparent focus:border-white/20 pb-0.5"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Notification toggle */}
            <div className="flex items-center gap-1 bg-white/10 border border-white/20 rounded-md pr-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={requestNotifPermission}
                disabled={notifPerm === 'denied'}
                className={cn(
                  'gap-1.5 hover:bg-white/10 text-white border-0 rounded-r-none',
                  notifPerm === 'granted' && 'text-emerald-300',
                )}
                title={
                  notifPerm === 'granted' ? 'Rappels activés — cliquer pour tester' :
                  notifPerm === 'denied'  ? 'Notifications bloquées par le navigateur' :
                                            'Activer les rappels du navigateur'
                }
              >
                {notifPerm === 'granted'
                  ? <Bell className="w-3.5 h-3.5" />
                  : <BellOff className="w-3.5 h-3.5" />}
                <span className="hidden sm:inline">
                  {notifPerm === 'granted' ? 'Rappels' : notifPerm === 'denied' ? 'Bloqués' : 'Activer'}
                </span>
              </Button>
              {notifPerm === 'granted' && (
                <>
                  <span className="w-px h-4 bg-white/20" />
                  <select
                    value={leadMin}
                    onChange={(e) => setLeadMin(+e.target.value)}
                    className="bg-transparent text-white text-xs outline-none cursor-pointer"
                    title="Délai du rappel avant le créneau"
                  >
                    <option value={0}  className="text-black">à l'heure</option>
                    <option value={5}  className="text-black">5 min avant</option>
                    <option value={10} className="text-black">10 min avant</option>
                    <option value={15} className="text-black">15 min avant</option>
                    <option value={30} className="text-black">30 min avant</option>
                    <option value={60} className="text-black">1 h avant</option>
                  </select>
                </>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => { downloadICS(data, weekKey); toast.success('Fichier .ics téléchargé — importez-le dans Google Calendar') }}
              className="bg-white/10 hover:bg-white/20 border-white/20 text-white gap-1.5"
              title="Télécharger un fichier .ics importable dans Google Calendar"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Google Cal</span>
            </Button>
            <Button variant="outline" size="sm" onClick={() => setTmplDialogOpen(true)} className="bg-white/10 hover:bg-white/20 border-white/20 text-white gap-1.5">
              <BookmarkPlus className="w-3.5 h-3.5" />
              Modèles
            </Button>
            <Button variant="outline" size="sm" onClick={resetData} className="bg-white/10 hover:bg-white/20 border-white/20 text-white gap-1.5">
              <RotateCcw className="w-3.5 h-3.5" />
              Reset
            </Button>
          </div>
        </div>

        <div className="relative grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
          <GoalKPI icon={Target} label="Objectif annuel" value={fmtMoney(data.goal.revenue)} />
          <GoalKPI icon={TrendingUp} label="Par mois" value={fmtMoney(computed.perMonth)} />
          <GoalKPI icon={Zap} label="Par jour" value={fmtMoney(computed.perDay)} />
          <GoalKPI icon={Trophy} label="Clients/jour" value={`~${computed.clientsPerDay}`} sub={`${fmtMoney(data.goal.avgClient)} / client`} />
        </div>

        <div className="relative grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/10">
          <EditNumber
            label="Revenu cible ($)"
            value={data.goal.revenue}
            onChange={v => setData(d => ({ ...d, goal: { ...d.goal, revenue: v } }))}
          />
          <EditNumber
            label="Sur combien de mois"
            value={data.goal.months}
            onChange={v => setData(d => ({ ...d, goal: { ...d.goal, months: Math.max(1, v) } }))}
          />
          <EditNumber
            label="Valeur moyenne / client ($)"
            value={data.goal.avgClient}
            onChange={v => setData(d => ({ ...d, goal: { ...d.goal, avgClient: Math.max(1, v) } }))}
          />
        </div>
      </div>

      {/* ── Week navigator ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <CalendarIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          <h2 className="text-base font-bold text-foreground">Programme hebdomadaire</h2>
          <span className="text-xs text-muted-foreground hidden sm:inline">— cliquez sur n'importe quelle case pour la modifier</span>
        </div>
        <div className="flex items-center gap-1 bg-card border border-border rounded-xl p-1">
          <button
            onClick={() => setWeekKey(k => shiftWeek(k, -1))}
            className="p-1.5 rounded-lg hover:bg-muted transition"
            title="Semaine précédente"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-2 text-center min-w-[160px]">
            <p className="text-xs font-bold text-foreground">{weekKey}</p>
            <p className="text-[10px] text-muted-foreground">{weekDateRangeLabel(weekKey)}</p>
          </div>
          <button
            onClick={() => setWeekKey(k => shiftWeek(k, +1))}
            className="p-1.5 rounded-lg hover:bg-muted transition"
            title="Semaine suivante"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          {!isCurrentWeek && (
            <button
              onClick={() => setWeekKey(currentWeekKey)}
              className="ml-1 px-2 py-1 text-[11px] rounded-lg bg-blue-500 text-white hover:bg-blue-600 transition font-medium"
            >
              Aujourd'hui
            </button>
          )}
        </div>
      </div>

      {/* ── Time distribution ── */}
      <TimeDistribution data={data} />

      {/* ── Weekly calendar grid ── */}
      <WeeklyCalendar
        data={data}
        weekKey={weekKey}
        todayIdx={todayIdx}
        nowMin={nowMin}
        statusFor={(di, bi) => week.blockStatus[`${di}_${bi}`]}
        onCycleStatus={cycleBlockStatus}
        onEdit={(di, bi) => setEditing({ dayIdx: di, blockIdx: bi })}
        onAdd={addBlock}
        onAddAt={addBlockAt}
        onMoveResize={setBlockTime}
        onNavigate={(path) => navigate(path)}
      />

      {/* ── Monotony warning ── */}
      <RepetitionWarning monotony={monotony} />

      {/* ── Weekly review ── */}
      <WeeklyReview
        data={data}
        weekStatus={week.blockStatus}
        kpiActual={kpiActual}
        isCurrentWeek={isCurrentWeek}
      />


      {/* ── KPIs · Habits · Rules ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* KPIs with Réel column */}
        <div className="card-premium p-5 space-y-3">
          <h3 className="section-title flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-emerald-500" /> Indicateurs hebdomadaires
            {isCurrentWeek && <span className="ml-auto text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Live</span>}
          </h3>
          <KPIRow
            label="Leads"
            target={data.weeklyKpis.leads}
            actual={kpiActual.leads}
            sourceHint="prospects créés cette semaine"
            onTargetChange={v => setData(d => ({ ...d, weeklyKpis: { ...d.weeklyKpis, leads: v } }))}
          />
          <KPIRow
            label="Appels"
            target={data.weeklyKpis.calls}
            actual={kpiActual.calls}
            actualEditable
            onActualChange={setCallsManual}
            onTargetChange={v => setData(d => ({ ...d, weeklyKpis: { ...d.weeklyKpis, calls: v } }))}
          />
          <KPIRow
            label="Closings"
            target={data.weeklyKpis.closings}
            actual={kpiActual.closings}
            sourceHint="prospects gagnés cette semaine"
            onTargetChange={v => setData(d => ({ ...d, weeklyKpis: { ...d.weeklyKpis, closings: v } }))}
          />
          <KPIRow
            label="Revenus"
            target={data.weeklyKpis.revenue}
            actual={kpiActual.revenue}
            suffix=" $"
            sourceHint="factures payées cette semaine"
            onTargetChange={v => setData(d => ({ ...d, weeklyKpis: { ...d.weeklyKpis, revenue: v } }))}
          />
        </div>

        {/* Habits 7-day grid */}
        <div className="card-premium p-5 space-y-2">
          <h3 className="section-title flex items-center gap-2">
            <ListChecks className="w-4 h-4 text-blue-500" /> Habitudes quotidiennes
          </h3>
          <HabitsGrid
            habits={data.habits}
            checks={week.habitChecks}
            todayIdx={todayIdx}
            onToggle={toggleHabit}
            onRename={(idx, val) => setData(d => {
              const habits = [...d.habits]
              habits[idx] = val
              return { ...d, habits }
            })}
            onDelete={(idx) => setData(d => ({ ...d, habits: d.habits.filter((_, i) => i !== idx) }))}
            onAdd={() => setData(d => ({ ...d, habits: [...d.habits, 'Nouvelle habitude'] }))}
          />
        </div>

        {/* Rules */}
        <div className="card-premium p-5 space-y-2">
          <h3 className="section-title flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-violet-500" /> Règles d'or
          </h3>
          {data.rules.map((r, i) => (
            <div key={i} className="flex items-start gap-2 group">
              <span className="text-xs font-bold text-violet-600 dark:text-violet-400 mt-0.5">{i + 1}.</span>
              <input
                value={r}
                onChange={e => setData(d => {
                  const rules = [...d.rules]
                  rules[i] = e.target.value
                  return { ...d, rules }
                })}
                className="flex-1 text-sm bg-transparent outline-none border-b border-transparent focus:border-violet-400 pb-0.5"
              />
              <button
                onClick={() => setData(d => ({ ...d, rules: d.rules.filter((_, idx) => idx !== i) }))}
                className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
          <button
            onClick={() => setData(d => ({ ...d, rules: [...d.rules, 'Nouvelle règle'] }))}
            className="flex items-center gap-1 text-xs text-violet-600 dark:text-violet-400 hover:underline pt-1"
          >
            <Plus className="w-3 h-3" /> Ajouter une règle
          </button>
        </div>
      </div>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editing} onOpenChange={v => { if (!v) setEditing(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Edit2 className="w-4 h-4" />
              Modifier la case
            </DialogTitle>
          </DialogHeader>
          {editingBlock && editing && (() => {
            const range     = parseTimeRange(editingBlock.time)
            const startMin  = range?.start ?? 6 * 60
            const endMin    = range?.end   ?? 7 * 60
            const startStr  = toHHMM(startMin)
            const endStr    = toHHMM(endMin)
            const setStart = (v: string) => {
              const [h, m] = v.split(':').map(Number)
              if (Number.isNaN(h) || Number.isNaN(m)) return
              const ns = h * 60 + m
              const ne = ns >= endMin ? Math.min(24 * 60 - 1, ns + 60) : endMin
              updateBlock(editing.dayIdx, editing.blockIdx, { time: formatTimeRange(ns, ne) })
            }
            const setEnd = (v: string) => {
              const [h, m] = v.split(':').map(Number)
              if (Number.isNaN(h) || Number.isNaN(m)) return
              let ne = h * 60 + m
              if (ne <= startMin) ne = Math.min(24 * 60 - 1, startMin + 30)
              updateBlock(editing.dayIdx, editing.blockIdx, { time: formatTimeRange(startMin, ne) })
            }
            const gcalUrl = googleCalendarUrl(editingBlock, editing.dayIdx, weekKey)
            return (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-[60px_1fr_1fr] gap-3">
                <div className="space-y-1.5">
                  <label className="form-label">Emoji</label>
                  <Input
                    value={editingBlock.emoji}
                    onChange={e => updateBlock(editing.dayIdx, editing.blockIdx, { emoji: e.target.value })}
                    className="text-center text-lg"
                    maxLength={4}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Début</label>
                  <Input
                    type="time"
                    value={startStr}
                    onChange={e => setStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="form-label">Fin</label>
                  <Input
                    type="time"
                    value={endStr}
                    onChange={e => setEnd(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Titre *</label>
                <AutocorrectInput
                  value={editingBlock.title}
                  onChange={e => updateBlock(editing.dayIdx, editing.blockIdx, { title: e.target.value })}
                  autoFocus
                />
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Sous-titre / détail</label>
                <AutocorrectInput
                  value={editingBlock.subtitle ?? ''}
                  onChange={e => updateBlock(editing.dayIdx, editing.blockIdx, { subtitle: e.target.value })}
                  placeholder="Ex: cardio, lecture, etc."
                />
              </div>

              <div className="space-y-1.5">
                <label className="form-label">Catégorie / couleur</label>
                <div className="flex flex-wrap gap-1.5">
                  {CAT_LIST.map(c => (
                    <button
                      key={c.key}
                      onClick={() => updateBlock(editing.dayIdx, editing.blockIdx, { category: c.key })}
                      className={cn(
                        'flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border transition-all',
                        editingBlock.category === c.key
                          ? `${CAT[c.key].bg} ${CAT[c.key].color} ${CAT[c.key].ring} font-semibold ring-2 ring-current/20`
                          : 'border-border text-muted-foreground hover:bg-muted',
                      )}
                    >
                      <span className={cn('w-2 h-2 rounded-full', CAT[c.key].dot)} />
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              {gcalUrl && (
                <a
                  href={gcalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 w-full text-xs font-medium px-3 py-2 rounded-lg border border-blue-200 dark:border-blue-700 bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-500/20 transition"
                  title="Ouvre Google Calendar avec cet événement (récurrent chaque semaine)"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Ajouter à Google Calendar (récurrent)
                </a>
              )}

              <div className="flex justify-between gap-2 pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => deleteBlock(editing.dayIdx, editing.blockIdx)}
                  className="gap-1.5 text-destructive hover:text-destructive"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Supprimer
                </Button>
                <Button size="sm" onClick={() => setEditing(null)} className="gap-1.5">
                  <Check className="w-3.5 h-3.5" /> Terminé
                </Button>
              </div>
            </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* ── Templates dialog ── */}
      <Dialog open={tmplDialogOpen} onOpenChange={setTmplDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookmarkPlus className="w-4 h-4" />
              Modèles de plan
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-1">
            <div className="flex gap-2">
              <AutocorrectInput
                value={newTmplName}
                onChange={e => setNewTmplName(e.target.value)}
                placeholder="Nom du modèle (ex: Semaine campagne, Voyage, Repos)"
                onKeyDown={e => { if (e.key === 'Enter') saveTemplate() }}
              />
              <Button size="sm" onClick={saveTemplate} className="gap-1.5">
                <Save className="w-3.5 h-3.5" /> Enregistrer
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Enregistrez la configuration actuelle (jours, habitudes, règles, KPI cibles, objectif) pour pouvoir la rappeler plus tard.
            </p>

            {templates.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                Aucun modèle enregistré pour l'instant.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-[280px] overflow-y-auto">
                {templates.map(t => (
                  <div key={t.id} className="flex items-center gap-2 p-2 rounded-lg border border-border hover:bg-muted/50 transition">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{t.name}</p>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(t.createdAt).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => applyTemplate(t.id)} className="gap-1 h-7 text-[11px]">
                      Appliquer
                    </Button>
                    <button
                      onClick={() => deleteTemplate(t.id)}
                      className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                      title="Supprimer le modèle"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* ─── Sub-components ────────────────────────────────────────── */

function TimeDistribution({ data }: { data: PlannerData }) {
  const stats = useMemo(() => {
    const minutesByCat = new Map<CategoryKey, number>()
    let total = 0
    data.days.forEach(day => {
      day.blocks.forEach(b => {
        const r = parseTimeRange(b.time)
        if (!r) return
        const dur = r.end - r.start
        if (dur <= 0) return
        minutesByCat.set(b.category, (minutesByCat.get(b.category) ?? 0) + dur)
        total += dur
      })
    })
    if (total === 0) return { entries: [] as Array<{ key: CategoryKey; minutes: number; pct: number }>, total: 0 }
    const entries = Array.from(minutesByCat.entries())
      .map(([key, minutes]) => ({ key, minutes, pct: minutes / total }))
      .sort((a, b) => b.minutes - a.minutes)
    return { entries, total }
  }, [data.days])

  if (stats.entries.length === 0) return null

  const totalH = Math.round(stats.total / 60 * 10) / 10
  /* Build SVG donut */
  const R = 36
  const C = 2 * Math.PI * R
  let acc = 0

  return (
    <div className="card-premium p-4 flex items-center gap-5 flex-wrap">
      <div className="relative flex-shrink-0">
        <svg width="100" height="100" viewBox="0 0 100 100">
          <circle cx="50" cy="50" r={R} fill="none" stroke="currentColor" strokeOpacity={0.08} strokeWidth="14" />
          {stats.entries.map(e => {
            const len = e.pct * C
            const offset = -acc * C
            acc += e.pct
            const cfg = CAT[e.key] ?? CAT.free
            const colorClass = cfg.dot.replace('bg-', 'text-')
            return (
              <circle
                key={e.key}
                cx="50" cy="50" r={R}
                fill="none"
                strokeWidth="14"
                stroke="currentColor"
                strokeDasharray={`${len} ${C}`}
                strokeDashoffset={offset}
                transform="rotate(-90 50 50)"
                className={colorClass}
              />
            )
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-lg font-bold text-foreground tabular-nums">{totalH}h</span>
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">/ semaine</span>
        </div>
      </div>

      <div className="flex-1 min-w-[200px]">
        <h3 className="section-title flex items-center gap-2 mb-2">
          <TrendingUp className="w-4 h-4 text-blue-500" />
          Répartition du temps
        </h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1">
          {stats.entries.map(e => {
            const cfg = CAT[e.key] ?? CAT.free
            const label = CAT_LIST.find(c => c.key === e.key)?.label ?? e.key
            const h = Math.floor(e.minutes / 60)
            const m = e.minutes % 60
            return (
              <div key={e.key} className="flex items-center gap-1.5 text-[11px]">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', cfg.dot)} />
                <span className="text-muted-foreground truncate flex-1">{label}</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {h > 0 ? `${h}h${m ? String(m).padStart(2,'0') : ''}` : `${m}min`}
                </span>
                <span className="text-muted-foreground tabular-nums w-8 text-right">{Math.round(e.pct * 100)}%</span>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function WeeklyReview({ data, weekStatus, kpiActual, isCurrentWeek }: {
  data:          PlannerData
  weekStatus:    Record<string, BlockStatus>
  kpiActual:     { leads: number; calls: number; closings: number; revenue: number }
  isCurrentWeek: boolean
}) {
  const review = useMemo(() => {
    let total = 0, done = 0, skip = 0, postpone = 0
    const doneByCat = new Map<CategoryKey, number>()
    data.days.forEach((day, di) => {
      day.blocks.forEach((b, bi) => {
        total++
        const s = weekStatus[`${di}_${bi}`]
        if (s === 'done')     { done++; doneByCat.set(b.category, (doneByCat.get(b.category) ?? 0) + 1) }
        if (s === 'skip')     skip++
        if (s === 'postpone') postpone++
      })
    })
    const pct = total > 0 ? Math.round((done / total) * 100) : 0
    let topCat: CategoryKey | null = null
    let topN = 0
    doneByCat.forEach((n, k) => { if (n > topN) { topN = n; topCat = k } })
    return { total, done, skip, postpone, pct, topCat, topN }
  }, [data.days, weekStatus])

  const grade =
    review.pct >= 90 ? { label: 'Excellent',  color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500' } :
    review.pct >= 70 ? { label: 'Très bien',  color: 'text-blue-600 dark:text-blue-400',       bg: 'bg-blue-500'    } :
    review.pct >= 50 ? { label: 'Correct',    color: 'text-amber-600 dark:text-amber-400',     bg: 'bg-amber-500'   } :
    review.pct >= 25 ? { label: 'À améliorer', color: 'text-orange-600 dark:text-orange-400',  bg: 'bg-orange-500'  } :
                       { label: 'Difficile',  color: 'text-rose-600 dark:text-rose-400',       bg: 'bg-rose-500'    }

  if (review.total === 0) return null
  const topCatLabel = review.topCat ? (CAT_LIST.find(c => c.key === review.topCat)?.label ?? review.topCat) : '—'

  return (
    <div className="card-premium p-5">
      <div className="flex items-center gap-2 mb-3">
        <Trophy className="w-4 h-4 text-violet-500" />
        <h3 className="text-base font-bold text-foreground">Bilan de la semaine</h3>
        {isCurrentWeek && (
          <span className="ml-auto text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400">En cours</span>
        )}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <div className="rounded-xl border border-border p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Note</p>
          <p className={cn('text-lg font-bold mt-0.5', grade.color)}>{grade.label}</p>
          <div className="h-1 rounded-full bg-muted mt-2 overflow-hidden">
            <div className={cn('h-full transition-all', grade.bg)} style={{ width: `${review.pct}%` }} />
          </div>
          <p className="text-[10px] text-muted-foreground tabular-nums mt-1">{review.pct}% accomplis</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Terminés</p>
          <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400 mt-0.5 tabular-nums">{review.done}<span className="text-xs text-muted-foreground"> / {review.total}</span></p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Reportés</p>
          <p className="text-lg font-bold text-amber-600 dark:text-amber-400 mt-0.5 tabular-nums">{review.postpone}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Sautés</p>
          <p className="text-lg font-bold text-slate-500 mt-0.5 tabular-nums">{review.skip}</p>
        </div>
        <div className="rounded-xl border border-border p-3">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Top catégorie</p>
          <p className="text-sm font-bold text-foreground mt-0.5 truncate">{topCatLabel}</p>
          <p className="text-[10px] text-muted-foreground">{review.topN} fois</p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
          <span className="text-muted-foreground">Leads</span>
          <span className="font-semibold tabular-nums">{kpiActual.leads}</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
          <span className="text-muted-foreground">Appels</span>
          <span className="font-semibold tabular-nums">{kpiActual.calls}</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
          <span className="text-muted-foreground">Closings</span>
          <span className="font-semibold tabular-nums">{kpiActual.closings}</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-lg bg-muted/40">
          <span className="text-muted-foreground">Revenus</span>
          <span className="font-semibold tabular-nums">{kpiActual.revenue.toLocaleString('fr-FR')} $</span>
        </div>
      </div>
    </div>
  )
}

function RepetitionWarning({ monotony }: {
  monotony: Array<{ title: string; emoji: string; category: CategoryKey; days: number[] }>
}) {
  const [open, setOpen] = useState(true)
  if (monotony.length === 0) return null

  return (
    <div className="rounded-2xl border-2 border-rose-300 dark:border-rose-700 bg-gradient-to-br from-rose-50 to-amber-50 dark:from-rose-500/10 dark:to-amber-500/5 overflow-hidden shadow-sm">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-rose-100/40 dark:hover:bg-rose-500/10 transition"
      >
        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-rose-500 text-white flex items-center justify-center shadow animate-pulse">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm md:text-base font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2 flex-wrap">
            Attention — routine trop répétitive
            <span className="px-2 py-0.5 text-[11px] rounded-full bg-rose-500 text-white font-bold">
              {monotony.length} activité{monotony.length > 1 ? 's' : ''}
            </span>
          </h3>
          <p className="text-xs md:text-sm text-rose-600/80 dark:text-rose-400/80 mt-0.5">
            Ces activités reviennent presque chaque jour. Variez pour éviter la lassitude et stimuler votre énergie.
          </p>
        </div>
        <ChevronRight className={cn('w-4 h-4 text-rose-500 flex-shrink-0 transition-transform', open && 'rotate-90')} />
      </button>

      {open && (
        <div className="px-4 pb-4 space-y-2.5 border-t border-rose-200 dark:border-rose-800">
          {monotony.map(m => {
            const ideas = VARIETY_SUGGESTIONS[m.category] ?? []
            const cfg   = CAT[m.category] ?? CAT.free
            return (
              <div
                key={m.title.toLowerCase()}
                className={cn(
                  'rounded-lg p-3 border',
                  cfg.bg, cfg.ring,
                )}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className={cn('text-sm font-semibold', cfg.color)}>
                    <span className="mr-1.5">{m.emoji}</span>
                    {m.title}
                  </p>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-500 text-white font-bold tabular-nums">
                    {m.days.length}× / semaine
                  </span>
                </div>
                {ideas.length > 0 && (
                  <div className="mt-2 flex items-start gap-1.5 flex-wrap">
                    <span className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 font-semibold">
                      <Lightbulb className="w-3 h-3" />
                      Variations:
                    </span>
                    {ideas.map(s => (
                      <span
                        key={s}
                        className="text-[11px] px-2 py-0.5 rounded-full bg-white/70 dark:bg-card text-foreground border border-border"
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
          <p className="text-[11px] text-muted-foreground italic pt-1">
            Conseil : remplacez 1 ou 2 occurrences par semaine pour casser la monotonie sans perdre l'effet d'habitude.
          </p>
        </div>
      )}
    </div>
  )
}

const HOUR_PX = 56
const SNAP_MIN = 15  // snap-to-grid for drag/click-to-create

function WeeklyCalendar({
  data, weekKey, todayIdx, nowMin,
  statusFor, onCycleStatus, onEdit, onAdd, onAddAt, onMoveResize, onNavigate,
}: {
  data:          PlannerData
  weekKey:       string
  todayIdx:      number
  nowMin:        number
  statusFor:     (dayIdx: number, blockIdx: number) => BlockStatus | undefined
  onCycleStatus: (dayIdx: number, blockIdx: number) => void
  onEdit:        (dayIdx: number, blockIdx: number) => void
  onAdd:         (dayIdx: number) => void
  onAddAt:       (dayIdx: number, startMin: number, endMin: number) => void
  onMoveResize:  (dayIdx: number, blockIdx: number, startMin: number, endMin: number) => void
  onNavigate:    (path: string) => void
}) {
  /* compute hour bounds from data, fallback 6h–23h */
  const { minHour, maxHour } = useMemo(() => {
    const ranges = data.days.flatMap(d =>
      d.blocks.map(b => parseTimeRange(b.time)).filter(Boolean) as { start: number; end: number }[]
    )
    if (ranges.length === 0) return { minHour: 6, maxHour: 23 }
    const lo = Math.max(0,  Math.floor(Math.min(...ranges.map(r => r.start)) / 60))
    const hi = Math.min(24, Math.ceil( Math.max(...ranges.map(r => r.end))   / 60))
    return { minHour: lo, maxHour: hi }
  }, [data.days])

  const hours: number[] = []
  for (let h = minHour; h <= maxHour; h++) hours.push(h)
  const totalPx = (maxHour - minHour) * HOUR_PX

  const monday = useMemo(() => {
    const [y, w] = weekKey.split('-W').map(Number)
    const j = new Date(y, 0, 4)
    j.setDate(j.getDate() - mondayIdx(j))
    return new Date(j.getTime() + (w - 1) * 7 * 86400000)
  }, [weekKey])

  /* ─── Conflict detection: find overlapping blocks per day ─── */
  const conflicts = useMemo(() => {
    const map: Record<number, Set<number>> = {}
    data.days.forEach((day, di) => {
      const set = new Set<number>()
      const items = day.blocks
        .map((b, bi) => ({ bi, range: parseTimeRange(b.time) }))
        .filter(x => x.range) as { bi: number; range: { start: number; end: number } }[]
      for (let i = 0; i < items.length; i++) {
        for (let j = i + 1; j < items.length; j++) {
          if (items[i].range.start < items[j].range.end &&
              items[j].range.start < items[i].range.end) {
            set.add(items[i].bi)
            set.add(items[j].bi)
          }
        }
      }
      if (set.size > 0) map[di] = set
    })
    return map
  }, [data.days])

  /* ─── Drag state (move or resize) ─── */
  type DragMode = 'move' | 'resize'
  type DragState = {
    dayIdx:    number
    blockIdx:  number
    mode:      DragMode
    initialY:  number
    startMin:  number
    endMin:    number
    previewStart: number
    previewEnd:   number
  }
  const [drag, setDrag] = useState<DragState | null>(null)
  const movedRef = useRef(false)

  /* Convert a y-pixel within a column to minutes-of-day, snapped. */
  const yToMin = (y: number, columnHeight: number) => {
    const totalMin = (maxHour - minHour) * 60
    const min = minHour * 60 + (y / columnHeight) * totalMin
    return Math.max(minHour * 60, Math.min(maxHour * 60, Math.round(min / SNAP_MIN) * SNAP_MIN))
  }

  const beginDrag = (
    e: React.PointerEvent,
    dayIdx: number,
    blockIdx: number,
    mode: DragMode,
    range: { start: number; end: number },
  ) => {
    e.stopPropagation()
    e.preventDefault()
    movedRef.current = false
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
    setDrag({
      dayIdx, blockIdx, mode,
      initialY:     e.clientY,
      startMin:     range.start,
      endMin:       range.end,
      previewStart: range.start,
      previewEnd:   range.end,
    })
  }

  useEffect(() => {
    if (!drag) return
    const onMove = (e: PointerEvent) => {
      const dy = e.clientY - drag.initialY
      const deltaMin = Math.round((dy / HOUR_PX) * 60 / SNAP_MIN) * SNAP_MIN
      if (deltaMin !== 0) movedRef.current = true
      let ps = drag.startMin, pe = drag.endMin
      if (drag.mode === 'move') {
        const dur = drag.endMin - drag.startMin
        ps = Math.max(minHour * 60, Math.min(maxHour * 60 - dur, drag.startMin + deltaMin))
        pe = ps + dur
      } else {
        pe = Math.max(drag.startMin + SNAP_MIN, Math.min(maxHour * 60, drag.endMin + deltaMin))
      }
      setDrag(d => d && { ...d, previewStart: ps, previewEnd: pe })
    }
    const onUp = () => {
      if (movedRef.current && (drag.previewStart !== drag.startMin || drag.previewEnd !== drag.endMin)) {
        onMoveResize(drag.dayIdx, drag.blockIdx, drag.previewStart, drag.previewEnd)
      }
      setDrag(null)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [drag, minHour, maxHour, onMoveResize])

  /* Click on empty area of a column → create a 60-min block at that time. */
  const onColumnClick = (e: React.MouseEvent, dayIdx: number) => {
    if (e.target !== e.currentTarget) return
    if (movedRef.current) { movedRef.current = false; return }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const startMin = yToMin(e.clientY - rect.top, rect.height)
    const endMin   = Math.min(maxHour * 60, startMin + 60)
    onAddAt(dayIdx, startMin, endMin)
  }

  return (
    <div className="card-premium overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/30 sticky top-0 z-30">
        <div />
        {data.days.map((day, di) => {
          const dt = new Date(monday)
          dt.setDate(monday.getDate() + di)
          const isToday = di === todayIdx
          const dayDone = day.blocks.reduce((n, _, bi) => statusFor(di, bi) === 'done' ? n + 1 : n, 0)
          const dayTotal = day.blocks.length
          return (
            <div
              key={di}
              className={cn(
                'p-2 text-center border-l border-border relative',
                day.weekend && 'bg-amber-50/40 dark:bg-amber-500/[0.04]',
                isToday && 'bg-blue-50/60 dark:bg-blue-500/10',
              )}
            >
              <p className={cn(
                'text-[10px] font-bold uppercase tracking-wider',
                day.weekend ? 'text-amber-600 dark:text-amber-400' : 'text-blue-600 dark:text-blue-400',
              )}>
                {day.short}
              </p>
              <p className={cn(
                'text-sm font-bold mt-0.5 mx-auto',
                isToday && 'inline-block min-w-[24px] px-1.5 py-0.5 rounded-full bg-blue-500 text-white',
              )}>
                {dt.getDate()}
              </p>
              {dayTotal > 0 && (
                <div className="flex items-center gap-1 mt-1 px-1">
                  <div className="flex-1 h-0.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${Math.round((dayDone / dayTotal) * 100)}%` }}
                    />
                  </div>
                  <span className="text-[9px] font-semibold text-muted-foreground tabular-nums">
                    {dayDone}/{dayTotal}
                  </span>
                </div>
              )}
              <button
                onClick={() => onAdd(di)}
                className="absolute top-1 right-1 p-0.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition opacity-0 group-hover/header:opacity-100"
                title="Ajouter une activité"
              >
                <Plus className="w-3 h-3" />
              </button>
            </div>
          )
        })}
      </div>

      {/* Body grid */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] relative">
        {/* Time rail */}
        <div className="relative bg-muted/10" style={{ height: totalPx }}>
          {hours.map((h, i) => (
            <div
              key={h}
              className="absolute left-0 right-0 flex items-start justify-end pr-2"
              style={{ top: i * HOUR_PX - 6 }}
            >
              <span className="text-[10px] text-muted-foreground font-medium tabular-nums">
                {String(h).padStart(2, '0')}:00
              </span>
            </div>
          ))}
        </div>

        {/* Day columns */}
        {data.days.map((day, di) => {
          const isToday   = di === todayIdx
          const conflictSet = conflicts[di]
          return (
            <div
              key={di}
              onClick={(e) => onColumnClick(e, di)}
              className={cn(
                'relative border-l border-border cursor-cell',
                day.weekend && 'bg-amber-50/20 dark:bg-amber-500/[0.03]',
                isToday && 'bg-blue-50/20 dark:bg-blue-500/[0.04]',
              )}
              style={{ height: totalPx }}
            >
              {/* hour grid lines */}
              {hours.slice(0, -1).map((_, i) => (
                <div
                  key={i}
                  className="absolute left-0 right-0 border-t border-border/40 pointer-events-none"
                  style={{ top: (i + 1) * HOUR_PX }}
                />
              ))}

              {/* now line */}
              {isToday && nowMin >= minHour * 60 && nowMin <= maxHour * 60 && (
                <div
                  className="absolute left-0 right-0 z-20 pointer-events-none"
                  style={{ top: ((nowMin - minHour * 60) / 60) * HOUR_PX }}
                >
                  <div className="h-0.5 bg-rose-500 shadow-sm" />
                  <div className="absolute -top-1 -left-1 w-2 h-2 rounded-full bg-rose-500 shadow" />
                </div>
              )}

              {/* blocks */}
              <AnimatePresence initial={false}>
                {day.blocks.map((b, bi) => {
                  const range = parseTimeRange(b.time)
                  if (!range) return null
                  const cfg     = CAT[b.category] ?? CAT.free
                  const status  = statusFor(di, bi)
                  const isLive  = isToday && nowMin >= range.start && nowMin < range.end
                  const isPast  = isToday && nowMin >= range.end
                  const link    = CAT_LINKS[b.category]
                  const isDragging = drag?.dayIdx === di && drag.blockIdx === bi
                  const eff     = isDragging
                    ? { start: drag!.previewStart, end: drag!.previewEnd }
                    : range
                  const top     = ((eff.start - minHour * 60) / 60) * HOUR_PX
                  const height  = Math.max(28, ((eff.end - eff.start) / 60) * HOUR_PX) - 2
                  const inConflict = conflictSet?.has(bi) ?? false

                  return (
                    <motion.div
                      key={bi}
                      layout={!isDragging}
                      initial={{ opacity: 0, scale: 0.97 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className={cn(
                        'group absolute left-0.5 right-0.5 rounded-md border overflow-hidden transition',
                        cfg.bg, cfg.ring,
                        isLive    && 'ring-2 ring-emerald-500 dark:ring-emerald-400 shadow-md z-10',
                        inConflict && 'ring-2 ring-rose-500 ring-dashed',
                        isDragging && 'opacity-90 shadow-xl z-30 scale-[1.02]',
                        status === 'done'     && 'opacity-60',
                        status === 'skip'     && 'opacity-40 line-through',
                        status === 'postpone' && 'opacity-70',
                        !status && isPast     && 'opacity-50',
                      )}
                      style={{ top, height }}
                    >
                      {/* Drag-to-move zone (whole top area) */}
                      <div
                        onPointerDown={(e) => beginDrag(e, di, bi, 'move', range)}
                        onClick={(e) => {
                          e.stopPropagation()
                          if (!movedRef.current) onEdit(di, bi)
                        }}
                        className="w-full h-full p-1.5 pr-5 cursor-grab active:cursor-grabbing select-none"
                        style={{ touchAction: 'none' }}
                      >
                        <div className="flex items-start gap-1 pointer-events-none">
                          <span className="text-[12px] leading-none flex-shrink-0 mt-0.5">{b.emoji}</span>
                          <div className="min-w-0 flex-1">
                            <p className={cn('text-[11px] font-semibold leading-tight truncate', cfg.color)}>
                              {b.title}
                            </p>
                            {height > 50 && b.subtitle && (
                              <p className="text-[9px] text-muted-foreground leading-tight line-clamp-2 mt-0.5">
                                {b.subtitle}
                              </p>
                            )}
                            {height > 38 && (
                              <p className="text-[9px] opacity-60 mt-0.5 truncate">
                                {isDragging
                                  ? formatTimeRange(eff.start, eff.end)
                                  : b.time}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Resize handle (bottom edge) */}
                      <div
                        onPointerDown={(e) => beginDrag(e, di, bi, 'resize', range)}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute bottom-0 left-0 right-0 h-2 cursor-ns-resize hover:bg-black/5 dark:hover:bg-white/10"
                        style={{ touchAction: 'none' }}
                        title="Glisser pour redimensionner"
                      />

                      {/* Status toggle */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onCycleStatus(di, bi) }}
                        className={cn(
                          'absolute top-0.5 right-0.5 p-0.5 rounded-md hover:bg-white/40 dark:hover:bg-white/10 transition z-10',
                          status ? STATUS_META[status].color : 'text-muted-foreground/50 hover:text-foreground',
                        )}
                        title={status ? STATUS_META[status].label : 'Marquer'}
                      >
                        {status
                          ? (() => { const Icn = STATUS_META[status].Icon; return <Icn className="w-3 h-3" /> })()
                          : <CheckCircle2 className="w-3 h-3" />
                        }
                      </button>

                      {/* Conflict badge */}
                      {inConflict && !isDragging && (
                        <span
                          className="absolute top-0.5 left-0.5 px-1 py-0 text-[8px] font-bold uppercase rounded bg-rose-500 text-white shadow flex items-center gap-0.5"
                          title="Ce créneau chevauche un autre"
                        >
                          <AlertTriangle className="w-2 h-2" />
                          ⚠
                        </span>
                      )}

                      {isLive && !inConflict && (
                        <span className="absolute top-0.5 left-0.5 px-1 py-0 text-[8px] font-bold uppercase rounded bg-emerald-500 text-white shadow">
                          ⏺
                        </span>
                      )}

                      {link && height > 60 && !isDragging && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onNavigate(link.path) }}
                          className={cn(
                            'absolute bottom-2 right-0.5 p-0.5 rounded opacity-0 group-hover:opacity-100 transition z-10',
                            'bg-white/60 dark:bg-white/10 hover:bg-white dark:hover:bg-white/20',
                            cfg.color,
                          )}
                          title={link.label}
                        >
                          <ArrowRight className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </motion.div>
                  )
                })}
              </AnimatePresence>
            </div>
          )
        })}
      </div>

      {/* Bottom add row */}
      <div className="grid grid-cols-[60px_repeat(7,1fr)] border-t border-border bg-muted/20">
        <div />
        {data.days.map((_, di) => (
          <button
            key={di}
            onClick={() => onAdd(di)}
            className="py-1.5 border-l border-border text-[10px] text-muted-foreground hover:bg-muted hover:text-foreground transition flex items-center justify-center gap-1"
          >
            <Plus className="w-3 h-3" /> Ajouter
          </button>
        ))}
      </div>
    </div>
  )
}

function HabitsGrid({
  habits, checks, todayIdx, onToggle, onRename, onDelete, onAdd,
}: {
  habits:   string[]
  checks:   Record<string, boolean>
  todayIdx: number
  onToggle: (habitIdx: number, dayIdx: number) => void
  onRename: (idx: number, val: string) => void
  onDelete: (idx: number) => void
  onAdd:    () => void
}) {
  const dayLabels = ['L', 'M', 'M', 'J', 'V', 'S', 'D']

  /* compute streak per habit (consecutive days from today backwards) */
  const streakFor = (habitIdx: number): number => {
    let n = 0
    const startDay = todayIdx >= 0 ? todayIdx : 6
    for (let d = startDay; d >= 0; d--) {
      if (checks[`${habitIdx}_${d}`]) n++
      else break
    }
    return n
  }

  return (
    <div className="space-y-1.5">
      {/* Header row */}
      <div className="grid grid-cols-[1fr_repeat(7,18px)_28px] gap-0.5 items-center pb-1 border-b border-border">
        <span className="text-[10px] font-semibold text-muted-foreground">Habitude</span>
        {dayLabels.map((d, i) => (
          <span
            key={i}
            className={cn(
              'text-[10px] font-bold text-center',
              i === todayIdx ? 'text-blue-600 dark:text-blue-400' : 'text-muted-foreground',
            )}
          >
            {d}
          </span>
        ))}
        <span className="text-[10px] font-semibold text-muted-foreground text-center" title="Streak">
          🔥
        </span>
      </div>

      {habits.map((h, hi) => {
        const streak = streakFor(hi)
        return (
          <div key={hi} className="grid grid-cols-[1fr_repeat(7,18px)_28px] gap-0.5 items-center group">
            <input
              value={h}
              onChange={e => onRename(hi, e.target.value)}
              className="text-xs bg-transparent outline-none border-b border-transparent focus:border-blue-400 pb-0.5 truncate pr-1"
            />
            {dayLabels.map((_, di) => {
              const checked = !!checks[`${hi}_${di}`]
              return (
                <button
                  key={di}
                  onClick={() => onToggle(hi, di)}
                  className={cn(
                    'w-[18px] h-[18px] rounded border transition-all flex items-center justify-center',
                    checked
                      ? 'bg-emerald-500 border-emerald-600 text-white'
                      : 'bg-transparent border-border hover:border-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10',
                    di === todayIdx && !checked && 'ring-1 ring-blue-400',
                  )}
                  title={checked ? 'Décocher' : 'Cocher'}
                >
                  {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                </button>
              )
            })}
            <div className="flex items-center justify-center gap-0.5">
              {streak > 0 ? (
                <span className="flex items-center gap-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                  <Flame className="w-2.5 h-2.5" />
                  {streak}
                </span>
              ) : (
                <button
                  onClick={() => onDelete(hi)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition"
                  title="Supprimer"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </div>
        )
      })}

      <button
        onClick={onAdd}
        className="flex items-center gap-1 text-xs text-blue-600 dark:text-blue-400 hover:underline pt-1"
      >
        <Plus className="w-3 h-3" /> Ajouter une habitude
      </button>
    </div>
  )
}

function GoalKPI({ icon: Icon, label, value, sub }: {
  icon: React.ElementType
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="bg-white/5 backdrop-blur-sm rounded-xl p-3 border border-white/10">
      <div className="flex items-center gap-1.5 text-white/60 text-[10px] uppercase tracking-wider">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <p className="text-lg md:text-xl font-bold text-white mt-1">{value}</p>
      {sub && <p className="text-[10px] text-white/50 mt-0.5">{sub}</p>}
    </div>
  )
}

function EditNumber({ label, value, onChange }: {
  label: string
  value: number
  onChange: (n: number) => void
}) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-wider text-white/60">{label}</label>
      <input
        type="number"
        value={value}
        onChange={e => onChange(+e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm font-semibold mt-1 outline-none focus:border-white/30"
      />
    </div>
  )
}

function KPIRow({
  label, target, actual, suffix = '', sourceHint, actualEditable, onTargetChange, onActualChange,
}: {
  label:           string
  target:          number
  actual:          number
  suffix?:         string
  sourceHint?:     string
  actualEditable?: boolean
  onTargetChange:  (n: number) => void
  onActualChange?: (n: number) => void
}) {
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0
  const ok  = pct >= 100
  const meh = pct >= 50 && pct < 100

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="flex items-center gap-3">
          {/* Actual */}
          <div className="flex items-center gap-1">
            {actualEditable ? (
              <input
                type="number"
                value={actual}
                onChange={e => onActualChange?.(+e.target.value)}
                className={cn(
                  'w-16 text-right text-sm font-bold tabular-nums bg-transparent border-b border-border outline-none focus:border-blue-500 pb-0.5',
                  ok && 'text-emerald-600 dark:text-emerald-400',
                  meh && 'text-amber-600 dark:text-amber-400',
                )}
              />
            ) : (
              <span
                className={cn(
                  'text-sm font-bold tabular-nums',
                  ok && 'text-emerald-600 dark:text-emerald-400',
                  meh && 'text-amber-600 dark:text-amber-400',
                  !ok && !meh && 'text-foreground',
                )}
                title={sourceHint}
              >
                {suffix === ' $' ? actual.toLocaleString('fr-FR') : actual}{suffix}
              </span>
            )}
            <span className="text-xs text-muted-foreground">/</span>
            {/* Target */}
            <input
              type="number"
              value={target}
              onChange={e => onTargetChange(+e.target.value)}
              className="w-20 text-right text-sm font-medium tabular-nums bg-transparent border-b border-border outline-none focus:border-blue-500 pb-0.5 text-muted-foreground"
            />
            {suffix && <span className="text-xs text-muted-foreground">{suffix}</span>}
          </div>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div
          className={cn(
            'h-full transition-all',
            ok  ? 'bg-emerald-500' :
            meh ? 'bg-amber-500'   :
                  'bg-blue-500',
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {sourceHint && !actualEditable && (
        <p className="text-[10px] text-muted-foreground">{sourceHint}</p>
      )}
    </div>
  )
}
