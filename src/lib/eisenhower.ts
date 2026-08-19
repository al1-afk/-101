/**
 * Matrice d'Eisenhower — que faire de chaque tâche.
 *
 * Deux axes, quatre décisions. L'intérêt n'est pas de ranger : c'est de
 * répondre, tâche par tâche, à « est-ce que ça mérite mon temps ? »
 *
 *   urgent + important      → FAIRE      maintenant, soi-même
 *   important, pas urgent   → PLANIFIER  le vrai travail de fond
 *   urgent, pas important   → DÉLÉGUER   ça presse, mais pas pour moi
 *   ni l'un ni l'autre      → SUPPRIMER  le courage de dire non
 *
 * Le quadrant stocké (team_member_tasks.eisenhower) peut valoir NULL :
 * la tâche n'a alors pas été classée à la main, et l'écran propose un
 * quadrant DÉDUIT. La distinction compte — voir `isSuggested`.
 */
import type { TeamMemberTask } from '@/hooks/useTeamMemberTasks'

export type Quadrant = 'do' | 'plan' | 'delegate' | 'eliminate'

export interface QuadrantMeta {
  key:      Quadrant
  /** Le verbe, parce que c'est une décision — pas une étiquette. */
  action:   string
  axes:     string
  hint:     string
  emoji:    string
  color:    string
  /** Classes de la carte du quadrant (fond + bordure). */
  surface:  string
}

export const QUADRANTS: Record<Quadrant, QuadrantMeta> = {
  do: {
    key: 'do', action: 'FAIRE', axes: 'Urgent · Important', emoji: '🔥',
    hint: 'Maintenant, et par toi.',
    color: '#DC2626',
    surface: 'border-rose-300 dark:border-rose-800/50 bg-rose-50/60 dark:bg-rose-950/20',
  },
  plan: {
    key: 'plan', action: 'PLANIFIER', axes: 'Important · Pas urgent', emoji: '🎯',
    hint: 'Le travail qui fait avancer — donne-lui une date.',
    color: '#2563EB',
    surface: 'border-blue-300 dark:border-blue-800/50 bg-blue-50/60 dark:bg-blue-950/20',
  },
  delegate: {
    key: 'delegate', action: 'DÉLÉGUER', axes: 'Urgent · Pas important', emoji: '🤝',
    hint: 'Ça presse, mais ça n\'a pas besoin de toi.',
    color: '#CA8A04',
    surface: 'border-amber-300 dark:border-amber-800/50 bg-amber-50/60 dark:bg-amber-950/20',
  },
  eliminate: {
    key: 'eliminate', action: 'SUPPRIMER', axes: 'Ni urgent · Ni important', emoji: '🗑️',
    hint: 'Le courage de dire non.',
    color: '#64748B',
    surface: 'border-slate-300 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30',
  },
}

/** Ordre d'affichage : la ligne du haut est celle qui compte le plus. */
export const QUADRANT_ORDER: Quadrant[] = ['do', 'plan', 'delegate', 'eliminate']

/** Une échéance à moins de 48 h rend une tâche urgente. */
const URGENT_HOURS = 48

/** `priority` haute ou urgente = tâche importante. */
const IMPORTANT_PRIORITIES = new Set(['high', 'urgent'])

/**
 * Quadrant DÉDUIT d'une tâche non classée.
 *
 * Deux signaux déjà présents : la priorité dit l'importance, la
 * proximité de l'échéance dit l'urgence. La déduction n'est qu'un point
 * de départ — elle évite une matrice vide au premier usage, et c'est en
 * la corrigeant que la personne fait le vrai arbitrage.
 */
export function suggestQuadrant(
  task: Pick<TeamMemberTask, 'priority' | 'due_date' | 'due_time'>,
  now: Date = new Date(),
): Quadrant {
  const important = IMPORTANT_PRIORITIES.has(task.priority)
  const urgent = isUrgent(task, now)
  if (important && urgent)  return 'do'
  if (important)            return 'plan'
  if (urgent)               return 'delegate'
  return 'eliminate'
}

/** L'échéance tombe-t-elle dans les prochaines 48 h (ou est-elle passée) ? */
export function isUrgent(
  task: Pick<TeamMemberTask, 'due_date' | 'due_time'>,
  now: Date = new Date(),
): boolean {
  if (!task.due_date) return false
  const date = String(task.due_date).slice(0, 10)
  const time = task.due_time ? String(task.due_time).slice(0, 5) : '23:59'
  const due = new Date(`${date}T${time}`)
  if (!Number.isFinite(due.getTime())) return false
  return due.getTime() - now.getTime() <= URGENT_HOURS * 3600_000
}

/** Quadrant effectif : le choix explicite, sinon la déduction. */
export function quadrantOf(
  task: Pick<TeamMemberTask, 'priority' | 'due_date' | 'due_time'> & { eisenhower?: string | null },
  now: Date = new Date(),
): Quadrant {
  const chosen = task.eisenhower
  if (chosen && chosen in QUADRANTS) return chosen as Quadrant
  return suggestQuadrant(task, now)
}

/** La tâche est-elle seulement SUPPOSÉE ici, faute de classement ? */
export function isSuggested(task: { eisenhower?: string | null }): boolean {
  return !task.eisenhower || !(task.eisenhower in QUADRANTS)
}
