/**
 * ProjetChat — fil de discussion par projet, commun à l'espace admin et
 * à l'espace membre. Une seule API derrière (projetChatApi) : `as`
 * choisit simplement le jeton.
 *
 *  - accusés de lecture façon WhatsApp (✓ envoyé, ✓✓ vu par…)
 *  - pièces jointes : bouton, glisser-déposer, Cmd+V
 *  - images affichées dans le fil, autres fichiers téléchargeables
 *  - notification (cloche + navigateur) envoyée par le serveur aux autres
 *
 * Sondage 8 s : suffisant pour une discussion de projet, et cela évite
 * d'ouvrir une connexion permanente par onglet.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  MessageSquare, Send, Loader2, Inbox, Paperclip, X, Download,
  FileText, Check, CheckCheck,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import {
  projetChatApi,
  type ChatMessage, type ChatFile, type ChatReader, type ChatThread,
} from '@/lib/api'

export type ProjetMessage = ChatMessage

interface Props {
  projetId:        string
  currentUserName: string
  isAdmin:         boolean
  /** Quel jeton utiliser — espace admin ou espace membre. */
  as?:             'admin' | 'member'
  /** Clé de cache react-query unique */
  queryKey:        readonly unknown[]
}

const isImage = (f: ChatFile) => f.mime?.startsWith('image/')

function humanSize(bytes: number | string): string {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`
  return `${(n / 1024 / 1024).toFixed(1)} Mo`
}

/** Image du fil : le contenu passe par l'API authentifiée, donc on ne
 *  peut pas viser l'URL directement — on récupère un blob local. */
function ChatImage({ file, as }: { file: ChatFile; as: 'admin' | 'member' }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let revoked = false
    let objectUrl: string | null = null
    projetChatApi.fileBlobUrl(file.id, as)
      .then(u => { if (revoked) { URL.revokeObjectURL(u) } else { objectUrl = u; setUrl(u) } })
      .catch(() => setFailed(true))
    return () => {
      revoked = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file.id, as])

  if (failed) return <FileChip file={file} as={as} />
  if (!url) {
    return (
      <div className="w-40 h-28 rounded-lg bg-black/5 dark:bg-white/5 flex items-center justify-center">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title={file.filename}>
      <img
        src={url}
        alt={file.filename}
        className="max-w-[240px] max-h-[240px] rounded-lg border border-black/10 dark:border-white/10 object-cover"
      />
    </a>
  )
}

/** Fichier non-image : nom, poids, téléchargement. */
function FileChip({ file, as }: { file: ChatFile; as: 'admin' | 'member' }) {
  const [busy, setBusy] = useState(false)

  const download = async () => {
    setBusy(true)
    try {
      const url = await projetChatApi.fileBlobUrl(file.id, as, false)
      const a = document.createElement('a')
      a.href = url
      a.download = file.filename
      document.body.appendChild(a)
      a.click()
      a.remove()
      /* Laisser au navigateur le temps de démarrer le téléchargement
         avant de libérer le blob. */
      setTimeout(() => URL.revokeObjectURL(url), 10_000)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Téléchargement impossible')
    } finally {
      setBusy(false)
    }
  }

  return (
    <button
      onClick={download}
      disabled={busy}
      className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-black/5 dark:bg-white/10 hover:bg-black/10 dark:hover:bg-white/20 transition-colors max-w-[240px] text-left"
      title={`Télécharger ${file.filename}`}
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

export default function ProjetChat({
  projetId, currentUserName, isAdmin, as = 'admin', queryKey,
}: Props) {
  const qc = useQueryClient()

  const { data, isLoading } = useQuery<ChatThread>({
    queryKey,
    queryFn: () => projetChatApi.thread(projetId, as),
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
    staleTime: 3_000,
  })

  const messages: ChatMessage[] = useMemo(() => data?.messages ?? [], [data])
  const readers:  ChatReader[]  = useMemo(() => data?.readers  ?? [], [data])

  const [text, setText] = useState('')
  /* Fichiers téléversés, en attente d'être rattachés au prochain message. */
  const [pending, setPending] = useState<ChatFile[]>([])
  const [uploading, setUploading] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const endRef   = useRef<HTMLDivElement>(null)
  const fileRef  = useRef<HTMLInputElement>(null)

  const post = useMutation({
    mutationFn: () => projetChatApi.post(
      projetId,
      { text: text.trim() || undefined, file_ids: pending.map(f => f.id) },
      as,
    ),
    onSuccess: () => {
      setText('')
      setPending([])
      qc.invalidateQueries({ queryKey })
    },
    onError: (e: unknown) =>
      toast.error(e instanceof Error ? e.message : "Erreur d'envoi"),
  })

  /* Marquer lu : à l'ouverture, puis à chaque nouveau message reçu.
     Le curseur est daté côté serveur — pas de dérive d'horloge. */
  useEffect(() => {
    if (isLoading) return
    projetChatApi.markRead(projetId, as).catch(() => {})
  }, [projetId, as, isLoading, messages.length])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  /* ── Téléversement ─────────────────────────────────────────────── */
  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setUploading(u => u + list.length)
    for (const file of list) {
      try {
        const saved = await projetChatApi.uploadFile(projetId, file, as)
        setPending(p => [...p, saved])
      } catch (e: unknown) {
        toast.error(`${file.name} : ${e instanceof Error ? e.message : 'échec'}`)
      } finally {
        setUploading(u => u - 1)
      }
    }
  }

  const send = () => {
    if (post.isPending || uploading > 0) return
    if (!text.trim() && pending.length === 0) return
    post.mutate()
  }

  /* Grouper les messages consécutifs d'un même auteur */
  const groups: Array<{ author: string; is_admin: boolean; messages: ChatMessage[] }> = []
  for (const m of messages) {
    const last = groups[groups.length - 1]
    if (last && last.author === m.author_name && last.is_admin === m.is_admin) last.messages.push(m)
    else groups.push({ author: m.author_name, is_admin: m.is_admin, messages: [m] })
  }

  /** Qui a lu ce message : curseur de lecture postérieur à son envoi. */
  const seenBy = (m: ChatMessage): string[] =>
    readers
      .filter(r => !r.is_me && new Date(r.last_read_at) >= new Date(m.created_at))
      .map(r => r.name)

  return (
    <div
      className={cn(
        'flex flex-col h-[600px] border rounded-xl bg-background overflow-hidden transition-colors',
        dragOver ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-border',
      )}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files)
      }}
    >
      {/* En-tête */}
      <div className="px-4 py-3 border-b border-border bg-muted/30 flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-blue-500" />
        <span className="text-sm font-bold">Discussion du projet</span>
        <span className="text-[11px] text-muted-foreground ml-auto">
          {messages.length} message{messages.length > 1 ? 's' : ''}
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <Inbox className="w-10 h-10 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">Aucun message dans cette discussion</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Sois le premier à écrire 👇</p>
          </div>
        ) : (
          <AnimatePresence>
            {groups.map((g, gi) => {
              const isMe = g.author === currentUserName
              return (
                <motion.div
                  key={gi}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn('flex gap-2', isMe ? 'flex-row-reverse' : 'flex-row')}
                >
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0',
                    g.is_admin ? 'bg-gradient-to-br from-blue-500 to-violet-600' : 'bg-gradient-to-br from-violet-500 to-fuchsia-500',
                  )}>
                    {g.author.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
                  </div>

                  <div className={cn('flex flex-col gap-1 max-w-[75%]', isMe ? 'items-end' : 'items-start')}>
                    <div className={cn('flex items-center gap-1.5', isMe && 'flex-row-reverse')}>
                      <span className="text-[11px] font-semibold text-foreground">{g.author}</span>
                      {g.is_admin && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-500 text-white">MANAGER</span>
                      )}
                    </div>

                    {g.messages.map(m => {
                      const seen = isMe ? seenBy(m) : []
                      return (
                        <div key={m.id} className={cn('flex flex-col gap-1', isMe ? 'items-end' : 'items-start')}>
                          {/* Pièces jointes au-dessus du texte, comme WhatsApp */}
                          {m.files?.length > 0 && (
                            <div className={cn('flex flex-wrap gap-1.5', isMe ? 'justify-end' : 'justify-start')}>
                              {m.files.map(f => (
                                isImage(f)
                                  ? <ChatImage key={f.id} file={f} as={as} />
                                  : <FileChip  key={f.id} file={f} as={as} />
                              ))}
                            </div>
                          )}

                          {(m.text?.trim() || !m.files?.length) && (
                            <div className={cn(
                              'px-3 py-2 rounded-2xl text-sm leading-snug whitespace-pre-wrap break-words',
                              isMe
                                ? 'bg-blue-500 text-white rounded-br-sm'
                                : g.is_admin
                                  ? 'bg-blue-50 dark:bg-blue-950/40 text-foreground border border-blue-200 dark:border-blue-900/40 rounded-bl-sm'
                                  : 'bg-muted text-foreground rounded-bl-sm',
                            )}>
                              {m.text}
                              <div className={cn(
                                'text-[9px] mt-1 flex items-center gap-1',
                                isMe ? 'text-blue-100 justify-end' : 'text-muted-foreground',
                              )}>
                                {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                                {isMe && (
                                  seen.length > 0
                                    ? <CheckCheck className="w-3.5 h-3.5" />
                                    : <Check className="w-3.5 h-3.5 opacity-70" />
                                )}
                              </div>
                            </div>
                          )}

                          {/* Qui a vu — sous la dernière bulle */}
                          {isMe && seen.length > 0 && (
                            <span className="text-[9px] text-muted-foreground pr-1">
                              Vu par {seen.join(', ')}
                            </span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
        <div ref={endRef} />
      </div>

      {/* Pièces jointes en attente */}
      {(pending.length > 0 || uploading > 0) && (
        <div className="px-3 pt-2 flex flex-wrap gap-2 border-t border-border">
          {pending.map(f => (
            <span key={f.id} className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/40 text-xs">
              <FileText className="w-3 h-3" />
              <span className="max-w-[140px] truncate">{f.filename}</span>
              <span className="opacity-60">{humanSize(f.size_bytes)}</span>
              <button
                onClick={() => setPending(p => p.filter(x => x.id !== f.id))}
                className="hover:text-red-500"
                aria-label={`Retirer ${f.filename}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          {uploading > 0 && (
            <span className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Envoi de {uploading} fichier{uploading > 1 ? 's' : ''}…
            </span>
          )}
        </div>
      )}

      {/* Zone de saisie */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <input
            ref={fileRef}
            type="file"
            multiple
            className="hidden"
            onChange={e => {
              if (e.target.files?.length) void uploadFiles(e.target.files)
              e.target.value = ''
            }}
          />
          <Button
            variant="secondary"
            onClick={() => fileRef.current?.click()}
            title="Joindre des fichiers"
            aria-label="Joindre des fichiers"
            className="flex-shrink-0"
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          <AutocorrectTextarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
            }}
            onPaste={e => {
              const files = Array.from(e.clipboardData?.files ?? [])
              if (files.length) { e.preventDefault(); void uploadFiles(files) }
            }}
            placeholder={`Écris un message en tant que ${currentUserName}…   (⌘+Entrée pour envoyer)`}
            rows={2}
            className="flex-1 rounded-lg border border-border bg-[var(--surface-input)] px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-blue-400 resize-none"
            maxLength={4000}
          />
          <Button
            onClick={send}
            disabled={(!text.trim() && pending.length === 0) || post.isPending || uploading > 0}
          >
            {post.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Envoyer
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {isAdmin
            ? 'Tu écris en tant que manager — tes messages sont marqués MANAGER.'
            : 'Visible par toute l\'équipe assignée au projet.'}
          {' '}Glisse un fichier ici ou colle une image (⌘V) pour la joindre.
        </p>
      </div>
    </div>
  )
}
