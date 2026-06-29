/**
 * Task timer — état partagé en localStorage (UN seul timer actif à la fois).
 * Utilisé côté admin (ProjetDetail) et côté membre (MyTasks).
 */

const TIMER_KEY = 'gestiq_active_timer'

export interface ActiveTimer {
  taskId:    string
  startedAt: number   // ms epoch
}

export function getActiveTimer(): ActiveTimer | null {
  try {
    const raw = localStorage.getItem(TIMER_KEY)
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

export function setActiveTimer(t: ActiveTimer | null) {
  try {
    if (t) localStorage.setItem(TIMER_KEY, JSON.stringify(t))
    else   localStorage.removeItem(TIMER_KEY)
  } catch {}
}

/** Format compact : "2h 15min" ou "45min 12s" ou "12s" */
export function formatHMS(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}min`
  if (m > 0) return `${m}min ${String(s).padStart(2, '0')}s`
  return `${s}s`
}

/** Format ultra-compact : "2h15" / "45min" / "12s" */
export function formatHMSShort(totalSeconds: number): string {
  if (totalSeconds < 0) totalSeconds = 0
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  if (h > 0) return `${h}h${String(m).padStart(2, '0')}`
  if (m > 0) return `${m}min`
  return `${s}s`
}
