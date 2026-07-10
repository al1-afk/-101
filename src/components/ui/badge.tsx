import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * Premium badge — pill, 20px height, subtle tinted backgrounds.
 * All variants use rgba tints (not saturated pastels) for a Linear feel.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border font-medium transition-colors whitespace-nowrap tracking-[-0.005em]',
  {
    variants: {
      variant: {
        // Positive / paid
        success: [
          'bg-emerald-500/10 border-emerald-500/25 text-emerald-700',
          'dark:text-emerald-300 dark:border-emerald-500/30',
        ],
        // Waiting / warning
        warning: [
          'bg-amber-500/10 border-amber-500/25 text-amber-700',
          'dark:text-amber-300 dark:border-amber-500/30',
        ],
        // Danger / overdue
        destructive: [
          'bg-red-500/10 border-red-500/25 text-red-600',
          'dark:text-red-300 dark:border-red-500/30',
        ],
        // Info / neutral action — electric blue
        default: [
          'bg-electric-500/10 border-electric-500/25 text-electric-700',
          'dark:text-electric-300 dark:border-electric-500/30',
        ],
        // Cyan accent
        cyan: [
          'bg-cyan-500/10 border-cyan-500/25 text-cyan-700',
          'dark:text-cyan-300 dark:border-cyan-500/30',
        ],
        // Muted / archived
        secondary: [
          'bg-slate-500/10 border-slate-500/20 text-slate-600',
          'dark:text-slate-400 dark:border-white/[0.08]',
        ],
        // AI / premium
        purple: [
          'bg-violet-500/10 border-violet-500/25 text-violet-700',
          'dark:text-violet-300 dark:border-violet-500/30',
        ],
        // Outline
        outline: [
          'bg-transparent border-slate-400/30 text-slate-600',
          'dark:text-slate-400 dark:border-slate-500/30',
        ],
        // Gradient primary
        gradient: [
          'bg-gradient-primary text-white border-transparent shadow-glow-blue',
        ],
      },
      size: {
        default: 'px-2.5 py-0.5 text-[11px]',
        sm:      'px-2 py-px text-[10px]',
        lg:      'px-3 py-1 text-[12.5px]',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant, size }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
