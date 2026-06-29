/**
 * Notification store — persisted in localStorage, scoped per-user.
 * Used by hooks (useTaskNotifier, useValidationNotifier) to push
 * notifications, and by NotificationBell to display them.
 */

export type NotificationType = 'task_assigned' | 'task_validated' | 'task_sent_to_validation' | 'info'

export interface Notification {
  id:        string
  type:      NotificationType
  title:     string
  message?:  string
  link?:     string                 // optional route to navigate to
  icon?:     string                 // emoji
  is_read:   boolean
  created_at:string                 // ISO
}

const KEY_PREFIX = 'gestiq_notifications_'
const EVENT      = 'gestiq:notifications-changed'

function storageKey(scope: 'admin' | 'member' = 'member'): string {
  return `${KEY_PREFIX}${scope}`
}

export function readNotifications(scope: 'admin' | 'member' = 'member'): Notification[] {
  try {
    const raw = localStorage.getItem(storageKey(scope))
    if (!raw) return []
    const arr = JSON.parse(raw) as Notification[]
    return Array.isArray(arr) ? arr : []
  } catch { return [] }
}

function writeNotifications(scope: 'admin' | 'member', list: Notification[]) {
  try { localStorage.setItem(storageKey(scope), JSON.stringify(list.slice(0, 100))) } catch {}
  window.dispatchEvent(new Event(EVENT))
}

export function addNotification(scope: 'admin' | 'member', n: Omit<Notification, 'id' | 'created_at' | 'is_read'>) {
  const existing = readNotifications(scope)
  const newN: Notification = {
    id:         `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    created_at: new Date().toISOString(),
    is_read:    false,
    ...n,
  }
  writeNotifications(scope, [newN, ...existing])
}

export function markAllRead(scope: 'admin' | 'member') {
  const list = readNotifications(scope).map(n => ({ ...n, is_read: true }))
  writeNotifications(scope, list)
}

export function markRead(scope: 'admin' | 'member', id: string) {
  const list = readNotifications(scope).map(n => n.id === id ? { ...n, is_read: true } : n)
  writeNotifications(scope, list)
}

export function clearAll(scope: 'admin' | 'member') {
  writeNotifications(scope, [])
}

export function subscribe(cb: () => void): () => void {
  window.addEventListener(EVENT, cb)
  window.addEventListener('storage', cb)
  return () => {
    window.removeEventListener(EVENT, cb)
    window.removeEventListener('storage', cb)
  }
}
