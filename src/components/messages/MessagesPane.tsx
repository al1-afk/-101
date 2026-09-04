/**
 * MessagesPane — l'écran Messages complet, monté tel quel dans les deux
 * espaces : /:tenantSlug/messages (administrateur) et /my-space/messagerie
 * (employé). Une seule différence entre les deux : `as`, qui choisit le
 * jeton, et `basePath`, qui sert aux liens.
 *
 * L'état de l'écran vit dans l'URL (?c=<conversation>&u=<utilisateur>) et
 * nulle part ailleurs. C'est ce qui permet à une notification — cloche,
 * toast, notification navigateur, push — d'ouvrir directement la bonne
 * conversation : elle n'a qu'à pointer basePath + '?c=…'. L'écriture se
 * fait en `replace` : sélectionner cinq collègues d'affilée ne doit pas
 * obliger à appuyer cinq fois sur « Précédent » pour sortir de la page.
 *
 * Le temps réel n'est PAS branché ici : useMessagesRealtime est monté une
 * seule fois par espace (AppLayout / MySpaceLayout) et invalide les clés
 * react-query que cet écran observe. Deux flux SSE pour un même onglet
 * gaspilleraient un des huit créneaux autorisés par personne.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { AlertCircle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { messagesApi, type DmContact, type DmMessage, type DmPriority, type DmThread } from '@/lib/api'
import { messagesKeys, useMessagesContacts } from '@/hooks/useMessaging'
import ConversationList from './ConversationList'
import MessageThread from './MessageThread'
import MessageComposer from './MessageComposer'
import NewMessageDialog from './NewMessageDialog'

interface MessagesPaneProps {
  as:       'admin' | 'member'
  /** Chemin de l'écran dans l'espace courant. La prop appartient à la
   *  signature figée du module, mais l'écran ne s'en sert pas : ce sont les
   *  notifications (useMessagesRealtime, monté par le layout) qui fabriquent
   *  les liens « basePath?c=… ». Ici, tout passe par les paramètres d'URL. */
  basePath: string
}

/* Taille d'une page du fil : la dernière au chargement, puis une de plus à
   chaque « Charger les messages plus anciens ». Le serveur plafonne `limit`
   à 200, d'où la pagination par curseur plutôt qu'une fenêtre qui grandit. */
const PAGE_SIZE = 60

/* Présence : le serveur la dérive d'un battement de cœur de 2 minutes.
   Sans rafraîchissement, la pastille verte de quelqu'un parti déjeuner
   resterait allumée jusqu'au prochain message. */
const PRESENCE_REFRESH_MS = 60_000

export default function MessagesPane({ as }: MessagesPaneProps) {
  const qc = useQueryClient()
  const [params, setParams] = useSearchParams()
  const conversationId = params.get('c')
  const peerUserId     = params.get('u')

  const [dialogOpen, setDialogOpen] = useState(false)
  const [opening, setOpening]       = useState(false)

  const { contacts, isLoading: contactsLoading, refetch: refetchContacts } = useMessagesContacts(as)

  /* Observateur passif sur la MÊME clé que le hook : `enabled: false`
     n'émet aucune requête mais donne accès à l'état d'erreur du cache, que
     useMessagesContacts n'expose pas — sans lui, une panne réseau laisserait
     la colonne de gauche indéfiniment vide et muette. */
  const contactsState = useQuery({
    queryKey: messagesKeys.contacts(as),
    queryFn:  () => messagesApi.contacts(as),
    enabled:  false,
  })

  useEffect(() => {
    const timer = setInterval(() => refetchContacts(), PRESENCE_REFRESH_MS)
    return () => clearInterval(timer)
  }, [refetchContacts])

  /* ── URL ──────────────────────────────────────────────────────── */
  const setUrl = useCallback((patch: { c?: string | null; u?: string | null }) => {
    setParams(previous => {
      const next = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(patch)) {
        if (value) next.set(key, value)
        else next.delete(key)
      }
      return next
    }, { replace: true })
  }, [setParams])

  /* ── Le fil ───────────────────────────────────────────────────── */
  /* La clé est exactement celle du contrat : c'est elle que
     useMessagesRealtime invalide à chaque message, accusé de réception ou
     de lecture. La requête ne ramène QUE la dernière page — l'historique
     remonté à la main vit à côté (voir `older`). */
  const threadKey = useMemo(
    () => (conversationId ? messagesKeys.thread(as, conversationId) : ['messages', as, 'thread', 'none'] as const),
    [as, conversationId],
  )

  const threadQuery = useQuery<DmThread>({
    queryKey: threadKey,
    queryFn:  () => messagesApi.thread(conversationId as string, { limit: PAGE_SIZE }, as),
    enabled:  !!conversationId,
    staleTime: 5_000,
    retry: 1,
  })

  /* Historique plus ancien, tenu HORS de react-query et volontairement.
     Il est chargé par curseur (`before`) plutôt qu'en agrandissant la
     fenêtre : le serveur plafonne `limit` à 200, une fenêtre qui grandit
     cesserait donc d'avancer au quatrième clic. Le garder hors du cache
     évite aussi qu'une invalidation temps réel — il y en a une par message
     reçu — ne fasse disparaître les pages déjà remontées. */
  const [older, setOlder] = useState<{
    conversationId: string; messages: DmMessage[]; hasMore: boolean
  } | null>(null)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const olderHere = older && older.conversationId === conversationId ? older : null

  const messages = useMemo(() => {
    const live = threadQuery.data?.messages ?? []
    if (!olderHere?.messages.length) return live
    /* Dédoublonnage : la page suivante peut recouper la fenêtre vivante si
       des messages sont arrivés entre le clic et la réponse. */
    const seen = new Set(live.map(m => m.id))
    return [...olderHere.messages.filter(m => !seen.has(m.id)), ...live]
  }, [threadQuery.data, olderHere])

  /* Tant qu'aucune page ancienne n'a été demandée, c'est la requête vivante
     qui sait s'il reste de l'historique ; ensuite c'est la dernière page. */
  const hasMore = olderHere ? olderHere.hasMore : (threadQuery.data?.has_more ?? false)

  /* ── Ouverture d'un fil par ?u=<utilisateur> ──────────────────── */
  /* Une notification ou un lien profond peut ne connaître que la personne.
     Le fil est alors créé (ou retrouvé) côté serveur, puis son identifiant
     est réinjecté dans l'URL. */
  const openedForRef = useRef<string | null>(null)
  useEffect(() => {
    if (!peerUserId || conversationId) return
    if (openedForRef.current === peerUserId) return
    openedForRef.current = peerUserId
    setOpening(true)
    messagesApi.openConversation(peerUserId, as)
      .then(res => setUrl({ c: res.conversation_id, u: peerUserId }))
      .catch((e: unknown) => {
        /* Réinitialisé pour qu'un second clic puisse retenter. */
        openedForRef.current = null
        toast.error(e instanceof Error ? e.message : 'Impossible d’ouvrir cette conversation')
        setUrl({ c: null, u: null })
      })
      .finally(() => setOpening(false))
  }, [peerUserId, conversationId, as, setUrl])

  /* ── Le correspondant affiché ─────────────────────────────────── */
  /* La liste de gauche est rafraîchie plus souvent que le fil : sa présence
     est donc la plus fraîche. Le correspondant du fil sert de repli, et il
     est le seul recours pour un collègue désactivé depuis (il a disparu de
     la liste, mais sa conversation reste lisible). */
  const peer: DmContact | null = useMemo(() => {
    const fromContacts = peerUserId
      ? contacts.find(c => c.user_id === peerUserId)
      : conversationId
        ? contacts.find(c => c.conversation_id === conversationId)
        : undefined
    return fromContacts ?? threadQuery.data?.conversation.peer ?? null
  }, [contacts, peerUserId, conversationId, threadQuery.data])

  /* Arrivée par ?c=… seul (notification) : on complète l'URL dès que le
     correspondant est connu, pour qu'elle reste partageable et que la ligne
     de gauche se surligne. */
  useEffect(() => {
    if (!conversationId || peerUserId) return
    const resolved = threadQuery.data?.conversation.peer?.user_id
    if (resolved) setUrl({ u: resolved })
  }, [conversationId, peerUserId, threadQuery.data, setUrl])

  /* ── Marquage « lu » ──────────────────────────────────────────── */
  /* Le dernier message reçu sert de repère : tant qu'il ne change pas, le
     fil est déjà marqué et il est inutile de rappeler l'API à chaque
     rafraîchissement (SSE + sondage de repli en produisent beaucoup). */
  const lastIncomingId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!messages[i].mine) return messages[i].id
    }
    return null
  }, [messages])

  const markedRef = useRef('')
  const markRead = useCallback(() => {
    if (!conversationId || !lastIncomingId) return
    /* Onglet en arrière-plan : personne ne lit réellement, on ne pose pas
       d'accusé de lecture mensonger à l'expéditeur. */
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return
    const marker = `${conversationId}:${lastIncomingId}`
    if (markedRef.current === marker) return
    markedRef.current = marker
    messagesApi.markRead(conversationId, as)
      .then(res => {
        if (!res.read) return
        void qc.invalidateQueries({ queryKey: messagesKeys.unread(as) })
        void qc.invalidateQueries({ queryKey: messagesKeys.contacts(as) })
      })
      .catch(() => { markedRef.current = '' })
  }, [conversationId, lastIncomingId, as, qc])

  useEffect(() => { markRead() }, [markRead])

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') markRead() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [markRead])

  /* ── Actions ──────────────────────────────────────────────────── */
  const selectContact = useCallback((contact: DmContact) => {
    if (contact.conversation_id) {
      setUrl({ c: contact.conversation_id, u: contact.user_id })
      return
    }
    /* Aucun fil encore : on efface `c` et on laisse l'effet d'ouverture
       créer la conversation, sinon l'ancien fil resterait affiché. */
    openedForRef.current = null
    setUrl({ c: null, u: contact.user_id })
  }, [setUrl])

  const sendMessage = useCallback(async (payload: {
    text?: string; priority?: DmPriority; file_ids?: string[]
  }) => {
    if (!conversationId) return
    const message = await messagesApi.send(conversationId, payload, as)
    /* Affichage immédiat : l'écho SSE et l'invalidation arrivent juste
       derrière, mais attendre l'aller-retour donnerait une bulle qui
       apparaît une demi-seconde après le clic. */
    qc.setQueryData<DmThread>(threadKey, previous => (
      previous && !previous.messages.some(m => m.id === message.id)
        ? { ...previous, messages: [...previous.messages, message] }
        : previous
    ))
    void qc.invalidateQueries({ queryKey: messagesKeys.contacts(as) })
    void qc.invalidateQueries({ queryKey: messagesKeys.unread(as) })
  }, [conversationId, as, qc, threadKey])

  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlder) return
    /* Le curseur est la date du plus ancien message DÉJÀ affiché : le
       serveur renvoie strictement ce qui le précède. */
    const oldest = messages[0]
    if (!oldest) return
    setLoadingOlder(true)
    try {
      const page = await messagesApi.thread(
        conversationId, { limit: PAGE_SIZE, before: oldest.created_at }, as,
      )
      setOlder(previous => {
        const base = previous && previous.conversationId === conversationId ? previous.messages : []
        const seen = new Set(base.map(m => m.id))
        return {
          conversationId,
          messages: [...page.messages.filter(m => !seen.has(m.id)), ...base],
          hasMore:  page.has_more,
        }
      })
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Impossible de charger l’historique')
    } finally {
      setLoadingOlder(false)
    }
  }, [conversationId, messages, as, loadingOlder])

  const backToList = useCallback(() => {
    openedForRef.current = null
    setUrl({ c: null, u: null })
  }, [setUrl])

  /* ── Rendu ────────────────────────────────────────────────────── */
  /* Deux colonnes dès md. En dessous, une seule à la fois : la présence
     d'un fil sélectionné décide laquelle, et le bouton « ← Messages » de
     l'en-tête du fil ramène à la liste. */
  const threadOpen = !!conversationId || !!peerUserId

  return (
    /* La hauteur appartient à la page qui monte le volet (elle seule sait ce
       qu'il reste sous son titre) : ici on remplit, et `min-h-0` autorise les
       deux colonnes à rétrécir pour défiler sur elles-mêmes. */
    <div className="card-premium overflow-hidden flex h-full min-h-0">
      <ConversationList
        contacts={contacts}
        activeUserId={peer?.user_id ?? peerUserId}
        isLoading={contactsLoading}
        isError={contactsState.isError}
        onRetry={refetchContacts}
        onSelect={selectContact}
        onNewMessage={() => setDialogOpen(true)}
        className={cn(
          'w-full md:w-[300px] lg:w-[340px] md:flex-shrink-0 md:border-r border-border',
          threadOpen ? 'hidden md:flex' : 'flex',
        )}
      />

      <div className={cn(
        'flex-1 min-w-0 flex-col',
        threadOpen ? 'flex' : 'hidden md:flex',
      )}>
        {opening && !conversationId ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="text-sm text-muted-foreground">Ouverture de la conversation…</span>
          </div>
        ) : (
          <>
            <MessageThread
              as={as}
              conversationId={conversationId}
              peer={peer}
              messages={messages}
              isLoading={threadQuery.isLoading}
              isError={threadQuery.isError}
              hasMore={hasMore}
              isLoadingOlder={loadingOlder}
              onLoadOlder={() => { void loadOlder() }}
              onRetry={() => { void threadQuery.refetch() }}
              onBack={backToList}
              className="flex-1 min-h-0"
            />

            {conversationId && !threadQuery.isError && (
              <MessageComposer
                as={as}
                conversationId={conversationId}
                peerName={peer?.name ?? 'votre collègue'}
                onSend={sendMessage}
              />
            )}

            {conversationId && threadQuery.isError && (
              /* Le fil est illisible (fil supprimé, accès révoqué, réseau) :
                 on propose de revenir à la liste plutôt que de laisser une
                 zone de saisie qui n'aboutirait à rien. */
              <div className="flex-shrink-0 border-t border-border p-3 flex items-center gap-2 justify-center">
                <AlertCircle className="w-4 h-4 text-red-500/80" />
                <span className="text-xs text-muted-foreground">
                  Conversation indisponible pour le moment.
                </span>
                <Button variant="secondary" size="sm" onClick={backToList}>
                  <RefreshCw className="w-3.5 h-3.5" /> Revenir à la liste
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <NewMessageDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contacts={contacts}
        isLoading={contactsLoading}
        onPick={selectContact}
      />
    </div>
  )
}
