import {
  CalendarDays,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Settings,
  Tv,
  type LucideIcon,
} from 'lucide-react'
import type { PropsWithChildren, ReactNode } from 'react'
import { NavLink } from 'react-router-dom'

import { useAuth } from '../../lib/auth'
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
  const initials =
    user?.display_name
      .split(' ')
      .map((part) => part[0])
      .join('')
      .slice(0, 2)
      .toUpperCase() || 'TS'

  return (
    <div className="min-h-screen bg-[#f8f9fb] font-['Public_Sans'] text-[#191c1e]">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col bg-[rgba(248,249,251,0.96)] p-6 text-sm font-medium text-[#1f2d63] shadow-[20px_0_50px_rgba(0,6,102,0.05)] md:flex">
        <div className="flex h-full flex-col">
          <div className="flex flex-col items-center justify-center space-y-4 pt-4 text-center">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.display_name}
                className="size-20 rounded-full object-cover shadow-sm ring-4 ring-white"
              />
            ) : (
              <div className="flex size-20 items-center justify-center rounded-full bg-[#d9deef] font-['Plus_Jakarta_Sans'] text-2xl font-extrabold text-[#081a82] shadow-sm ring-4 ring-white">
                {initials}
              </div>
            )}
            <div>
              <h2 className="font-['Plus_Jakarta_Sans'] text-lg font-bold text-[#09155b]">{user?.display_name}</h2>
              <p className="mt-1 text-xs text-[#6f7487]">Expert ASL Instructor</p>
            </div>
            <button className="w-full rounded-full bg-[linear-gradient(135deg,#000666,#1a237e)] px-4 py-2.5 font-bold text-white shadow-[0_12px_24px_rgba(0,6,102,0.12)] transition-opacity hover:opacity-90">
              Go Live Now
            </button>
          </div>

          <nav className="mt-8 flex flex-1 flex-col gap-2">
            {NAV_ITEMS.map((item) => (
              <TeacherNavLink key={item.to} to={item.to} icon={item.icon} label={item.label} />
            ))}
          </nav>

          <div className="space-y-2 pt-6">
            {FOOTER_ITEMS.map((item) => (
              <TeacherNavLink key={item.to} to={item.to} icon={item.icon} label={item.label} />
            ))}
            <button
              onClick={() => {
                void signOut()
              }}
              className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-[#5b647f] transition-all hover:bg-[rgba(224,227,229,0.5)] hover:text-[#09155b]"
            >
              <LogOut className="size-4" />
              Logout
            </button>
          </div>
        </div>
      </aside>

      <div className="md:ml-72">
        {title || subtitle || headerRight ? (
          <header className="sticky top-0 z-20 border-b border-[#eef0f5] bg-[rgba(248,249,251,0.86)] px-6 py-4 backdrop-blur-lg">
            <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-4">
              <div className="min-w-0">
                {title ? (
                  <h1 className="font-['Plus_Jakarta_Sans'] text-2xl font-extrabold tracking-tight text-[#081a82]">{title}</h1>
                ) : null}
                {subtitle ? <p className="mt-1 text-sm text-[#5f6781]">{subtitle}</p> : null}
              </div>
              {headerRight ? (
                <div className="shrink-0">{headerRight}</div>
              ) : (
                <div className="hidden items-center gap-4 md:flex">
                  <div className="rounded-full bg-white px-4 py-2 text-sm text-[#5f6781] shadow-[0_6px_20px_rgba(0,6,102,0.05)]">
                    {user?.display_name}
                  </div>
                </div>
              )}
            </div>
          </header>
        ) : null}

        <main className="mx-auto max-w-[1600px] px-6 py-6 md:px-10 lg:px-12 lg:py-10">{children}</main>
      </div>
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
          'flex items-center gap-3 rounded-xl px-4 py-3 text-[#5b647f] transition-all hover:bg-[rgba(224,227,229,0.5)] hover:text-[#09155b]',
          isActive && 'bg-white text-[#09155b] shadow-sm',
        )
      }
    >
      <Icon className="size-4" />
      {label}
    </NavLink>
  )
}
