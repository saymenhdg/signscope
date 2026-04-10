import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-2xl border text-sm font-semibold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary/50 focus-visible:ring-offset-0 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'border-transparent bg-gradient-to-br from-primary to-primary-container px-4 py-2 text-[#0b1326] shadow-[0_16px_34px_rgba(124,135,243,0.28)] hover:brightness-110',
        secondary:
          'border-outline-variant/25 bg-surface-container-high px-4 py-2 text-on-surface hover:bg-surface-container-highest',
        ghost:
          'border-transparent bg-transparent px-3 py-2 text-on-surface-variant hover:bg-surface-container hover:text-on-surface',
        outline:
          'border-outline-variant/25 bg-transparent px-4 py-2 text-on-surface hover:bg-surface-container',
      },
      size: {
        default: '',
        sm: 'px-3 py-1.5 text-xs',
        lg: 'px-5 py-3 text-base',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants>

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />
}
