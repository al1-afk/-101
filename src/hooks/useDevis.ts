import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { devisApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'

export interface DevisLine {
  id:            string
  description:   string
  quantite:      number
  prix_unitaire: number
  total:         number
}

export interface Devis {
  id:              string
  created_at:      string
  numero:          string
  client_id:       string | null
  client_nom?:     string
  /* Devis ciblant un prospect (lead) pas encore client — cf. migration 078. */
  prospect_id?:    string | null
  statut:          'brouillon' | 'envoye' | 'accepte' | 'refuse' | 'expire'
  date_emission:   string
  date_expiration: string | null
  montant_ht:      number
  tva:             number
  montant_ttc:     number
  notes:           string | null
  lignes?:         DevisLine[]
}

const KEY = 'devis'

export function useDevis() {
  return useQuery<Devis[]>({
    queryKey: [KEY, currentTenantIdForCache()],
    queryFn:  () => devisApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<Devis[]>,
    staleTime: 1000 * 60 * 3,
  })
}

export function useCreateDevis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Devis, 'id' | 'created_at'>) =>
      devisApi.create(data) as Promise<Devis>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Devis créé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateDevis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Devis> & { id: string }) =>
      devisApi.update(id, data) as Promise<Devis>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Devis mis à jour') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteDevis() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => devisApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Devis supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
