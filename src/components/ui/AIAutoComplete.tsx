/**
 * AIAutoComplete — input avec auto-complétion IA du mot en cours de frappe.
 *
 * Fonctionnement :
 *   - Debounce 350 ms après la dernière frappe
 *   - Si le dernier mot ≥ 2 caractères → appelle /api/ai/complete
 *   - Affiche la suggestion en "ghost text" à la suite du curseur
 *   - Tab / → : accepte
 *   - Escape : ignore
 *
 * Utilisation :
 *   <AIAutoComplete value={x} onChange={setX} placeholder="Nom du client…" />
 *
 * Se comporte comme un <Input> normal, en plus.
 */
import { useEffect, useRef, useState, forwardRef } from 'react'
import { aiApi, aiStatus } from '@/lib/aiApi'
import { cn } from '@/lib/utils'
import { Sparkles } from 'lucide-react'

interface Props extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  value:      string
  onChange:   (next: string) => void
  /** Petit texte de contexte pour aider l'IA (ex: "Nom du client"). */
  context?:   string
  /** Désactive complètement l'auto-complétion. */
  disableAi?: boolean
}

const AIAutoComplete = forwardRef<HTMLInputElement, Props>(function AIAutoComplete(
  { value, onChange, context, disableAi, className, placeholder, ...rest },
  ref,
) {
  const [suggestion, setSuggestion] = useState<string>('')
  const [ready,      setReady]      = useState(false)
  const localRef = useRef<HTMLInputElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const inputRef = (ref as React.RefObject<HTMLInputElement>) || localRef

  useEffect(() => {
    aiStatus().then(s => setReady(!!s.configured)).catch(() => setReady(false))
  }, [])

  /* Extraire le dernier mot en cours de frappe. */
  const lastWord = (() => {
    const m = value.match(/[\wÀ-ÿ'’-]+$/i)
    return m ? m[0] : ''
  })()

  useEffect(() => {
    // Reset des suggestions à chaque nouvelle valeur
    setSuggestion('')

    if (disableAi || !ready)   return
    if (!lastWord)             return
    if (lastWord.length < 2)   return
    // Skip si l'utilisateur a fini son mot (dernier char = espace)
    if (/\s$/.test(value))     return

    if (timerRef.current) clearTimeout(timerRef.current)
    if (abortRef.current) abortRef.current.abort()

    timerRef.current = setTimeout(async () => {
      try {
        const { suggestions } = await aiApi.complete(lastWord, context)
        const best = suggestions.find(s => s.toLowerCase().startsWith(lastWord.toLowerCase()) && s !== lastWord)
        if (best) setSuggestion(best.slice(lastWord.length))
      } catch { /* silencieux */ }
    }, 350)

    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, ready, disableAi, context])

  const accept = () => {
    if (!suggestion) return
    onChange(value + suggestion)
    setSuggestion('')
  }

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!suggestion) return
    if (e.key === 'Tab' || e.key === 'ArrowRight' && (inputRef.current?.selectionStart ?? 0) === value.length) {
      e.preventDefault()
      accept()
    } else if (e.key === 'Escape') {
      setSuggestion('')
    }
    rest.onKeyDown?.(e)
  }

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        {...rest}
        value={value}
        onChange={e => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        className={cn(
          'flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors',
          'placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        autoComplete="off"
      />

      {/* Ghost text de suggestion */}
      {suggestion && (
        <div
          className="pointer-events-none absolute inset-0 flex items-center px-3 text-sm text-muted-foreground/60 whitespace-pre overflow-hidden"
          aria-hidden
        >
          <span className="invisible">{value}</span>
          <span className="flex items-center">
            {suggestion}
            <span className="ml-1.5 inline-flex items-center gap-0.5 rounded bg-blue-100/60 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 px-1 text-[9px] font-mono font-bold">
              <Sparkles className="w-2 h-2" /> Tab
            </span>
          </span>
        </div>
      )}
    </div>
  )
})

export default AIAutoComplete
