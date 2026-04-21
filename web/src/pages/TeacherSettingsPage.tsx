import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Eye, LoaderCircle, Save, UserCircle2 } from 'lucide-react'
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from 'react'

import { TeacherShell } from '../components/teacher/TeacherShell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { useToast } from '../components/ui/toast'
import { apiRequest } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { TeacherDashboard, TeacherProfileCard, TeacherProfileCardUpdatePayload, User } from '../lib/types'
import { cn } from '../lib/utils'

const PROFILE_TAGS = ['ASL', 'Fingerspelling', 'Beginners', 'Conversation', 'Deaf Culture', 'Kids', 'Medical', 'Business']
const inputClassName =
  'h-14 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 text-base text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-secondary/60'
const textAreaClassName =
  'min-h-32 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 py-3 text-base text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-secondary/60'

export function TeacherSettingsPage() {
  const queryClient = useQueryClient()
  const { user, restoreSession } = useAuth()
  const { toast } = useToast()
  const { data, error } = useQuery({
    queryKey: ['teacher-dashboard'],
    queryFn: () => apiRequest<TeacherDashboard>('/api/teacher/dashboard'),
  })

  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [headline, setHeadline] = useState('')
  const [intro, setIntro] = useState('')
  const [hourlyRate, setHourlyRate] = useState('')
  const [lessonDuration, setLessonDuration] = useState('45')
  const [specialties, setSpecialties] = useState<string[]>([])
  const [customSpecialty, setCustomSpecialty] = useState('')
  const [isPublic, setIsPublic] = useState(false)
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null)
  const [localAvatarPreview, setLocalAvatarPreview] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    setDisplayName(user.display_name)
    setBio(user.bio ?? '')
  }, [user])

  useEffect(() => {
    const profile = data?.profile_card
    if (!profile) return
    setHeadline(profile.headline ?? '')
    setIntro(profile.intro ?? '')
    setHourlyRate(profile.hourly_rate_usd ? String(profile.hourly_rate_usd) : '')
    setLessonDuration(String(profile.lesson_duration_minutes || 45))
    setSpecialties(profile.specialties)
    setIsPublic(profile.is_public)
  }, [data?.profile_card])

  useEffect(() => {
    if (!selectedAvatar) {
      setLocalAvatarPreview(null)
      return
    }
    const previewUrl = URL.createObjectURL(selectedAvatar)
    setLocalAvatarPreview(previewUrl)
    return () => URL.revokeObjectURL(previewUrl)
  }, [selectedAvatar])

  const profileMutation = useMutation({
    mutationFn: (payload: { display_name: string; bio: string | null }) =>
      apiRequest<User>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await restoreSession()
    },
  })

  const cardMutation = useMutation({
    mutationFn: (payload: TeacherProfileCardUpdatePayload) =>
      apiRequest<TeacherProfileCard>('/api/teacher/profile-card', {
        method: 'PUT',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['teacher-dashboard'] })
      await queryClient.invalidateQueries({ queryKey: ['teacher-directory'] })
    },
  })

  const avatarMutation = useMutation({
    mutationFn: (file: File) => {
      const formData = new FormData()
      formData.append('avatar', file)
      return apiRequest<User>('/api/auth/profile/avatar', {
        method: 'POST',
        body: formData,
      })
    },
    onSuccess: async () => {
      await restoreSession()
      setSelectedAvatar(null)
      toast({ title: 'Avatar updated', variant: 'success' })
    },
  })

  const avatarSrc = localAvatarPreview ?? user?.avatar_url ?? null
  const joinedLabel = useMemo(() => (user?.created_at ? new Date(user.created_at).toLocaleDateString() : '…'), [user?.created_at])
  const previewCard: TeacherProfileCard = {
    teacher_id: user?.id ?? 0,
    display_name: displayName.trim() || user?.display_name || 'Teacher',
    avatar_url: avatarSrc,
    headline: headline.trim() || null,
    intro: intro.trim() || null,
    specialties,
    hourly_rate_usd: hourlyRate.trim() ? Number(hourlyRate) : null,
    lesson_duration_minutes: Number(lessonDuration) || 45,
    is_public: isPublic,
  }

  async function handleSaveAll() {
    setFormError(null)
    try {
      const trimmedDisplayName = displayName.trim()
      if (trimmedDisplayName.length < 2) throw new Error('Display name must be at least 2 characters.')

      const trimmedHeadline = headline.trim()
      const trimmedIntro = intro.trim()
      if (trimmedHeadline.length < 4) throw new Error('Headline must be at least 4 characters.')
      if (trimmedIntro.length < 12) throw new Error('Intro must be at least 12 characters.')

      const payload: TeacherProfileCardUpdatePayload = {
        headline: trimmedHeadline,
        intro: trimmedIntro,
        specialties,
        hourly_rate_usd: hourlyRate.trim() ? Number(hourlyRate) : null,
        lesson_duration_minutes: Number(lessonDuration) || 45,
        is_public: isPublic,
      }

      await profileMutation.mutateAsync({ display_name: trimmedDisplayName, bio: bio.trim() || null })
      await cardMutation.mutateAsync(payload)
      toast({ title: 'Teacher settings saved', variant: 'success' })
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Failed to save teacher settings.')
    }
  }

  async function handleAvatarUpload() {
    setFormError(null)
    if (!selectedAvatar) {
      setFormError('Choose an image first.')
      return
    }
    try {
      await avatarMutation.mutateAsync(selectedAvatar)
    } catch (uploadError) {
      setFormError(uploadError instanceof Error ? uploadError.message : 'Failed to upload avatar.')
    }
  }

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

  const isSaving = profileMutation.isPending || cardMutation.isPending

  return (
    <TeacherShell title="Settings" subtitle="Manage your teaching profile, schedule, and preferences.">
      {(error || formError) ? (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error instanceof Error ? error.message : formError}
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-8">
          <Card className="rounded-3xl p-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="relative">
                {avatarSrc ? (
                  <img src={avatarSrc} alt={previewCard.display_name} className="size-28 rounded-full border-2 border-outline-variant/20 object-cover shadow-md" />
                ) : (
                  <div className="flex size-28 items-center justify-center rounded-full bg-primary/15 text-primary shadow-md">
                    <UserCircle2 className="size-14" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-headline text-3xl font-black text-on-surface">{previewCard.display_name}</p>
                <p className="mt-2 text-sm text-on-surface-variant">{user?.email}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge>Joined {joinedLabel}</Badge>
                  <Badge>Setup {data?.profile_completion_percent ?? 0}%</Badge>
                </div>
              </div>

              <div className="w-full max-w-xs space-y-3">
                <label className="flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container-high px-4 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-highest">
                  <Camera className="size-4 text-secondary" />
                  <span>{selectedAvatar ? selectedAvatar.name : 'Choose avatar'}</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setSelectedAvatar(event.target.files?.[0] ?? null)}
                  />
                </label>
                <Button className="w-full" onClick={handleAvatarUpload} disabled={!selectedAvatar || avatarMutation.isPending}>
                  {avatarMutation.isPending ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Camera className="size-4" />}
                  {avatarMutation.isPending ? 'Uploading…' : 'Upload Avatar'}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="rounded-3xl p-8">
            <CardTitle>Profile Details</CardTitle>
            <CardDescription className="mt-2">Basic account fields and the public bio shared across your teacher workspace.</CardDescription>

            <div className="mt-8 grid gap-5">
              <Field label="Display name">
                <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} className={inputClassName} />
              </Field>
              <div className="grid gap-5 lg:grid-cols-2">
                <Field label="Email address">
                  <input value={user?.email ?? ''} className={`${inputClassName} opacity-75`} disabled readOnly />
                </Field>
                <Field label="Account role">
                  <input value="Teacher" className={`${inputClassName} opacity-75`} disabled readOnly />
                </Field>
              </div>
              <Field label="Account bio">
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} className={textAreaClassName} placeholder="Short profile context shown across the app." maxLength={280} />
              </Field>
            </div>
          </Card>

          <Card className="rounded-3xl p-8">
            <CardTitle>Teacher Card Setup</CardTitle>
            <CardDescription className="mt-2">Curate how students see you in the directory and what defaults they book against.</CardDescription>

            <div className="mt-8 grid gap-5">
              <Field label="Headline">
                <input value={headline} onChange={(event) => setHeadline(event.target.value)} className={inputClassName} placeholder="Expert ASL Instructor for beginner confidence" />
              </Field>

              <Field label="Introduction">
                <textarea value={intro} onChange={(event) => setIntro(event.target.value)} className={textAreaClassName} placeholder="Describe your teaching style, who you help, and what students can expect from lessons." maxLength={500} />
              </Field>

              <div className="grid gap-5 lg:grid-cols-2">
                <Field label="Hourly rate (USD)">
                  <input value={hourlyRate} onChange={(event) => setHourlyRate(event.target.value)} className={inputClassName} inputMode="numeric" placeholder="45" />
                </Field>
                <Field label="Default lesson duration (minutes)">
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
                          className={cn(
                            'cursor-pointer rounded-full border px-4 py-2 text-sm font-semibold transition-colors',
                            active
                              ? 'border-primary/20 bg-primary text-background'
                              : 'border-outline-variant/20 bg-surface-container-high text-on-surface-variant hover:bg-surface-container-highest',
                          )}
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

              <div className="flex items-center justify-between rounded-3xl border border-outline-variant/10 bg-surface-container p-5">
                <div>
                  <p className="font-semibold text-on-surface">Directory visibility</p>
                  <p className="mt-1 text-sm text-on-surface-variant">
                    When enabled, students can discover your profile and submit booking requests.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublic((current) => !current)}
                  className={cn(
                    'relative inline-flex h-8 w-[3.75rem] items-center rounded-full transition-colors',
                    isPublic ? 'bg-secondary' : 'bg-surface-container-highest',
                  )}
                  aria-pressed={isPublic}
                  aria-label="Toggle directory visibility"
                >
                  <span className={cn('inline-block size-6 transform rounded-full bg-background shadow transition-transform', isPublic ? 'translate-x-8' : 'translate-x-1')} />
                </button>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap justify-end gap-3">
              <Button onClick={handleSaveAll} disabled={isSaving}>
                {isSaving ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" />}
                {isSaving ? 'Saving…' : 'Save Teacher Settings'}
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="sticky top-24 rounded-3xl p-8">
            <div className="flex items-center gap-3">
              <Eye className="size-5 text-primary" />
              <div>
                <CardTitle>Live Preview</CardTitle>
                <CardDescription>This is how your teacher card will appear in search results.</CardDescription>
              </div>
            </div>

            <div className="mt-8 overflow-hidden rounded-3xl border border-outline-variant/10 shadow-lg">
              <div className="relative h-52 bg-gradient-to-br from-primary/15 to-secondary/10">
                {previewCard.avatar_url ? (
                  <img src={previewCard.avatar_url} alt={previewCard.display_name} className="h-full w-full object-cover opacity-70" />
                ) : null}
                <div className="absolute inset-0 bg-gradient-to-t from-background/20 to-transparent" />
                <div className="absolute right-4 top-4">
                  <Badge className={previewCard.is_public ? 'border-secondary/10 bg-secondary/10 text-secondary' : 'border-outline-variant/20'}>
                    {previewCard.is_public ? 'Accepting students' : 'Draft'}
                  </Badge>
                </div>
              </div>

              <div className="space-y-5 bg-surface-container-low p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-headline text-2xl font-black text-on-surface">{previewCard.display_name}</p>
                    <p className="mt-1 text-sm text-secondary">{previewCard.headline ?? 'Add a teacher headline'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-headline text-2xl font-black text-on-surface">
                      {previewCard.hourly_rate_usd ? `$${previewCard.hourly_rate_usd}` : 'TBD'}
                    </p>
                    <p className="text-xs uppercase tracking-[0.18em] text-on-surface-variant">
                      / {previewCard.lesson_duration_minutes} min
                    </p>
                  </div>
                </div>

                <p className="text-sm leading-7 text-on-surface-variant">
                  {previewCard.intro ?? 'Add a short intro to tell students what you teach and how you run lessons.'}
                </p>

                <div className="flex flex-wrap gap-2">
                  {previewCard.specialties.length ? (
                    previewCard.specialties.map((tag) => <Badge key={tag}>{tag}</Badge>)
                  ) : (
                    <Badge>Add specialties</Badge>
                  )}
                </div>

                <div className="rounded-3xl border border-outline-variant/10 bg-surface-container p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Setup progress</p>
                  <p className="mt-3 font-headline text-4xl font-black text-on-surface">{data?.profile_completion_percent ?? 0}%</p>
                  <p className="mt-2 text-sm text-on-surface-variant">{data?.account_status ?? 'Teacher setup in progress'}</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </TeacherShell>
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
