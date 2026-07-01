import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { calendrierApi } from '@/lib/api'
import { tokenStore } from '@/lib/api'

interface CalEvent {
  id:    string
  titre: string
  date:  string
  heure: string
  type:  string
  notes?: string
  done:  boolean
}

const LEAD_MINUTES = 10
const FIRED_KEY    = 'gestiq_reminders_fired'

function loadFired(): Set<string> {
  try {
    const raw = localStorage.getItem(FIRED_KEY)
    return new Set(raw ? JSON.parse(raw) : [])
  } catch { return new Set() }
}

function saveFired(fired: Set<string>) {
  try {
    // keep only recent ids (last 200) to bound storage
    const arr = Array.from(fired).slice(-200)
    localStorage.setItem(FIRED_KEY, JSON.stringify(arr))
  } catch {}
}

function eventDateTime(e: CalEvent): Date {
  return new Date(`${e.date}T${e.heure}:00`)
}

function showNotif(e: CalEvent) {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const body = `${e.heure} · ${e.titre}${e.notes ? `\n${e.notes}` : ''}`
    new Notification('Rappel — NEXT GITAL', {
      body,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `event-${e.id}`,
      requireInteraction: false,
    })
  } catch { /* ignore */ }
}

/* Schedules in-app reminders for upcoming calendar events.
   Active only when the app/PWA is open. Fires once per event id. */
export function useEventReminders() {
  const isAuthed = !!tokenStore.get()

  const { data: events = [] } = useQuery<CalEvent[]>({
    queryKey: ['calendrier_events'],
    queryFn:  () => calendrierApi.list({ orderBy: 'date', order: 'asc' }) as Promise<CalEvent[]>,
    enabled:  isAuthed,
    refetchInterval: 5 * 60 * 1000, // refresh every 5 min
  })

  const timeoutsRef = useRef<number[]>([])
  const firedRef    = useRef<Set<string>>(loadFired())

  useEffect(() => {
    // clear previous timeouts
    timeoutsRef.current.forEach(id => clearTimeout(id))
    timeoutsRef.current = []

    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
    if (!events.length) return

    const now      = Date.now()
    const horizon  = now + 24 * 60 * 60 * 1000 // next 24h
    const leadMs   = LEAD_MINUTES * 60 * 1000

    for (const e of events) {
      if (e.done) continue
      if (firedRef.current.has(e.id)) continue
      const eventMs = eventDateTime(e).getTime()
      if (Number.isNaN(eventMs)) continue
      const fireAt  = eventMs - leadMs
      // skip past events (more than leadMs ago) and events beyond horizon
      if (fireAt < now - 30 * 1000) continue
      if (fireAt > horizon) continue

      const delay = Math.max(0, fireAt - now)
      const id = window.setTimeout(() => {
        showNotif(e)
        firedRef.current.add(e.id)
        saveFired(firedRef.current)
      }, delay)
      timeoutsRef.current.push(id)
    }

    return () => {
      timeoutsRef.current.forEach(id => clearTimeout(id))
      timeoutsRef.current = []
    }
  }, [events])
}
