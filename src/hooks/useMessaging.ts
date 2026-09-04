/**
 * useMessaging — les hooks de la messagerie interne (messages privés entre
 * les personnes d'un même espace, administrateurs et employés confondus).
 *
 * Le temps réel arrive par un flux SSE (`messagesApi.stream`), mais il ne doit
 * JAMAIS en dépendre seul : un proxy, un réseau mobile ou un onglet endormi
 * coupent la connexion sans prévenir. D'où le sondage react-query de repli,
 * court tant que le flux est tombé et long quand il tient.
 *
 * Les clés react-query sont volontairement communes aux deux espaces : un
 * navigateur n'affiche qu'une messagerie à la fois, et `queryClient.clear()`
 * à la déconnexion (src/lib/session.ts) suffit à éviter tout mélange.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  memberTokenStore,
  messagesApi,
  tokenStore,
  type DmContact,
  type DmMessage,
  type DmPrefs,
  type DmStreamEvent,
  type DmUnread,
} from '@/lib/api'
import { getSoundPref, playNotificationSound, unlockNotificationSound } from '@/lib/notificationSound'
import { getBrowserNotifPref, showBrowserNotification } from '@/lib/browserNotifications'

type Audience = 'admin' | 'member'

/* Les clés portent le PUBLIC — et ce n'est pas de la cosmétique.
   Ce dépôt autorise volontairement une session administrateur ET une
   session employé dans le même navigateur (deux emplacements de jeton
   distincts, cf. tokenStore / memberTokenStore dans src/lib/api.ts).
   Sans cette dimension, passer de /my-space à l'espace admin sans
   recharger la page servait à l'un le cache de l'autre : les
   conversations d'un compte s'affichaient sous l'identité du second. */
export const messagesKeys = {
  unread:   (as: Audience) => ['messages', as, 'unread'] as const,
  contacts: (as: Audience) => ['messages', as, 'contacts'] as const,
  thread:   (as: Audience, id: string) => ['messages', as, 'thread', id] as const,
  prefs:    (as: Audience) => ['messages', as, 'prefs'] as const,
}

/* Repli tant que le serveur n'a pas répondu : mêmes valeurs que la migration
   099 (e-mail éteint, e-mail urgent allumé), pour que l'interface n'affiche
   pas des interrupteurs qui sautent au premier chargement. */
const DEFAULT_PREFS: DmPrefs = {
  inapp_enabled:       true,
  popup_enabled:       true,
  sound_enabled:       true,
  browser_enabled:     true,
  push_enabled:        true,
  email_enabled:       false,
  urgent_email_enabled: true,
}

/* Réunion des charges utiles SSE du contrat (§2). Tout est optionnel : un
   événement d'une version plus récente du serveur ne doit jamais faire
   planter l'onglet, seulement être ignoré. */
interface DmStreamPayload {
  message?:       DmMessage
  conversation_id?: string
  peer_id?:       string
  peer_name?:     string
  unread_total?:  number
  reader_id?:     string
  read_at?:       string
  recipient_id?:  string
  delivered_at?:  string
  total?:         number
  server_time?:   string
}

const SOUND_THROTTLE_MS   = 3_000
const POLL_WHEN_STREAMING = 60_000
const POLL_WHEN_OFFLINE   = 20_000

/* Partagé par tout l'onglet : dix messages reçus d'un coup ne doivent
   produire qu'un seul « ding », pas dix. */
let lastSoundAt = 0

/** Les deux espaces cohabitent dans le même navigateur et l'un peut être
 *  déconnecté : sans jeton, aucune requête ne part et aucun flux ne s'ouvre. */
function hasToken(as: Audience): boolean {
  try {
    return !!(as === 'member' ? memberTokenStore.get() : tokenStore.get())
  } catch {
    /* localStorage inaccessible (mode privé strict) : on reste muet. */
    return false
  }
}

/** Aperçu affiché dans le toast et la notification navigateur. */
function previewOf(message: DmMessage): string {
  const body = (message.body ?? '').trim()
  if (body) return body.length > 140 ? `${body.slice(0, 139)}…` : body
  const count = message.files?.length ?? 0
  if (count > 1) return `${count} pièces jointes`
  if (count === 1) return 'Pièce jointe'
  return 'Nouveau message'
}

/* Une seule définition de la requête des préférences : le hook public et le
   hook temps réel la partagent, react-query dédoublonne l'appel réseau. */
function usePrefsQuery(as: Audience) {
  return useQuery<DmPrefs>({
    queryKey: messagesKeys.prefs(as),
    queryFn:  () => messagesApi.prefs(as),
    enabled:  hasToken(as),
    staleTime: 5 * 60_000,
    retry: 1,
  })
}

/** Compteur pour la pastille de la barre latérale. */
export function useMessagesUnread(as: Audience = 'admin'): number {
  const { data } = useQuery<DmUnread>({
    queryKey: messagesKeys.unread(as),
    queryFn:  () => messagesApi.unread(as),
    enabled:  hasToken(as),
    staleTime: 10_000,
    refetchOnWindowFocus: true,
    retry: 1,
  })
  return data?.total ?? 0
}

/** Liste des correspondants de l'espace, avec présence, non-lus et aperçu. */
export function useMessagesContacts(as: Audience = 'admin') {
  const { data, isLoading, refetch } = useQuery({
    queryKey: messagesKeys.contacts(as),
    queryFn:  () => messagesApi.contacts(as),
    enabled:  hasToken(as),
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    retry: 1,
  })

  /* Référence stable : sans useMemo, `?? []` fabrique un tableau neuf à
     chaque rendu et relance les effets qui en dépendent en boucle. */
  const contacts = useMemo<DmContact[]>(() => data?.contacts ?? [], [data])

  return {
    contacts,
    me: data?.me ?? null,
    isLoading,
    refetch: useCallback(() => { void refetch() }, [refetch]),
  }
}

/** Préférences de notification de la messagerie (une ligne par personne). */
export function useMessagesPrefs(as: Audience = 'admin') {
  const qc = useQueryClient()
  const { data } = usePrefsQuery(as)

  const mutation = useMutation({
    mutationFn: (patch: Partial<DmPrefs>) => messagesApi.savePrefs(patch, as),
    /* Bascule optimiste : attendre l'aller-retour donnerait un interrupteur
       qui revient en arrière une demi-seconde avant de se remettre en place. */
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: messagesKeys.prefs(as) })
      const previous = qc.getQueryData<DmPrefs>(messagesKeys.prefs(as))
      qc.setQueryData<DmPrefs>(messagesKeys.prefs(as), { ...(previous ?? DEFAULT_PREFS), ...patch })
      return { previous }
    },
    onError: (_err, _patch, context) => {
      if (context?.previous) qc.setQueryData(messagesKeys.prefs(as), context.previous)
      toast.error('Impossible d’enregistrer vos préférences de messagerie')
    },
    onSuccess: (res) => { qc.setQueryData(messagesKeys.prefs(as), res.prefs) },
  })

  return {
    prefs:    data ?? DEFAULT_PREFS,
    save:     (patch: Partial<DmPrefs>) => mutation.mutate(patch),
    isSaving: mutation.isPending,
  }
}

/**
 * Branche l'espace sur le temps réel. À monter UNE SEULE FOIS par espace
 * (AppLayout côté administrateur, MySpaceLayout côté employé) : chaque montage
 * ouvre un flux SSE et le serveur en plafonne huit par personne.
 *
 * `basePath` sert à construire le lien « Voir le message » : la notification
 * doit ouvrir directement la bonne conversation, pas la liste.
 */
export function useMessagesRealtime(as: Audience, basePath: string): void {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const location = useLocation()
  const active = hasToken(as)
  const [connected, setConnected] = useState(false)
  const { data: prefs } = usePrefsQuery(as)

  /* Filet de sécurité : le SSE peut mourir sans que l'onglet le sache tout de
     suite (proxy, veille, bascule wifi/4G). Le sondage se resserre dès que le
     flux est déclaré coupé, et se relâche quand il est rétabli. */
  useQuery<DmUnread>({
    queryKey: messagesKeys.unread(as),
    queryFn:  () => messagesApi.unread(as),
    enabled:  active,
    refetchInterval: connected ? POLL_WHEN_STREAMING : POLL_WHEN_OFFLINE,
    refetchOnWindowFocus: true,
    staleTime: 10_000,
    retry: 1,
  })

  /* Le gestionnaire d'événements doit rester STABLE : s'il changeait à chaque
     rendu, l'effet du flux se relancerait et rouvrirait une connexion SSE.
     Tout ce qui bouge (route courante, préférences) passe donc par ce ref. */
  const ctxRef = useRef({ basePath, search: location.search, prefs, navigate })
  useEffect(() => {
    ctxRef.current = { basePath, search: location.search, prefs, navigate }
  })

  const handleEvent = useCallback((event: DmStreamEvent, data: DmStreamPayload) => {
    const { basePath: base, search, prefs: current, navigate: go } = ctxRef.current
    const effective = current ?? DEFAULT_PREFS

    /* La plupart des événements portent le total à jour : on repeint la
       pastille tout de suite, l'invalidation confirme juste derrière. */
    const patchTotal = (total: unknown) => {
      if (typeof total !== 'number') return
      qc.setQueryData<DmUnread>(messagesKeys.unread(as), prev => (prev ? { ...prev, total } : prev))
    }

    switch (event) {
      case 'message': {
        const message = data?.message as DmMessage | undefined
        const conversationId = String(data?.conversation_id ?? message?.conversation_id ?? '')
        patchTotal(data?.unread_total)
        void qc.invalidateQueries({ queryKey: messagesKeys.unread(as) })
        void qc.invalidateQueries({ queryKey: messagesKeys.contacts(as) })
        if (conversationId) void qc.invalidateQueries({ queryKey: messagesKeys.thread(as, conversationId) })

        /* Mes propres messages reviennent ici pour la synchro multi-appareils :
           ils rafraîchissent l'écran, mais ne s'annoncent jamais. */
        if (!message || message.mine) return

        /* Déjà en train de lire ce fil, onglet au premier plan : la
           conversation se met à jour toute seule, alerter serait du bruit.
           L'onglet en arrière-plan, lui, n'est pas « en train de regarder ». */
        const openedConversation = new URLSearchParams(search).get('c')
        if (
          conversationId &&
          openedConversation === conversationId &&
          typeof document !== 'undefined' &&
          document.visibilityState === 'visible'
        ) return

        const urgent = message.priority === 'urgent'
        const sender = message.sender_name || String(data?.peer_name ?? '').trim() || 'Nouveau message'
        const title  = urgent ? `🔴 URGENT — ${sender}` : `💬 ${sender}`
        const body   = previewOf(message)
        const url    = conversationId ? `${base}?c=${encodeURIComponent(conversationId)}` : base

        if (effective.popup_enabled) {
          toast(title, {
            description: body,
            /* Un message urgent doit rester à l'écran le temps qu'on le voie. */
            duration: urgent ? 12_000 : 6_000,
            action: { label: 'Voir le message', onClick: () => go(url) },
          })
        }

        if (effective.sound_enabled && getSoundPref() === 'on') {
          const now = Date.now()
          /* Anti-rafale : une conversation qui déverse dix messages ne doit
             pas produire dix sons superposés. */
          if (now - lastSoundAt >= SOUND_THROTTLE_MS) {
            lastSoundAt = now
            playNotificationSound(urgent ? 'urgent' : 'message')
          }
        }

        if (effective.browser_enabled && getBrowserNotifPref() === 'on') {
          /* showBrowserNotification se tait de lui-même quand l'onglet est
             visible : ici, c'est l'onglet en arrière-plan qui est visé. */
          showBrowserNotification({
            title,
            body,
            url,
            tag:  conversationId ? `dm-${conversationId}` : 'dm',
            icon: '/icon-192.png',
          })
        }
        return
      }

      case 'read': {
        /* Accusé de lecture : le fil repeint ses « ✓✓ Lu », et mes autres
           appareils voient la pastille retomber. Aucun bruit. */
        const conversationId = String(data?.conversation_id ?? '')
        /* `unread_total` est le compteur du LECTEUR, et cet événement est
           aussi reçu par l'EXPÉDITEUR — c'est ainsi qu'il obtient son
           « ✓✓ Lu ». Le lui appliquer faisait tomber sa pastille à zéro
           alors qu'il avait des messages non lus ailleurs. Le serveur ne
           joint plus ce total qu'à mes propres appareils ; on revérifie
           ici pour ne pas dépendre d'un seul rempart. Dans le doute (mon
           identifiant pas encore chargé), on ne repeint rien : les
           invalidations qui suivent iront chercher la valeur juste. */
        const moi = qc.getQueryData<{ me?: { user_id?: string } }>(messagesKeys.contacts(as))?.me?.user_id
        if (moi && String(data?.reader_id ?? '') === moi) patchTotal(data?.unread_total)
        void qc.invalidateQueries({ queryKey: messagesKeys.unread(as) })
        void qc.invalidateQueries({ queryKey: messagesKeys.contacts(as) })
        if (conversationId) void qc.invalidateQueries({ queryKey: messagesKeys.thread(as, conversationId) })
        return
      }

      case 'delivered': {
        /* Seul le fil concerné change (une coche de plus) : ni la liste des
           correspondants ni le compteur ne bougent. */
        const conversationId = String(data?.conversation_id ?? '')
        if (conversationId) void qc.invalidateQueries({ queryKey: messagesKeys.thread(as, conversationId) })
        return
      }

      case 'unread': {
        patchTotal(data?.total)
        void qc.invalidateQueries({ queryKey: messagesKeys.unread(as) })
        return
      }

      case 'ready': {
        /* Le flux ne rejoue pas ce qui s'est passé pendant la coupure : à
           chaque (re)connexion, on resynchronise pastille et liste. */
        void qc.invalidateQueries({ queryKey: messagesKeys.unread(as) })
        void qc.invalidateQueries({ queryKey: messagesKeys.contacts(as) })
        return
      }

      default:
        return
    }
    /* `as` fait partie des dépendances depuis que les clés du cache
       portent le public : sans lui, un changement d'espace continuerait
       d'invalider les clés de l'ancien. */
  }, [qc, as])

  const handlerRef = useRef(handleEvent)
  useEffect(() => { handlerRef.current = handleEvent }, [handleEvent])

  /* Le navigateur refuse de faire du bruit tant que la page n'a pas été
     touchée. On arme donc le déverrouillage dès le montage de l'espace :
     le premier clic de la session — n'importe lequel — réveille le
     contexte audio, et la notification suivante s'entend vraiment. */
  useEffect(() => { unlockNotificationSound() }, [])

  const stopRef = useRef<(() => void) | null>(null)
  useEffect(() => {
    /* Sans jeton, aucun flux : `connected` reste faux, donc le sondage de
       repli garde sa cadence courte — et la requête, elle, est désactivée. */
    if (!active) return
    /* Garde de réentrance : le double montage du mode strict (et un rendu
       concurrent) ouvriraient deux flux pour le même onglet, alors que le
       serveur en plafonne huit par personne, tous appareils confondus. */
    if (stopRef.current) return

    const stop = messagesApi.stream(as, {
      onEvent:  (event, payload) => handlerRef.current(event, payload),
      onStatus: (ok) => setConnected(ok),
    })
    stopRef.current = stop

    return () => {
      stopRef.current = null
      setConnected(false)
      stop()
    }
  }, [active, as])
}
