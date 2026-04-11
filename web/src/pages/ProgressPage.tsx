import { Award, Flame, TrendingUp } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AppShell } from '../components/app-shell'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
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
  const [overview, setOverview] = useState<ProgressOverview | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const payload = await apiRequest<ProgressOverview>('/api/progress/overview')
        if (!cancelled) {
          setOverview(payload)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load progress.')
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  return (
    <AppShell
      title="Progress Analytics"
      subtitle="Track activity heatmaps, weekly model confidence, weak areas, and achievement progress from the authenticated FastAPI session."
    >
      {error && (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
      )}

      <section className="grid gap-6 md:grid-cols-3">
        <MetricCard label="Total Progress" value={String(overview?.totals.signs_mastered ?? '...')} detail="Signs mastered" />
        <MetricCard label="Current Activity" value={overview ? `${overview.totals.streak_days} day` : '...'} detail="Practice streak" icon={Flame} />
        <MetricCard
          label="Rank"
          value={overview ? `Level ${overview.totals.level}` : '...'}
          detail={overview?.totals.level_title ?? 'Loading rank'}
          primary
        />
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
            <div className="grid min-w-[860px] grid-flow-col grid-rows-7 gap-1">
              {(overview?.heatmap ?? Array.from({ length: 84 }, () => 0)).map((level, index) => (
                <span
                  key={index}
                  className={cn('size-3 rounded-[4px]', HEATMAP_LEVELS[level] ?? HEATMAP_LEVELS[0])}
                />
              ))}
            </div>
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
          <p className="mt-8 font-headline text-5xl font-black text-on-surface">
            {overview?.totals.xp_points ?? '...'}
          </p>
          <p className="mt-2 text-sm text-on-surface-variant">
            {overview
              ? `${overview.totals.level_title} - ${overview.totals.next_level_xp} XP for the next level`
              : 'Loading experience totals'}
          </p>
          <div className="mt-8 h-3 overflow-hidden rounded-full bg-surface-container-highest">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
              style={{ width: `${overview?.totals.progress_percent ?? 0}%` }}
            />
          </div>
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
                    className="w-full rounded-t-2xl bg-gradient-to-t from-secondary to-primary"
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
            {(overview?.categories ?? []).map((category) => (
              <div key={category.name} className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold text-on-surface">{category.name}</span>
                  <span className="text-on-surface-variant">{category.mastered} signs</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-surface-container-highest">
                  <div className="h-full rounded-full bg-gradient-to-r from-primary to-secondary" style={{ width: `${category.percent}%` }} />
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <CardTitle>Weak Areas</CardTitle>
          <CardDescription className="mt-1">These categories are currently pulling your average down.</CardDescription>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {(overview?.weak_areas ?? []).map((item) => (
              <div key={item.name} className="rounded-[24px] border border-outline-variant/10 bg-surface-container p-5">
                <p className="font-semibold text-on-surface">{item.name}</p>
                <p className="mt-2 text-sm text-on-surface-variant">Accuracy: {item.accuracy}%</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <CardTitle>Achievements</CardTitle>
          <CardDescription className="mt-1">Milestones unlocked by your current account activity.</CardDescription>
          <div className="mt-8 space-y-4">
            {(overview?.achievements ?? []).map((achievement) => (
              <div
                key={achievement.name}
                className={cn(
                  'rounded-[24px] border p-5',
                  achievement.unlocked
                    ? 'border-secondary/15 bg-secondary/10'
                    : 'border-outline-variant/10 bg-surface-container opacity-70',
                )}
              >
                <p className="font-semibold text-on-surface">{achievement.name}</p>
                <p className="mt-2 text-sm leading-7 text-on-surface-variant">{achievement.description}</p>
              </div>
            ))}
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
        'rounded-[30px] border-outline-variant/12 p-8',
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
