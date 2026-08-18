import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teamMemberTasksApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'
import { nextDueDate, type TaskRecurrence } from '@/lib/taskRecurrence'

export type TaskStatus   = 'todo' | 'in_progress' | 'validation' | 'done' | 'cancelled'
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent'

export interface TeamMemberTask {
  id:                string
  tenant_id:         string
  team_member_id:    string | null
  /** Tâche assignée à un admin (users.id) plutôt qu'à un membre de l'équipe.
      Mutuellement exclusif avec team_member_id en pratique. */
  assigned_user_id:  string | null
  /** Tâche assignée à un stagiaire (stagiaires.id).
      Mutuellement exclusif avec team_member_id et assigned_user_id. */
  assigned_stagiaire_id: string | null
  project_id:        string | null
  title:             string
  description:       string | null
  priority:          TaskPriority
  status:            TaskStatus
  due_date:          string | null
  /** Heure d'échéance « HH:MM[:SS] ». null = heure par défaut de la personne. */
  due_time:          string | null
  /** Minutes avant l'échéance pour être prévenu.
   *  null = réglages par défaut, [] = aucun rappel sur cette tâche. */
  reminder_offsets:  number[] | null
  category:          string | null     // Analyse, Design, Développement, SEO, etc.
  elapsed_seconds:   number            // total time tracked
  is_request:        boolean           // change request from client
  request_price:     number | null     // billable price for change request
  attachments:       string[]          // data URLs (base64) — images collées via Cmd+V
  /** Si défini : la tâche est récurrente. À la complétion, une nouvelle
      occurrence est créée automatiquement avec la due_date calculée. */
  recurrence:        TaskRecurrence | null
  created_at:        string
  updated_at:        string
  completed_at:      string | null
  created_by:        string | null
}

const KEY = 'team_member_tasks'
const tk = () => [KEY, currentTenantIdForCache()] as const

export function useTeamMemberTasks() {
  return useQuery<TeamMemberTask[]>({
    queryKey: tk(),
    queryFn:  () => teamMemberTasksApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<TeamMemberTask[]>,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
    /* Background polling every 10 s when the tab is active.
       Powers the admin's "X a terminé Y" toast notification
       and keeps the projet kanban live without manual reload. */
    refetchInterval:             10_000,
    refetchIntervalInBackground: false,
  })
}

/** Tasks for a specific project, sorted by status then due date. */
export function useProjectTasks(projetId: string | undefined) {
  const { data = [] } = useTeamMemberTasks()
  if (!projetId) return []
  return data
    .filter(t => t.project_id === projetId)
    .sort((a, b) => {
      const ord: Record<TaskStatus, number> = { in_progress: 0, validation: 1, todo: 2, done: 3, cancelled: 4 }
      if (ord[a.status] !== ord[b.status]) return ord[a.status] - ord[b.status]
      const ad = a.due_date ? new Date(a.due_date).getTime() : Infinity
      const bd = b.due_date ? new Date(b.due_date).getTime() : Infinity
      return ad - bd
    })
}

/** Tasks assigned to a specific team member. */
export function useTasksOfMember(teamMemberId: string | undefined) {
  const { data = [] } = useTeamMemberTasks()
  if (!teamMemberId) return []
  return data.filter(t => t.team_member_id === teamMemberId)
}

export function useCreateTeamMemberTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<Omit<TeamMemberTask, 'id' | 'tenant_id' | 'created_at' | 'updated_at' | 'completed_at'>>) =>
      teamMemberTasksApi.create({ status: 'todo', priority: 'normal', ...data }) as Promise<TeamMemberTask>,
    onSuccess: async (created: TeamMemberTask) => {
      /* Optimistic-ish : on injecte tout de suite dans le cache pour que
         l'UI affiche la tâche sans attendre le refetch réseau. */
      qc.setQueryData<TeamMemberTask[]>(tk(), (prev) => prev ? [created, ...prev] : [created])
      await qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('Tâche créée')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateTeamMemberTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<TeamMemberTask> & { id: string }) =>
      teamMemberTasksApi.update(id, data) as Promise<TeamMemberTask>,
    /* Le statut AVANT écriture, lu dans le cache : c'est lui qui dit s'il
       s'agit d'une vraie transition vers « terminée ». */
    onMutate: (variables: Partial<TeamMemberTask> & { id: string }) => ({
      previousStatus: qc.getQueryData<TeamMemberTask[]>(tk())
        ?.find(t => t.id === variables.id)?.status,
    }),
    onSuccess: async (updated: TeamMemberTask, variables, context) => {
      qc.setQueryData<TeamMemberTask[]>(tk(), (prev) =>
        prev ? prev.map(t => t.id === updated.id ? { ...t, ...updated } : t) : prev
      )

      /* Récurrence : la prochaine occurrence naît d'une TRANSITION vers
         « terminée », jamais de l'état renvoyé.

         La nuance est décisive depuis que la fiche reste ouverte sur une
         tâche close : `updated.status` vaut 'done' à CHAQUE réponse du
         serveur (RETURNING *), y compris quand on ne touche qu'à la
         priorité ou qu'on tape un commentaire — l'auto-save aurait alors
         recréé une occurrence toutes les 700 ms. On exige donc que le
         patch porte le statut, et que la tâche ne fût pas déjà terminée. */
      const passeATerminee = variables.status === 'done'
        && context?.previousStatus !== 'done'
      if (passeATerminee && updated.recurrence) {
        const base = updated.due_date ?? new Date().toISOString().slice(0, 10)
        const nextDate = nextDueDate(updated.recurrence, base)
        if (nextDate) {
          try {
            const next = await teamMemberTasksApi.create({
              team_member_id:        updated.team_member_id,
              assigned_user_id:      updated.assigned_user_id,
              assigned_stagiaire_id: updated.assigned_stagiaire_id,
              project_id:            updated.project_id,
              title:                 updated.title,
              description:           updated.description,
              priority:              updated.priority,
              status:                'todo',
              due_date:              nextDate,
              /* L'occurrence suivante hérite de l'heure et des rappels :
                 sans ça, une tâche récurrente réglée « 14 h, prévenir
                 30 min avant » perd sa précision dès la 2e occurrence. */
              due_time:              updated.due_time,
              reminder_offsets:      updated.reminder_offsets,
              category:              updated.category,
              is_request:            false,
              recurrence:            updated.recurrence,
            } as any) as TeamMemberTask
            qc.setQueryData<TeamMemberTask[]>(tk(), (prev) => prev ? [next, ...prev] : [next])
            toast.success(`🔁 Prochaine occurrence créée pour le ${nextDate}`)
          } catch (e: any) {
            console.error('[recurrence] failed to create next:', e?.message ?? e)
          }
        }
      }

      await qc.invalidateQueries({ queryKey: [KEY] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteTeamMemberTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => teamMemberTasksApi.remove(id),
    onSuccess: async (_, id: string) => {
      qc.setQueryData<TeamMemberTask[]>(tk(), (prev) => prev ? prev.filter(t => t.id !== id) : prev)
      await qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('Tâche supprimée')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
