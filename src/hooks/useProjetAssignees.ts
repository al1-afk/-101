import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projetAssigneesApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'

export type ProjetAssigneeRole = 'lead' | 'member'

/** Périmètre des tâches visibles par la personne sur le projet.
    'all' = toutes les tâches du projet, 'assigned' = uniquement les siennes. */
export type ProjetTaskAccess = 'all' | 'assigned'

export interface ProjetAssignee {
  id:              string
  tenant_id:       string
  projet_id:       string
  /** Exclusif avec stagiaire_id — l'un des deux est renseigné. */
  team_member_id:  string | null
  /** Exclusif avec team_member_id — assignation d'un stagiaire au projet. */
  stagiaire_id:    string | null
  role:            ProjetAssigneeRole
  notes:           string | null
  /** Si false : le membre n'a PAS accès aux Infos & Accès du projet
      (contact client, notes, identifiants, liens utiles). Default true. */
  share_infos:     boolean
  /** 'all' : la personne consulte toutes les tâches du projet (les autres
      en lecture seule). 'assigned' : uniquement celles qui lui sont
      attribuées — les autres ne quittent jamais le serveur. Default
      'assigned' (migration 085, rétrocompatibilité). */
  task_access:     ProjetTaskAccess
  assigned_at:     string
  created_at:      string
  updated_at:      string
}

const KEY = 'projet_assignees'
const tk = () => [KEY, currentTenantIdForCache()] as const

export function useProjetAssignees() {
  return useQuery<ProjetAssignee[]>({
    queryKey: tk(),
    queryFn:  () => projetAssigneesApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<ProjetAssignee[]>,
    staleTime: 5_000,
    refetchOnWindowFocus: true,
    refetchOnMount: true,
  })
}

/** All assignees of a given project (derived from cached list). */
export function useAssigneesOf(projetId: string | undefined) {
  const { data = [] } = useProjetAssignees()
  return projetId ? data.filter(a => a.projet_id === projetId) : []
}

export function useAddProjetAssignee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data:
      | { projet_id: string; team_member_id: string; stagiaire_id?: never; role?: ProjetAssigneeRole; notes?: string; task_access?: ProjetTaskAccess; share_infos?: boolean }
      | { projet_id: string; stagiaire_id:   string; team_member_id?: never; role?: ProjetAssigneeRole; notes?: string; task_access?: ProjetTaskAccess; share_infos?: boolean }
    ) =>
      projetAssigneesApi.create({ role: 'member', task_access: 'assigned', ...data }) as Promise<ProjetAssignee>,
    onSuccess: async (created: ProjetAssignee) => {
      qc.setQueryData<ProjetAssignee[]>(tk(), (prev) => prev ? [created, ...prev] : [created])
      await qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('Membre assigné')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateProjetAssignee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<ProjetAssignee> & { id: string }) =>
      projetAssigneesApi.update(id, data) as Promise<ProjetAssignee>,
    onSuccess: async (updated: ProjetAssignee) => {
      qc.setQueryData<ProjetAssignee[]>(tk(), (prev) =>
        prev ? prev.map(a => a.id === updated.id ? { ...a, ...updated } : a) : prev
      )
      await qc.invalidateQueries({ queryKey: [KEY] })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useRemoveProjetAssignee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => projetAssigneesApi.remove(id),
    onSuccess: async (_, id: string) => {
      qc.setQueryData<ProjetAssignee[]>(tk(), (prev) => prev ? prev.filter(a => a.id !== id) : prev)
      await qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('Membre retiré')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
