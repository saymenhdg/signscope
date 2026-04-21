import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Bell,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Mail,
  Star,
  Users,
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

import { TeacherShell } from '../components/teacher/TeacherShell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { apiRequest } from '../lib/api'
import type { LessonBooking, LessonBookingStatus, TeacherDashboard, TeacherNotifications } from '../lib/types'
import { cn } from '../lib/utils'

export function TeacherDashboardPage() {
  const queryClient = useQueryClient()
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const notificationsRef = useRef<HTMLDivElement | null>(null)
  const { data, isLoading, error } = useQuery({
    queryKey: ['teacher-dashboard'],
    queryFn: () => apiRequest<TeacherDashboard>('/api/teacher/dashboard'),
  })
  const { data: notifications } = useQuery({
    queryKey: ['teacher-notifications'],
    queryFn: () => apiRequest<TeacherNotifications>('/api/teacher/notifications'),
  })

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (!notificationsRef.current?.contains(event.target as Node)) {
        setNotificationsOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const bookingMutation = useMutation({
    mutationFn: ({ bookingId, status }: { bookingId: number; status: LessonBookingStatus }) =>
      apiRequest<LessonBooking>(`/api/teacher/bookings/${bookingId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teacher-dashboard'] })
      await queryClient.invalidateQueries({ queryKey: ['teacher-notifications'] })
    },
  })

  const bookings = data?.booking_requests ?? []
  const pendingCount = bookings.filter((booking) => booking.status === 'pending').length
  const confirmedBookings = bookings.filter((booking) => booking.status === 'confirmed' || booking.status === 'completed')
  const weeklyEarnings = estimateWeeklyEarnings(confirmedBookings, data?.profile_card?.hourly_rate_usd ?? null)
  const scheduleItems = bookings.slice(0, 3)
  const displayName = data?.profile_card?.display_name?.split(' ')[0] ?? 'Sarah'

  return (
    <TeacherShell>
      <div className="text-[#111c4e]">
        {error ? (
          <div className="mb-6 rounded-2xl border border-[#e4b6b3] bg-[#fff0ef] px-4 py-3 text-sm text-[#a33d38]">
            {error instanceof Error ? error.message : 'Failed to load teacher dashboard.'}
          </div>
        ) : null}

        <div className="mb-8 flex items-start justify-between gap-4">
          <div>
            <h1 className="font-['Plus_Jakarta_Sans'] text-4xl font-extrabold tracking-tight text-[#000666] sm:text-5xl">
              Welcome back, {displayName}
            </h1>
            <p className="mt-2 text-sm text-[#42507f]">Here&apos;s your teaching overview for today.</p>
          </div>
          <div className="relative" ref={notificationsRef}>
            <button
              type="button"
              onClick={() => setNotificationsOpen((current) => !current)}
              className="relative flex size-14 items-center justify-center rounded-full bg-white text-[#081a82] shadow-[0_12px_30px_rgba(12,28,104,0.08)]"
            >
              <Bell className="size-5" />
              {(notifications?.unread_count ?? 0) > 0 ? (
                <>
                  <span className="absolute right-4 top-4 size-2 rounded-full bg-[#d63b2f]" />
                  <span className="absolute -right-1 -top-1 flex min-w-6 items-center justify-center rounded-full bg-[#000666] px-1.5 py-1 text-[10px] font-bold text-white">
                    {notifications!.unread_count}
                  </span>
                </>
              ) : null}
            </button>

            {notificationsOpen ? (
              <div className="absolute right-0 top-16 z-20 w-[22rem] rounded-[24px] border border-white/70 bg-white p-4 shadow-[0_24px_50px_rgba(12,28,104,0.14)]">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <p className="font-['Plus_Jakarta_Sans'] text-xl font-bold text-[#000666]">Notifications</p>
                    <p className="text-sm text-[#6a7083]">{notifications?.unread_count ?? 0} active alerts</p>
                  </div>
                </div>

                <div className="max-h-[24rem] space-y-3 overflow-y-auto">
                  {notifications?.items.length ? (
                    notifications.items.map((item) => (
                      <Link
                        key={item.id}
                        to={item.action_path}
                        onClick={() => setNotificationsOpen(false)}
                        className="block rounded-[18px] bg-[#fbfbfe] p-4 ring-1 ring-[#edf0f5] transition-colors hover:bg-[#f3f6fd]"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-semibold text-[#191c1e]">{item.title}</p>
                            <p className="mt-1 line-clamp-2 text-sm text-[#6a7083]">{item.detail}</p>
                            <p className="mt-2 text-xs text-[#767683]">{new Date(item.created_at).toLocaleString()}</p>
                          </div>
                          <Badge className="border-0 bg-[#eff2fb] text-[#000666]">{item.count}</Badge>
                        </div>
                      </Link>
                    ))
                  ) : (
                    <div className="rounded-[18px] border border-dashed border-[#dbe0ec] bg-[#fbfbfe] p-5 text-center">
                      <p className="font-['Plus_Jakarta_Sans'] text-lg font-bold text-[#000666]">You&apos;re all caught up</p>
                      <p className="mt-2 text-sm text-[#6a7083]">New booking requests and unread messages will appear here.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.9fr_0.9fr]">
          <div className="space-y-6">
            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="font-['Plus_Jakarta_Sans'] text-[2rem] font-bold text-[#000666]">Today&apos;s Schedule</h2>
                <Link to="/app/teacher/settings" className="text-sm font-semibold text-[#081a82]/70 hover:text-[#081a82]">
                  Profile Setup
                </Link>
              </div>

              <Card className="rounded-[26px] border border-white/60 bg-white p-3 shadow-[0_18px_40px_rgba(12,28,104,0.08)]">
                <div className="space-y-3">
                  {isLoading ? (
                    Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-24 rounded-[20px]" />)
                  ) : scheduleItems.length ? (
                    scheduleItems.map((booking, index) => (
                      <ScheduleRow
                        key={booking.id}
                        booking={booking}
                        isPrimary={index === 0}
                        isWorking={bookingMutation.isPending && bookingMutation.variables?.bookingId === booking.id}
                        onAccept={() => bookingMutation.mutate({ bookingId: booking.id, status: 'confirmed' })}
                        onDecline={() => bookingMutation.mutate({ bookingId: booking.id, status: 'declined' })}
                      />
                    ))
                  ) : (
                    <EmptyPanel
                      title="No classes scheduled yet"
                      description="New bookings will appear here as students start requesting sessions."
                    />
                  )}
                </div>
              </Card>
            </section>

            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="font-['Plus_Jakarta_Sans'] text-[2rem] font-bold text-[#000666]">Weekly Earnings</h2>
                <Badge className="border-0 bg-[#a8eef3] px-4 py-1 text-[11px] font-bold uppercase tracking-[0.08em] text-[#1b6d71]">
                  +12% vs last week
                </Badge>
              </div>

              <Card className="rounded-[26px] border border-white/60 bg-white p-6 shadow-[0_18px_40px_rgba(12,28,104,0.08)]">
                {isLoading ? (
                  <Skeleton className="h-56 rounded-[20px]" />
                ) : (
                  <div>
                    <p className="font-['Plus_Jakarta_Sans'] text-5xl font-bold tracking-tight text-[#000666]">{weeklyEarnings}</p>
                    <p className="mt-2 text-sm text-[#61709f]">Total this week</p>

                    <div className="mt-8 flex h-48 items-end gap-4">
                      {buildEarningsBars(confirmedBookings.length).map((bar, index) => (
                        <div key={index} className="flex flex-1 flex-col items-center gap-3">
                          <div
                            className={cn(
                              'w-full rounded-t-[4px] transition-all',
                              bar.active ? 'bg-[#101585] shadow-[0_8px_18px_rgba(16,21,133,0.24)]' : 'bg-[#edf0f6]',
                            )}
                            style={{ height: `${bar.height}%` }}
                          />
                          <span
                            className={cn(
                              'text-xs font-medium',
                              bar.active ? 'text-[#081a82]' : 'text-[#64739e]',
                            )}
                          >
                            {bar.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            </section>
          </div>

          <aside className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              {isLoading ? (
                <>
                  <Skeleton className="h-36 rounded-[24px]" />
                  <Skeleton className="h-36 rounded-[24px]" />
                </>
              ) : (
                <>
                  <MiniStatCard icon={Star} value="4.9" label="Teacher Rating" />
                  <MiniStatCard
                    icon={Clock3}
                    value={String(data?.stats.completed_lessons ?? 0)}
                    label="Hours Taught"
                  />
                </>
              )}
            </div>

            <Card className="rounded-[26px] border border-white/60 bg-white p-5 shadow-[0_18px_40px_rgba(12,28,104,0.08)]">
              <div className="mb-5 flex items-center justify-between gap-4">
                <h2 className="font-['Plus_Jakarta_Sans'] text-[2rem] font-bold text-[#000666]">Student Requests</h2>
                <div className="flex size-7 items-center justify-center rounded-full bg-[#44200b] text-xs font-bold text-white">
                  {pendingCount}
                </div>
              </div>

              <div className="space-y-4">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-[22px]" />)
                ) : bookings.length ? (
                  bookings.slice(0, 3).map((booking) => (
                    <RequestCard
                      key={booking.id}
                      booking={booking}
                      isWorking={bookingMutation.isPending && bookingMutation.variables?.bookingId === booking.id}
                      onAccept={() => bookingMutation.mutate({ bookingId: booking.id, status: 'confirmed' })}
                      onDecline={() => bookingMutation.mutate({ bookingId: booking.id, status: 'declined' })}
                      onComplete={() => bookingMutation.mutate({ bookingId: booking.id, status: 'completed' })}
                    />
                  ))
                ) : (
                  <EmptyPanel
                    title="No requests yet"
                    description="Incoming student requests will appear in this panel."
                    compact
                  />
                )}
              </div>
            </Card>
          </aside>
        </div>
      </div>
    </TeacherShell>
  )
}

function ScheduleRow({
  booking,
  isPrimary,
  isWorking,
  onAccept,
  onDecline,
}: {
  booking: LessonBooking
  isPrimary: boolean
  isWorking: boolean
  onAccept: () => void
  onDecline: () => void
}) {
  const date = new Date(booking.scheduled_at)
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  const meridiem = date.toLocaleTimeString([], { hour: '2-digit', hour12: true }).includes('PM') ? 'PM' : 'AM'

  return (
    <div
      className={cn(
        'flex flex-col gap-4 rounded-[20px] px-4 py-5 sm:flex-row sm:items-center',
        isPrimary ? 'bg-[#f4f6fa] ring-1 ring-[#edf0f5]' : 'bg-transparent hover:bg-[#f7f8fc]',
      )}
    >
      <div className={cn('hidden w-1 self-stretch rounded-full sm:block', isPrimary ? 'bg-[#53c8da]' : 'bg-transparent')} />
      <div className="w-20 shrink-0">
        <p className="font-['Plus_Jakarta_Sans'] text-3xl font-bold tracking-tight text-[#000666]">{time}</p>
        <p className="mt-1 text-xs font-bold uppercase tracking-[0.18em] text-[#61709f]">{meridiem}</p>
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate font-['Plus_Jakarta_Sans'] text-[1.45rem] font-bold text-[#191c1e]">
          {booking.status === 'pending' ? 'ASL Trial Session' : 'Confirmed Lesson'}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-4 text-sm text-[#5e6d9a]">
          <span className="inline-flex items-center gap-2">
            <Users className="size-4 text-[#081a82]" />
            {booking.student_name}
          </span>
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="size-4 text-[#081a82]" />
            {booking.duration_minutes} Minutes
          </span>
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        {booking.status === 'pending' ? (
          <>
            <Button
              className="min-w-28 rounded-full bg-[#eef0f6] px-5 py-2 text-sm font-semibold text-[#081a82] shadow-none hover:bg-[#dff8fb]"
              onClick={onAccept}
              disabled={isWorking}
            >
              {isWorking ? 'Saving...' : 'Join Room'}
            </Button>
            <Button
              variant="secondary"
              className="min-w-24 rounded-full border-0 bg-[#eef0f6] px-5 py-2 text-sm font-semibold text-[#081a82] hover:bg-[#eceff7]"
              onClick={onDecline}
              disabled={isWorking}
            >
              Decline
            </Button>
          </>
        ) : (
          <Badge className="border-0 bg-[#eef0f6] px-5 py-2 text-sm font-semibold capitalize text-[#081a82]">
            {booking.status}
          </Badge>
        )}
      </div>
    </div>
  )
}

function RequestCard({
  booking,
  isWorking,
  onAccept,
  onDecline,
  onComplete,
}: {
  booking: LessonBooking
  isWorking: boolean
  onAccept: () => void
  onDecline: () => void
  onComplete: () => void
}) {
  const initials = booking.student_name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <div className="rounded-[22px] bg-[#fbfbfe] p-4 ring-1 ring-[#edf0f5]">
      <div className="flex items-start gap-3">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[#e7ebf6] font-headline text-sm font-black text-[#081a82]">
          {initials}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-[#18255f]">{booking.student_name}</p>
          <p className="mt-1 text-xs text-[#64739e]">
            {booking.status === 'pending'
              ? 'Wants 1-on-1 Mentoring'
              : booking.status === 'confirmed'
                ? 'Confirmed lesson'
                : booking.status === 'completed'
                  ? 'Completed lesson'
                  : booking.status}
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-[#64739e]">
            <Mail className="size-3.5 text-[#081a82]" />
            <span className="truncate">{booking.student_email}</span>
          </div>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        {booking.status === 'pending' ? (
          <>
            <button
              onClick={onAccept}
              disabled={isWorking}
              className="flex-1 rounded-full bg-[#a8eef3] px-4 py-2 text-sm font-semibold text-[#1b6d71] transition-colors hover:bg-[#95e5ec] disabled:opacity-60"
            >
              Accept
            </button>
            <button
              onClick={onDecline}
              disabled={isWorking}
              className="flex-1 rounded-full bg-[#eef0f4] px-4 py-2 text-sm font-semibold text-[#55648e] transition-colors hover:bg-[#e6e9ef] disabled:opacity-60"
            >
              Decline
            </button>
          </>
        ) : booking.status === 'confirmed' ? (
          <button
            onClick={onComplete}
            disabled={isWorking}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-[#eef0f4] px-4 py-2 text-sm font-semibold text-[#081a82] transition-colors hover:bg-[#e6e9ef] disabled:opacity-60"
          >
            <CheckCircle2 className="size-4" />
            Mark Completed
          </button>
        ) : (
          <div className="flex w-full items-center justify-center rounded-full bg-[#eef0f4] px-4 py-2 text-sm font-semibold capitalize text-[#55648e]">
            {booking.status}
          </div>
        )}
      </div>
    </div>
  )
}

function MiniStatCard({
  icon: Icon,
  value,
  label,
}: {
  icon: typeof Star
  value: string
  label: string
}) {
  return (
    <Card className="rounded-[24px] border border-white/60 bg-white p-5 shadow-[0_18px_40px_rgba(12,28,104,0.08)]">
      <Icon className="size-5 text-[#081a82]" />
      <p className="mt-6 font-['Plus_Jakarta_Sans'] text-5xl font-bold tracking-tight text-[#000666]">{value}</p>
      <p className="mt-2 text-sm text-[#5f6d99]">{label}</p>
    </Card>
  )
}

function EmptyPanel({
  title,
  description,
  compact = false,
}: {
  title: string
  description: string
  compact?: boolean
}) {
  return (
    <div className={cn('rounded-[20px] border border-dashed border-[#dbe0ec] bg-[#fbfbfe] text-center', compact ? 'p-5' : 'p-8')}>
      <p className="font-['Plus_Jakarta_Sans'] text-xl font-bold text-[#000666]">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm leading-7 text-[#64739e]">{description}</p>
    </div>
  )
}

function estimateWeeklyEarnings(bookings: LessonBooking[], hourlyRateUsd: number | null) {
  if (!hourlyRateUsd) {
    return '$0.00'
  }
  const total = bookings.reduce((sum, booking) => sum + (hourlyRateUsd * booking.duration_minutes) / 60, 0)
  return `$${total.toFixed(2)}`
}

function buildEarningsBars(volume: number) {
  const base = [38, 52, 28, 66, 44, 22, 34]
  return [
    { label: 'Mon', height: base[0], active: false },
    { label: 'Tue', height: base[1], active: false },
    { label: 'Wed', height: base[2], active: false },
    { label: 'Thu', height: Math.max(base[3], 32 + volume * 6), active: true },
    { label: 'Fri', height: base[4], active: false },
    { label: 'Sat', height: base[5], active: false },
    { label: 'Sun', height: base[6], active: false },
  ]
}
