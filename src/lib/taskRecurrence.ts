/**
 * Moteur de récurrence pour les tâches.
 *
 * Format de récurrence (stocké dans team_member_tasks.recurrence) :
 *   { type: 'daily' }
 *   { type: 'weekly', weekdays: [1,3,5] }         // lun/mer/ven (0=dim)
 *   { type: 'monthly' }                            // même jour du mois
 *   { type: 'every_n_days', interval: 3 }
 *
 * Champ commun optionnel : endDate (YYYY-MM-DD) — arrête la récurrence.
 */

export type RecurrenceType =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'every_n_days'

export interface TaskRecurrence {
  type:      RecurrenceType
  weekdays?: number[]   // 0..6 (dim..sam) — utilisé si type === 'weekly'
  interval?: number     // > 0 — utilisé si type === 'every_n_days'
  endDate?:  string     // YYYY-MM-DD — arrête à cette date incluse
}

/** Ordre des jours FR pour l'UI. Lundi en premier. */
export const WEEKDAY_LABELS: Array<{ id: number; short: string; long: string }> = [
  { id: 1, short: 'Lun', long: 'Lundi'    },
  { id: 2, short: 'Mar', long: 'Mardi'    },
  { id: 3, short: 'Mer', long: 'Mercredi' },
  { id: 4, short: 'Jeu', long: 'Jeudi'    },
  { id: 5, short: 'Ven', long: 'Vendredi' },
  { id: 6, short: 'Sam', long: 'Samedi'   },
  { id: 0, short: 'Dim', long: 'Dimanche' },
]

/* ═══════════════════════════════════════════════════════════════════
   Calcul de la prochaine échéance
═══════════════════════════════════════════════════════════════════ */

/** Retourne YYYY-MM-DD à partir d'un Date (fuseau local). */
function toISODate(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${dd}`
}

/** Parse YYYY-MM-DD en Date (à midi local pour éviter le décalage UTC). */
function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d, 12, 0, 0, 0)
}

/**
 * Retourne la prochaine date d'échéance après `fromDate` (YYYY-MM-DD).
 * Retourne null si la récurrence est terminée (endDate dépassée).
 */
export function nextDueDate(
  recurrence: TaskRecurrence,
  fromDate:   string,
): string | null {
  const base = fromISODate(fromDate)

  let next = new Date(base)
  switch (recurrence.type) {
    case 'daily':
      next.setDate(next.getDate() + 1)
      break

    case 'weekly': {
      const days = (recurrence.weekdays ?? []).filter(d => d >= 0 && d <= 6)
      if (days.length === 0) return null
      // Cherche le prochain jour dans la liste, en démarrant à J+1
      let step = 1
      while (step <= 14) {
        const candidate = new Date(base)
        candidate.setDate(candidate.getDate() + step)
        if (days.includes(candidate.getDay())) {
          next = candidate
          break
        }
        step++
      }
      if (step > 14) return null
      break
    }

    case 'monthly':
      next.setMonth(next.getMonth() + 1)
      break

    case 'every_n_days': {
      const n = Math.max(1, Math.floor(recurrence.interval ?? 1))
      next.setDate(next.getDate() + n)
      break
    }
  }

  const iso = toISODate(next)

  // Vérifie la date de fin
  if (recurrence.endDate && iso > recurrence.endDate) return null

  return iso
}

/* ═══════════════════════════════════════════════════════════════════
   Résumé lisible pour l'UI
═══════════════════════════════════════════════════════════════════ */

/** Ex: "Tous les lundis, mercredis" ou "Tous les 3 jours". */
export function describeRecurrence(r: TaskRecurrence): string {
  switch (r.type) {
    case 'daily':
      return 'Tous les jours'
    case 'weekly': {
      const days = (r.weekdays ?? []).filter(d => d >= 0 && d <= 6)
      if (days.length === 0) return 'Chaque semaine'
      if (days.length === 7) return 'Tous les jours'
      if (days.length === 5 && [1, 2, 3, 4, 5].every(d => days.includes(d))) {
        return 'En semaine (lun→ven)'
      }
      if (days.length === 2 && days.includes(0) && days.includes(6)) {
        return 'Le week-end'
      }
      const names = days
        .sort((a, b) => (a === 0 ? 7 : a) - (b === 0 ? 7 : b))
        .map(d => WEEKDAY_LABELS.find(w => w.id === d)?.short ?? '')
        .filter(Boolean)
      return names.join(' · ')
    }
    case 'monthly':
      return 'Chaque mois (même jour)'
    case 'every_n_days': {
      const n = Math.max(1, Math.floor(r.interval ?? 1))
      return n === 1 ? 'Tous les jours' : `Tous les ${n} jours`
    }
  }
}

/** Validation minimaliste pour ne pas enregistrer une récurrence invalide. */
export function isValidRecurrence(r: TaskRecurrence | null | undefined): boolean {
  if (!r) return true
  switch (r.type) {
    case 'daily':
    case 'monthly':
      return true
    case 'weekly':
      return Array.isArray(r.weekdays) && r.weekdays.length > 0
    case 'every_n_days':
      return typeof r.interval === 'number' && r.interval >= 1 && r.interval <= 365
  }
}
