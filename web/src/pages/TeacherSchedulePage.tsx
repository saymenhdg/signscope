import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CheckCircle2, ExternalLink, Video, XCircle } from 'lucide-react'
import { Link } from 'react-router-dom'

import { TeacherShell } from '../components/teacher/TeacherShell'
import { Badge } from '../components/ui/badge'
import { Button, buttonVariants } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { apiRequest } from '../lib/api'
import type { LessonBooking, LessonBookingStatus, TeacherSchedule } from '../lib/types'
import { cn } from '../lib/utils'

export function TeacherSchedulePage() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['teacher-schedule'],
    queryFn: () => apiRequest<TeacherSchedule>('/api/teacher/schedule'),
    refetchInterval: 30000,
  })

  const bookingMutation = useMutation({
    mutationFn: ({ bookingId, status }: { bookingId: number; status: LessonBookingStatus }) =>
      apiRequest<LessonBooking>(`/api/teacher/bookings/${bookingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teacher-schedule'] })
      await queryClient.invalidateQueries({ queryKey: ['teacher-dashboard'] })
      await queryClient.invalidateQueries({ queryKey: ['teacher-notifications'] })
    },
  })

  const bookings = data?.bookings ?? []
  const upcoming = bookings.filter((item) => item.status === 'pending' || item.status === 'confirmed')
  const completed = bookings.filter((item) => item.status === 'completed')
  const cancelled = bookings.filter((item) => item.status === 'declined' || item.status === 'cancelled')

  return (
    <TeacherShell title="Schedule" subtitle="Review lesson requests, upcoming sessions, and completed classes.">
      {error ? (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load teacher schedule.'}
        </div>
      ) : null}

      <div className="space-y-8">
        <section className="grid gap-4 md:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-3xl" />)
          ) : (
            <>
              <ScheduleStatCard label="All Sessions" value={String(data?.totals.total ?? 0)} />
              <ScheduleStatCard label="Upcoming" value={String(data?.totals.upcoming ?? 0)} />
              <ScheduleStatCard label="Completed" value={String(data?.totals.completed ?? 0)} />
              <ScheduleStatCard label="Cancelled" value={String(data?.totals.cancelled ?? 0)} />
            </>
          )}
        </section>

        <section className="grid gap-8 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-3xl p-6">
            <div className="mb-6 flex items-center gap-3">
              <CalendarClock className="size-5 text-primary" />
              <div>
                <h2 className="font-headline text-2xl font-bold text-on-surface">Upcoming Sessions</h2>
                <p className="text-sm text-on-surface-variant">Accept requests and move confirmed sessions through completion.</p>
              </div>
            </div>

            <div className="space-y-4">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-2xl" />)
              ) : upcoming.length ? (
                upcoming.map((booking) => (
                  <ScheduleBookingCard
                    key={booking.id}
                    booking={booking}
                    isWorking={bookingMutation.isPending && bookingMutation.variables?.bookingId === booking.id}
                    onStatusChange={(status) => bookingMutation.mutate({ bookingId: booking.id, status })}
                  />
                ))
              ) : (
                <EmptyScheduleState title="No upcoming sessions" description="Accepted bookings and new requests will appear here." />
              )}
            </div>
          </Card>

          <div className="space-y-8">
            <Card className="rounded-3xl p-6">
              <h2 className="font-headline text-2xl font-bold text-on-surface">Completed</h2>
              <div className="mt-5 space-y-3">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)
                ) : completed.length ? (
                  completed.slice(0, 5).map((booking) => <CompactBookingRow key={booking.id} booking={booking} tone="completed" />)
                ) : (
                  <EmptyScheduleState title="No completed sessions" description="Mark lessons complete after you finish them." compact />
                )}
              </div>
            </Card>

            <Card className="rounded-3xl p-6">
              <h2 className="font-headline text-2xl font-bold text-on-surface">Cancelled / Declined</h2>
              <div className="mt-5 space-y-3">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-2xl" />)
                ) : cancelled.length ? (
                  cancelled.slice(0, 5).map((booking) => <CompactBookingRow key={booking.id} booking={booking} tone="cancelled" />)
                ) : (
                  <EmptyScheduleState title="No cancelled sessions" description="Declined requests and cancelled lessons will show here." compact />
                )}
              </div>
            </Card>
          </div>
        </section>
      </div>
    </TeacherShell>
  )
}

function ScheduleBookingCard({
  booking,
  isWorking,
  onStatusChange,
}: {
  booking: LessonBooking
  isWorking: boolean
  onStatusChange: (status: LessonBookingStatus) => void
}) {
  const when = new Date(booking.scheduled_at)
  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container p-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-headline text-xl font-bold text-on-surface">{booking.student_name}</p>
            <StatusChip status={booking.status} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-on-surface-variant">
            <span>{when.toLocaleString()}</span>
            <span>{booking.duration_minutes} min</span>
            <span>{booking.student_email}</span>
          </div>
          {booking.status === 'confirmed' && !booking.can_join && booking.join_starts_at ? (
            <p className="text-sm text-on-surface-variant">Join opens {new Date(booking.join_starts_at).toLocaleString()}.</p>
          ) : null}
          {booking.note ? <p className="text-sm leading-7 text-on-surface-variant">{booking.note}</p> : null}
        </div>

        <div className="flex flex-wrap gap-3">
          {booking.status === 'pending' ? (
            <>
              <Button
                disabled={isWorking}
                onClick={() => onStatusChange('confirmed')}
                className="rounded-full"
              >
                <CheckCircle2 className="size-4" />
                {isWorking ? 'Saving…' : 'Accept'}
              </Button>
              <Button
                variant="secondary"
                className="rounded-full"
                disabled={isWorking}
                onClick={() => onStatusChange('declined')}
              >
                <XCircle className="size-4" />
                Decline
              </Button>
            </>
          ) : booking.status === 'confirmed' ? (
            <>
              <Link
                to={`/app/teacher/schedule/${booking.id}`}
                className={cn(buttonVariants({ variant: booking.can_join ? 'default' : 'secondary' }), 'rounded-full')}
              >
                {booking.can_join ? <Video className="size-4" /> : <ExternalLink className="size-4" />}
                {booking.can_join ? 'Join Class' : 'Open Class'}
              </Link>
              <Button
                className="rounded-full"
                disabled={isWorking}
                onClick={() => onStatusChange('completed')}
              >
                <CheckCircle2 className="size-4" />
                Mark Completed
              </Button>
              <Button
                variant="secondary"
                className="rounded-full"
                disabled={isWorking}
                onClick={() => onStatusChange('cancelled')}
              >
                Cancel
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function CompactBookingRow({ booking, tone }: { booking: LessonBooking; tone: 'completed' | 'cancelled' }) {
  return (
    <div className="rounded-2xl border border-outline-variant/10 bg-surface-container p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-on-surface">{booking.student_name}</p>
          <p className="mt-1 text-sm text-on-surface-variant">{new Date(booking.scheduled_at).toLocaleString()}</p>
        </div>
        <Badge className={tone === 'completed' ? 'border-secondary/10 bg-secondary/10 text-secondary' : 'border-tertiary/10 bg-tertiary/10 text-tertiary'}>
          {booking.status}
        </Badge>
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

function EmptyScheduleState({
  title,
  description,
  compact = false,
}: {
  title: string
  description: string
  compact?: boolean
}) {
  return (
    <div className={cn('rounded-2xl border border-dashed border-outline-variant/20 bg-surface-container text-center', compact ? 'p-5' : 'p-8')}>
      <p className="font-headline text-xl font-bold text-on-surface">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-on-surface-variant">{description}</p>
    </div>
  )
}
