import { useQuery } from '@tanstack/react-query'
import { CalendarClock, ExternalLink, Video } from 'lucide-react'
import { Link } from 'react-router-dom'

import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { buttonVariants } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { apiRequest } from '../lib/api'
import type { LessonBooking, StudentSchedule } from '../lib/types'
import { cn } from '../lib/utils'

export function StudentClassesPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['student-schedule'],
    queryFn: () => apiRequest<StudentSchedule>('/api/student/schedule'),
    refetchInterval: 30000,
  })

  const bookings = data?.bookings ?? []
  const upcoming = bookings.filter((item) => item.status === 'pending' || item.status === 'confirmed')
  const completed = bookings.filter((item) => item.status === 'completed')

  return (
    <AppShell title="My Classes" subtitle="Track your booked lessons and join the call when the class window opens.">
      {error ? (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load classes.'}
        </div>
      ) : null}

      <div className="space-y-8">
        <section className="grid gap-4 md:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-3xl" />)
          ) : (
            <>
              <ScheduleStatCard label="All Classes" value={String(data?.totals.total ?? 0)} />
              <ScheduleStatCard label="Upcoming" value={String(data?.totals.upcoming ?? 0)} />
              <ScheduleStatCard label="Confirmed" value={String(data?.totals.confirmed ?? 0)} />
              <ScheduleStatCard label="Completed" value={String(data?.totals.completed ?? 0)} />
            </>
          )}
        </section>

        <section className="grid gap-8 xl:grid-cols-[1.15fr_0.85fr]">
          <Card className="rounded-3xl p-6">
            <div className="mb-6 flex items-center gap-3">
              <CalendarClock className="size-5 text-primary" />
              <div>
                <h2 className="font-headline text-2xl font-bold text-on-surface">Upcoming Classes</h2>
                <p className="text-sm text-on-surface-variant">Confirmed sessions unlock the join button near the lesson start time.</p>
              </div>
            </div>

            <div className="space-y-4">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-36 rounded-2xl" />)
              ) : upcoming.length ? (
                upcoming.map((booking) => <StudentBookingCard key={booking.id} booking={booking} />)
              ) : (
                <EmptyState title="No classes booked yet" detail="Book a teacher from the directory to see upcoming sessions here." />
              )}
            </div>
          </Card>

          <Card className="rounded-3xl p-6">
            <h2 className="font-headline text-2xl font-bold text-on-surface">Completed</h2>
            <div className="mt-5 space-y-3">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)
              ) : completed.length ? (
                completed.slice(0, 6).map((booking) => (
                  <div key={booking.id} className="rounded-2xl border border-outline-variant/10 bg-surface-container p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold text-on-surface">{booking.teacher_name}</p>
                        <p className="mt-1 text-sm text-on-surface-variant">{formatBookingTime(booking.scheduled_at)}</p>
                      </div>
                      <Badge className="border-secondary/10 bg-secondary/10 text-secondary">{booking.status}</Badge>
                    </div>
                  </div>
                ))
              ) : (
                <EmptyState title="No completed classes" detail="Finished lessons will move here automatically." compact />
              )}
            </div>
          </Card>
        </section>
      </div>
    </AppShell>
  )
}

function StudentBookingCard({ booking }: { booking: LessonBooking }) {
  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-headline text-xl font-bold text-on-surface">{booking.teacher_name}</p>
            <StatusChip status={booking.status} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-on-surface-variant">
            <span>{formatBookingTime(booking.scheduled_at)}</span>
            <span>{booking.duration_minutes} min</span>
          </div>
          {booking.note ? <p className="text-sm leading-7 text-on-surface-variant">{booking.note}</p> : null}
          {booking.status === 'confirmed' && !booking.can_join && booking.join_starts_at ? (
            <p className="text-sm text-on-surface-variant">Join opens {formatRelativeWindow(booking.join_starts_at)}.</p>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            to={`/app/classes/${booking.id}`}
            className={cn(buttonVariants({ variant: booking.can_join ? 'default' : 'secondary' }), 'rounded-full')}
          >
            {booking.can_join ? <Video className="size-4" /> : <ExternalLink className="size-4" />}
            {booking.can_join ? 'Join Class' : 'Open Class'}
          </Link>
        </div>
      </div>
    </div>
  )
}

function ScheduleStatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-3xl p-5">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</p>
      <p className="mt-4 font-headline text-4xl font-bold text-on-surface">{value}</p>
    </Card>
  )
}

function StatusChip({ status }: { status: string }) {
  const className =
    status === 'pending'
      ? 'border-tertiary/10 bg-tertiary/10 text-tertiary'
      : status === 'confirmed'
        ? 'border-secondary/10 bg-secondary/10 text-secondary'
        : status === 'completed'
          ? 'border-primary/10 bg-primary/10 text-primary'
          : 'border-outline-variant/20 bg-surface-container-high text-on-surface-variant'

  return <Badge className={className}>{status}</Badge>
}

function EmptyState({ title, detail, compact = false }: { title: string; detail: string; compact?: boolean }) {
  return (
    <div className={`rounded-2xl border border-dashed border-outline-variant/20 bg-surface-container text-center ${compact ? 'p-5' : 'p-8'}`}>
      <p className="font-headline text-xl font-bold text-on-surface">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-on-surface-variant">{detail}</p>
    </div>
  )
}

function formatBookingTime(value: string) {
  return new Date(value).toLocaleString()
}

function formatRelativeWindow(value: string) {
  const date = new Date(value)
  return date.toLocaleString()
}
