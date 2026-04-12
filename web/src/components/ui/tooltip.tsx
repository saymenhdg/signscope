import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import type { PropsWithChildren, ReactNode } from 'react'

type TooltipProps = PropsWithChildren<{
  content: ReactNode
  side?: 'top' | 'right' | 'bottom' | 'left'
}>

export function Tooltip({ children, content, side = 'top' }: TooltipProps) {
  return (
    <TooltipPrimitive.Provider delayDuration={300}>
      <TooltipPrimitive.Root>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={6}
            className="z-50 rounded-xl border border-outline-variant/25 bg-surface-container-highest px-3 py-1.5 text-xs font-medium text-on-surface shadow-lg backdrop-blur-xl animate-in fade-in-0 zoom-in-95"
          >
            {content}
            <TooltipPrimitive.Arrow className="fill-surface-container-highest" />
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
