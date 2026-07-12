import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { stagiairesApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'

export type StagiaireGenre  = 'homme' | 'femme'
export type StagiaireStatut = 'accepte' | 'en_cours' | 'termine' | 'annule'

export interface Stagiaire {
  id:             string
  tenant_id:      string
  member_id:      string | null
  nom_complet:    string
  genre:          StagiaireGenre
  cin:            string
  date_naissance: string | null
  lieu_naissance: string | null
  telephone:      string
  email:          string
  adresse:        string
  etablissement:  string
  formation:      string
  departement:    string
  date_debut:     string
  date_fin:       string
  statut:         StagiaireStatut
  notes:          string | null
  created_at:     string
  updated_at:     string
}

export type StagiaireInput = Omit<Stagiaire, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>

const KEY = 'stagiaires'
const tk = () => [KEY, currentTenantIdForCache()] as const

export function useStagiaires() {
  return useQuery<Stagiaire[]>({
    queryKey: tk(),
    queryFn:  () => stagiairesApi.list({ orderBy: 'created_at', order: 'desc', limit: 500 }) as Promise<Stagiaire[]>,
    staleTime: 1000 * 60 * 2,
  })
}

export function useCreateStagiaire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: StagiaireInput) => stagiairesApi.create(data as any) as Promise<Stagiaire>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('Stagiaire ajouté')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateStagiaire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Stagiaire> & { id: string }) =>
      stagiairesApi.update(id, data) as Promise<Stagiaire>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('Stagiaire mis à jour')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteStagiaire() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => stagiairesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      toast.success('Stagiaire supprimé')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
