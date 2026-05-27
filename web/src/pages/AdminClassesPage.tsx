import { useQuery } from '@tanstack/react-query'
import { CalendarDays, Clock3, School } from 'lucide-react'

import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { apiRequest } from '../lib/api'
import type { AdminClassesResponse } from '../lib/types'

export function AdminClassesPage() {
  const { data, error } = useQuery({
    queryKey: ['admin-classes'],
    queryFn: () => apiRequest<AdminClassesResponse>('/api/admin/classes'),
  })

  return (
    <AppShell title="Classes" subtitle="Review lesson bookings across teachers and students from one admin view.">
      {error ? (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load classes.'}
        </div>
      ) : null}

      <Card className="rounded-[30px] border-outline-variant/12 p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Class Bookings</CardTitle>
            <CardDescription>System-wide booking schedule and pairing details.</CardDescription>
          </div>
          <School className="size-5 text-secondary" />
        </div>

        <div className="mt-6 space-y-4">
          {data ? (
            data.classes.length ? (
              data.classes.map((item) => (
                <div key={item.id} className="rounded-[20px] border border-outline-variant/10 bg-surface-container p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-semibold text-on-surface">{item.teacher_name}</p>
                        <span className="text-on-surface-variant">→</span>
                        <p className="font-semibold text-on-surface">{item.student_name}</p>
                        <Badge className={statusBadgeClass(item.status)}>{item.status}</Badge>
                      </div>
                      <p className="mt-2 text-sm text-on-surface-variant">
                        Teacher: {item.teacher_email}
                      </p>
                      <p className="mt-1 text-sm text-on-surface-variant">
                        Student: {item.student_email}
                      </p>
                      {item.note ? <p className="mt-3 text-sm leading-7 text-on-surface-variant">{item.note}</p> : null}
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <Badge className="border-outline-variant/15 bg-background/45 text-on-surface-variant">
                        <CalendarDays className="mr-1 size-3" />
                        {formatDate(item.scheduled_at)}
                      </Badge>
                      <Badge className="border-outline-variant/15 bg-background/45 text-on-surface-variant">
                        <Clock3 className="mr-1 size-3" />
                        {item.duration_minutes} min
                      </Badge>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-[20px] border border-dashed border-outline-variant/20 bg-surface-container p-5 text-sm leading-7 text-on-surface-variant">
                No classes or bookings found yet.
              </div>
            )
          ) : (
            Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-32 rounded-[20px]" />)
          )}
        </div>
      </Card>
    </AppShell>
  )
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function statusBadgeClass(status: string) {
  if (status === 'confirmed' || status === 'completed') {
    return 'border-secondary/10 bg-secondary/10 text-secondary'
  }
  if (status === 'pending') {
    return 'border-tertiary/10 bg-tertiary/10 text-tertiary'
  }
  return 'border-outline-variant/15 bg-background/45 text-on-surface-variant'
}
