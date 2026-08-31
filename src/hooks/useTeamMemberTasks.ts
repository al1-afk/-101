import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teamMemberTasksApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'
import { nextDueDate, type TaskRecurrence } from '@/lib/taskRecurrence'
import { resetChecklist } from '@/lib/taskNotes'

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
  /** Quadrant d'Eisenhower décidé à la main (do/plan/delegate/eliminate).
   *  null = non classée, l'écran déduit le quadrant. */
  eisenhower:        string | null
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

/**
 * Tâches CLOSES d'une personne — l'archive.
 *
 * Requête dédiée, et non un filtre sur `useTeamMemberTasks()` : ce
 * dernier ramène les 500 tâches les plus récemment CRÉÉES de tout
 * l'espace (limite du CRUD générique). Sur un espace actif, une tâche
 * créée il y a trois mois et terminée hier en sort — l'archive
 * affichait donc un décompte faux et pouvait taire précisément ce qu'on
 * venait de clore, alors que c'est ce qu'on cherche en premier.
 *
 * Deux appels parce que le CRUD générique ne filtre que par égalité :
 * « done » et « cancelled » ne peuvent pas être demandés ensemble. Le
 * tri se fait sur `completed_at`, soit exactement la colonne affichée —
 * trier sur un axe et tronquer sur un autre revenait à perdre des
 * lignes au hasard.
 */
export function useArchivedTasks(userId: string | null | undefined, limit = 100) {
  return useQuery<TeamMemberTask[]>({
    queryKey: [KEY, 'archive', currentTenantIdForCache(), userId, limit],
    enabled:  Boolean(userId),
    staleTime: 30_000,
    queryFn: async () => {
      const params = { orderBy: 'completed_at', order: 'desc' as const, limit }
      const [done, cancelled] = await Promise.all([
        teamMemberTasksApi.list({ ...params, status: 'done',      assigned_user_id: userId }) as Promise<TeamMemberTask[]>,
        teamMemberTasksApi.list({ ...params, status: 'cancelled', assigned_user_id: userId }) as Promise<TeamMemberTask[]>,
      ])
      return [...done, ...cancelled]
        .sort((a, b) => {
          const da = a.completed_at ? new Date(a.completed_at).getTime() : 0
          const db = b.completed_at ? new Date(b.completed_at).getTime() : 0
          return db - da
        })
        .slice(0, limit)
    },
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
    /* Écriture OPTIMISTE, et statut d'avant conservé.
       Sans elle, déplacer une carte dans la matrice la faisait revenir
       dans sa case d'origine jusqu'à la réponse du serveur : le geste
       semblait refusé alors qu'il partait bien. On écrit donc tout de
       suite, et on remet l'état d'avant si l'écriture échoue. */
    onMutate: async (variables: Partial<TeamMemberTask> & { id: string }) => {
      await qc.cancelQueries({ queryKey: tk() })
      const previous = qc.getQueryData<TeamMemberTask[]>(tk())
      qc.setQueryData<TeamMemberTask[]>(tk(), (old) =>
        old ? old.map(t => t.id === variables.id ? { ...t, ...variables } : t) : old
      )
      return {
        previous,
        previousStatus: previous?.find(t => t.id === variables.id)?.status,
      }
    },
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

        /* L'occurrence suivante a-t-elle DÉJÀ été créée ?
           Depuis que l'archive permet de rouvrir une tâche close, le
           cycle « terminer → rouvrir → re-terminer » repartait de la
           même `due_date` et refabriquait la même occurrence : un
           doublon permanent à chaque aller-retour. La série n'a besoin
           que d'une occurrence par échéance. */
        const dejaCreee = nextDate
          ? (qc.getQueryData<TeamMemberTask[]>(tk()) ?? []).some(t =>
              t.id !== updated.id
              && t.title === updated.title
              && t.recurrence != null
              && t.assigned_user_id === updated.assigned_user_id
              && t.team_member_id === updated.team_member_id
              && String(t.due_date ?? '').slice(0, 10) === nextDate
              && t.status !== 'cancelled')
          : false

        if (nextDate && dejaCreee) {
          toast.message(`🔁 L'occurrence du ${nextDate} existe déjà`)
        } else if (nextDate) {
          try {
            const next = await teamMemberTasksApi.create({
              team_member_id:        updated.team_member_id,
              assigned_user_id:      updated.assigned_user_id,
              assigned_stagiaire_id: updated.assigned_stagiaire_id,
              project_id:            updated.project_id,
              title:                 updated.title,
              /* Checklist décochée : la nouvelle occurrence est à faire,
                 pas à contempler. */
              description:           resetChecklist(updated.description),
              priority:              updated.priority,
              status:                'todo',
              due_date:              nextDate,
              /* L'occurrence suivante hérite de l'heure et des rappels :
                 sans ça, une tâche récurrente réglée « 14 h, prévenir
                 30 min avant » perd sa précision dès la 2e occurrence. */
              due_time:              updated.due_time,
              reminder_offsets:      updated.reminder_offsets,
              /* Sans ça, une récurrente classée dans PLANIFIER revenait
                 le mois suivant non classée — et la déduction la posait
                 dans SUPPRIMER, la case qui invite à la jeter. */
              eisenhower:            updated.eisenhower,
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
    onError: (e: any, _variables, context) => {
      /* Retour à l'état d'avant : laisser l'écriture optimiste en place
         ferait croire à une modification enregistrée. */
      if (context?.previous) qc.setQueryData(tk(), context.previous)
      toast.error(e?.message ?? 'Erreur')
    },
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
