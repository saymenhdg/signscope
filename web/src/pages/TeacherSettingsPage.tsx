import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, Eye, Save, UserCircle2 } from 'lucide-react'
import { type ChangeEvent, type ReactNode, useEffect, useMemo, useState } from 'react'

import { TeacherShell } from '../components/teacher/TeacherShell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { apiRequest } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { TeacherDashboard, TeacherProfileCard, TeacherProfileCardUpdatePayload, User } from '../lib/types'

const PROFILE_TAGS = ['ASL', 'Fingerspelling', 'Beginners', 'Conversation', 'Deaf Culture', 'Kids', 'Medical', 'Business']
const inputClassName =
  'h-14 rounded-xl bg-[#e0e3e5] px-4 text-base text-[#191c1e] outline-none transition-all placeholder:text-[#767683] focus:bg-white focus:shadow-[0_8px_24px_-8px_rgba(0,6,102,0.12)]'
const textAreaClassName =
  'min-h-32 rounded-xl bg-[#e0e3e5] px-4 py-3 text-base text-[#191c1e] outline-none transition-all placeholder:text-[#767683] focus:bg-white focus:shadow-[0_8px_24px_-8px_rgba(0,6,102,0.12)]'

export function TeacherSettingsPage() {
  const queryClient = useQueryClient()
  const { user, restoreSession } = useAuth()
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
  const [message, setMessage] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!user) {
      return
    }
    setDisplayName(user.display_name)
    setBio(user.bio ?? '')
  }, [user])

  useEffect(() => {
    const profile = data?.profile_card
    if (!profile) {
      return
    }
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
      setMessage('Account details updated.')
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
      setMessage('Teacher card updated.')
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
      setMessage('Avatar updated.')
    },
  })

  const avatarSrc = localAvatarPreview ?? user?.avatar_url ?? null
  const joinedLabel = useMemo(() => (user?.created_at ? new Date(user.created_at).toLocaleDateString() : '...'), [user?.created_at])
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
    setMessage(null)
    try {
      const trimmedDisplayName = displayName.trim()
      if (trimmedDisplayName.length < 2) {
        throw new Error('Display name must be at least 2 characters.')
      }

      const trimmedHeadline = headline.trim()
      const trimmedIntro = intro.trim()
      if (trimmedHeadline.length < 4) {
        throw new Error('Headline must be at least 4 characters.')
      }
      if (trimmedIntro.length < 12) {
        throw new Error('Intro must be at least 12 characters.')
      }

      const payload: TeacherProfileCardUpdatePayload = {
        headline: trimmedHeadline,
        intro: trimmedIntro,
        specialties,
        hourly_rate_usd: hourlyRate.trim() ? Number(hourlyRate) : null,
        lesson_duration_minutes: Number(lessonDuration) || 45,
        is_public: isPublic,
      }

      await profileMutation.mutateAsync({
        display_name: trimmedDisplayName,
        bio: bio.trim() || null,
      })
      await cardMutation.mutateAsync(payload)
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Failed to save teacher settings.')
    }
  }

  async function handleAvatarUpload() {
    setFormError(null)
    setMessage(null)
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
      if (current.includes(tag)) {
        return current.filter((item) => item !== tag)
      }
      if (current.length >= 6) {
        return current
      }
      return [...current, tag]
    })
  }

  function addCustomSpecialty() {
    const value = customSpecialty.trim()
    if (!value || specialties.includes(value) || specialties.length >= 6) {
      return
    }
    setSpecialties((current) => [...current, value])
    setCustomSpecialty('')
  }

  return (
    <TeacherShell title="Settings" subtitle="Manage your teaching profile, schedule, and preferences.">
      {(error || formError || message) ? (
        <div
          className={
            error || formError
              ? 'mb-6 rounded-2xl border border-[#f2c9c6] bg-[#fff1f0] px-4 py-3 text-sm text-[#b2433b]'
              : 'mb-6 rounded-2xl border border-[#bce8ea] bg-[#effcfd] px-4 py-3 text-sm text-[#1b6d71]'
          }
        >
          {error instanceof Error ? error.message : formError ?? message}
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-8">
          <Card className="rounded-[28px] border border-white/70 bg-white p-8 shadow-[0_20px_40px_rgba(0,6,102,0.06)]">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-center">
              <div className="relative">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={previewCard.display_name}
                    className="size-28 rounded-full object-cover shadow-md"
                  />
                ) : (
                  <div className="flex size-28 items-center justify-center rounded-full bg-[#e6e8ea] text-[#000666] shadow-md">
                    <UserCircle2 className="size-14" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="font-['Plus_Jakarta_Sans'] text-3xl font-black text-[#000666]">{previewCard.display_name}</p>
                <p className="mt-2 text-sm text-[#6a7083]">{user?.email}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Badge className="border-0 bg-[#eff2fb] text-[#000666]">Joined {joinedLabel}</Badge>
                  <Badge className="border-0 bg-[#eff2fb] text-[#000666]">
                    Setup {data?.profile_completion_percent ?? 0}%
                  </Badge>
                </div>
              </div>

              <div className="w-full max-w-xs space-y-3">
                <label className="flex cursor-pointer items-center justify-center gap-3 rounded-xl bg-[#f2f4f6] px-4 py-3 text-sm font-semibold text-[#1f2d63] transition-colors hover:bg-[#e9ecef]">
                  <Camera className="size-4 text-[#000666]" />
                  <span>{selectedAvatar ? selectedAvatar.name : 'Choose avatar'}</span>
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setSelectedAvatar(event.target.files?.[0] ?? null)}
                  />
                </label>
                <Button
                  className="w-full rounded-full bg-[linear-gradient(135deg,#000666,#1a237e)] text-white shadow-[0_8px_20px_-8px_rgba(0,6,102,0.4)] hover:brightness-110"
                  onClick={handleAvatarUpload}
                  disabled={!selectedAvatar || avatarMutation.isPending}
                >
                  <Camera className="size-4" />
                  {avatarMutation.isPending ? 'Uploading...' : 'Upload Avatar'}
                </Button>
              </div>
            </div>
          </Card>

          <Card className="rounded-[28px] border border-white/70 bg-white p-8 shadow-[0_20px_40px_rgba(0,6,102,0.06)]">
            <CardTitle className="font-['Plus_Jakarta_Sans'] text-2xl text-[#000666]">Profile Details</CardTitle>
            <CardDescription className="mt-2 text-[#6a7083]">
              Basic account fields and the public bio shared across your teacher workspace.
            </CardDescription>

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
                <textarea
                  value={bio}
                  onChange={(event) => setBio(event.target.value)}
                  className={textAreaClassName}
                  placeholder="Short profile context shown across the app."
                  maxLength={280}
                />
              </Field>
            </div>
          </Card>

          <Card className="rounded-[28px] border border-white/70 bg-white p-8 shadow-[0_20px_40px_rgba(0,6,102,0.06)]">
            <CardTitle className="font-['Plus_Jakarta_Sans'] text-2xl text-[#000666]">Teacher Card Setup</CardTitle>
            <CardDescription className="mt-2 text-[#6a7083]">
              Curate how students see you in the directory and what defaults they book against.
            </CardDescription>

            <div className="mt-8 grid gap-5">
              <Field label="Headline">
                <input
                  value={headline}
                  onChange={(event) => setHeadline(event.target.value)}
                  className={inputClassName}
                  placeholder="Expert ASL Instructor for beginner confidence"
                />
              </Field>

              <Field label="Introduction">
                <textarea
                  value={intro}
                  onChange={(event) => setIntro(event.target.value)}
                  className={textAreaClassName}
                  placeholder="Describe your teaching style, who you help, and what students can expect from lessons."
                  maxLength={500}
                />
              </Field>

              <div className="grid gap-5 lg:grid-cols-2">
                <Field label="Hourly rate (USD)">
                  <input
                    value={hourlyRate}
                    onChange={(event) => setHourlyRate(event.target.value)}
                    className={inputClassName}
                    inputMode="numeric"
                    placeholder="45"
                  />
                </Field>
                <Field label="Default lesson duration (minutes)">
                  <select
                    value={lessonDuration}
                    onChange={(event) => setLessonDuration(event.target.value)}
                    className={inputClassName}
                  >
                    {[30, 45, 60, 75, 90].map((minutes) => (
                      <option key={minutes} value={minutes}>
                        {minutes} minutes
                      </option>
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
                          className={
                            active
                              ? 'rounded-full border border-transparent bg-[#000666] px-4 py-2 text-sm font-semibold text-white'
                              : 'rounded-full border border-transparent bg-[#eceef0] px-4 py-2 text-sm font-semibold text-[#5f6781]'
                          }
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
                      className="h-12 min-w-64 flex-1 rounded-xl bg-[#e0e3e5] px-4 text-sm text-[#191c1e] outline-none transition-all placeholder:text-[#767683] focus:bg-white focus:shadow-[0_8px_24px_-8px_rgba(0,6,102,0.12)]"
                      placeholder="Add custom specialty"
                    />
                    <Button type="button" className="rounded-full bg-[linear-gradient(135deg,#000666,#1a237e)] text-white hover:brightness-110" onClick={addCustomSpecialty}>
                      Add Tag
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {specialties.map((tag) => (
                      <Badge key={tag} className="border-0 bg-[#eceef0] text-[#000666]">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              </Field>

              <div className="flex items-center justify-between rounded-[20px] bg-[#f2f4f6] p-5">
                <div>
                  <p className="font-semibold text-[#191c1e]">Directory visibility</p>
                  <p className="mt-1 text-sm text-[#6a7083]">
                    When enabled, students can discover your profile and submit booking requests.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPublic((current) => !current)}
                  className={`relative inline-flex h-8 w-[3.75rem] items-center rounded-full transition-colors ${isPublic ? 'bg-[#14696d]' : 'bg-[#e0e3e5]'}`}
                  aria-pressed={isPublic}
                >
                  <span
                    className={`inline-block size-6 transform rounded-full bg-white transition-transform ${isPublic ? 'translate-x-8' : 'translate-x-1'}`}
                  />
                </button>
              </div>
            </div>

            <div className="mt-8 flex flex-wrap justify-end gap-3">
              <Button
                onClick={handleSaveAll}
                disabled={profileMutation.isPending || cardMutation.isPending}
                className="rounded-full bg-[linear-gradient(135deg,#000666,#1a237e)] px-6 text-white shadow-[0_8px_20px_-8px_rgba(0,6,102,0.4)] hover:brightness-110"
              >
                <Save className="size-4" />
                {profileMutation.isPending || cardMutation.isPending ? 'Saving...' : 'Save Teacher Settings'}
              </Button>
            </div>
          </Card>
        </div>

        <div className="space-y-8">
          <Card className="sticky top-24 rounded-[28px] border border-white/70 bg-white p-8 shadow-[0_20px_40px_rgba(0,6,102,0.06)]">
            <div className="flex items-center gap-3">
              <Eye className="size-5 text-[#000666]" />
              <div>
                <CardTitle className="font-['Plus_Jakarta_Sans'] text-2xl text-[#000666]">Live Preview</CardTitle>
                <CardDescription className="text-[#6a7083]">This is how your teacher card will appear in search results.</CardDescription>
              </div>
            </div>

            <div className="mt-8 overflow-hidden rounded-[28px] bg-[#ffffff] shadow-[0_20px_40px_-15px_rgba(0,6,102,0.08)]">
              <div className="relative h-52 bg-[linear-gradient(135deg,rgba(0,6,102,0.12),rgba(26,35,126,0.18))]">
                {previewCard.avatar_url ? (
                  <img src={previewCard.avatar_url} alt={previewCard.display_name} className="h-full w-full object-cover opacity-70" />
                ) : null}
                <div className="absolute inset-0 bg-[linear-gradient(180deg,transparent,rgba(25,28,30,0.18))]" />
                <div className="absolute right-4 top-4 rounded-full bg-[#14696d] px-3 py-1 text-xs font-bold uppercase tracking-[0.18em] text-white">
                  {previewCard.is_public ? 'Accepting students' : 'Draft'}
                </div>
              </div>

              <div className="space-y-5 p-6">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="font-['Plus_Jakarta_Sans'] text-2xl font-black text-[#191c1e]">{previewCard.display_name}</p>
                    <p className="mt-1 text-sm text-[#14696d]">{previewCard.headline ?? 'Add a teacher headline'}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-['Plus_Jakarta_Sans'] text-2xl font-black text-[#000666]">
                      {previewCard.hourly_rate_usd ? `$${previewCard.hourly_rate_usd}` : 'TBD'}
                    </p>
                    <p className="text-xs uppercase tracking-[0.18em] text-[#767683]">
                      / {previewCard.lesson_duration_minutes} min
                    </p>
                  </div>
                </div>

                <p className="text-sm leading-7 text-[#454652]">
                  {previewCard.intro ?? 'Add a short intro to tell students what you teach and how you run lessons.'}
                </p>

                <div className="flex flex-wrap gap-2">
                  {previewCard.specialties.length ? (
                    previewCard.specialties.map((tag) => (
                      <Badge key={tag} className="border-0 bg-[#eceef0] text-[#454652]">
                        {tag}
                      </Badge>
                    ))
                  ) : (
                    <Badge className="border-0 bg-[#eceef0] text-[#454652]">
                      Add specialties
                    </Badge>
                  )}
                </div>

                <div className="rounded-[22px] bg-[#f2f4f6] p-4">
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-[#14696d]">Setup progress</p>
                  <p className="mt-3 font-['Plus_Jakarta_Sans'] text-4xl font-black text-[#191c1e]">{data?.profile_completion_percent ?? 0}%</p>
                  <p className="mt-2 text-sm text-[#454652]">
                    {data?.account_status ?? 'Teacher setup in progress'}
                  </p>
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
      <span className="text-xs font-bold uppercase tracking-[0.24em] text-[#767683]">{label}</span>
      {children}
    </label>
  )
}
