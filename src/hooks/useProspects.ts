import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { prospectsOffline } from '@/lib/offline/prospectsOffline'
import { currentTenantIdForCache } from '@/lib/authToken'
import { toast } from 'sonner'

export type ProspectStatut = 'nouveau' | 'contacte' | 'qualifie' | 'proposition' | 'gagne' | 'perdu'

export interface Prospect {
  id:             string
  created_at:     string
  nom:            string
  email:          string | null
  telephone:      string | null
  entreprise:     string | null
  statut:         ProspectStatut
  valeur_estimee: number | null
  source:         string | null
  notes:          string | null
  responsable:    string | null
  date_contact:   string | null
  date_relance:   string | null
  /* Date + heure de relance (rappel planifié). date_relance garde la partie jour. */
  relance_at?:    string | null
}

export const PROSPECT_STAGES: { id: ProspectStatut; label: string; accent: string; dot: string }[] = [
  { id: 'nouveau',      label: 'Nouveau',     accent: '#64748B', dot: 'bg-slate-400'   },
  { id: 'contacte',    label: 'Contacté',    accent: '#3B82F6', dot: 'bg-blue-500'    },
  { id: 'qualifie',    label: 'Qualifié',    accent: '#8B5CF6', dot: 'bg-violet-500'  },
  { id: 'proposition', label: 'Proposition', accent: '#F59E0B', dot: 'bg-amber-500'   },
  { id: 'gagne',       label: 'Gagné',       accent: '#10B981', dot: 'bg-emerald-500' },
  { id: 'perdu',       label: 'Perdu',       accent: '#EF4444', dot: 'bg-red-500'     },
]

export const PROSPECT_SOURCES = [
  'Facebook Ads',
  'Instagram Ads',
  'WhatsApp Ads',
  'Google Ads',
  'SEO',
  'Recommandation',
  'Site web',
  'Instagram',
  'LinkedIn',
  'Appel entrant',
  'Autre',
]

const KEY = 'prospects'

export function useProspects() {
  return useQuery<Prospect[]>({
    queryKey: [KEY, currentTenantIdForCache()],
    queryFn:  () => prospectsOffline.list({ orderBy: 'created_at', order: 'desc' }),
    staleTime: 1000 * 60 * 2,
  })
}

const offlineNote = () =>
  (typeof navigator !== 'undefined' && !navigator.onLine)
    ? ' (hors ligne — synchronisation au retour)'
    : ''

export function useCreateProspect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<Prospect, 'id' | 'created_at'>) =>
      prospectsOffline.create(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Prospect créé' + offlineNote()) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateProspect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<Prospect> & { id: string }) =>
      prospectsOffline.update(id, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Prospect mis à jour' + offlineNote()) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteProspect() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => prospectsOffline.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [KEY] }); toast.success('Prospect supprimé' + offlineNote()) },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
