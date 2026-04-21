import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Moon,
  Settings,
  Sun,
  Tv,
  type LucideIcon,
} from 'lucide-react'
import type { PropsWithChildren, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { Tooltip } from '../ui/tooltip'
import { useAuth } from '../../lib/auth'
import { useTheme } from '../../lib/theme'
import { cn } from '../../lib/utils'

type TeacherShellProps = PropsWithChildren<{
  title?: string
  subtitle?: string
  headerRight?: ReactNode
}>

const NAV_ITEMS = [
  { to: '/app/teacher', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/app/teacher/schedule', label: 'Schedule', icon: CalendarDays },
  { to: '/app/teacher/messages', label: 'Messages', icon: MessageSquare },
  { to: '/app/teacher/settings', label: 'Profile Setup', icon: Tv },
]

const FOOTER_ITEMS = [
  { to: '/app/teacher/settings', label: 'Settings', icon: Settings },
]

export function TeacherShell({ children, title, subtitle, headerRight }: TeacherShellProps) {
  const { user, signOut } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const initials =
    user?.display_name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'TS'

  return (
    <div className="min-h-screen bg-background font-sans text-on-background">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-outline-variant/20 bg-surface-container-low/92 p-6 text-sm font-medium shadow-[20px_0_50px_rgba(0,6,102,0.05)] backdrop-blur-xl md:flex">
        <div className="flex h-full flex-col">
          <div className="flex flex-col items-center justify-center space-y-4 pt-4 text-center">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.display_name}
                className="size-20 rounded-full border-2 border-outline-variant/20 object-cover shadow-sm"
              />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-full bg-primary/15 font-headline text-2xl font-extrabold text-primary shadow-sm">
                {initials}
              </div>
            )}
            <div>
              <h2 className="font-headline text-lg font-bold text-on-surface">{user?.display_name}</h2>
              <p className="mt-1 text-xs text-on-surface-variant">ASL Instructor</p>
            </div>
            <NavLink
              to="/app/teacher"
              className="w-full rounded-full bg-gradient-to-br from-primary to-primary-container px-4 py-2.5 text-center font-bold text-background shadow-lg shadow-primary/10 transition-opacity hover:opacity-90"
            >
              Go Live Now
            </NavLink>
          </div>

          <nav className="mt-8 flex flex-1 flex-col gap-1">
            {NAV_ITEMS.map((item) => (
              <TeacherNavLink key={item.to} to={item.to} icon={item.icon} label={item.label} />
            ))}
          </nav>

          <div className="space-y-1 pt-6">
            {FOOTER_ITEMS.map((item) => (
              <TeacherNavLink key={item.to} to={item.to} icon={item.icon} label={item.label} />
            ))}
            <div className="flex items-center gap-2 pt-2">
              <Tooltip content={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}>
                <button
                  onClick={toggleTheme}
                  className="flex size-10 items-center justify-center rounded-xl border border-outline-variant/25 bg-surface-container-high text-on-surface-variant transition-all hover:bg-surface-container-highest hover:text-on-surface"
                  aria-label="Toggle theme"
                >
                  {theme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
                </button>
              </Tooltip>
              <button
                onClick={() => {
                  void signOut()
                }}
                className="flex flex-1 items-center gap-3 rounded-xl border border-outline-variant/25 bg-surface-container-high px-4 py-2.5 text-sm font-semibold text-on-surface-variant transition-all hover:bg-surface-container-highest hover:text-on-surface"
              >
                <LogOut className="size-4" />
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </aside>

      <div className="md:ml-72">
        {title || subtitle || headerRight ? (
          <header className="sticky top-0 z-20 border-b border-outline-variant/20 bg-background/88 px-6 py-4 backdrop-blur-xl">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
              <div className="min-w-0">
                {title ? (
                  <h1 className="font-headline text-2xl font-extrabold tracking-tight text-primary">{title}</h1>
                ) : null}
                {subtitle ? <p className="mt-1 text-sm text-on-surface-variant">{subtitle}</p> : null}
              </div>
              {headerRight ? (
                <div className="shrink-0">{headerRight}</div>
              ) : (
                <div className="hidden items-center gap-4 md:flex">
                  <div className="rounded-full border border-outline-variant/25 bg-surface-container px-4 py-2 text-sm text-on-surface-variant">
                    {user?.display_name}
                  </div>
                </div>
              )}
            </div>
          </header>
        ) : null}

        <main className="mx-auto max-w-[1600px] px-6 py-6 pb-24 md:px-10 md:pb-6 lg:px-12 lg:py-10">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-outline-variant/30 bg-background/92 px-2 py-3 backdrop-blur-xl md:hidden">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/app/teacher'}
              className={({ isActive }) =>
                cn(
                  'flex min-w-16 flex-col items-center gap-1 rounded-2xl px-3 py-2 text-[11px] font-semibold text-on-surface-variant transition-colors',
                  isActive && 'bg-primary/15 text-secondary',
                )
              }
            >
              <Icon className="size-4" />
              {item.label}
            </NavLink>
          )
        })}
      </nav>
    </div>
  )
}

function TeacherNavLink({
  to,
  icon: Icon,
  label,
}: {
  to: string
  icon: LucideIcon
  label: string
}) {
  return (
    <NavLink
      to={to}
      end={to === '/app/teacher'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-2xl px-4 py-3 text-on-surface-variant transition-all hover:bg-surface-container hover:text-on-surface',
          isActive && 'bg-gradient-to-r from-primary/10 to-transparent text-secondary ring-1 ring-secondary/10',
        )
      }
    >
      <Icon className="size-4" />
      {label}
    </NavLink>
  )
}
