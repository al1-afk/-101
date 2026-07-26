import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { prestationModelsApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'
import type { PrestationModel } from '@/lib/prestationTemplates'

const KEY = 'prestation_models'

export function usePrestationModels() {
  return useQuery<PrestationModel[]>({
    queryKey: [KEY, currentTenantIdForCache()],
    queryFn:  () => prestationModelsApi.list({ orderBy: 'position', order: 'asc' }) as Promise<PrestationModel[]>,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreatePrestationModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<PrestationModel>) => prestationModelsApi.create(data as any) as Promise<PrestationModel>,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdatePrestationModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<PrestationModel> & { id: string }) =>
      prestationModelsApi.update(id, data) as Promise<PrestationModel>,
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeletePrestationModel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => prestationModelsApi.remove(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: [KEY] }),
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
