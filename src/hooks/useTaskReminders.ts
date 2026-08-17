/**
 * Réglages de rappel de tâches + état de l'abonnement Web Push.
 *
 * Les défauts servent à deux endroits : ils s'appliquent aux tâches qui
 * n'ont pas de rappel propre (`reminder_offsets = NULL`), et ils sont
 * affichés dans le sélecteur pour qu'on sache ce qu'on hérite.
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { taskRemindersApi, type TaskReminderPrefs } from '@/lib/api'
import { currentTenantIdForCache } from '@/lib/authToken'
import {
  pushStatus, enablePush, disablePush, syncPushSubscription, type PushStatus,
} from '@/lib/pushClient'

const PREFS   = 'task_reminder_prefs'
const DEVICES = 'push_devices'

/* Mêmes valeurs que la migration 088 et la route serveur : 30 min et
   1 jour. Ce repli ne sert que le temps du chargement. */
export const FALLBACK_PREFS: TaskReminderPrefs = {
  default_offsets:  [1440, 30],
  default_due_time: '09:00:00',
  email_enabled: true,
  push_enabled:  true,
  inapp_enabled: true,
}

export function useTaskReminderPrefs() {
  const q = useQuery<TaskReminderPrefs>({
    queryKey: [PREFS, currentTenantIdForCache()],
    queryFn:  () => taskRemindersApi.prefs(),
    staleTime: 1000 * 60 * 5,
  })
  return { ...q, prefs: q.data ?? FALLBACK_PREFS }
}

export function useSaveTaskReminderPrefs() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<TaskReminderPrefs>) => taskRemindersApi.savePrefs(patch),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [PREFS] })
      toast.success('Réglages de rappel enregistrés')
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur'),
  })
}

export function usePushDevices() {
  return useQuery({
    queryKey: [DEVICES, currentTenantIdForCache()],
    queryFn:  () => taskRemindersApi.devices(),
    staleTime: 1000 * 60,
  })
}

/**
 * État de l'abonnement push de CE navigateur, avec les actions pour
 * l'activer ou le couper. L'état est relu après chaque action : c'est
 * le navigateur qui fait foi, pas ce qu'on croit avoir demandé.
 */
export function usePushSubscription() {
  const qc = useQueryClient()
  const [status, setStatus] = useState<PushStatus | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    setStatus(await pushStatus())
  }, [])

  useEffect(() => {
    /* Redéposer AVANT de lire l'état : un abonnement que le serveur a
       perdu redevient ainsi actif tout seul, sans que la personne ait à
       recliquer sur « Activer ». */
    void syncPushSubscription().finally(() => { void refresh() })
  }, [refresh])

  const enable = useCallback(async () => {
    setBusy(true)
    try {
      const next = await enablePush()
      setStatus(next)
      qc.invalidateQueries({ queryKey: [DEVICES] })
      if (next.state === 'ready')      toast.success('Notifications activées sur cet appareil')
      else if (next.state === 'denied') toast.error(next.reason)
      else                              toast.message(next.reason)
    } catch (e: any) {
      toast.error(e?.message ?? 'Activation impossible')
    } finally {
      setBusy(false)
    }
  }, [qc])

  const disable = useCallback(async () => {
    setBusy(true)
    try {
      await disablePush()
      await refresh()
      qc.invalidateQueries({ queryKey: [DEVICES] })
      toast.success('Notifications coupées sur cet appareil')
    } finally {
      setBusy(false)
    }
  }, [qc, refresh])

  return { status, busy, enable, disable, refresh }
}
