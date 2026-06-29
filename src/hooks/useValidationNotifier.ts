/**
 * useValidationNotifier — détecte les tâches qui viennent de passer
 * en statut 'validation' (un membre vient de cliquer Terminer).
 * Affiche un toast pour le manager admin.
 */
import { useEffect, useRef } from 'react'
import { useTeamMemberTasks } from './useTeamMemberTasks'
import { useTeam } from './useTeam'
import { toast } from 'sonner'
import { addNotification } from '@/lib/notificationStore'

const SEEN_VALIDATION_KEY = 'gestiq_validation_seen_ids'

function readSeen(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(SEEN_VALIDATION_KEY) ?? '[]')) }
  catch { return new Set() }
}
function writeSeen(ids: Set<string>) {
  try { localStorage.setItem(SEEN_VALIDATION_KEY, JSON.stringify([...ids])) } catch {}
}

/**
 * To use in admin layout (Sidebar/Header). Polls is provided by
 * react-query via useTeamMemberTasks (refetched ~ 60s by default).
 */
export function useValidationNotifier() {
  const { data: tasks = [] }   = useTeamMemberTasks()
  const { data: members = [] } = useTeam()
  const isFirstLoad = useRef(true)

  useEffect(() => {
    if (!Array.isArray(tasks)) return
    const seen = readSeen()
    const inValidation = tasks.filter(t => t.status === 'validation')

    if (isFirstLoad.current) {
      inValidation.forEach(t => seen.add(t.id))
      writeSeen(seen)
      isFirstLoad.current = false
      return
    }

    const newOnes = inValidation.filter(t => !seen.has(t.id))
    if (newOnes.length > 0) {
      for (const t of newOnes.slice(0, 3)) {
        const m = members.find(x => x.id === t.team_member_id)
        const author = m ? `${m.prenom ?? ''} ${m.nom ?? ''}`.trim() : 'Un membre'
        toast.info(`✓ ${author} a terminé : ${t.title}`, {
          description: 'À valider dans le projet',
          duration: 7000,
        })
        /* Persist in the notification bell store (admin) */
        addNotification('admin', {
          type:    'task_sent_to_validation',
          title:   `${author} a terminé : ${t.title}`,
          message: 'À valider dans le projet',
          icon:    '⚑',
          link:    t.project_id ? `/projets/${t.project_id}` : undefined,
        })
      }
      if (newOnes.length > 3) {
        toast.info(`+${newOnes.length - 3} autres tâches en attente de validation`)
      }
      newOnes.forEach(t => seen.add(t.id))
      writeSeen(seen)
    }

    /* GC : retirer les IDs qui ne sont plus en validation */
    const currentIds = new Set(inValidation.map(t => t.id))
    for (const id of seen) if (!currentIds.has(id)) seen.delete(id)
    writeSeen(seen)
  }, [tasks, members])
}
