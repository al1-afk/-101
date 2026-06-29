import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { clientsApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'

export interface Client {
  id:         string
  created_at: string
  nom:        string
  email:      string | null
  telephone:  string | null
  entreprise: string | null
  adresse:    string | null
  ville:      string | null
  pays:       string | null
  notes:      string | null
  /* Champs métier — affichés dans la table /clients (migration 057).
     Optionnels pour ne pas casser les callers existants (Devis/Factures
     qui créent un client à la volée). */
  type_service?:        string | null  // 'Site web' | 'Social Media' | ...
  sous_categorie?:      string | null  // 'SEO' | 'Ads' | 'Les messages' | ...
  date_debut_contrat?:  string | null  // YYYY-MM-DD
  montant_ttc_annuel?:  number | null
  prix_renouvellement?: number | null
}

const KEY = 'clients'
const tk = () => [KEY, currentTenantIdForCache()] as const

export function useClients() {
  return useQuery<Client[]>({
    queryKey: tk(),
    queryFn:  () => clientsApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<Client[]>,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Client, 'id' | 'created_at'>) =>
      clientsApi.create(data) as Promise<Client>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Client créé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateClient(opts: { silent?: boolean } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Client> & { id: string }) =>
      clientsApi.update(id, data) as Promise<Client>,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [KEY] })
      if (!opts.silent) toast.success('Client mis à jour')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteClient() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => clientsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Client supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
