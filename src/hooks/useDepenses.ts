import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { depensesApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'

export interface Depense {
  id:              string
  created_at:      string
  description:     string
  montant:         number
  categorie:       string
  type:            'personnel' | 'business'
  date_depense:    string
  bank_account_id: string | null
}

const KEY = 'depenses'

export function useDepenses() {
  return useQuery<Depense[]>({
    queryKey: [KEY, currentTenantIdForCache()],
    queryFn:  () => depensesApi.list({ orderBy: 'date_depense', order: 'desc' }) as Promise<Depense[]>,
    staleTime: 1000 * 60 * 3,
  })
}

export function useCreateDepense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Depense, 'id' | 'created_at'>) =>
      depensesApi.create(data) as Promise<Depense>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Dépense ajoutée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteDepense() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => depensesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Dépense supprimée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
