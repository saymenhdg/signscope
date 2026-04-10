import type { HTMLAttributes } from 'react'

import { cn } from '../../lib/utils'

export function Badge({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border border-outline-variant/20 bg-surface-container-high px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-on-surface',
        className,
      )}
      {...props}
    />
  )
}
