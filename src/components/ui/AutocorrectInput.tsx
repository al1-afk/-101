/**
 * AutocorrectInput / AutocorrectTextarea — drop-in remplacements pour
 * <Input> et <textarea> qui appliquent l'auto-correction FR
 * (cf. lib/frenchAutocorrect.ts) au moment où l'utilisateur termine
 * un mot (espace, ponctuation, retour-ligne).
 *
 * Utilisation identique à <Input> standard, juste avec un import différent :
 *
 *   import { AutocorrectInput } from '@/components/ui/AutocorrectInput'
 *   <AutocorrectInput value={x} onChange={e => setX(e.target.value)} />
 *
 * La correction préserve la casse (`Recu` → `Reçu`).
 */
import * as React from 'react'
import { Input, type InputProps } from './input'
import { autocorrectAfterChar } from '@/lib/frenchAutocorrect'

function useAutocorrectHandler<E extends HTMLInputElement | HTMLTextAreaElement>(
  userOnChange?: (e: React.ChangeEvent<E>) => void,
) {
  return React.useCallback(
    (e: React.ChangeEvent<E>) => {
      const el = e.target
      const result = autocorrectAfterChar(el.value, el.selectionStart ?? 0)
      if (result) {
        /* Mutate the native value before calling parent's onChange so the
           parent receives the corrected text directly. */
        el.value = result.value
        /* Restore caret after React re-renders. */
        const caret = result.caret
        requestAnimationFrame(() => {
          try { el.setSelectionRange(caret, caret) } catch { /* detached */ }
        })
      }
      userOnChange?.(e)
    },
    [userOnChange],
  )
}

export const AutocorrectInput = React.forwardRef<HTMLInputElement, InputProps>(
  (props, ref) => {
    const onChange = useAutocorrectHandler<HTMLInputElement>(props.onChange)
    return <Input {...props} ref={ref} lang="fr" onChange={onChange} />
  },
)
AutocorrectInput.displayName = 'AutocorrectInput'

type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

export const AutocorrectTextarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    const onChange = useAutocorrectHandler<HTMLTextAreaElement>(props.onChange)
    return (
      <textarea
        {...props}
        ref={ref}
        lang="fr"
        onChange={onChange}
        className={className}
      />
    )
  },
)
AutocorrectTextarea.displayName = 'AutocorrectTextarea'
