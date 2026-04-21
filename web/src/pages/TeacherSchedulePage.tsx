import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarClock, CheckCircle2, XCircle } from 'lucide-react'

import { TeacherShell } from '../components/teacher/TeacherShell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { apiRequest } from '../lib/api'
import type { LessonBooking, LessonBookingStatus, TeacherSchedule } from '../lib/types'

export function TeacherSchedulePage() {
  const queryClient = useQueryClient()
  const { data, isLoading, error } = useQuery({
    queryKey: ['teacher-schedule'],
    queryFn: () => apiRequest<TeacherSchedule>('/api/teacher/schedule'),
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
        <div className="mb-6 rounded-2xl border border-[#f2c9c6] bg-[#fff1f0] px-4 py-3 text-sm text-[#b2433b]">
          {error instanceof Error ? error.message : 'Failed to load teacher schedule.'}
        </div>
      ) : null}

      <div className="space-y-8">
        <section className="grid gap-4 md:grid-cols-4">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-[24px]" />)
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
          <Card className="rounded-[26px] border border-white/70 bg-white p-6 shadow-[0_20px_40px_rgba(0,6,102,0.06)]">
            <div className="mb-6 flex items-center gap-3">
              <CalendarClock className="size-5 text-[#000666]" />
              <div>
                <h2 className="font-['Plus_Jakarta_Sans'] text-2xl font-bold text-[#000666]">Upcoming Sessions</h2>
                <p className="text-sm text-[#6a7083]">Accept requests and move confirmed sessions through completion.</p>
              </div>
            </div>

            <div className="space-y-4">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-[22px]" />)
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
            <Card className="rounded-[26px] border border-white/70 bg-white p-6 shadow-[0_20px_40px_rgba(0,6,102,0.06)]">
              <h2 className="font-['Plus_Jakarta_Sans'] text-2xl font-bold text-[#000666]">Completed</h2>
              <div className="mt-5 space-y-3">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-[20px]" />)
                ) : completed.length ? (
                  completed.slice(0, 5).map((booking) => <CompactBookingRow key={booking.id} booking={booking} tone="completed" />)
                ) : (
                  <EmptyScheduleState title="No completed sessions" description="Mark lessons complete after you finish them." compact />
                )}
              </div>
            </Card>

            <Card className="rounded-[26px] border border-white/70 bg-white p-6 shadow-[0_20px_40px_rgba(0,6,102,0.06)]">
              <h2 className="font-['Plus_Jakarta_Sans'] text-2xl font-bold text-[#000666]">Cancelled / Declined</h2>
              <div className="mt-5 space-y-3">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-20 rounded-[20px]" />)
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
    <div className="rounded-[22px] bg-[#fbfbfe] p-5 ring-1 ring-[#edf0f5]">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-['Plus_Jakarta_Sans'] text-xl font-bold text-[#191c1e]">{booking.student_name}</p>
            <StatusChip status={booking.status} />
          </div>
          <div className="flex flex-wrap items-center gap-4 text-sm text-[#5f6781]">
            <span>{when.toLocaleString()}</span>
            <span>{booking.duration_minutes} min</span>
            <span>{booking.student_email}</span>
          </div>
          {booking.note ? <p className="text-sm leading-7 text-[#6a7083]">{booking.note}</p> : null}
        </div>

        <div className="flex flex-wrap gap-3">
          {booking.status === 'pending' ? (
            <>
              <Button
                className="rounded-full bg-[#a8eef3] px-5 text-[#1b6d71] shadow-none hover:bg-[#95e5ec]"
                disabled={isWorking}
                onClick={() => onStatusChange('confirmed')}
              >
                <CheckCircle2 className="size-4" />
                {isWorking ? 'Saving...' : 'Accept'}
              </Button>
              <Button
                variant="secondary"
                className="rounded-full border-0 bg-[#eef0f4] px-5 text-[#55648e] hover:bg-[#e6e9ef]"
                disabled={isWorking}
                onClick={() => onStatusChange('declined')}
              >
                <XCircle className="size-4" />
                Decline
              </Button>
            </>
          ) : booking.status === 'confirmed' ? (
            <>
              <Button
                className="rounded-full bg-[linear-gradient(135deg,#000666,#1a237e)] px-5 text-white hover:brightness-110"
                disabled={isWorking}
                onClick={() => onStatusChange('completed')}
              >
                <CheckCircle2 className="size-4" />
                Mark Completed
              </Button>
              <Button
                variant="secondary"
                className="rounded-full border-0 bg-[#eef0f4] px-5 text-[#55648e] hover:bg-[#e6e9ef]"
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
    <div className="rounded-[20px] bg-[#fbfbfe] p-4 ring-1 ring-[#edf0f5]">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold text-[#191c1e]">{booking.student_name}</p>
          <p className="mt-1 text-sm text-[#6a7083]">{new Date(booking.scheduled_at).toLocaleString()}</p>
        </div>
        <Badge className={tone === 'completed' ? 'border-0 bg-[#e6f6ef] text-[#14696d]' : 'border-0 bg-[#f3ece7] text-[#7b4b2a]'}>
          {booking.status}
        </Badge>
      </div>
    </div>
  )
}

function ScheduleStatCard({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-[24px] border border-white/70 bg-white p-5 shadow-[0_20px_40px_rgba(0,6,102,0.06)]">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#767683]">{label}</p>
      <p className="mt-4 font-['Plus_Jakarta_Sans'] text-4xl font-bold text-[#000666]">{value}</p>
    </Card>
  )
}

function StatusChip({ status }: { status: string }) {
  const className =
    status === 'pending'
      ? 'border-0 bg-[#f3ece7] text-[#7b4b2a]'
      : status === 'confirmed'
        ? 'border-0 bg-[#e6f6ef] text-[#14696d]'
        : status === 'completed'
          ? 'border-0 bg-[#eff2fb] text-[#000666]'
          : 'border-0 bg-[#eef0f4] text-[#55648e]'

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
    <div className={`rounded-[20px] border border-dashed border-[#dbe0ec] bg-[#fbfbfe] text-center ${compact ? 'p-5' : 'p-8'}`}>
      <p className="font-['Plus_Jakarta_Sans'] text-xl font-bold text-[#000666]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[#64739e]">{description}</p>
    </div>
  )
}
