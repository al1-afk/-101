/**
 * ProjetChat — fil de discussion par projet, réutilisable :
 *  - admin : utilise projetMessagesApi (CRUD générique)
 *  - membre: utilise mySpaceApi.projetMessages / postProjetMessage
 * Polling 8s pour temps quasi-réel.
 */
import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, Send, Loader2, Inbox } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export interface ProjetMessage {
  id:                     string
  projet_id:              string
  author_name:            string
  author_user_id?:        string | null
  author_team_member_id?: string | null
  is_admin:               boolean
  text:                   string
  created_at:             string
}

interface Props {
  projetId:    string
  currentUserName: string
  isAdmin:     boolean
  /** Récupérer la liste — adapté admin ou membre */
  fetchMessages: () => Promise<ProjetMessage[]>
  /** Poster un message — adapté admin ou membre */
  postMessage:   (text: string) => Promise<any>
  /** Clé de cache react-query unique */
  queryKey:    readonly unknown[]
}

export default function ProjetChat({
  projetId, currentUserName, isAdmin, fetchMessages, postMessage, queryKey,
}: Props) {
  const qc = useQueryClient()
  const { data: messages = [], isLoading } = useQuery<ProjetMessage[]>({
    queryKey,
    queryFn: fetchMessages,
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
    staleTime: 3_000,
  })

  const [text, setText] = useState('')
  const endRef = useRef<HTMLDivElement>(null)

  const post = useMutation({
    mutationFn: (t: string) => postMessage(t),
    onSuccess: () => {
      setText('')
      qc.invalidateQueries({ queryKey })
    },
    onError: (e: any) => toast.error(e?.message ?? 'Erreur d\'envoi'),
  })

  /* Scroll bottom on new message */
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const send = () => {
    const t = text.trim()
    if (!t || post.isPending) return
    post.mutate(t)
  }

  /* Group consecutive messages from same author */
  const groups: Array<{ author: string; is_admin: boolean; messages: ProjetMessage[] }> = []
  for (const m of messages) {
    const last = groups[groups.length - 1]
    if (last && last.author === m.author_name && last.is_admin === m.is_admin) {
      last.messages.push(m)
    } else {
      groups.push({ author: m.author_name, is_admin: m.is_admin, messages: [m] })
    }
  }

  return (
    <div className="flex flex-col h-[600px] border border-border rounded-xl bg-background overflow-hidden">
      {/* Header */}
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
                  {/* Avatar */}
                  <div className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-[10px] flex-shrink-0',
                    g.is_admin ? 'bg-gradient-to-br from-blue-500 to-violet-600' : 'bg-gradient-to-br from-violet-500 to-fuchsia-500',
                  )}>
                    {g.author.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()}
                  </div>

                  {/* Bulles */}
                  <div className={cn('flex flex-col gap-1 max-w-[75%]', isMe ? 'items-end' : 'items-start')}>
                    <div className={cn('flex items-center gap-1.5', isMe && 'flex-row-reverse')}>
                      <span className="text-[11px] font-semibold text-foreground">{g.author}</span>
                      {g.is_admin && (
                        <span className="text-[9px] font-bold px-1 py-0.5 rounded bg-blue-500 text-white">MANAGER</span>
                      )}
                    </div>
                    {g.messages.map(m => (
                      <div key={m.id} className={cn(
                        'px-3 py-2 rounded-2xl text-sm leading-snug whitespace-pre-wrap break-words',
                        isMe
                          ? 'bg-blue-500 text-white rounded-br-sm'
                          : g.is_admin
                            ? 'bg-blue-50 dark:bg-blue-950/40 text-foreground border border-blue-200 dark:border-blue-900/40 rounded-bl-sm'
                            : 'bg-muted text-foreground rounded-bl-sm',
                      )}>
                        {m.text}
                        <div className={cn('text-[9px] mt-1', isMe ? 'text-blue-100' : 'text-muted-foreground')}>
                          {new Date(m.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
        <div ref={endRef} />
      </div>

      {/* Composer */}
      <div className="border-t border-border p-3">
        <div className="flex items-end gap-2">
          <AutocorrectTextarea
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); send() }
            }}
            placeholder={`Écris un message en tant que ${currentUserName}…   (⌘+Entrée pour envoyer)`}
            rows={2}
            className="flex-1 rounded-lg border border-border bg-[var(--surface-input)] px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-blue-400 resize-none"
            maxLength={4000}
          />
          <Button onClick={send} disabled={!text.trim() || post.isPending}>
            {post.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            Envoyer
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          {isAdmin
            ? 'Tu écris en tant que manager — tes messages sont marqués MANAGER.'
            : 'Visible par toute l\'équipe assignée au projet.'}
        </p>
      </div>
    </div>
  )
}
