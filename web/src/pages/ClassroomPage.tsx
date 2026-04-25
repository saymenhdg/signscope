import { useQuery } from '@tanstack/react-query'
import { ExternalLink, ShieldAlert, Video } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'

import { AppShell } from '../components/app-shell'
import { TeacherShell } from '../components/teacher/TeacherShell'
import { Badge } from '../components/ui/badge'
import { buttonVariants } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { apiRequest } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { ClassSession } from '../lib/types'
import { cn } from '../lib/utils'

export function ClassroomPage() {
  const { bookingId } = useParams()
  const { user } = useAuth()

  const { data, isLoading, error } = useQuery({
    queryKey: ['class-session', bookingId],
    queryFn: () => apiRequest<ClassSession>(`/api/classes/${bookingId}`),
    enabled: Boolean(bookingId),
    refetchInterval: 15000,
  })

  const booking = data?.booking
  const isTeacher = user?.role === 'teacher'
  const title = booking
    ? isTeacher ? `Class with ${booking.student_name}` : `${booking.teacher_name} class`
    : 'Classroom'
  const subtitle = booking
    ? `Scheduled for ${new Date(booking.scheduled_at).toLocaleString()}`
    : 'Loading class session'

  const Shell = isTeacher ? TeacherShell : AppShell

  return (
    <Shell title={title} subtitle={subtitle}>
      {error ? (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load class.'}
        </div>
      ) : null}

      {isLoading ? (
        <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
          <Skeleton className="h-72 rounded-3xl" />
          <Skeleton className="h-[36rem] rounded-3xl" />
        </div>
      ) : booking ? (
        <div className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
          <Card className="rounded-3xl p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Class status</p>
                <p className="mt-3 font-headline text-3xl font-bold text-on-surface">{booking.can_join ? 'Live Now' : 'Waiting Room'}</p>
              </div>
              <Badge className={booking.can_join ? 'border-secondary/10 bg-secondary/10 text-secondary' : 'border-outline-variant/20 bg-surface-container-high text-on-surface-variant'}>
                {booking.status}
              </Badge>
            </div>

            <div className="mt-6 space-y-4 text-sm text-on-surface-variant">
              <p><span className="font-semibold text-on-surface">Teacher:</span> {booking.teacher_name}</p>
              <p><span className="font-semibold text-on-surface">Student:</span> {booking.student_name}</p>
              <p><span className="font-semibold text-on-surface">Starts:</span> {new Date(booking.scheduled_at).toLocaleString()}</p>
              <p><span className="font-semibold text-on-surface">Duration:</span> {booking.duration_minutes} minutes</p>
              {booking.join_starts_at ? <p><span className="font-semibold text-on-surface">Join opens:</span> {new Date(booking.join_starts_at).toLocaleString()}</p> : null}
              {booking.join_ends_at ? <p><span className="font-semibold text-on-surface">Join closes:</span> {new Date(booking.join_ends_at).toLocaleString()}</p> : null}
              {data.room_name ? <p><span className="font-semibold text-on-surface">Room:</span> {data.room_name}</p> : null}
            </div>

            <div className="mt-8 flex flex-wrap gap-3">
              {booking.can_join && data.join_url ? (
                <a
                  href={data.join_url}
                  target="_blank"
                  rel="noreferrer"
                  className={cn(buttonVariants({ variant: 'default' }), 'rounded-full')}
                >
                  <ExternalLink className="size-4" />
                  Open in new tab
                </a>
              ) : null}
              <Link
                to={user?.role === 'teacher' ? '/app/teacher/schedule' : '/app/classes'}
                className={cn(buttonVariants({ variant: 'secondary' }), 'rounded-full')}
              >
                Back to schedule
              </Link>
            </div>
          </Card>

          <Card className="overflow-hidden rounded-3xl p-0">
            {booking.can_join && data.join_url ? (
              <div className="h-[70vh] min-h-[34rem]">
                <iframe
                  title="Video classroom"
                  src={data.join_url}
                  className="h-full w-full border-0"
                  allow="camera; microphone; fullscreen; display-capture; autoplay"
                />
              </div>
            ) : (
              <div className="flex h-[70vh] min-h-[34rem] items-center justify-center bg-surface-container-low p-8 text-center">
                <div className="max-w-xl">
                  <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
                    {booking.status === 'confirmed' ? <ShieldAlert className="size-7" /> : <Video className="size-7" />}
                  </div>
                  <p className="mt-6 font-headline text-3xl font-bold text-on-surface">
                    {booking.status === 'confirmed' ? 'The class room is not open yet' : 'This class is not joinable'}
                  </p>
                  <p className="mt-3 text-sm leading-7 text-on-surface-variant">
                    {booking.status === 'confirmed'
                      ? 'Refreshes happen automatically. Once the class enters the join window, the video call will appear here for both teacher and student.'
                      : 'Only confirmed classes open a video room. Ask the teacher to confirm the booking first.'}
                  </p>
                </div>
              </div>
            )}
          </Card>
        </div>
      ) : null}
    </Shell>
  )
}
