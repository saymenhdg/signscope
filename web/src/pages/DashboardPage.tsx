import { Activity, ArrowRight, BookOpenCheck, Camera, ImageIcon, Sparkles } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'

import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { buttonVariants } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { apiRequest } from '../lib/api'
import type { DashboardOverview } from '../lib/types'
import { cn } from '../lib/utils'

const QUICK_ACTIONS = [
  {
    title: 'Learning Hub',
    description: 'Open the guided alphabet coach and the core-word study pages.',
    icon: BookOpenCheck,
    to: '/app/learn',
    accent: 'bg-gradient-to-br from-secondary/85 to-primary/70 text-[#0b1326]',
  },
  {
    title: 'Start Live Camera',
    description: 'Practice signs in front of your webcam with real-time AI feedback.',
    icon: Camera,
    to: '/app/live',
    accent: 'bg-gradient-to-br from-primary to-primary-container text-[#0b1326]',
  },
  {
    title: 'Practice Progress',
    description: 'See your strengths, weak areas, and what to practice next.',
    icon: Activity,
    to: '/app/progress',
    accent: 'bg-surface-container text-on-surface',
  },
]

export function DashboardPage() {
  const { data: overview, error } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: () => apiRequest<DashboardOverview>('/api/dashboard/overview'),
  })

  return (
    <AppShell
      title="Dashboard"
      subtitle="Your learning overview — jump into lessons, practice live, or review your progress."
    >
      {error && (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load dashboard.'}
        </div>
      )}

      {/* ── Quick Actions ── */}
      <section className="grid gap-6 md:grid-cols-3">
        {QUICK_ACTIONS.map((action) => {
          const Icon = action.icon
          return (
            <Link
              key={action.title}
              to={action.to}
              className={cn(
                'group relative overflow-hidden rounded-[30px] border border-outline-variant/10 p-7 shadow-lg transition-all duration-300 hover:-translate-y-1 hover:shadow-xl',
                action.accent,
              )}
            >
              <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-black/10 backdrop-blur-xl transition-transform duration-300 group-hover:scale-110">
                <Icon className="size-5" />
              </div>
              <p className="font-headline text-2xl font-bold">{action.title}</p>
              <p className="mt-3 max-w-xs text-sm leading-7 opacity-85">{action.description}</p>
              <ArrowRight className="mt-6 size-4 opacity-70 transition-transform duration-300 group-hover:translate-x-2" />
            </Link>
          )
        })}
      </section>

      {/* ── Stats Row ── */}
      <section className="mt-8 grid gap-4 grid-cols-2 lg:grid-cols-4">
        {overview ? (
          <>
            <StatCard label="Signs Mastered" value={String(overview.stats.signs_mastered)} />
            <StatCard label="Streak" value={`${overview.stats.practice_streak} days`} />
            <StatCard label="Live Accuracy" value={`${overview.stats.live_accuracy}%`} />
            <StatCard label="Rank" value={overview.stats.rank_label} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="rounded-[26px] border-outline-variant/12 bg-surface-container-low/90 p-6">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-4 h-8 w-16" />
            </Card>
          ))
        )}
      </section>

      {/* ── Main Content ── */}
      <div className="mt-8 grid gap-8 lg:grid-cols-3">
        {/* Daily Goal */}
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <CardTitle>Daily Goal</CardTitle>
          <CardDescription>
            {overview
              ? `You are ${overview.stats.daily_goal_percent}% through today's target.`
              : 'Loading your progress...'}
          </CardDescription>
          <div className="mt-8 flex justify-center">
            {overview ? (
              <div className="relative flex size-44 items-center justify-center rounded-full border-[12px] border-surface-container-highest">
                <div
                  className="absolute inset-0 rounded-full border-[12px] border-transparent transition-all duration-700"
                  style={{
                    background: `conic-gradient(var(--secondary) 0deg ${overview.stats.daily_goal_percent * 3.6}deg, transparent 0deg)`,
                    WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 12px), black 0)',
                    mask: 'radial-gradient(farthest-side, transparent calc(100% - 12px), black 0)',
                  }}
                />
                <div className="text-center">
                  <p className="font-headline text-4xl font-black text-on-surface">
                    {overview.stats.daily_goal_percent}%
                  </p>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.24em] text-secondary">Complete</p>
                </div>
              </div>
            ) : (
              <Skeleton className="size-44 rounded-full" />
            )}
          </div>
          <p className="mt-6 text-center text-sm leading-7 text-on-surface-variant">
            {overview
              ? `About ${overview.stats.daily_goal_remaining_minutes} minutes left in today's learning block.`
              : 'Preparing your estimate...'}
          </p>
        </Card>

        {/* AI Insight */}
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>AI Insight</CardTitle>
              <CardDescription>Your next recommendation.</CardDescription>
            </div>
            <Sparkles className="size-5 text-secondary" />
          </div>
          {overview ? (
            <>
              <p className="mt-6 font-headline text-2xl font-bold text-on-surface">
                {overview.insight.headline}
              </p>
              <p className="mt-3 text-sm leading-7 text-on-surface-variant">
                {overview.insight.detail}
              </p>
            </>
          ) : (
            <div className="mt-6 space-y-3">
              <Skeleton className="h-7 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}
          <Link to="/app/progress" className={cn(buttonVariants({ variant: 'secondary' }), 'mt-6 w-fit rounded-2xl')}>
            Open Progress
          </Link>
        </Card>

        {/* Recent Sessions */}
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Recent Sessions</CardTitle>
              <CardDescription>Your latest practice results.</CardDescription>
            </div>
            <ImageIcon className="size-5 text-secondary" />
          </div>
          <div className="mt-6 space-y-3">
            {overview ? (
              overview.recent_translations.length > 0 ? (
                overview.recent_translations.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-[20px] border border-outline-variant/10 bg-surface-container p-4 transition-colors hover:bg-surface-container-high"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="truncate font-semibold text-on-surface">{item.transcript}</p>
                      <Badge
                        className={cn(
                          'shrink-0',
                          item.status_label === 'High Accuracy'
                            ? 'border-secondary/10 bg-secondary/10 text-secondary'
                            : 'border-tertiary/10 bg-tertiary/10 text-tertiary',
                        )}
                      >
                        {item.confidence.toFixed(0)}%
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-xs uppercase tracking-[0.2em] text-on-surface-variant">{item.source_type}</p>
                  </div>
                ))
              ) : (
                <div className="rounded-[20px] border border-dashed border-outline-variant/20 bg-surface-container p-5 text-sm leading-7 text-on-surface-variant">
                  No sessions yet. Complete a lesson or try the live camera to see results here.
                </div>
              )
            ) : (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[20px] border border-outline-variant/10 bg-surface-container p-4">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="mt-3 h-3 w-24" />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-[26px] border-outline-variant/12 bg-surface-container-low/90 p-6">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</p>
      <p className="mt-3 font-headline text-3xl font-black tracking-tight text-on-surface">{value}</p>
    </Card>
  )
}
