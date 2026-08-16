/**
 * 7aty — accès aux données de suivi du temps.
 *
 * Une seule requête ramène les blocs des 60 derniers jours : la semaine
 * en cours, la précédente (pour dire « tu as récupéré 2 h ») et de quoi
 * faire tourner la détection de schémas. Tout le reste — totaux, score,
 * rapport — est calculé en mémoire par src/lib/timeAnalytics.ts. Changer
 * de semaine dans l'écran ne déclenche donc aucun aller-retour réseau.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import {
  timeApi,
  type TimeEntryDTO, type TimeGoalDTO, type TimeSettingsDTO,
} from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import { DEFAULT_SETTINGS, type TimeEntry, type TimeSettings } from '@/lib/timeAnalytics'

const ENTRIES  = 'time_entries'
const RUNNING  = 'time_running'
const GOALS    = 'time_goals'
const SETTINGS = 'time_settings'

/** Fenêtre chargée : deux mois glissants (cf. commentaire d'en-tête). */
const WINDOW_DAYS = 60

function windowStart(): Date {
  return new Date(Date.now() - WINDOW_DAYS * 24 * 3600 * 1000)
}

export function useTimeEntries() {
  return useQuery<TimeEntry[]>({
    queryKey: [ENTRIES, currentTenantIdForCache()],
    queryFn:  async () => (await timeApi.entries(windowStart())) as unknown as TimeEntry[],
    staleTime: 1000 * 30,
  })
}

export function useRunningEntry() {
  return useQuery<TimeEntry | null>({
    queryKey: [RUNNING, currentTenantIdForCache()],
    queryFn:  async () => (await timeApi.running()) as unknown as TimeEntry | null,
    /* Le chronomètre peut avoir été démarré depuis un autre onglet ou le
       téléphone : on revérifie régulièrement plutôt que de faire
       confiance au seul état local. */
    refetchInterval: 1000 * 60,
    staleTime: 1000 * 10,
  })
}

export function useTimeGoals() {
  return useQuery<TimeGoalDTO[]>({
    queryKey: [GOALS, currentTenantIdForCache()],
    queryFn:  () => timeApi.goals(),
    staleTime: 1000 * 60 * 5,
  })
}

export function useTimeSettings() {
  const q = useQuery<TimeSettingsDTO>({
    queryKey: [SETTINGS, currentTenantIdForCache()],
    queryFn:  () => timeApi.settings(),
    staleTime: 1000 * 60 * 5,
  })
  /* Le serveur renvoie déjà des valeurs par défaut quand rien n'a été
     réglé ; ce repli couvre le seul temps du chargement. */
  const settings: TimeSettings = q.data
    ? {
        work_start_hour: q.data.work_start_hour,
        work_end_hour:   q.data.work_end_hour,
        work_days:       q.data.work_days ?? DEFAULT_SETTINGS.work_days,
        alert_threshold_min:     q.data.alert_threshold_min,
        alerts_enabled:          q.data.alerts_enabled,
        weekly_high_value_hours: q.data.weekly_high_value_hours,
        reminder_enabled: q.data.reminder_enabled ?? DEFAULT_SETTINGS.reminder_enabled,
        reminder_hour:    q.data.reminder_hour    ?? DEFAULT_SETTINGS.reminder_hour,
      }
    : DEFAULT_SETTINGS
  return { ...q, settings }
}

/* ── Mutations ───────────────────────────────────────────────────── */

/* Blocs et chronomètre bougent ensemble : démarrer un chronomètre ferme
   le précédent, l'arrêter crée un bloc terminé. Les deux caches sont
   donc toujours invalidés de pair. */
function invalidateTime(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: [ENTRIES] })
  qc.invalidateQueries({ queryKey: [RUNNING] })
}

export function useCreateTimeEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<TimeEntryDTO>) => timeApi.create(data),
    onSuccess: () => { invalidateTime(qc); toast.success('Bloc enregistré') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useUpdateTimeEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...data }: Partial<TimeEntryDTO> & { id: string }) => timeApi.update(id, data),
    onSuccess: () => invalidateTime(qc),
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useDeleteTimeEntry() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => timeApi.remove(id),
    onSuccess: () => { invalidateTime(qc); toast.success('Bloc supprimé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useStartTimer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<TimeEntryDTO>) => timeApi.start(data),
    onSuccess: (res) => {
      invalidateTime(qc)
      /* Le serveur a fermé le bloc précédent : le dire, sinon la personne
         croit avoir perdu ce qu'elle chronométrait. */
      if (res.stopped) toast.success(`« ${res.stopped.label} » arrêté — ${res.running.label} démarré`)
      else toast.success(`« ${res.running.label} » démarré`)
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useStopTimer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: Partial<TimeEntryDTO> = {}) => timeApi.stop(data),
    onSuccess: () => { invalidateTime(qc); toast.success('Bloc enregistré') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useCancelTimer() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => timeApi.cancelRunning(),
    onSuccess: () => { invalidateTime(qc); toast.success('Chronomètre annulé') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useSaveTimeGoals() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (goals: { category_key: string; max_minutes_week: number }[]) => timeApi.saveGoals(goals),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [GOALS] }); toast.success('Objectifs enregistrés') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function useSaveTimeSettings() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<TimeSettingsDTO>) => timeApi.saveSettings(patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: [SETTINGS] }); toast.success('Réglages enregistrés') },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

/* ── Horloge partagée ────────────────────────────────────────────────
   Un chronomètre en cours doit faire avancer TOUS les compteurs de
   l'écran (durée en cours, totaux de la semaine, score). Un seul
   intervalle, exposé comme une valeur, évite d'en poser un par
   composant. */
export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}
