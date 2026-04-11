import {
  BarChart3,
  BookOpenCheck,
  Camera,
  CloudUpload,
  Home,
  LogOut,
  Sparkles,
  UserCircle2,
} from 'lucide-react'
import type { PropsWithChildren } from 'react'
import { NavLink, useLocation } from 'react-router-dom'

import { LEARN_SUBNAV_ITEMS } from './learning/learn-subnav'
import { Button, buttonVariants } from './ui/button'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/utils'

type AppShellProps = PropsWithChildren<{
  title: string
  subtitle: string
}>

const NAV_ITEMS = [
  { to: '/app/dashboard', label: 'Dashboard', icon: Home },
  { to: '/app/learn', label: 'Learn', icon: BookOpenCheck },
  { to: '/app/live', label: 'Live', icon: Camera },
  { to: '/app/upload', label: 'Upload', icon: CloudUpload },
  { to: '/app/progress', label: 'Progress', icon: BarChart3 },
]

export function AppShell({ children, title, subtitle }: AppShellProps) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const isLearnSection = location.pathname === '/app/learn' || location.pathname.startsWith('/app/learn/')

  return (
    <div className="min-h-screen bg-background text-on-background">
      <aside className="fixed inset-y-0 left-0 hidden w-72 flex-col border-r border-outline-variant/35 bg-[#131b2e]/92 px-6 py-8 shadow-[40px_0_60px_-15px_rgba(45,52,73,0.1)] backdrop-blur-xl lg:flex">
        <div className="mb-10 flex items-center gap-3">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-container text-[#0b1326] shadow-lg shadow-primary/10">
            <Sparkles className="size-5" />
          </div>
          <div>
            <p className="font-headline text-xl font-extrabold text-primary">SignSpeak AI</p>
            <p className="text-xs uppercase tracking-[0.24em] text-on-surface-variant">Workspace</p>
          </div>
        </div>

        <NavLink
          to="/app/profile"
          className={({ isActive }) =>
            cn(
              'mb-8 rounded-3xl border border-outline-variant/20 bg-surface-container p-4 transition-colors hover:border-secondary/15 hover:bg-surface-container-high',
              isActive && 'border-secondary/20 bg-surface-container-high',
            )
          }
        >
          <div className="flex items-center gap-4">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.display_name}
                className="size-12 rounded-2xl border border-outline-variant/20 object-cover"
              />
            ) : (
              <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 text-secondary">
                <span className="font-headline text-lg font-black">
                  {user?.display_name
                    .split(' ')
                    .map((part) => part[0])
                    .join('')
                    .slice(0, 2)
                    .toUpperCase() ?? 'SS'}
                </span>
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="truncate font-headline text-sm font-bold text-on-surface">{user?.display_name}</p>
              <p className="truncate text-xs text-secondary">{user?.email}</p>
            </div>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">
              Edit
            </span>
          </div>
        </NavLink>

        <nav className="flex flex-1 flex-col gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const showLearnChildren = item.label === 'Learn' && isLearnSection
            return (
              <div key={item.to}>
                <NavLink
                  to={item.to}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-4 rounded-2xl px-4 py-3 text-sm font-semibold text-on-surface-variant transition-all hover:bg-surface-container hover:text-on-surface',
                      isActive && 'bg-gradient-to-r from-primary/10 to-transparent text-secondary ring-1 ring-secondary/10',
                    )
                  }
                >
                  <Icon className="size-4" />
                  {item.label}
                </NavLink>

                {showLearnChildren ? (
                  <div className="ml-6 mt-2 grid gap-1 border-l border-outline-variant/15 pl-4">
                    {LEARN_SUBNAV_ITEMS.map((subItem) => {
                      const SubIcon = subItem.icon
                      return (
                        <NavLink
                          key={subItem.to}
                          to={subItem.to}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 rounded-xl px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface',
                              isActive && 'bg-secondary/10 text-secondary',
                            )
                          }
                        >
                          <SubIcon className="size-3.5" />
                          {subItem.label}
                        </NavLink>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )
          })}
        </nav>

        <Button
          variant="secondary"
          className="mt-8 justify-start rounded-2xl px-4 py-3"
          onClick={() => {
            void signOut()
          }}
        >
          <LogOut className="size-4" />
          Sign Out
        </Button>
      </aside>

      <div className="lg:pl-72">
        <header className="sticky top-0 z-40 border-b border-outline-variant/20 bg-[#0b1326]/88 px-5 py-4 backdrop-blur-xl sm:px-6">
          <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
            <div className="min-w-0">
              <p className="font-headline text-2xl font-black tracking-tight text-primary sm:text-3xl">{title}</p>
              <p className="mt-1 max-w-2xl text-sm text-on-surface-variant sm:text-base">{subtitle}</p>
            </div>
            <div className="flex items-center gap-3">
              <NavLink
                to="/app/profile"
                className={({ isActive }) =>
                  cn(
                    'hidden rounded-full border border-outline-variant/25 bg-surface-container px-4 py-2 text-sm text-on-surface-variant transition-colors md:flex md:items-center md:gap-2',
                    isActive && 'border-secondary/15 text-secondary',
                  )
                }
              >
                <UserCircle2 className="size-4 text-secondary" />
                <span>{user?.display_name}</span>
              </NavLink>
              <NavLink to="/app/profile" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'lg:hidden')}>
                <UserCircle2 className="size-4" />
              </NavLink>
              <Button
                variant="secondary"
                size="sm"
                className="lg:hidden"
                onClick={() => {
                  void signOut()
                }}
              >
                <LogOut className="size-4" />
              </Button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>

      <nav className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-outline-variant/30 bg-[#0b1326]/92 px-2 py-3 backdrop-blur-xl lg:hidden">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon
          return (
            <NavLink
              key={item.to}
              to={item.to}
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
