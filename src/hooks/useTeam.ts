import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { teamApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'
import type { Role } from '@/lib/permissions'

export interface TeamMember {
  id:            string
  created_at:    string
  nom:           string
  prenom:        string
  email:         string | null
  telephone:     string | null
  poste:         string | null
  departement:   string | null
  /* Référence la source unique du vocabulaire des rôles : le redéclarer
     ici avait créé une quatrième liste à maintenir, et un rôle ajouté
     ailleurs ne compilait plus. */
  role:          Role | null
  salaire_base:  number
  date_embauche: string | null
  statut:        'actif' | 'inactif' | 'conge'
  /** Type de collaboration. La colonne existe en base (CHECK employee /
   *  trainer / freelance) mais le formulaire « Ajouter un salarié » ne la
   *  renseigne pas : une fiche sans type est traitée comme un salarié. */
  member_type?:  'employee' | 'trainer' | 'freelance' | null
}

const KEY = 'team_members'

export function useTeam() {
  return useQuery<TeamMember[]>({
    queryKey: [KEY, currentTenantIdForCache()],
    queryFn:  () => teamApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<TeamMember[]>,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<TeamMember, 'id' | 'created_at'>) =>
      teamApi.create(data) as Promise<TeamMember>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Membre ajouté') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<TeamMember> & { id: string }) =>
      teamApi.update(id, data) as Promise<TeamMember>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Membre mis à jour') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteTeamMember() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => teamApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Membre supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
