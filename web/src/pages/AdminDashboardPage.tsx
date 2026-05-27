import { Activity, AlertTriangle, Binary, CalendarClock, Cog, ShieldCheck, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'

import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { apiRequest } from '../lib/api'
import type { AdminOverview } from '../lib/types'
import { cn } from '../lib/utils'

const COMMAND_CARDS = [
  {
    title: 'Model Ops',
    description: 'Track the active checkpoint, deployment settings, and evaluation trend for the word recognizer.',
    icon: Binary,
    tone: 'from-primary/18 via-primary/8 to-transparent',
  },
  {
    title: 'Learning Health',
    description: 'Watch weak labels, recent graded accuracy, and platform-wide practice volume in one place.',
    icon: Activity,
    tone: 'from-secondary/18 via-secondary/8 to-transparent',
  },
  {
    title: 'Operations',
    description: 'Monitor teacher supply, booking pressure, and role mix before support issues compound.',
    icon: ShieldCheck,
    tone: 'from-tertiary/18 via-tertiary/8 to-transparent',
  },
]

export function AdminDashboardPage() {
  const { data: overview, error } = useQuery({
    queryKey: ['admin-overview'],
    queryFn: () => apiRequest<AdminOverview>('/api/admin/overview'),
  })

  return (
    <AppShell
      title="Admin Dashboard"
      subtitle="System operations, model status, and learning quality in the same visual language as the rest of the workspace."
    >
      {error ? (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load admin overview.'}
        </div>
      ) : null}

      <section className="grid gap-6 md:grid-cols-3">
        {COMMAND_CARDS.map((card) => {
          const Icon = card.icon
          return (
            <Card
              key={card.title}
              className={cn(
                'overflow-hidden rounded-[30px] border-outline-variant/12 p-7',
                `bg-[radial-gradient(circle_at_top_left,var(--tw-gradient-from),var(--tw-gradient-via),var(--tw-gradient-to))] ${card.tone}`,
              )}
            >
              <div className="flex size-12 items-center justify-center rounded-2xl bg-surface-container text-secondary shadow-lg shadow-secondary/10">
                <Icon className="size-5" />
              </div>
              <CardTitle className="mt-5 text-2xl">{card.title}</CardTitle>
              <CardDescription className="mt-3 max-w-sm leading-7">{card.description}</CardDescription>
            </Card>
          )
        })}
      </section>

      <section className="mt-8 grid grid-cols-2 gap-4 xl:grid-cols-4">
        {overview ? (
          <>
            <StatCard label="Total Users" value={overview.stats.total_users} icon={Users} />
            <StatCard label="Public Teachers" value={overview.stats.public_teachers} icon={ShieldCheck} />
            <StatCard label="Pending Bookings" value={overview.stats.pending_bookings} icon={CalendarClock} />
            <StatCard label="Recent Accuracy" value={`${overview.stats.recent_accuracy}%`} icon={Activity} />
          </>
        ) : (
          Array.from({ length: 4 }).map((_, index) => (
            <Card key={index} className="rounded-[26px] border-outline-variant/12 p-6">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-4 h-8 w-20" />
            </Card>
          ))
        )}
      </section>

      <div className="mt-8 grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="rounded-[30px] border-outline-variant/12 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Word Model Status</CardTitle>
              <CardDescription>Current deployment target and the dataset footprint it depends on.</CardDescription>
            </div>
            <Cog className="size-5 text-secondary" />
          </div>
          {overview ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <InfoPanel label="Checkpoint" value={overview.model.checkpoint_name} />
              <InfoPanel label="Path" value={overview.model.active_checkpoint} mono />
              <InfoPanel label="Best Validation" value={`${overview.model.best_val_accuracy}%`} />
              <InfoPanel label="Test Accuracy" value={`${overview.model.test_accuracy}%`} />
              <InfoPanel label="Test Loss" value={String(overview.model.test_loss)} />
              <InfoPanel label="Epochs" value={String(overview.model.epochs)} />
              <InfoPanel label="Word Clips" value={String(overview.growth.dataset_records)} />
              <InfoPanel label="Vocabulary" value={`${overview.growth.word_vocabulary} words`} />
              <InfoPanel label="Dataset Classes" value={String(overview.growth.dataset_classes)} />
              <InfoPanel
                label="Inference Policy"
                value={overview.model.mirror_tta_enabled ? 'Mirror TTA enabled' : 'Single pass'}
              />
            </div>
          ) : (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              {Array.from({ length: 10 }).map((_, index) => (
                <Card key={index} className="rounded-[22px] border-outline-variant/10 bg-surface-container p-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-3 h-4 w-40" />
                </Card>
              ))}
            </div>
          )}
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Role Distribution</CardTitle>
              <CardDescription>Current mix of accounts using the platform.</CardDescription>
            </div>
            <Users className="size-5 text-secondary" />
          </div>
          <div className="mt-6 space-y-3">
            {overview ? (
              overview.role_distribution.map((item) => (
                <RowMeter
                  key={item.role}
                  label={item.role}
                  value={item.count}
                  percent={overview.stats.total_users > 0 ? (item.count / overview.stats.total_users) * 100 : 0}
                />
              ))
            ) : (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-[20px] border border-outline-variant/10 bg-surface-container p-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-4 h-2 w-full" />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>

      <div className="mt-8">
        <Card className="rounded-[30px] border-outline-variant/12 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Low Accuracy Labels</CardTitle>
              <CardDescription>Labels with enough graded history to flag as platform review targets.</CardDescription>
            </div>
            <AlertTriangle className="size-5 text-secondary" />
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {overview ? (
              overview.low_accuracy_labels.length ? (
                overview.low_accuracy_labels.map((item) => (
                  <div
                    key={`${item.track}-${item.label}`}
                    className="rounded-[20px] border border-outline-variant/10 bg-surface-container p-4"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-semibold text-on-surface">{item.label}</p>
                      <Badge className="border-tertiary/10 bg-tertiary/10 text-tertiary">{item.accuracy}%</Badge>
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-on-surface-variant">
                      {item.track} track • {item.attempts} graded attempts
                    </p>
                  </div>
                ))
              ) : (
                <EmptyState message="No graded weak-label signals yet." />
              )
            ) : (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="rounded-[20px] border border-outline-variant/10 bg-surface-container p-4">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="mt-3 h-3 w-36" />
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </AppShell>
  )
}

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: number | string
  icon: typeof Users
}) {
  return (
    <Card className="rounded-[26px] border-outline-variant/12 p-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</p>
        <Icon className="size-4 text-secondary" />
      </div>
      <p className="mt-4 font-headline text-3xl font-black tracking-tight text-on-surface">{value}</p>
    </Card>
  )
}

function InfoPanel({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-[22px] border border-outline-variant/10 bg-surface-container p-5">
      <p className="text-xs font-bold uppercase tracking-[0.22em] text-on-surface-variant">{label}</p>
      <p className={cn('mt-3 text-sm leading-7 text-on-surface', mono && 'font-mono text-[13px] break-all')}>{value}</p>
    </div>
  )
}

function RowMeter({ label, value, percent }: { label: string; value: number; percent: number }) {
  return (
    <div className="rounded-[20px] border border-outline-variant/10 bg-surface-container p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-semibold uppercase tracking-[0.18em] text-on-surface">{label}</p>
        <span className="text-sm text-on-surface-variant">{value}</span>
      </div>
      <div className="mt-4 h-2 rounded-full bg-surface-container-highest">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-secondary to-primary"
          style={{ width: `${Math.max(8, Math.min(percent, 100))}%` }}
        />
      </div>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-[20px] border border-dashed border-outline-variant/20 bg-surface-container p-5 text-sm leading-7 text-on-surface-variant">
      {message}
    </div>
  )
}
