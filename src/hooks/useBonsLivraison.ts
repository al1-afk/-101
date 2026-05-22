import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { bonsLivraisonApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'

export type BonLivraisonStatut = 'brouillon' | 'envoye' | 'confirme'

export interface BonLivraisonLien {
  label: string
  url:   string
}

export type IdentifiantType = 'password' | 'user' | 'email' | 'url' | 'other'

export interface BonLivraisonIdentifiant {
  label:   string
  valeur:  string
  type:    IdentifiantType
}

export interface BonLivraison {
  id:              string
  tenant_id:       string
  numero:          string
  projet_id:       string | null
  client_id:       string | null
  titre:           string
  description:     string | null
  liens:           BonLivraisonLien[]
  identifiants:    BonLivraisonIdentifiant[]
  date_livraison:  string
  statut:          BonLivraisonStatut
  notes:           string | null
  created_at:      string
  updated_at:      string
}

export type BonLivraisonInput = Omit<BonLivraison, 'id' | 'tenant_id' | 'created_at' | 'updated_at'>

const KEY = 'bons_livraison'
const tk = () => [KEY, currentTenantIdForCache()] as const

export function useBonsLivraison() {
  return useQuery<BonLivraison[]>({
    queryKey: tk(),
    queryFn:  () => bonsLivraisonApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<BonLivraison[]>,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateBonLivraison() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<BonLivraisonInput>) =>
      bonsLivraisonApi.create(data as any) as Promise<BonLivraison>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Bon de livraison créé') },
    onError:   (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateBonLivraison() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<BonLivraison> & { id: string }) =>
      bonsLivraisonApi.update(id, data) as Promise<BonLivraison>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Bon de livraison mis à jour') },
    onError:   (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteBonLivraison() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => bonsLivraisonApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Bon de livraison supprimé') },
    onError:   (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

/* Génère un numéro auto au format BL-YYYY-NNNN basé sur les bons existants */
export function nextBonLivraisonNumero(existing: BonLivraison[]): string {
  const year = new Date().getFullYear()
  const prefix = `BL-${year}-`
  const nums = existing
    .map(b => b.numero)
    .filter(n => n.startsWith(prefix))
    .map(n => parseInt(n.slice(prefix.length), 10))
    .filter(n => !isNaN(n))
  const next = (nums.length > 0 ? Math.max(...nums) : 0) + 1
  return `${prefix}${String(next).padStart(4, '0')}`
}
