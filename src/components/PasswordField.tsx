/**
 * PasswordField — input masqué avec bouton reveal + copy.
 * - readOnly : true → affichage seul (membre view)
 * - readOnly : false → édition (admin view)
 * Le presse-papier est vidé automatiquement après 30 s pour la sécurité.
 */
import { useState } from 'react'
import { Eye, EyeOff, Copy, Check } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface Props {
  value:        string
  onChange?:    (v: string) => void
  readOnly?:    boolean
  placeholder?: string
  className?:   string
  showCopy?:    boolean    // default true
  showReveal?:  boolean    // default true
  autoComplete?:string     // default 'new-password' (avoid browser autofill)
}

export default function PasswordField({
  value, onChange, readOnly = false, placeholder, className,
  showCopy = true, showReveal = true, autoComplete = 'new-password',
}: Props) {
  const [revealed, setRevealed] = useState(false)
  const [copied,   setCopied]   = useState(false)

  const copy = async () => {
    if (!value) return
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      toast.success('✓ Copié — sera effacé du presse-papier dans 30s')
      setTimeout(() => setCopied(false), 2000)
      /* Auto-clear clipboard for security */
      setTimeout(() => {
        navigator.clipboard.writeText('').catch(() => {})
      }, 30_000)
    } catch {
      toast.error('Impossible de copier')
    }
  }

  return (
    <div className={cn('relative flex items-center gap-1', className)}>
      <Input
        type={revealed || readOnly === false && !value ? 'text' : 'password'}
        value={value}
        onChange={onChange ? (e => onChange(e.target.value)) : undefined}
        readOnly={readOnly}
        placeholder={placeholder ?? (readOnly ? '—' : '••••••••')}
        autoComplete={autoComplete}
        className={cn('font-mono text-xs pr-2 flex-1', readOnly && 'bg-muted/30 cursor-default')}
      />
      {value && showReveal && (
        <Button type="button" variant="ghost" size="icon" className="w-7 h-7 flex-shrink-0"
          onClick={() => setRevealed(v => !v)}
          title={revealed ? 'Masquer' : 'Révéler'}>
          {revealed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </Button>
      )}
      {value && showCopy && (
        <Button type="button" variant="ghost" size="icon" className="w-7 h-7 flex-shrink-0"
          onClick={copy}
          title="Copier (auto-effacé après 30s)">
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
        </Button>
      )}
    </div>
  )
}
