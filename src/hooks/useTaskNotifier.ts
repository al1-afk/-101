/**
 * useTaskNotifier — détecte les nouvelles tâches assignées au membre
 * connecté + les changements de statut (validation côté admin).
 * Affiche un toast et expose un compteur pour le badge.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLocation } from 'react-router-dom'
import { mySpaceApi } from '@/lib/api'
import { toast } from 'sonner'
import { addNotification } from '@/lib/notificationStore'

const SEEN_KEY = 'gestiq_my_tasks_seen_ids'

function readSeenIds(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')) }
  catch { return new Set() }
}
function writeSeenIds(ids: Set<string>) {
  try { localStorage.setItem(SEEN_KEY, JSON.stringify([...ids])) } catch {}
}

/**
 * Used inside MySpaceLayout — polls every 20 s, toasts new tasks,
 * returns the unread badge count.
 */
export function useTaskNotifier(): { unreadCount: number; markAllSeen: () => void } {
  const qc = useQueryClient()
  const location = useLocation()
  const [unreadCount, setUnreadCount] = useState(0)
  const isFirstLoad = useRef(true)

  const { data: tasks = [] } = useQuery<any[]>({
    queryKey: ['my-space', 'tasks'],
    queryFn:  () => mySpaceApi.tasks(),
    refetchInterval: 20_000,           // poll every 20s
    refetchOnWindowFocus: true,
    staleTime: 0,
  })

  /* Detect new task assignments since last visit */
  useEffect(() => {
    if (!Array.isArray(tasks)) return
    const seen = readSeenIds()
    const open = tasks.filter(t => t.status !== 'done' && t.status !== 'cancelled')
    const newOnes = open.filter(t => !seen.has(t.id))

    if (isFirstLoad.current) {
      /* First load → just seed seen set, don't spam toasts */
      open.forEach(t => seen.add(t.id))
      writeSeenIds(seen)
      isFirstLoad.current = false
      setUnreadCount(0)
      return
    }

    if (newOnes.length > 0) {
      for (const t of newOnes.slice(0, 3)) {
        toast.info(`🔔 Nouvelle tâche : ${t.title}`, {
          description: t.project_name ? `Projet : ${t.project_name}` : undefined,
          duration: 6000,
        })
      }
      if (newOnes.length > 3) {
        toast.info(`+${newOnes.length - 3} autres tâches assignées`)
      }
      /* Persist in the notification bell store */
      for (const t of newOnes) {
        addNotification('member', {
          type:    'task_assigned',
          title:   `Nouvelle tâche : ${t.title}`,
          message: t.project_name ? `Projet : ${t.project_name}` : undefined,
          icon:    '🔔',
          link:    '/my-space/tasks',
        })
      }
      setUnreadCount(c => c + newOnes.length)
      /* Track them as seen so we don't re-notify on next poll */
      newOnes.forEach(t => seen.add(t.id))
      writeSeenIds(seen)
    }

    /* Garbage-collect : remove seen IDs that are no longer in current tasks
       (avoid bloat over months). */
    const currentIds = new Set(tasks.map(t => t.id))
    for (const id of seen) if (!currentIds.has(id)) seen.delete(id)
    writeSeenIds(seen)
  }, [tasks])

  /* Clear badge when user actually visits /my-space/tasks */
  useEffect(() => {
    if (location.pathname === '/my-space/tasks') {
      setUnreadCount(0)
    }
  }, [location.pathname])

  const markAllSeen = () => {
    setUnreadCount(0)
    qc.invalidateQueries({ queryKey: ['my-space', 'tasks'] })
  }

  return { unreadCount, markAllSeen }
}
