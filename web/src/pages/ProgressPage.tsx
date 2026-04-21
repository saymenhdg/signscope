import { Award, Flame, History, Target, TrendingUp } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { AppShell } from '../components/app-shell'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { apiRequest } from '../lib/api'
import type { ProgressOverview } from '../lib/types'
import { cn } from '../lib/utils'

const HEATMAP_LEVELS = [
  'bg-surface-container-highest',
  'bg-secondary/20',
  'bg-secondary/40',
  'bg-secondary/70',
  'bg-secondary',
]

export function ProgressPage() {
  const { data: overview, error } = useQuery({
    queryKey: ['progress-overview'],
    queryFn: () => apiRequest<ProgressOverview>('/api/progress/overview'),
  })
  const categories = overview?.categories ?? []
  const weakAreas = overview?.weak_areas ?? []
  const achievements = overview?.achievements ?? []
  const trackBreakdown = overview?.track_breakdown ?? []
  const focusLabels = overview?.focus_labels ?? []
  const recentSessions = overview?.recent_sessions ?? []

  return (
    <AppShell
      title="Progress Analytics"
      subtitle="Track activity heatmaps, weekly accuracy, weak areas, and achievement progress from your recorded learning sessions."
    >
      {error && (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">
          {error instanceof Error ? error.message : 'Failed to load progress.'}
        </div>
      )}

      <section className="grid gap-6 md:grid-cols-3">
        {overview ? (
          <>
            <MetricCard label="Total Progress" value={String(overview.totals.signs_mastered)} detail="Signs mastered" />
            <MetricCard label="Current Activity" value={`${overview.totals.streak_days} day`} detail="Practice streak" icon={Flame} />
            <MetricCard
              label="Rank"
              value={`Level ${overview.totals.level}`}
              detail={overview.totals.level_title}
              primary
            />
          </>
        ) : (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-10 w-20" />
              <Skeleton className="mt-4 h-3 w-32" />
            </Card>
          ))
        )}
      </section>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Activity Heatmap</CardTitle>
              <CardDescription>Last 12 weeks of practice activity intensity.</CardDescription>
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">84 Days</span>
          </div>
          <div className="mt-8 overflow-x-auto">
            {overview ? (
              <div className="grid min-w-[860px] grid-flow-col grid-rows-7 gap-1">
                {overview.heatmap.map((level, index) => (
                  <span
                    key={index}
                    className={cn('size-3 rounded-[4px] transition-colors', HEATMAP_LEVELS[level] ?? HEATMAP_LEVELS[0])}
                  />
                ))}
              </div>
            ) : (
              <div className="grid min-w-[860px] grid-flow-col grid-rows-7 gap-1">
                {Array.from({ length: 84 }).map((_, i) => (
                  <Skeleton key={i} className="size-3 rounded-[4px]" />
                ))}
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Level Progress</CardTitle>
              <CardDescription>Current XP toward the next rank.</CardDescription>
            </div>
            <Award className="size-5 text-secondary" />
          </div>
          {overview ? (
            <>
              <p className="mt-8 font-headline text-5xl font-black text-on-surface">
                {overview.totals.xp_points}
              </p>
              <p className="mt-2 text-sm text-on-surface-variant">
                {overview.totals.level_title} - {overview.totals.next_level_xp} XP for the next level
              </p>
              <div className="mt-8 h-3 overflow-hidden rounded-full bg-surface-container-highest">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-700"
                  style={{ width: `${overview.totals.progress_percent}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <Skeleton className="mt-8 h-12 w-24" />
              <Skeleton className="mt-3 h-4 w-48" />
              <Skeleton className="mt-8 h-3 w-full rounded-full" />
            </>
          )}
        </Card>
      </div>

      <section className="mt-8 grid gap-8 lg:grid-cols-2">
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Weekly Accuracy</CardTitle>
              <CardDescription>Average practice accuracy grouped by weekday.</CardDescription>
            </div>
            <TrendingUp className="size-5 text-secondary" />
          </div>
          <div className="mt-8 flex h-52 items-end gap-3">
            {(overview?.weekly_accuracy ?? Array.from({ length: 7 }, () => 0)).map((value, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-secondary">{value}%</div>
                <div className="relative flex w-full flex-1 items-end rounded-t-2xl bg-surface-container-high">
                  <div
                    className="w-full rounded-t-2xl bg-gradient-to-t from-secondary to-primary transition-[height] duration-700"
                    style={{ height: `${Math.max(8, value)}%` }}
                  />
                </div>
                <div className="text-[10px] font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <CardTitle>Lesson Category Mix</CardTitle>
          <CardDescription className="mt-1">How the current practice set is distributed by category.</CardDescription>
          <div className="mt-8 space-y-5">
            {overview ? (
              categories.map((category) => (
                <div key={category.name} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-semibold text-on-surface">{category.name}</span>
                    <span className="text-on-surface-variant">{category.mastered} signs</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-surface-container-highest">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-700"
                      style={{ width: `${category.percent}%` }}
                    />
                  </div>
                </div>
              ))
            ) : (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-2 w-full rounded-full" />
                </div>
              ))
            )}
          </div>
        </Card>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Track Breakdown</CardTitle>
              <CardDescription>Compare alphabet coaching against word practice using recorded sessions.</CardDescription>
            </div>
            <Target className="size-5 text-secondary" />
          </div>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {overview ? (
              trackBreakdown.length > 0 ? (
                trackBreakdown.map((track) => (
                <div
                  key={track.track}
                  className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5 transition-colors hover:bg-surface-container-high"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-semibold text-on-surface">{track.label}</p>
                      <p className="mt-1 text-sm text-on-surface-variant">
                        {track.sessions} sessions • {track.attempts} graded attempts
                      </p>
                    </div>
                    <span className="font-headline text-3xl font-black text-on-surface">{track.accuracy}%</span>
                  </div>
                  <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-container-highest">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-700"
                      style={{ width: `${track.percent}%` }}
                    />
                  </div>
                  <p className="mt-3 text-sm text-on-surface-variant">{track.correct} correct reads recorded.</p>
                </div>
                ))
              ) : (
                <EmptyState copy="Track comparison appears once graded alphabet or word practice has been recorded." />
              )
            ) : (
              Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-3 w-32" />
                  <Skeleton className="mt-4 h-2 w-full rounded-full" />
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <CardTitle>Weak Areas</CardTitle>
          <CardDescription className="mt-1">These categories are currently pulling your average down.</CardDescription>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {overview ? (
              weakAreas.map((item) => (
                <div key={item.name} className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5 transition-colors hover:bg-surface-container-high">
                  <p className="font-semibold text-on-surface">{item.name}</p>
                  <p className="mt-2 text-sm text-on-surface-variant">Accuracy: {item.accuracy}%</p>
                </div>
              ))
            ) : (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-3 w-20" />
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <CardTitle>Achievements</CardTitle>
          <CardDescription className="mt-1">Milestones unlocked by your current account activity.</CardDescription>
          <div className="mt-8 space-y-4">
            {overview ? (
              achievements.map((achievement) => (
                <div
                  key={achievement.name}
                  className={cn(
                    'rounded-3xl border p-5 transition-colors',
                    achievement.unlocked
                      ? 'border-secondary/15 bg-secondary/10 hover:bg-secondary/15'
                      : 'border-outline-variant/10 bg-surface-container opacity-70',
                  )}
                >
                  <p className="font-semibold text-on-surface">{achievement.name}</p>
                  <p className="mt-2 text-sm leading-7 text-on-surface-variant">{achievement.description}</p>
                </div>
              ))
            ) : (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="mt-3 h-3 w-full" />
                </div>
              ))
            )}
          </div>
        </Card>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Focus Queue</CardTitle>
              <CardDescription>Labels with the weakest recent accuracy should be your next reps.</CardDescription>
            </div>
            <Target className="size-5 text-secondary" />
          </div>
          <div className="mt-8 space-y-4">
            {overview ? (
              focusLabels.length > 0 ? (
                focusLabels.map((item) => (
                  <div
                    key={`${item.track}-${item.label}`}
                    className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5 transition-colors hover:bg-surface-container-high"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-on-surface">{item.label}</p>
                        <p className="mt-1 text-sm uppercase tracking-[0.2em] text-on-surface-variant">{item.track}</p>
                      </div>
                      <span className="font-mono text-sm text-secondary">{item.accuracy}%</span>
                    </div>
                    <p className="mt-3 text-sm text-on-surface-variant">{item.attempts} graded attempts recorded.</p>
                  </div>
                ))
              ) : (
                <EmptyState copy="Not enough repeated labels yet. Once the same letter or word has been graded at least twice, it will appear here." />
              )
            ) : (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="mt-3 h-3 w-16" />
                  <Skeleton className="mt-3 h-3 w-32" />
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Recent Sessions</CardTitle>
              <CardDescription>Latest graded alphabet and word runs written back from the live app.</CardDescription>
            </div>
            <History className="size-5 text-secondary" />
          </div>
          <div className="mt-8 space-y-4">
            {overview ? (
              recentSessions.length > 0 ? (
                recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5 transition-colors hover:bg-surface-container-high"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-on-surface">{session.unit_title}</p>
                        <p className="mt-1 text-sm text-on-surface-variant">
                          {session.category} • {session.track}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-headline text-2xl font-black text-on-surface">{session.accuracy}%</p>
                        <p className="text-xs uppercase tracking-[0.2em] text-on-surface-variant">accuracy</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-3">
                      <SessionMeta label="Correct" value={`${session.correct_items}/${session.attempts_count || session.completed_items}`} />
                      <SessionMeta label="Duration" value={`${session.duration_minutes} min`} />
                      <SessionMeta label="Finished" value={formatSessionTime(session.completed_at)} />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState copy="No graded sessions yet. Run an alphabet coach or word studio session and it will show up here." />
              )
            ) : (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5">
                  <Skeleton className="h-4 w-36" />
                  <Skeleton className="mt-3 h-3 w-24" />
                  <div className="mt-4 grid gap-3 sm:grid-cols-3">
                    <Skeleton className="h-10 rounded-2xl" />
                    <Skeleton className="h-10 rounded-2xl" />
                    <Skeleton className="h-10 rounded-2xl" />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>
      </section>
    </AppShell>
  )
}

function MetricCard({
  label,
  value,
  detail,
  icon: Icon,
  primary = false,
}: {
  label: string
  value: string
  detail: string
  icon?: typeof TrendingUp
  primary?: boolean
}) {
  return (
    <Card
      className={cn(
        'rounded-[30px] border-outline-variant/12 p-8 transition-transform duration-300 hover:-translate-y-0.5',
        primary ? 'bg-gradient-to-br from-primary to-primary-container text-[#0b1326]' : 'bg-surface-container-low/90',
      )}
    >
      <p className={cn('text-sm font-semibold', primary ? 'text-[#081486]/70' : 'text-on-surface-variant')}>{label}</p>
      <p className={cn('mt-3 font-headline text-4xl font-black', primary ? 'text-[#0b1326]' : 'text-on-surface')}>
        {value}
      </p>
      <div className="mt-4 flex items-center gap-2">
        {Icon ? <Icon className={cn('size-4', primary ? 'text-[#081486]/70' : 'text-secondary')} /> : null}
        <span className={cn('text-sm', primary ? 'text-[#081486]/80' : 'text-on-surface-variant')}>{detail}</span>
      </div>
    </Card>
  )
}

function SessionMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container-low px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">{label}</p>
      <p className="mt-2 text-sm font-semibold text-on-surface">{value}</p>
    </div>
  )
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-3xl border border-dashed border-outline-variant/20 bg-surface-container p-6 text-sm leading-7 text-on-surface-variant">
      {copy}
    </div>
  )
}

function formatSessionTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) {
    return 'Recent'
  }

  const now = Date.now()
  const diffMs = now - date.getTime()
  const diffMinutes = Math.floor(diffMs / 60_000)
  if (diffMinutes < 60) {
    return `${Math.max(1, diffMinutes)}m ago`
  }
  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) {
    return `${diffHours}h ago`
  }
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) {
    return `${diffDays}d ago`
  }
  return date.toLocaleDateString()
}
