import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { projetsApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'

export type ProjetStatut   = 'planifie' | 'en_cours' | 'en_pause' | 'termine' | 'annule'
export type ProjetPriorite = 'basse' | 'normale' | 'haute' | 'urgente'

export interface Projet {
  id:              string
  tenant_id:       string
  client_id:       string | null
  nom:             string
  description:     string | null
  statut:          ProjetStatut
  priorite:        ProjetPriorite
  date_debut:      string | null
  date_fin_prevue: string | null
  date_fin_reelle: string | null
  budget:          number | null
  cout_reel:       number | null
  progression:     number
  responsable:     string | null
  notes:           string | null
  created_at:      string
  updated_at:      string
}

export type ProjetInput = Omit<Projet, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>

const KEY = 'projets'
const tk = () => [KEY, currentTenantIdForCache()] as const

export function useProjets() {
  return useQuery<Projet[]>({
    queryKey: tk(),
    queryFn:  () => projetsApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<Projet[]>,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateProjet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<ProjetInput>) => projetsApi.create(data as any) as Promise<Projet>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Projet créé') },
    onError:   (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateProjet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Projet> & { id: string }) =>
      projetsApi.update(id, data) as Promise<Projet>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Projet mis à jour') },
    onError:   (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteProjet() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => projetsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Projet supprimé') },
    onError:   (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

/** Get a single project from the cached list (no extra API call). */
export function useProjet(id: string | undefined): Projet | undefined {
  const { data } = useProjets()
  return id ? data?.find(p => p.id === id) : undefined
}
