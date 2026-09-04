/**
 * MessageComposer — la zone de saisie du fil privé.
 *
 * Le téléversement se fait AVANT l'envoi : chaque fichier est déposé sur la
 * conversation (message_id nul), et le message final ne transporte que les
 * identifiants obtenus. C'est ce que veut le contrat de l'API, et cela
 * permet d'annuler une pièce jointe sans avoir rien envoyé à personne.
 *
 * Le brouillon est vidé quand la conversation change : garder un texte à
 * l'écran en basculant de correspondant, c'est prendre le risque de
 * l'envoyer à la mauvaise personne.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Paperclip, Send, Loader2, X, FileText, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { AutocorrectTextarea } from '@/components/ui/AutocorrectInput'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import { messagesApi, type DmFile, type DmPriority } from '@/lib/api'

interface MessageComposerProps {
  as:             'admin' | 'member'
  conversationId: string
  peerName:       string
  /** Rendu par MessagesPane : c'est lui qui tient le cache react-query. */
  onSend:         (payload: { text?: string; priority?: DmPriority; file_ids?: string[] }) => Promise<unknown>
  disabled?:      boolean
  className?:     string
}

const MAX_LENGTH = 4000

const PRIORITIES: Array<{ value: DmPriority; label: string; active: string }> = [
  { value: 'normal',    label: 'Normal',      active: 'bg-blue-500 text-white border-blue-500' },
  { value: 'important', label: 'Important',   active: 'bg-amber-500 text-white border-amber-500' },
  { value: 'urgent',    label: '🔴 Urgent',   active: 'bg-red-500 text-white border-red-500' },
]

function humanSize(bytes: number | string): string {
  const n = Number(bytes) || 0
  if (n < 1024) return `${n} o`
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} Ko`
  return `${(n / 1024 / 1024).toFixed(1)} Mo`
}

export default function MessageComposer({
  as, conversationId, peerName, onSend, disabled = false, className,
}: MessageComposerProps) {
  const [text, setText]           = useState('')
  const [priority, setPriority]   = useState<DmPriority>('normal')
  const [pending, setPending]     = useState<DmFile[]>([])
  const [uploading, setUploading] = useState(0)
  const [sending, setSending]     = useState(false)
  const [dragOver, setDragOver]   = useState(false)

  const fileRef     = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  /* Changement de correspondant : on repart de zéro, priorité comprise —
     un « urgent » choisi pour quelqu'un d'autre n'a rien à faire ici. */
  useEffect(() => {
    setText('')
    setPending([])
    setPriority('normal')
    setUploading(0)
  }, [conversationId])

  /* Hauteur automatique : on remet à zéro avant de mesurer, sinon
     scrollHeight ne redescend jamais quand on efface des lignes. */
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const uploadFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setUploading(count => count + list.length)
    for (const file of list) {
      try {
        const saved = await messagesApi.uploadFile(conversationId, file, as)
        setPending(current => [...current, saved])
      } catch (e: unknown) {
        toast.error(`${file.name} : ${e instanceof Error ? e.message : 'échec du téléversement'}`)
      } finally {
        setUploading(count => count - 1)
      }
    }
  }

  const canSend = (!!text.trim() || pending.length > 0) && !sending && uploading === 0 && !disabled

  const send = async () => {
    if (!canSend) return
    const body = text.trim()
    if (body.length > MAX_LENGTH) {
      toast.error(`Message trop long : ${body.length} caractères sur ${MAX_LENGTH} autorisés.`)
      return
    }
    setSending(true)
    try {
      await onSend({
        text:     body || undefined,
        priority,
        file_ids: pending.map(f => f.id),
      })
      setText('')
      setPending([])
      /* La priorité ne se réarme pas toute seule : un message urgent est
         une exception, pas un mode de conversation. */
      setPriority('normal')
      textareaRef.current?.focus()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Le message n’a pas pu être envoyé')
    } finally {
      setSending(false)
    }
  }

  const remaining = MAX_LENGTH - text.length

  return (
    <div
      className={cn(
        'flex-shrink-0 border-t border-border p-2.5 sm:p-3 transition-colors',
        dragOver && 'bg-blue-500/[0.06]',
        className,
      )}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => {
        e.preventDefault()
        setDragOver(false)
        if (e.dataTransfer.files?.length) void uploadFiles(e.dataTransfer.files)
      }}
    >
      {/* Pièces jointes prêtes à partir */}
      {(pending.length > 0 || uploading > 0) && (
        <div className="flex flex-wrap gap-2 pb-2">
          {pending.map(file => (
            <span
              key={file.id}
              className="flex items-center gap-1.5 pl-2 pr-1.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-500/15 text-xs text-foreground"
            >
              {file.mime?.startsWith('image/')
                ? <ImageIcon className="w-3 h-3 flex-shrink-0" />
                : <FileText  className="w-3 h-3 flex-shrink-0" />}
              <span className="max-w-[140px] truncate">{file.filename}</span>
              <span className="opacity-60">{humanSize(file.size_bytes)}</span>
              <button
                type="button"
                onClick={() => setPending(current => current.filter(f => f.id !== file.id))}
                className="hover:text-red-500 transition-colors"
                aria-label={`Retirer ${file.filename}`}
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

      <AutocorrectTextarea
        ref={textareaRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => {
          /* Entrée envoie, Maj+Entrée passe à la ligne — la convention de
             toutes les messageries. On laisse aussi ⌘/Ctrl+Entrée par
             habitude, comme dans la discussion de projet. */
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            void send()
          }
        }}
        onPaste={e => {
          const files = Array.from(e.clipboardData?.files ?? [])
          if (files.length) { e.preventDefault(); void uploadFiles(files) }
        }}
        placeholder="Écrire un message…"
        aria-label={`Écrire un message à ${peerName}`}
        rows={1}
        maxLength={MAX_LENGTH}
        disabled={disabled}
        className="w-full rounded-xl border border-black/[0.08] dark:border-white/[0.06] bg-[var(--surface-input)] px-3 py-2 text-[13.5px] text-foreground placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-electric-500 resize-none transition-colors disabled:opacity-50"
      />

      {/* Barre d'outils : trombone, priorité, envoi */}
      <div className="flex items-center gap-2 mt-2">
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={e => {
            if (e.target.files?.length) void uploadFiles(e.target.files)
            /* Remis à vide : sans cela, rejoindre deux fois le même fichier
               ne déclencherait aucun événement de changement. */
            e.target.value = ''
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          title="Joindre une image, un PDF ou un document"
          aria-label="Joindre un fichier"
        >
          <Paperclip className="w-4 h-4" />
        </Button>

        <div
          role="group"
          aria-label="Priorité du message"
          className="flex items-center gap-1 p-0.5 rounded-xl bg-black/[0.04] dark:bg-white/[0.05]"
        >
          {PRIORITIES.map(option => (
            <button
              key={option.value}
              type="button"
              onClick={() => setPriority(option.value)}
              aria-pressed={priority === option.value}
              className={cn(
                'px-2 sm:px-2.5 py-1 rounded-lg text-[11px] font-semibold border border-transparent transition-colors',
                priority === option.value
                  ? option.active
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {/* Le compteur n'apparaît qu'à l'approche de la limite serveur. */}
        {remaining < 300 && (
          <span className={cn(
            'text-[10px] ml-auto',
            remaining <= 0 ? 'text-red-500 font-semibold' : 'text-muted-foreground',
          )}>
            {remaining}
          </span>
        )}

        <Button
          type="button"
          onClick={() => void send()}
          disabled={!canSend}
          className={cn(remaining < 300 ? '' : 'ml-auto')}
        >
          {sending
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : <Send className="w-4 h-4" />}
          <span className="hidden sm:inline">Envoyer</span>
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground mt-1.5 hidden sm:block">
        Entrée pour envoyer, Maj+Entrée pour aller à la ligne. Glissez un fichier ici ou collez une image (⌘V).
      </p>
    </div>
  )
}
