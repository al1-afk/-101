import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { facturesApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'

export type FactureStatut = 'brouillon' | 'envoyee' | 'impayee' | 'partielle' | 'payee' | 'annulee' | 'refusee'

export interface Facture {
  id:            string
  created_at:    string
  numero:        string
  client_id:     string | null
  client_nom?:   string
  client_email?: string
  statut:        FactureStatut
  date_emission: string
  date_echeance: string | null
  montant_ht:    number
  tva:           number
  montant_ttc:   number
  montant_paye:  number
  notes:         string | null
}

export function computeAutoStatut(montant_paye: number, montant_ttc: number, current: FactureStatut): FactureStatut {
  if (['brouillon', 'annulee', 'refusee'].includes(current)) return current
  if (montant_paye >= montant_ttc && montant_ttc > 0) return 'payee'
  if (montant_paye > 0 && montant_paye < montant_ttc) return 'partielle'
  return current === 'envoyee' ? 'envoyee' : 'impayee'
}

const KEY = 'factures'

export function useFactures() {
  return useQuery<Facture[]>({
    queryKey: [KEY, currentTenantIdForCache()],
    queryFn:  () => facturesApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<Facture[]>,
    staleTime: 1000 * 60 * 2,
  })
}

export function useCreateFacture() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Facture, 'id' | 'created_at' | 'client_nom' | 'client_email'>) =>
      facturesApi.create(data) as Promise<Facture>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Facture créée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateFacture() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Facture> & { id: string }) =>
      facturesApi.update(id, data) as Promise<Facture>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Facture mise à jour') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteFacture() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => facturesApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Facture supprimée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useMarkFacturePaid() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (facture: Facture) =>
      facturesApi.update(facture.id, { statut: 'payee', montant_paye: facture.montant_ttc }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Facture marquée comme payée ✓') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useMarkFactureEnvoyee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => facturesApi.update(id, { statut: 'envoyee' }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Facture marquée comme envoyée') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDuplicateFacture() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (facture: Facture) => {
      const now = new Date()
      const mm  = String(now.getMonth() + 1).padStart(2, '0')
      return facturesApi.create({
        numero:        `AAA${String(Date.now()).slice(-3)}/${mm}-${now.getFullYear()}`,
        client_id:     facture.client_id,
        statut:        'brouillon',
        date_emission: now.toISOString().slice(0, 10),
        date_echeance: null,
        montant_ht:    facture.montant_ht,
        tva:           facture.tva,
        montant_ttc:   facture.montant_ttc,
        montant_paye:  0,
        notes:         `Copie de ${facture.numero}`,
      }) as Promise<Facture>
    },
    onSuccess: (f: any) => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success(`Dupliquée → ${f.numero}`) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
