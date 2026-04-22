import { Award, Flame, History, Sparkles, Star, Target, TrendingUp, Zap } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
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
      title="Progress"
      subtitle="See how you're improving — streaks, accuracy trends, weak spots, and achievements."
    >
      {error && (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load progress.'}
        </div>
      )}

      {/* ── Hero Stats ── */}
      <section className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {overview ? (
          <>
            <StatCard label="Signs Mastered" value={String(overview.totals.signs_mastered)} icon={Star} />
            <StatCard label="Streak" value={`${overview.totals.streak_days} days`} icon={Flame} />
            <StatCard label="XP Points" value={String(overview.totals.xp_points)} icon={Zap} />
            <StatCard
              label={overview.totals.level_title}
              value={`Level ${overview.totals.level}`}
              icon={Award}
              accent
            />
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

      {/* ── Level Progress Bar ── */}
      {overview && (
        <div className="mt-4 rounded-[22px] border border-outline-variant/12 bg-surface-container-low/90 px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">
              {overview.totals.level_title}
            </p>
            <p className="text-xs text-on-surface-variant">
              {overview.totals.next_level_xp} XP to next level
            </p>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-700"
              style={{ width: `${overview.totals.progress_percent}%` }}
            />
          </div>
        </div>
      )}

      {/* ── Heatmap + Weekly Accuracy ── */}
      <section className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.6fr]">
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Activity Heatmap</CardTitle>
              <CardDescription>Last 12 weeks of practice.</CardDescription>
            </div>
            <span className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">84 Days</span>
          </div>
          <div className="mt-6 overflow-x-auto">
            {overview ? (
              <div className="grid min-w-[640px] grid-flow-col grid-rows-7 gap-[5px]">
                {overview.heatmap.map((level, index) => (
                  <span
                    key={index}
                    className={cn('size-3.5 rounded-[5px] transition-colors', HEATMAP_LEVELS[level] ?? HEATMAP_LEVELS[0])}
                  />
                ))}
              </div>
            ) : (
              <div className="grid min-w-[640px] grid-flow-col grid-rows-7 gap-[5px]">
                {Array.from({ length: 84 }).map((_, i) => (
                  <Skeleton key={i} className="size-3.5 rounded-[5px]" />
                ))}
              </div>
            )}
            <div className="mt-4 flex items-center justify-end gap-2">
              <span className="text-[10px] text-on-surface-variant">Less</span>
              {HEATMAP_LEVELS.map((cls, i) => (
                <span key={i} className={cn('size-3 rounded-[3px]', cls)} />
              ))}
              <span className="text-[10px] text-on-surface-variant">More</span>
            </div>
          </div>
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <CardTitle>Weekly Accuracy</CardTitle>
          <CardDescription className="mt-1">By weekday.</CardDescription>
          <div className="mt-6 flex h-44 items-end gap-2">
            {(overview?.weekly_accuracy ?? Array.from({ length: 7 }, () => 0)).map((value, index) => (
              <div key={index} className="flex flex-1 flex-col items-center gap-2">
                <div className="text-[10px] font-bold text-secondary">{value}%</div>
                <div className="relative flex w-full flex-1 items-end rounded-t-xl bg-surface-container-high">
                  <div
                    className="w-full rounded-t-xl bg-gradient-to-t from-secondary to-primary transition-[height] duration-700"
                    style={{ height: `${Math.max(8, value)}%` }}
                  />
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
                  {['M', 'T', 'W', 'T', 'F', 'S', 'S'][index]}
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      {/* ── Track Breakdown + Categories ── */}
      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Track Breakdown</CardTitle>
              <CardDescription>Alphabet vs. word practice.</CardDescription>
            </div>
            <Target className="size-5 text-secondary" />
          </div>
          <div className="mt-6 space-y-4">
            {overview ? (
              trackBreakdown.length > 0 ? (
                trackBreakdown.map((track) => (
                  <div
                    key={track.track}
                    className="rounded-[22px] border border-outline-variant/10 bg-surface-container p-5 transition-colors hover:bg-surface-container-high"
                  >
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-on-surface">{track.label}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {track.sessions} sessions &middot; {track.attempts} attempts
                        </p>
                      </div>
                      <p className="font-headline text-3xl font-black text-on-surface">{track.accuracy}%</p>
                    </div>
                    <div className="mt-4 h-2 overflow-hidden rounded-full bg-surface-container-highest">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-secondary transition-[width] duration-700"
                        style={{ width: `${track.percent}%` }}
                      />
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState copy="Complete a practice session to see your track comparison here." />
              )
            ) : (
              Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-[22px] border border-outline-variant/10 bg-surface-container p-5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-3 w-32" />
                  <Skeleton className="mt-4 h-2 w-full rounded-full" />
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <CardTitle>Category Mix</CardTitle>
          <CardDescription className="mt-1">How your practice is distributed.</CardDescription>
          <div className="mt-6 space-y-5">
            {overview ? (
              categories.length > 0 ? (
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
                <EmptyState copy="Category data will appear after you start practicing." />
              )
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

      {/* ── Focus Queue + Weak Areas ── */}
      <section className="mt-8 grid gap-6 lg:grid-cols-2">
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Focus Queue</CardTitle>
              <CardDescription>Signs that need the most practice.</CardDescription>
            </div>
            <Target className="size-5 text-secondary" />
          </div>
          <div className="mt-6 space-y-3">
            {overview ? (
              focusLabels.length > 0 ? (
                focusLabels.map((item) => (
                  <div
                    key={`${item.track}-${item.label}`}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-outline-variant/10 bg-surface-container px-5 py-4 transition-colors hover:bg-surface-container-high"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 font-headline text-sm font-black text-primary">
                        {item.label.slice(0, 2)}
                      </span>
                      <div>
                        <p className="font-semibold text-on-surface">{item.label}</p>
                        <p className="text-xs text-on-surface-variant">{item.track} &middot; {item.attempts} attempts</p>
                      </div>
                    </div>
                    <Badge
                      className={cn(
                        'shrink-0',
                        item.accuracy < 50
                          ? 'border-error/15 bg-error/10 text-error'
                          : 'border-tertiary/15 bg-tertiary/10 text-tertiary',
                      )}
                    >
                      {item.accuracy}%
                    </Badge>
                  </div>
                ))
              ) : (
                <EmptyState copy="Practice a letter or word at least twice to see focus suggestions." />
              )
            ) : (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 rounded-2xl border border-outline-variant/10 bg-surface-container px-5 py-4">
                  <Skeleton className="size-9 rounded-xl" />
                  <div className="flex-1">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="mt-2 h-3 w-16" />
                  </div>
                </div>
              ))
            )}
          </div>
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <CardTitle>Weak Areas</CardTitle>
          <CardDescription className="mt-1">Categories pulling your average down.</CardDescription>
          <div className="mt-6 space-y-3">
            {overview ? (
              weakAreas.length > 0 ? (
                weakAreas.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-outline-variant/10 bg-surface-container px-5 py-4 transition-colors hover:bg-surface-container-high"
                  >
                    <p className="font-semibold text-on-surface">{item.name}</p>
                    <div className="flex items-center gap-3">
                      <div className="h-2 w-20 overflow-hidden rounded-full bg-surface-container-highest">
                        <div
                          className="h-full rounded-full bg-error/70 transition-[width] duration-700"
                          style={{ width: `${item.accuracy}%` }}
                        />
                      </div>
                      <span className="text-sm font-semibold text-error">{item.accuracy}%</span>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState copy="No weak areas detected yet. Keep practicing and they'll surface here." />
              )
            ) : (
              Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center justify-between rounded-2xl border border-outline-variant/10 bg-surface-container px-5 py-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-2 w-20 rounded-full" />
                </div>
              ))
            )}
          </div>
        </Card>
      </section>

      {/* ── Achievements ── */}
      <section className="mt-8">
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Achievements</CardTitle>
              <CardDescription>Milestones you've unlocked along the way.</CardDescription>
            </div>
            <Sparkles className="size-5 text-secondary" />
          </div>
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {overview ? (
              achievements.length > 0 ? (
                achievements.map((achievement) => (
                  <div
                    key={achievement.name}
                    className={cn(
                      'rounded-[22px] border p-5 transition-colors',
                      achievement.unlocked
                        ? 'border-secondary/15 bg-secondary/8'
                        : 'border-outline-variant/10 bg-surface-container opacity-55',
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={cn(
                          'flex size-9 items-center justify-center rounded-xl',
                          achievement.unlocked ? 'bg-secondary/15 text-secondary' : 'bg-surface-container-high text-on-surface-variant',
                        )}
                      >
                        <Award className="size-4" />
                      </div>
                      <p className="font-semibold text-on-surface">{achievement.name}</p>
                    </div>
                    <p className="mt-3 text-sm leading-relaxed text-on-surface-variant">{achievement.description}</p>
                  </div>
                ))
              ) : (
                <EmptyState copy="Complete lessons and practice sessions to unlock achievements." />
              )
            ) : (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[22px] border border-outline-variant/10 bg-surface-container p-5">
                  <div className="flex items-center gap-3">
                    <Skeleton className="size-9 rounded-xl" />
                    <Skeleton className="h-4 w-28" />
                  </div>
                  <Skeleton className="mt-3 h-3 w-full" />
                </div>
              ))
            )}
          </div>
        </Card>
      </section>

      {/* ── Recent Sessions ── */}
      <section className="mt-8">
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Recent Sessions</CardTitle>
              <CardDescription>Your latest practice results.</CardDescription>
            </div>
            <History className="size-5 text-secondary" />
          </div>
          <div className="mt-6 space-y-3">
            {overview ? (
              recentSessions.length > 0 ? (
                recentSessions.map((session) => (
                  <div
                    key={session.id}
                    className="rounded-[22px] border border-outline-variant/10 bg-surface-container p-5 transition-colors hover:bg-surface-container-high"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-on-surface">{session.unit_title}</p>
                        <p className="mt-1 text-xs text-on-surface-variant">
                          {session.category} &middot; {session.track}
                        </p>
                      </div>
                      <div className="flex items-center gap-6">
                        <SessionMeta label="Correct" value={`${session.correct_items}/${session.attempts_count || session.completed_items}`} />
                        <SessionMeta label="Duration" value={`${session.duration_minutes}m`} />
                        <SessionMeta label="When" value={formatSessionTime(session.completed_at)} />
                        <div className="text-right">
                          <p className="font-headline text-2xl font-black text-on-surface">{session.accuracy}%</p>
                          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">accuracy</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState copy="No sessions yet. Complete a lesson to see your results here." />
              )
            ) : (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-[22px] border border-outline-variant/10 bg-surface-container p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <Skeleton className="h-4 w-36" />
                      <Skeleton className="mt-2 h-3 w-24" />
                    </div>
                    <Skeleton className="h-8 w-14" />
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

function StatCard({
  label,
  value,
  icon: Icon,
  accent = false,
}: {
  label: string
  value: string
  icon: typeof TrendingUp
  accent?: boolean
}) {
  return (
    <Card
      className={cn(
        'rounded-[26px] border-outline-variant/12 p-6',
        accent ? 'bg-gradient-to-br from-primary to-primary-container text-[#0b1326]' : 'bg-surface-container-low/90',
      )}
    >
      <div className="flex items-center justify-between">
        <p className={cn('text-xs font-bold uppercase tracking-[0.24em]', accent ? 'text-[#081486]/70' : 'text-on-surface-variant')}>
          {label}
        </p>
        <Icon className={cn('size-4', accent ? 'text-[#081486]/60' : 'text-secondary')} />
      </div>
      <p className={cn('mt-3 font-headline text-3xl font-black tracking-tight', accent ? 'text-[#0b1326]' : 'text-on-surface')}>
        {value}
      </p>
    </Card>
  )
}

function SessionMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="hidden sm:block">
      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">{label}</p>
      <p className="mt-1 text-sm font-semibold text-on-surface">{value}</p>
    </div>
  )
}

function EmptyState({ copy }: { copy: string }) {
  return (
    <div className="rounded-[22px] border border-dashed border-outline-variant/20 bg-surface-container p-6 text-sm leading-7 text-on-surface-variant">
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
