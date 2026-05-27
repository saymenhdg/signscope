import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { GraduationCap, LoaderCircle, Pencil, Save, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { useToast } from '../components/ui/toast'
import { apiRequest } from '../lib/api'
import type {
  AdminTeacherProfile,
  AdminTeacherProfileUpdatePayload,
  AdminTeacherProfilesResponse,
} from '../lib/types'

const PROFILE_TAGS = ['ASL', 'Fingerspelling', 'Beginners', 'Conversation', 'Deaf Culture', 'Kids', 'Medical', 'Business']
const inputClassName =
  'h-14 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 text-base text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-secondary/60'
const textAreaClassName =
  'min-h-32 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 py-3 text-base text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-secondary/60'

export function AdminTeachersPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data, error } = useQuery({
    queryKey: ['admin-teachers'],
    queryFn: () => apiRequest<AdminTeacherProfilesResponse>('/api/admin/teachers'),
  })
  const [selectedTeacher, setSelectedTeacher] = useState<AdminTeacherProfile | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [headline, setHeadline] = useState('')
  const [intro, setIntro] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [lessonDuration, setLessonDuration] = useState('45')
  const [specialties, setSpecialties] = useState<string[]>([])
  const [customSpecialty, setCustomSpecialty] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [isEmailVerified, setIsEmailVerified] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedTeacher) return
    setDisplayName(selectedTeacher.display_name)
    setBio(selectedTeacher.bio ?? '')
    setHeadline(selectedTeacher.headline ?? '')
    setIntro(selectedTeacher.intro ?? '')
    setHourlyRate(selectedTeacher.hourly_rate_usd === null ? '' : String(selectedTeacher.hourly_rate_usd))
    setLessonDuration(String(selectedTeacher.lesson_duration_minutes || 45))
    setSpecialties(selectedTeacher.specialties)
    setIsPublic(selectedTeacher.is_public)
    setIsEmailVerified(selectedTeacher.is_email_verified)
    setCustomSpecialty('')
    setFormError(null)
  }, [selectedTeacher])

  const mutation = useMutation({
    mutationFn: ({ teacherId, payload }: { teacherId: number; payload: AdminTeacherProfileUpdatePayload }) =>
      apiRequest<AdminTeacherProfile>(`/api/admin/teachers/${teacherId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-teachers'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
      toast({ title: 'Teacher profile updated', variant: 'success' })
      setSelectedTeacher(null)
    },
  })

  function toggleSpecialty(tag: string) {
    setSpecialties((current) => {
      if (current.includes(tag)) return current.filter((item) => item !== tag)
      if (current.length >= 6) return current
      return [...current, tag]
    })
  }

  function addCustomSpecialty() {
    const value = customSpecialty.trim()
    if (!value || specialties.includes(value) || specialties.length >= 6) return
    setSpecialties((current) => [...current, value])
    setCustomSpecialty('')
  }

  async function handleSave() {
    if (!selectedTeacher) return
    setFormError(null)
    try {
      const payload: AdminTeacherProfileUpdatePayload = {
        display_name: displayName.trim(),
        bio: bio.trim() || null,
        is_email_verified: isEmailVerified,
        headline: headline.trim() || null,
        intro: intro.trim() || null,
        specialties,
        hourly_rate_usd: hourlyRate.trim() ? Number(hourlyRate) : null,
        lesson_duration_minutes: Number(lessonDuration) || 45,
        is_public: isPublic,
      }
      await mutation.mutateAsync({ teacherId: selectedTeacher.teacher_id, payload })
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Failed to update teacher profile.')
    }
  }

  return (
    <AppShell title="Teachers" subtitle="Review teacher cards and edit published or draft profile information.">
      {error ? (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load teacher profiles.'}
        </div>
      ) : null}

      <Card className="rounded-[30px] border-outline-variant/12 p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>Teacher Profiles</CardTitle>
            <CardDescription>Edit the public teacher directory and internal draft profiles.</CardDescription>
          </div>
          <GraduationCap className="size-5 text-secondary" />
        </div>

        <div className="mt-6 space-y-4">
          {data ? (
            data.teachers.map((teacher) => (
              <div key={teacher.teacher_id} className="rounded-[20px] border border-outline-variant/10 bg-surface-container p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-on-surface">{teacher.display_name}</p>
                      <Badge className={teacher.is_public ? 'border-secondary/10 bg-secondary/10 text-secondary' : 'border-tertiary/10 bg-tertiary/10 text-tertiary'}>
                        {teacher.is_public ? 'public' : 'draft'}
                      </Badge>
                    </div>
                    <p className="mt-1 truncate text-sm text-on-surface-variant">{teacher.email}</p>
                    <p className="mt-2 text-sm text-on-surface">{teacher.headline ?? 'No headline yet'}</p>
                    {teacher.specialties.length ? (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {teacher.specialties.slice(0, 4).map((tag) => (
                          <Badge key={tag} className="border-outline-variant/15 bg-background/45 text-on-surface-variant">{tag}</Badge>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-col items-end gap-3">
                    <Badge className="border-outline-variant/15 bg-background/45 text-on-surface-variant">{teacher.profile_completion_percent}% complete</Badge>
                    <Button variant="secondary" size="sm" onClick={() => setSelectedTeacher(teacher)}>
                      <Pencil className="size-4" />
                      Edit
                    </Button>
                  </div>
                </div>
              </div>
            ))
          ) : (
            Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-40 rounded-[20px]" />)
          )}
        </div>
      </Card>

      {selectedTeacher ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={() => setSelectedTeacher(null)}>
          <div
            className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[32px] border border-outline-variant/15 bg-surface-container-low/95 p-8 shadow-[0_40px_110px_rgba(4,8,20,0.6)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${selectedTeacher.display_name}`}
          >
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-headline text-3xl font-black text-on-surface">Edit Teacher</h2>
                <p className="mt-2 text-sm text-on-surface-variant">{selectedTeacher.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTeacher(null)}
                className="flex size-11 items-center justify-center rounded-full border border-outline-variant/15 bg-background/40 text-on-surface-variant transition-colors hover:text-on-surface"
                aria-label="Close editor"
              >
                <X className="size-5" />
              </button>
            </div>

            {formError ? (
              <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">{formError}</div>
            ) : null}

            <div className="grid gap-5">
              <Field label="Display name">
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={inputClassName} />
              </Field>
              <Field label="Account bio">
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} className={textAreaClassName} placeholder="Internal or public bio text" />
              </Field>
              <Field label="Headline">
                <input value={headline} onChange={(event) => setHeadline(event.target.value)} className={inputClassName} placeholder="Expert ASL Instructor" />
              </Field>
              <Field label="Introduction">
                <textarea value={intro} onChange={(event) => setIntro(event.target.value)} className={textAreaClassName} placeholder="Describe teaching style and focus." />
              </Field>
              <div className="grid gap-5 lg:grid-cols-2">
                <Field label="Hourly rate (USD)">
                  <input value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} className={inputClassName} inputMode="numeric" placeholder="45" />
                </Field>
                <Field label="Lesson duration">
                  <select value={lessonDuration} onChange={(event) => setLessonDuration(event.target.value)} className={inputClassName}>
                    {[30, 45, 60, 75, 90].map((minutes) => (
                      <option key={minutes} value={minutes}>{minutes} minutes</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="Specialties">
                <div className="space-y-4">
                  <div className="flex flex-wrap gap-2">
                    {PROFILE_TAGS.map((tag) => {
                      const active = specialties.includes(tag)
                      return (
                        <button
                          key={tag}
                          type="button"
                          onClick={() => toggleSpecialty(tag)}
                          className={`cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${active ? 'border-primary/20 bg-primary text-background' : 'border-outline-variant/20 bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest'}`}
                        >
                          {tag}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <input
                      value={customSpecialty}
                      onChange={(event) => setCustomSpecialty(event.target.value)}
                      className="h-12 min-w-64 flex-1 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 text-sm text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-secondary/60"
                      placeholder="Add custom specialty"
                    />
                    <Button type="button" onClick={addCustomSpecialty}>Add Tag</Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {specialties.map((tag) => (
                      <Badge key={tag}>{tag}</Badge>
                    ))}
                  </div>
                </div>
              </Field>
              <div className="grid gap-5 lg:grid-cols-2">
                <ToggleRow
                  title="Directory visibility"
                  description="Control whether students can discover and book this teacher."
                  enabled={isPublic}
                  onToggle={() => setIsPublic((current) => !current)}
                />
                <ToggleRow
                  title="Email verified"
                  description="Mark whether the teacher account should count as verified."
                  enabled={isEmailVerified}
                  onToggle={() => setIsEmailVerified((current) => !current)}
                />
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setSelectedTeacher(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={mutation.isPending}>
                {mutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
                {mutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  )
}

function ToggleRow({
  title,
  description,
  enabled,
  onToggle,
}: {
  title: string
  description: string
  enabled: boolean
  onToggle: () => void
}) {
  return (
    <div className="flex items-center justify-between rounded-3xl border border-outline-variant/10 bg-surface-container p-5">
      <div>
        <p className="font-semibold text-on-surface">{title}</p>
        <p className="mt-1 text-sm text-on-surface-variant">{description}</p>
      </div>
      <button
        type="button"
        onClick={onToggle}
        className={`relative inline-flex h-8 w-[3.75rem] items-center rounded-full transition-colors ${enabled ? 'bg-secondary' : 'bg-surface-container-highest'}`}
        aria-pressed={enabled}
      >
        <span className={`inline-block size-6 transform rounded-full bg-background shadow transition-transform ${enabled ? 'translate-x-8' : 'translate-x-1'}`} />
      </button>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</span>
      {children}
    </label>
  )
}
