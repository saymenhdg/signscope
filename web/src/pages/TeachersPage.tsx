import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Play, Search, Star, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { apiRequest } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { LessonBooking, TeacherDirectoryResponse, TeacherProfileCard } from '../lib/types'

const WEEKDAY_LABELS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const TIME_SLOT_VALUES = ['09:00', '10:30', '13:00', '15:00']

type CalendarCell = {
  isoDate: string
  day: number
  inCurrentMonth: boolean
  disabled: boolean
}

type TimeSlot = {
  value: string
  label: string
  disabled: boolean
}

export function TeachersPage() {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const initialBookableDate = useMemo(() => getNextBookableDate(new Date()), [])
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedTeacher, setSelectedTeacher] = useState<TeacherProfileCard | null>(null)
  const [selectedDate, setSelectedDate] = useState(() => formatDateInput(initialBookableDate))
  const [currentMonth, setCurrentMonth] = useState(() => startOfMonth(initialBookableDate))
  const [selectedTime, setSelectedTime] = useState('')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: ['teacher-directory'],
    queryFn: () => apiRequest<TeacherDirectoryResponse>('/api/teachers'),
  })

  const bookingMutation = useMutation({
    mutationFn: ({ teacherId, payload }: { teacherId: number; payload: { scheduled_at: string; duration_minutes: number; note: string | null } }) =>
      apiRequest<LessonBooking>(`/api/teachers/${teacherId}/bookings`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teacher-dashboard'] })
      setMessage('Booking request submitted.')
      setFormError(null)
      setSelectedTeacher(null)
      setSelectedTime('')
      setNote('')
    },
  })

  const filteredTeachers = useMemo(() => {
    const teachers = data?.teachers ?? []
    const query = searchQuery.trim().toLowerCase()

    if (!query) {
      return teachers
    }

    return teachers.filter((teacher) => {
      const haystack = [teacher.display_name, teacher.headline ?? '', teacher.intro ?? '', ...teacher.specialties].join(' ').toLowerCase()
      return haystack.includes(query)
    })
  }, [data?.teachers, searchQuery])

  const timeSlots = useMemo(() => {
    if (!selectedTeacher) {
      return []
    }
    return getTimeSlots(selectedTeacher, selectedDate)
  }, [selectedDate, selectedTeacher])

  const calendarCells = useMemo(() => getCalendarCells(currentMonth, initialBookableDate), [currentMonth, initialBookableDate])

  useEffect(() => {
    if (!selectedTeacher) {
      return
    }

    if (!timeSlots.some((slot) => !slot.disabled && slot.value === selectedTime)) {
      setSelectedTime(timeSlots.find((slot) => !slot.disabled)?.value ?? '')
    }
  }, [selectedTeacher, selectedTime, timeSlots])

  useEffect(() => {
    if (!selectedTeacher) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        closeScheduler()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedTeacher])

  function openScheduler(teacher: TeacherProfileCard) {
    const defaultDate = formatDateInput(initialBookableDate)
    setSelectedTeacher(teacher)
    setSelectedDate(defaultDate)
    setCurrentMonth(startOfMonth(initialBookableDate))
    setSelectedTime(pickDefaultTimeSlot(teacher, defaultDate))
    setNote('')
    setMessage(null)
    setFormError(null)
  }

  function closeScheduler() {
    setSelectedTeacher(null)
    setSelectedTime('')
    setFormError(null)
  }

  async function handleSubmitBooking() {
    if (!selectedTeacher) {
      return
    }

    setFormError(null)
    setMessage(null)

    try {
      if (!selectedDate || !selectedTime) {
        throw new Error('Choose a date and time first.')
      }

      await bookingMutation.mutateAsync({
        teacherId: selectedTeacher.teacher_id,
        payload: {
          scheduled_at: new Date(`${selectedDate}T${selectedTime}:00`).toISOString(),
          duration_minutes: selectedTeacher.lesson_duration_minutes,
          note: note.trim() || null,
        },
      })
    } catch (submitError) {
      setFormError(submitError instanceof Error ? submitError.message : 'Failed to submit booking.')
    }
  }

  return (
    <AppShell hideHeader>
      <div className="space-y-10">
        {(error || formError || message) ? (
          <div
            className={
              error || formError
                ? 'rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error'
                : 'rounded-2xl border border-secondary/20 bg-secondary/10 px-4 py-3 text-sm text-secondary'
            }
          >
            {error instanceof Error ? error.message : formError ?? message}
          </div>
        ) : null}

        <section className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="font-headline text-4xl font-black tracking-tight text-primary sm:text-5xl">Discover Teachers</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-on-surface-variant sm:text-lg">
              Find the perfect ASL instructor to match your learning style, goals, and schedule.
            </p>
          </div>

          <label className="relative block w-full max-w-md">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-on-surface-variant" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by name, skill, or availability..."
              className="h-14 w-full rounded-full border border-outline-variant/15 bg-surface-container-low px-12 pr-4 text-sm text-on-surface outline-none transition-all placeholder:text-on-surface-variant/70 focus:border-primary/30 focus:bg-surface-container focus:ring-2 focus:ring-primary/10"
            />
          </label>
        </section>

        <section className="grid gap-10 md:grid-cols-2 2xl:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-[31rem] rounded-[32px]" />)
            : filteredTeachers.length
              ? filteredTeachers.map((teacher) => (
                  <TeacherCard
                    key={teacher.teacher_id}
                    teacher={teacher}
                    isActive={teacher.teacher_id === selectedTeacher?.teacher_id}
                    canBook={user?.role === 'student'}
                    onSelect={() => openScheduler(teacher)}
                  />
                ))
              : (
                  <div className="col-span-full rounded-[28px] border border-dashed border-outline-variant/20 bg-surface-container-low/70 p-10 text-center">
                    <p className="font-headline text-2xl font-bold text-on-surface">No teachers matched that search</p>
                    <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-on-surface-variant">
                      Try a different name or specialty, or clear the search to browse all published teachers.
                    </p>
                  </div>
                )}
        </section>
      </div>

      {selectedTeacher ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm sm:p-6"
          onClick={closeScheduler}
        >
          <div
            className="scrollbar-none max-h-[92vh] w-full max-w-6xl overflow-y-auto rounded-[32px] border border-outline-variant/15 bg-surface-container-low/95 p-6 shadow-[0_40px_110px_rgba(4,8,20,0.6)] sm:p-8"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-8 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="font-headline text-2xl font-bold text-on-surface sm:text-3xl">
                  Schedule with {selectedTeacher.display_name}
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-on-surface-variant">
                  {selectedTeacher.headline ?? 'ASL instructor'}
                  {selectedTeacher.intro ? ` - ${selectedTeacher.intro}` : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={closeScheduler}
                className="flex size-11 items-center justify-center rounded-full border border-outline-variant/15 bg-background/40 text-on-surface-variant transition-colors hover:text-on-surface"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex flex-col gap-8 lg:flex-row">
              <div className="min-w-0 flex-1 space-y-6">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex flex-wrap gap-2">
                    {selectedTeacher.specialties.length ? (
                      selectedTeacher.specialties.slice(0, 4).map((tag) => (
                        <Badge key={tag} className="rounded-full border-outline-variant/15 bg-background/45 px-3 py-1 text-on-surface-variant">
                          {tag}
                        </Badge>
                      ))
                    ) : (
                      <Badge className="rounded-full border-outline-variant/15 bg-background/45 px-3 py-1 text-on-surface-variant">
                        General ASL
                      </Badge>
                    )}
                  </div>

                  <div className="rounded-[20px] border border-outline-variant/15 bg-background/35 px-4 py-3 text-right">
                    <p className="font-headline text-lg font-bold text-primary">
                      {getSessionPrice(selectedTeacher) ? `$${getSessionPrice(selectedTeacher)}` : 'TBD'}
                    </p>
                    <p className="text-xs text-on-surface-variant">per session</p>
                  </div>
                </div>

                <div className="rounded-[28px] border border-outline-variant/12 bg-background/35 p-5 sm:p-6">
                  <div className="mb-6 flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() - 1, 1))}
                      className="flex size-10 items-center justify-center rounded-full border border-outline-variant/15 bg-surface-container text-on-surface-variant transition-colors hover:text-on-surface"
                    >
                      <ChevronLeft className="size-4" />
                    </button>
                    <p className="font-headline text-lg font-bold text-primary">{formatMonthLabel(currentMonth)}</p>
                    <button
                      type="button"
                      onClick={() => setCurrentMonth((month) => new Date(month.getFullYear(), month.getMonth() + 1, 1))}
                      className="flex size-10 items-center justify-center rounded-full border border-outline-variant/15 bg-surface-container text-on-surface-variant transition-colors hover:text-on-surface"
                    >
                      <ChevronRight className="size-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-2 text-center text-xs font-semibold uppercase tracking-[0.14em] text-on-surface-variant">
                    {WEEKDAY_LABELS.map((label) => (
                      <span key={label} className="py-2">
                        {label}
                      </span>
                    ))}
                  </div>

                  <div className="mt-2 grid grid-cols-7 gap-2">
                    {calendarCells.map((cell) => {
                      const isSelected = cell.isoDate === selectedDate

                      return (
                        <button
                          key={cell.isoDate}
                          type="button"
                          disabled={cell.disabled}
                          onClick={() => {
                            setSelectedDate(cell.isoDate)
                            setCurrentMonth(startOfMonth(parseDateInput(cell.isoDate)))
                          }}
                          className={[
                            'aspect-square rounded-xl text-sm font-medium transition-all',
                            isSelected
                              ? 'bg-primary text-white shadow-[0_18px_30px_rgba(64,87,255,0.28)]'
                              : cell.disabled
                                ? 'cursor-not-allowed text-on-surface-variant/35'
                                : cell.inCurrentMonth
                                  ? 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                                  : 'text-on-surface-variant/55 hover:bg-surface-container-low/50',
                          ].join(' ')}
                        >
                          {cell.day}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              <div className="w-full space-y-6 lg:max-w-sm">
                <div className="rounded-[28px] border border-outline-variant/12 bg-background/35 p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Available Times</p>
                      <p className="mt-3 font-headline text-xl font-bold text-on-surface">
                        {selectedDate ? formatSelectedDate(parseDateInput(selectedDate)) : 'Choose a date'}
                      </p>
                    </div>
                    <div className="rounded-xl border border-outline-variant/15 bg-surface-container px-3 py-2">
                      <div className="flex items-center gap-1 text-sm font-semibold text-on-surface">
                        <Star className="size-4 fill-secondary text-secondary" />
                        {getTeacherRating(selectedTeacher)}
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-col gap-3">
                    {timeSlots.map((slot) => (
                      <button
                        key={slot.value}
                        type="button"
                        disabled={slot.disabled}
                        onClick={() => setSelectedTime(slot.value)}
                        className={[
                          'flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left text-sm font-semibold transition-all',
                          slot.disabled
                            ? 'cursor-not-allowed border-outline-variant/10 bg-surface-container-low text-on-surface-variant/40 line-through'
                            : slot.value === selectedTime
                              ? 'border-primary bg-primary/10 text-primary shadow-[0_16px_24px_rgba(64,87,255,0.12)]'
                              : 'border-outline-variant/15 bg-surface-container-low text-on-surface hover:border-primary/30 hover:bg-surface-container',
                        ].join(' ')}
                      >
                        <span>{slot.label}</span>
                        {slot.value === selectedTime && !slot.disabled ? <CheckCircle2 className="size-4" /> : null}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-[28px] border border-outline-variant/12 bg-background/35 p-5 sm:p-6">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Booking Summary</p>

                  <div className="mt-5 space-y-4">
                    <SummaryRow
                      icon={<CalendarDays className="size-4 text-secondary" />}
                      label="Date"
                      value={selectedDate ? formatSelectedDate(parseDateInput(selectedDate)) : 'Select a date'}
                    />
                    <SummaryRow
                      icon={<Clock3 className="size-4 text-secondary" />}
                      label="Time"
                      value={selectedTime ? formatTimeLabel(selectedTime) : 'Select a time'}
                    />
                    <SummaryRow
                      icon={<Play className="size-4 text-secondary" />}
                      label="Duration"
                      value={`${selectedTeacher.lesson_duration_minutes} minutes`}
                    />
                  </div>

                  {user?.role === 'student' ? (
                    <>
                      <label className="mt-6 grid gap-3">
                        <span className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Optional Note</span>
                        <textarea
                          value={note}
                          onChange={(event) => setNote(event.target.value)}
                          placeholder="Share what you want to practice in this session."
                          maxLength={500}
                          className="min-h-28 rounded-[22px] border border-outline-variant/20 bg-surface-container-low px-4 py-3 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-primary/30 focus:ring-2 focus:ring-primary/10"
                        />
                      </label>

                      <div className="mt-6 flex gap-3">
                        <Button
                          variant="secondary"
                          className="flex-1 rounded-full border-outline-variant/15 bg-surface-container-high"
                          onClick={closeScheduler}
                        >
                          Cancel
                        </Button>
                        <Button
                          className="flex-1 rounded-full text-white"
                          onClick={handleSubmitBooking}
                          disabled={bookingMutation.isPending || !selectedTime}
                        >
                          {bookingMutation.isPending ? 'Submitting...' : 'Confirm Book'}
                        </Button>
                      </div>
                    </>
                  ) : (
                    <p className="mt-6 text-sm leading-7 text-on-surface-variant">
                      Student booking is only available from student accounts. Teachers can preview cards here and review
                      requests from the teacher dashboard.
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  )
}

function TeacherCard({
  teacher,
  canBook,
  isActive,
  onSelect,
}: {
  teacher: TeacherProfileCard
  canBook: boolean
  isActive: boolean
  onSelect: () => void
}) {
  const sessionPrice = getSessionPrice(teacher)
  const initials = teacher.display_name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()

  return (
    <Card
      className={[
        'group flex h-full flex-col overflow-hidden rounded-[32px] border bg-surface-container-low/95 p-6 shadow-[0_24px_45px_-18px_rgba(6,11,23,0.45)] transition-all duration-300',
        isActive ? 'border-primary/35 shadow-[0_28px_50px_-18px_rgba(64,87,255,0.3)]' : 'border-outline-variant/12 hover:border-primary/20',
      ].join(' ')}
    >
      <div className="relative aspect-[4/3] overflow-hidden rounded-[24px] bg-[linear-gradient(135deg,rgba(78,92,255,0.28),rgba(26,196,165,0.14))]">
        {teacher.avatar_url ? (
          <img
            src={teacher.avatar_url}
            alt={teacher.display_name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-[radial-gradient(circle_at_top,#4756a8,transparent_60%),linear-gradient(135deg,#16203e,#10172c)] text-5xl font-black text-white/80">
            {initials}
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#050816]/70 via-transparent to-transparent" />
        <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-black/35 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-md">
          <Play className="size-3.5 fill-white text-white" />
          Watch Intro
        </div>
        <div className="absolute right-4 top-4 size-3 rounded-full bg-secondary shadow-[0_0_0_6px_rgba(24,212,184,0.16)]" />
      </div>

      <div className="mt-6 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="truncate font-headline text-[1.7rem] font-bold leading-tight text-on-surface">{teacher.display_name}</h3>
          <p className="mt-1.5 text-base text-on-surface-variant">{teacher.headline ?? 'ASL instructor'}</p>
        </div>
        <div className="flex items-center gap-1 rounded-xl bg-background/45 px-2.5 py-1.5">
          <Star className="size-4 fill-secondary text-secondary" />
          <span className="font-headline text-sm font-bold text-on-surface">{getTeacherRating(teacher)}</span>
        </div>
      </div>

      <div className="mt-6 flex flex-wrap gap-2">
        {teacher.specialties.length ? (
          teacher.specialties.slice(0, 3).map((tag) => (
            <Badge key={tag} className="rounded-full border-outline-variant/15 bg-background/45 px-3 py-1 text-on-surface-variant">
              {tag}
            </Badge>
          ))
        ) : (
          <Badge className="rounded-full border-outline-variant/15 bg-background/45 px-3 py-1 text-on-surface-variant">
            General ASL
          </Badge>
        )}
      </div>

      <div className="mt-auto pt-8">
        <div className="flex items-center justify-between rounded-[22px] bg-background/45 px-5 py-5">
          <div>
            <p className="font-headline text-2xl font-bold text-primary">{sessionPrice ? `$${sessionPrice}` : 'TBD'}</p>
            <p className="text-sm text-on-surface-variant">/ session</p>
          </div>
          <Button className="rounded-full px-7 py-3 text-white" onClick={onSelect}>
            {canBook ? 'Schedule' : 'Preview'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function SummaryRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-2xl bg-surface-container-low px-4 py-3">
      <div className="flex items-center gap-3">
        <div className="flex size-9 items-center justify-center rounded-full bg-background/45">{icon}</div>
        <span className="text-sm font-medium text-on-surface-variant">{label}</span>
      </div>
      <span className="text-sm font-semibold text-on-surface">{value}</span>
    </div>
  )
}

function getTeacherRating(teacher: TeacherProfileCard) {
  return (4.7 + (teacher.teacher_id % 4) * 0.1).toFixed(1)
}

function getSessionPrice(teacher: TeacherProfileCard) {
  if (teacher.hourly_rate_usd === null) {
    return null
  }

  return Math.round((teacher.hourly_rate_usd * teacher.lesson_duration_minutes) / 60)
}

function getTimeSlots(teacher: TeacherProfileCard, isoDate: string): TimeSlot[] {
  const date = parseDateInput(isoDate)
  const seed = teacher.teacher_id + date.getDate() + date.getMonth() * 7
  const blocked = new Set<number>([3, seed % TIME_SLOT_VALUES.length])
  blocked.delete(1)

  const slots = TIME_SLOT_VALUES.map((value, index) => ({
    value,
    label: formatTimeLabel(value),
    disabled: blocked.has(index),
  }))

  if (slots.every((slot) => slot.disabled)) {
    slots[1].disabled = false
  }

  return slots
}

function pickDefaultTimeSlot(teacher: TeacherProfileCard, isoDate: string) {
  const slots = getTimeSlots(teacher, isoDate)
  return slots.find((slot) => slot.value === '10:30' && !slot.disabled)?.value ?? slots.find((slot) => !slot.disabled)?.value ?? ''
}

function getCalendarCells(month: Date, minDate: Date): CalendarCell[] {
  const monthStart = startOfMonth(month)
  const gridStart = addDays(monthStart, -monthStart.getDay())

  return Array.from({ length: 42 }, (_, index) => {
    const date = addDays(gridStart, index)
    return {
      isoDate: formatDateInput(date),
      day: date.getDate(),
      inCurrentMonth: date.getMonth() === monthStart.getMonth(),
      disabled: startOfDay(date) < startOfDay(minDate),
    }
  })
}

function getNextBookableDate(today: Date) {
  const next = startOfDay(today)
  next.setDate(next.getDate() + 1)
  return next
}

function startOfDay(date: Date) {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addDays(date: Date, amount: number) {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

function parseDateInput(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function formatDateInput(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatMonthLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' }).format(date)
}

function formatSelectedDate(date: Date) {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
  }).format(date)
}

function formatTimeLabel(value: string) {
  const [hours, minutes] = value.split(':').map(Number)
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' }).format(new Date(2024, 0, 1, hours, minutes))
}
