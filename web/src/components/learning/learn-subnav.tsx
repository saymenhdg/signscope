import { BookOpenCheck, Camera, Type } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { NavLink } from 'react-router-dom'

import { cn } from '../../lib/utils'

export type LearnSubnavItem = {
  to: string
  label: string
  icon: LucideIcon
}

export const LEARN_SUBNAV_ITEMS: LearnSubnavItem[] = [
  {
    to: '/app/learn/alphabet',
    label: 'Learn Alphabets',
    icon: Type,
  },
  {
    to: '/app/learn/words',
    label: 'Learn Words',
    icon: BookOpenCheck,
  },
  {
    to: '/app/learn/test',
    label: 'Test',
    icon: Camera,
  },
]

type LearnSubnavProps = {
  className?: string
}

export function LearnSubnav({ className }: LearnSubnavProps) {
  return (
    <div
      className={cn(
        'rounded-[28px] border border-outline-variant/15 bg-surface-container-low/90 p-3 shadow-sm',
        className,
      )}
    >
      <div className="mb-3 px-3">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Learn Menu</p>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        {LEARN_SUBNAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-[22px] border px-4 py-3 text-sm font-semibold transition-colors',
                  isActive
                    ? 'border-secondary/15 bg-secondary/10 text-secondary'
                    : 'border-outline-variant/10 bg-surface-container text-on-surface-variant hover:border-secondary/15 hover:text-on-surface',
                )
              }
            >
              <Icon className="size-4" />
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </div>
    </div>
  )
}

