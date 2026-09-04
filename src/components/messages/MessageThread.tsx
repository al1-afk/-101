/**
 * MessageThread — la colonne de droite : UNE conversation privée, jamais un
 * fil commun. En-tête d'identité, séparateurs de date, bulles alignées selon
 * l'auteur, accusés de réception sous mes messages, pièces jointes en ligne.
 *
 * Deux points méritent l'attention :
 *
 *  - le défilement. Coller le fil en bas à chaque rafraîchissement (et il y
 *    en a beaucoup : SSE + sondage de repli) arracherait la lecture de
 *    quelqu'un remonté dans l'historique. On ne recolle donc que si
 *    l'utilisateur était DÉJÀ en bas, ou si le dernier message est le sien.
 *  - le chargement de l'historique. Ajouter des messages au-dessus décale
 *    tout le contenu ; on mémorise la hauteur avant la requête pour
 *    repositionner exactement là où on lisait.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ArrowLeft, Loader2, Check, CheckCheck, FileText, Download, AlertCircle,
  RefreshCw, MessageSquare, ChevronUp, Inbox,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { ROLE_LABELS } from '@/lib/permissions'
import { messagesApi, type DmContact, type DmFile, type DmMessage } from '@/lib/api'
import { ContactAvatar, presenceLabel } from './PresenceDot'
import { toast } from 'sonner'

interface MessageThreadProps {
  as:              'admin' | 'member'
  conversationId:  string | null
  peer:            DmContact | null
  messages:        DmMessage[]
  isLoading:       boolean
  isError:         boolean
  hasMore:         boolean
  isLoadingOlder:  boolean
  onLoadOlder:     () => void
  onRetry:         () => void
  /** Retour à la liste — visible seulement sur mobile. */
  onBack:          () => void
  className?:      string
}

const isImage = (file: DmFile) => !!file.mime?.startsWith('image/')

function humanSize(bytes: number | string): string {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`
  return `${(n / 1024 / 1024).toFixed(1)} Mo`
}

function hourOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
}

/** Clé de journée (AAAA-MM-JJ locale) : sert à découper le fil. */
function dayKey(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return 'inconnu'
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
}

/** « Aujourd'hui », « Hier », « 3 septembre », « 3 septembre 2024 ». */
function dayLabel(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now   = new Date()
  const day   = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const days  = Math.round((today.getTime() - day.getTime()) / 86_400_000)
  if (days === 0) return 'Aujourd’hui'
  if (days === 1) return 'Hier'
  const sameYear = date.getFullYear() === now.getFullYear()
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }),
  })
}

/** Poste (employé) ou rôle traduit (administrateur/staff). */
function roleLabel(peer: DmContact): string {
  if (!peer.role) return peer.kind === 'member' ? 'Employé' : 'Membre de l’espace'
  const known = (ROLE_LABELS as Record<string, string>)[peer.role]
  return known ?? peer.role
}

/* ── Pièces jointes ────────────────────────────────────────────────
   Le contenu passe par l'API authentifiée (le contrôle d'accès y est
   refait) : impossible de pointer un <img src> sur l'URL, on récupère
   donc un blob local qu'on libère au démontage. */
function ThreadImage({ file, as }: { file: DmFile; as: 'admin' | 'member' }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null
    messagesApi.fileBlobUrl(file.id, as)
      .then(u => {
        if (cancelled) { URL.revokeObjectURL(u); return }
        objectUrl = u
        setUrl(u)
      })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file.id, as])

  if (failed) return <ThreadFileChip file={file} as={as} />
  if (!url) {
    return (
      <div className="w-40 h-28 rounded-xl bg-black/[0.05] dark:bg-white/[0.06] flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={file.filename}>
      <img
        src={url}
        alt={file.filename}
        className="max-w-[240px] max-h-[240px] rounded-xl border border-black/10 dark:border-white/10 object-cover"
      />
    </a>
  )
}

function ThreadFileChip({ file, as }: { file: DmFile; as: 'admin' | 'member' }) {
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const url = await messagesApi.fileBlobUrl(file.id, as, false)
      const a = document.createElement('a')
      a.href = url
      a.download = file.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      /* Le navigateur lit le blob de façon asynchrone : le libérer tout de
         suite annulerait le téléchargement qui vient d'être lancé. */
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Téléchargement impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={busy}
      title={`Télécharger ${file.filename}`}
      className="flex items-center gap-2 px-2.5 py-2 rounded-xl bg-black/[0.05] dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors max-w-[240px] text-left"
    >
      {busy
        ? <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" />
        : <FileText className="w-4 h-4 flex-shrink-0" />}
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium truncate">{file.filename}</span>
        <span className="block text-[10px] opacity-70">{humanSize(file.size_bytes)}</span>
      </span>
      <Download className="w-3.5 h-3.5 flex-shrink-0 opacity-60" />
    </button>
  )
}

/** Accusé sous MES messages uniquement : envoyé, reçu, lu. */
function DeliveryTicks({ message }: { message: DmMessage }) {
  if (message.read_at) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-blue-600 dark:text-blue-400 font-medium">
        <CheckCheck className="w-3.5 h-3.5" /> Lu à {hourOf(message.read_at)}
      </span>
    )
  }
  if (message.delivered_at) {
    return (
      <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <CheckCheck className="w-3.5 h-3.5" /> Reçu
      </span>
    )
  }
  return (
    <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
      <Check className="w-3.5 h-3.5" /> Envoyé
    </span>
  )
}

const PRIORITY_BADGE: Record<'important' | 'urgent', { label: string; className: string }> = {
  important: {
    label: 'Important',
    className: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
  },
  urgent: {
    label: '🔴 Urgent',
    className: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  },
}

function MessageSkeleton({ mine }: { mine: boolean }) {
  return (
    <div className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'h-12 rounded-2xl animate-pulse bg-black/[0.05] dark:bg-white/[0.06]',
          mine ? 'w-48' : 'w-60',
        )}
      />
    </div>
  )
}

export default function MessageThread({
  as, conversationId, peer, messages, isLoading, isError,
  hasMore, isLoadingOlder, onLoadOlder, onRetry, onBack, className,
}: MessageThreadProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  /* L'utilisateur est-il collé en bas ? Un ref, pas un state : cette valeur
     change à chaque pixel de molette et ne doit rien redessiner. */
  const stuckToBottomRef = useRef(true)
  const lastConversationRef = useRef<string | null>(null)
  const lastCountRef = useRef(0)
  /* Hauteur du contenu juste avant un chargement d'historique. */
  const restoreHeightRef = useRef<number | null>(null)

  const onScroll = useCallback(() => {
    const el = scrollRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    /* 120 px de tolérance : on reste « en bas » même à une bulle près. */
    stuckToBottomRef.current = distance < 120
  }, [])

  /* useLayoutEffect et non useEffect : repositionner après la peinture
     produirait un saut visible du fil. */
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el) return

    if (conversationId !== lastConversationRef.current) {
      lastConversationRef.current = conversationId
      lastCountRef.current = messages.length
      stuckToBottomRef.current = true
      el.scrollTop = el.scrollHeight
      return
    }

    if (restoreHeightRef.current !== null) {
      /* Repositionner seulement si le fil a bel et bien grandi : quand le
         chargement d'historique échoue, la hauteur mémorisée doit être jetée,
         sinon elle s'appliquerait au prochain message reçu et projetterait la
         lecture au milieu de nulle part. */
      if (messages.length > lastCountRef.current) {
        el.scrollTop = el.scrollHeight - restoreHeightRef.current
      }
      restoreHeightRef.current = null
      lastCountRef.current = messages.length
      return
    }

    if (messages.length === lastCountRef.current) return
    const grew = messages.length > lastCountRef.current
    const last = messages[messages.length - 1]
    lastCountRef.current = messages.length
    if (!grew) return
    if (stuckToBottomRef.current || last?.mine) {
      el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    }
  }, [conversationId, messages])

  const loadOlder = () => {
    const el = scrollRef.current
    /* Mémorisé AVANT la requête : au retour, la différence de hauteur donne
       exactement de combien le contenu a été poussé vers le bas. */
    if (el) restoreHeightRef.current = el.scrollHeight
    onLoadOlder()
  }

  /* Découpage en journées : un seul parcours, mémorisé — le fil peut
     compter plusieurs centaines de bulles après « charger plus ancien ». */
  const days = useMemo(() => {
    const out: Array<{ key: string; label: string; items: DmMessage[] }> = []
    for (const message of messages) {
      const key = dayKey(message.created_at)
      const current = out[out.length - 1]
      if (current && current.key === key) current.items.push(message)
      else out.push({ key, label: dayLabel(message.created_at), items: [message] })
    }
    return out
  }, [messages])

  /* ── Aucun fil ouvert ─────────────────────────────────────────── */
  if (!conversationId) {
    return (
      <div className={cn('flex flex-col items-center justify-center h-full text-center px-6', className)}>
        <div className="w-16 h-16 rounded-2xl bg-blue-500/10 flex items-center justify-center mb-4">
          <MessageSquare className="w-8 h-8 text-blue-500" />
        </div>
        <p className="text-base font-semibold text-foreground">Choisissez un collègue pour démarrer</p>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Vos échanges restent privés : seule la personne choisie voit ce que vous écrivez.
        </p>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col min-h-0 h-full', className)}>
      {/* En-tête d'identité */}
      <div className="flex items-center gap-3 px-3 sm:px-4 py-2.5 border-b border-border flex-shrink-0">
        <button
          type="button"
          onClick={onBack}
          className="md:hidden flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
        >
          <ArrowLeft className="w-4 h-4" /> Messages
        </button>

        {peer ? (
          <>
            <ContactAvatar
              name={peer.name}
              avatarUrl={peer.avatar_url}
              presence={peer.presence}
              size={38}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-bold text-foreground truncate">{peer.name}</p>
              <p className="text-[11px] text-muted-foreground truncate">
                {roleLabel(peer)} · {presenceLabel(peer.presence, peer.last_seen_at)}
              </p>
            </div>
          </>
        ) : (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-[38px] h-[38px] rounded-full bg-black/[0.06] dark:bg-white/[0.06] animate-pulse" />
            <div className="h-3 w-32 rounded bg-black/[0.06] dark:bg-white/[0.06] animate-pulse" />
          </div>
        )}
      </div>

      {/* Fil */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 min-h-0 overflow-y-auto px-3 sm:px-4 py-4 space-y-3"
      >
        {isError ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <AlertCircle className="w-9 h-9 text-red-500/70 mb-2" />
            <p className="text-sm font-medium text-foreground">Cette conversation n’a pas pu être chargée</p>
            <p className="text-xs text-muted-foreground mt-1">
              La connexion a peut-être été interrompue.
            </p>
            <Button variant="secondary" size="sm" onClick={onRetry} className="mt-3">
              <RefreshCw className="w-3.5 h-3.5" /> Réessayer
            </Button>
          </div>
        ) : isLoading && messages.length === 0 ? (
          <div className="space-y-3">
            <MessageSkeleton mine={false} />
            <MessageSkeleton mine />
            <MessageSkeleton mine={false} />
            <MessageSkeleton mine={false} />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center">
            <Inbox className="w-9 h-9 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Aucun message pour l’instant.</p>
            <p className="text-xs text-muted-foreground/70 mt-1">
              Écrivez le premier message ci-dessous.
            </p>
          </div>
        ) : (
          <>
            {hasMore && (
              <div className="flex justify-center pb-1">
                <Button variant="ghost" size="sm" onClick={loadOlder} disabled={isLoadingOlder}>
                  {isLoadingOlder
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <ChevronUp className="w-3.5 h-3.5" />}
                  Charger les messages plus anciens
                </Button>
              </div>
            )}

            {days.map(day => (
              <div key={day.key} className="space-y-3">
                <div className="flex items-center justify-center">
                  <span className="text-[10.5px] font-semibold px-2.5 py-1 rounded-full bg-black/[0.05] dark:bg-white/[0.07] text-muted-foreground">
                    {day.label}
                  </span>
                </div>

                {day.items.map(message => {
                  const mine = message.mine
                  const badge = message.priority === 'normal' ? null : PRIORITY_BADGE[message.priority]
                  const hasText = !!message.body?.trim()
                  return (
                    <motion.div
                      key={message.id}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.15 }}
                      className={cn('flex flex-col gap-1', mine ? 'items-end' : 'items-start')}
                    >
                      {badge && (
                        <span className={cn(
                          'text-[10px] font-bold px-2 py-0.5 rounded-full',
                          badge.className,
                        )}>
                          {badge.label}
                        </span>
                      )}

                      {message.files?.length > 0 && (
                        <div className={cn(
                          'flex flex-wrap gap-1.5 max-w-[85%] sm:max-w-[75%]',
                          mine ? 'justify-end' : 'justify-start',
                        )}>
                          {message.files.map(file => (
                            isImage(file)
                              ? <ThreadImage   key={file.id} file={file} as={as} />
                              : <ThreadFileChip key={file.id} file={file} as={as} />
                          ))}
                        </div>
                      )}

                      {hasText && (
                        <div className={cn(
                          'px-3.5 py-2 rounded-2xl text-[13.5px] leading-snug whitespace-pre-wrap break-words max-w-[85%] sm:max-w-[75%]',
                          mine
                            ? 'bg-blue-500 text-white rounded-br-sm'
                            : 'bg-black/[0.05] dark:bg-white/[0.07] text-foreground rounded-bl-sm',
                          /* L'urgence doit se voir même en diagonale : un liseré
                             rouge suffit, la bulle garde sa couleur d'auteur. */
                          message.priority === 'urgent' && 'ring-2 ring-red-500/50',
                        )}>
                          {message.body}
                        </div>
                      )}

                      <div className={cn(
                        'flex items-center gap-2 px-1',
                        mine ? 'flex-row-reverse' : 'flex-row',
                      )}>
                        <span className="text-[10px] text-muted-foreground">
                          {hourOf(message.created_at)}
                        </span>
                        {mine && <DeliveryTicks message={message} />}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
