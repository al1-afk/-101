import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * NEXT GITAL — Premium Button system (2026)
 *
 *   default    : blue → cyan gradient (primary CTA)
 *   secondary  : neutral outlined
 *   destructive: red danger
 *   outline    : subtle
 *   ghost      : text only
 *   link       : cyan underlined
 *   success    : emerald
 *   premium    : glass, backdrop blur
 */
const buttonVariants = cva(
  [
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl',
    'text-[13px] font-semibold tracking-[-0.005em] transition-all duration-150 cursor-pointer',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-electric-500/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background',
    'disabled:pointer-events-none disabled:opacity-50',
    'active:scale-[0.98]',
  ].join(' '),
  {
    variants: {
      variant: {
        default: [
          'text-white border border-electric-600/30',
          'shadow-glow-blue',
          'hover:brightness-105 hover:-translate-y-[1px] hover:shadow-glow-blue',
          'active:translate-y-0 active:brightness-95',
          'bg-gradient-primary',
        ],
        secondary: [
          'bg-white text-foreground border border-border',
          'hover:bg-electric-50 hover:border-electric-500/30 hover:text-electric-700',
          'dark:bg-navy-800 dark:border-white/[0.06] dark:hover:bg-navy-700 dark:hover:text-cyan-300 dark:hover:border-cyan-500/25',
        ],
        destructive: [
          'bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-400',
          'hover:bg-red-500/15 hover:border-red-500/40',
        ],
        outline: [
          'border border-border bg-transparent text-foreground',
          'hover:bg-black/[0.03] dark:hover:bg-white/[0.05] hover:border-electric-500/25',
        ],
        ghost: [
          'text-muted-foreground bg-transparent',
          'hover:text-foreground hover:bg-black/[0.04] dark:hover:bg-white/[0.06]',
        ],
        link: [
          'text-electric-600 dark:text-cyan-400 underline-offset-4 h-auto p-0',
          'hover:underline',
        ],
        success: [
          'bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-400',
          'hover:bg-emerald-500/15 hover:border-emerald-500/40',
        ],
        premium: [
          'text-foreground bg-white/60 dark:bg-white/[0.06]',
          'backdrop-blur-xl backdrop-saturate-150',
          'border border-black/[0.06] dark:border-white/[0.08]',
          'hover:border-electric-500/30 hover:text-electric-600 dark:hover:text-cyan-300',
        ],
      },
      size: {
        default: 'h-10 px-4',
        sm:      'h-8 px-3 text-[12px] rounded-lg',
        lg:      'h-11 px-6 text-sm',
        xl:      'h-12 px-8 text-sm rounded-xl',
        icon:    'h-9 w-9 rounded-lg',
        'icon-sm':'h-7 w-7 rounded-md',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
