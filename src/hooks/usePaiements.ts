import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { paiementsApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'

export type PaiementMethode = 'especes' | 'virement' | 'carte_bancaire' | 'paypal' | 'cheque' | 'prelevement'
export type PaiementStatus  = 'paye' | 'en_attente'
export type PaiementType    = 'domaine' | 'hebergement' | 'site_web' | 'seo' | 'ads' | 'renouvellement' | 'autre'

export interface Paiement {
  id:              string
  reference:       string
  facture_id:      string | null
  contrat_id:      string | null
  client_id:       string | null
  date:            string
  montant:         number
  type_paiement:   PaiementType
  methode:         PaiementMethode
  status:          PaiementStatus
  notes:           string | null
  bank_account_id: string | null
  created_at:      string
  updated_at:      string
}

const KEY = 'paiements'

export function usePaiements() {
  return useQuery<Paiement[]>({
    queryKey: [KEY, currentTenantIdForCache()],
    queryFn:  () => paiementsApi.list({ orderBy: 'date', order: 'desc' }) as Promise<Paiement[]>,
    staleTime: 1000 * 60 * 2,
  })
}

export function useCreatePaiement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Paiement, 'id' | 'created_at' | 'updated_at'>) =>
      paiementsApi.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Paiement ajouté') },
    onError:   (e: any) => toast.error(e.message ?? 'Erreur'),
  })
}

export function useUpdatePaiement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Paiement> }) =>
      paiementsApi.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Paiement mis à jour') },
    onError:   (e: any) => toast.error(e.message ?? 'Erreur'),
  })
}

export function useDeletePaiement() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => paiementsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Paiement supprimé') },
    onError:   (e: any) => toast.error(e.message ?? 'Erreur'),
  })
}
