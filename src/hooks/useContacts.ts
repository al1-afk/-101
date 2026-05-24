import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { contactsApi } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'

export type ContactType   = 'freelance' | 'artisan' | 'candidat' | 'partenaire' | 'autre'
export type ContactStatut = 'actif' | 'contact'

export interface Contact {
  id:          string
  created_at:  string
  nom:         string
  telephone:   string | null
  email:       string | null
  profession:  string | null
  type:        ContactType
  statut:      ContactStatut
  ville:       string | null
  notes:       string | null
  tags:        string[] | null
}

const KEY = 'contacts'
const tk = () => [KEY, currentTenantIdForCache()] as const

export function useContacts() {
  return useQuery<Contact[]>({
    queryKey: tk(),
    queryFn:  () => contactsApi.list({ orderBy: 'created_at', order: 'desc' }) as Promise<Contact[]>,
    staleTime: 1000 * 60 * 5,
  })
}

export function useCreateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Contact, 'id' | 'created_at'>) =>
      contactsApi.create(data) as Promise<Contact>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Contact ajouté') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Contact> & { id: string }) =>
      contactsApi.update(id, data) as Promise<Contact>,
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Contact mis à jour') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteContact() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => contactsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Contact supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
