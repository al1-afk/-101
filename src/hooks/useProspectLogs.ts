import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'

export type LogType = 'creation' | 'statut' | 'note' | 'edit' | 'appel' | 'email'

export interface ProspectLog {
  id:               string
  prospect_id:      string
  created_at:       string
  type:             LogType
  message:          string
  auteur?:          string | null
  /* Durée en minutes — renseignée pour les appels (type='appel'), suivi du temps. */
  duration_minutes?: number | null
  /* Images jointes (data URL JPEG compressées) — captures collées ou glissées. */
  media?:           string[] | null
}

const TABLE = 'prospect_logs'

function qKey(prospectId: string) {
  return [TABLE, prospectId] as const
}

export function useProspectLogs(prospectId: string | null) {
  return useQuery<ProspectLog[]>({
    queryKey: qKey(prospectId ?? ''),
    enabled:  !!prospectId,
    queryFn:  () => api.get<ProspectLog[]>(`/api/prospect_logs?prospect_id=${prospectId}&orderBy=created_at&order=desc`),
    staleTime: 0,
  })
}

/* Tous les logs du tenant (triés du plus récent au plus ancien) — sert à afficher
   le dernier suivi/appel de chaque prospect dans la liste, d'un coup d'œil. */
export function useAllProspectLogs() {
  return useQuery<ProspectLog[]>({
    queryKey: [TABLE, 'all'],
    queryFn:  () => api.get<ProspectLog[]>(`/api/prospect_logs?orderBy=created_at&order=desc&limit=1000`),
    staleTime: 1000 * 30,
  })
}

export function useAddProspectLog() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Omit<ProspectLog, 'id' | 'created_at'>) =>
      api.post<ProspectLog>('/api/prospect_logs', data),
    onSuccess: (log) => {
      qc.setQueryData<ProspectLog[]>(qKey(log.prospect_id), old =>
        [log, ...(old ?? [])].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      )
      /* Rafraîchit le badge « dernier appel » de la liste des prospects. */
      qc.invalidateQueries({ queryKey: [TABLE, 'all'] })
      toast.success('Note ajoutée')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}
