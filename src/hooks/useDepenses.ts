import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { depensesApi, financeApi, newOpId } from '@/lib/api'
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
  /* Renseigné quand la dépense est la réalisation d'une dépense prévue. */
  prevision_id?:   string | null
}

const KEY = 'depenses'

/* Une dépense modifie un solde : tout ce qui en dépend doit être relu. */
function invalidateAfterDepense(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [KEY] })
  qc.invalidateQueries({ queryKey: ['bank_accounts'] })
  qc.invalidateQueries({ queryKey: ['previsions_financieres'] })
}

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
    /* `op_id` : un double-clic (ou un retry réseau) rejoue le même
       identifiant, l'index unique (tenant_id, op_id) empêche la seconde
       écriture — pas de dépense en double. */
    mutationFn: (data: Omit<Depense, 'id' | 'created_at'> & { op_id?: string }) =>
      depensesApi.create({ op_id: newOpId(), ...data } as any) as Promise<Depense>,
    onSuccess: () => { invalidateAfterDepense(qc); toast.success('Dépense ajoutée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteDepense() {
  const qc = useQueryClient()
  return useMutation({
    /* Passe par /api/finance : si la dépense réalisait une dépense
       prévue, la prévision repasse en « prévu » dans la même
       transaction — sinon l'historique afficherait une prévision payée
       sans paiement derrière. */
    mutationFn: (id: string) => financeApi.deleteDepense(id),
    onSuccess: () => { invalidateAfterDepense(qc); toast.success('Dépense supprimée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
