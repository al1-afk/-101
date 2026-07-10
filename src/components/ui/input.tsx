import * as React from 'react'
import { cn } from '@/lib/utils'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Premium input — 40px, 12px radius, cyan focus ring.
 */
const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-10 w-full rounded-xl px-3.5 py-2 text-base sm:text-[13.5px]',
          'border bg-[var(--surface-input)] text-foreground',
          'border-black/[0.08] dark:border-white/[0.06]',
          'placeholder:text-slate-400 dark:placeholder:text-slate-500',
          'file:border-0 file:bg-transparent file:text-sm file:font-medium',
          'transition-[border-color,box-shadow,background-color] duration-150',
          'focus-visible:outline-none focus-visible:border-electric-500',
          'focus-visible:shadow-[0_0_0_3px_rgba(37,99,235,0.15)]',
          'dark:focus-visible:shadow-[0_0_0_3px_rgba(59,130,246,0.20)]',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className,
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
