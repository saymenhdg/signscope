import { Activity, ArrowRight, BookOpenCheck, Camera, CloudUpload, ImageIcon, Sparkles } from 'lucide-react'
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
    description: 'Open the webcam translator and run live alphabet or sign recognition.',
    icon: Camera,
    to: '/app/live',
    accent: 'bg-gradient-to-br from-primary to-primary-container text-[#0b1326]',
  },
  {
    title: 'Upload Video',
    description: 'Queue a clip, inspect transcript segments, and save it to your library.',
    icon: CloudUpload,
    to: '/app/upload',
    accent: 'bg-surface-container text-on-surface',
  },
  {
    title: 'Practice Progress',
    description: 'Review heatmaps, weak areas, and the drills the model recommends next.',
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
      subtitle="Route through live learning, recent graded sessions, and the practice data coming back from FastAPI."
    >
      {error && (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">
          {error instanceof Error ? error.message : 'Failed to load dashboard.'}
        </div>
      )}

      <section className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
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

      <div className="mt-8 grid gap-8 xl:grid-cols-[0.42fr_0.58fr]">
        <div className="space-y-8">
          <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
            <CardTitle>Daily Goal</CardTitle>
            <CardDescription>
              {overview
                ? `You are ${overview.stats.daily_goal_percent}% through today's target.`
                : 'Loading current session progress...'}
            </CardDescription>
            <div className="mt-8 flex justify-center">
              {overview ? (
                <div className="relative flex size-48 items-center justify-center rounded-full border-[14px] border-surface-container-highest">
                  <div
                    className="absolute inset-0 rounded-full border-[14px] border-transparent transition-all duration-700"
                    style={{
                      background: `conic-gradient(var(--secondary) 0deg ${overview.stats.daily_goal_percent * 3.6}deg, transparent 0deg)`,
                      WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 14px), black 0)',
                      mask: 'radial-gradient(farthest-side, transparent calc(100% - 14px), black 0)',
                    }}
                  />
                  <div className="text-center">
                    <p className="font-headline text-5xl font-black text-on-surface">
                      {overview.stats.daily_goal_percent}%
                    </p>
                    <p className="mt-2 text-xs font-bold uppercase tracking-[0.24em] text-secondary">Complete</p>
                  </div>
                </div>
              ) : (
                <Skeleton className="size-48 rounded-full" />
              )}
            </div>
            <p className="mt-8 text-center text-sm leading-7 text-on-surface-variant">
              {overview
                ? `About ${overview.stats.daily_goal_remaining_minutes} minutes remain before you close out today's learning block.`
                : 'Preparing your remaining time estimate.'}
            </p>
          </Card>

          <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>AI Insight</CardTitle>
                <CardDescription>Next recommendation from your recent practice data.</CardDescription>
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
        </div>

        <div className="space-y-8">
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

          <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Recent Translations</CardTitle>
                <CardDescription>Recent saved learning sessions and their graded summaries.</CardDescription>
              </div>
              <ImageIcon className="size-5 text-secondary" />
            </div>
            <div className="mt-8 space-y-4">
              {overview ? (
                overview.recent_translations.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-3 rounded-[24px] border border-outline-variant/10 bg-surface-container p-5 transition-colors hover:bg-surface-container-high sm:flex-row sm:items-center"
                  >
                    <div className="flex-1">
                      <p className="font-semibold text-on-surface">{item.transcript}</p>
                      <p className="mt-1 text-xs uppercase tracking-[0.24em] text-on-surface-variant">{item.source_type}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge
                        className={
                          item.status_label === 'High Accuracy'
                            ? 'border-secondary/10 bg-secondary/10 text-secondary'
                            : 'border-tertiary/10 bg-tertiary/10 text-tertiary'
                        }
                      >
                        {item.status_label}
                      </Badge>
                      <span className="font-mono text-sm text-on-surface-variant">{item.confidence.toFixed(1)}%</span>
                    </div>
                  </div>
                ))
              ) : (
                Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="rounded-[24px] border border-outline-variant/10 bg-surface-container p-5">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="mt-3 h-3 w-24" />
                  </div>
                ))
              )}
            </div>
          </Card>
        </div>
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
