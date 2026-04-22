import { CalendarDays, Camera, ImagePlus, LoaderCircle, Mail, Pencil, Save, UserCircle2 } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { useToast } from '../components/ui/toast'
import { apiRequest } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { User } from '../lib/types'

const inputClassName =
  'h-14 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 text-base text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-secondary/60'

const textAreaClassName =
  'min-h-32 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 py-3 text-base text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-secondary/60'

export function ProfilePage() {
  const { user, restoreSession } = useAuth()
  const { toast } = useToast()
  const [displayName, setDisplayName] = useState('')
  const [age, setAge] = useState('')
  const [bio, setBio] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null)
  const [localAvatarPreview, setLocalAvatarPreview] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSavingProfile, setIsSavingProfile] = useState(false)
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false)

  useEffect(() => {
    if (!user) {
      return
    }
    setDisplayName(user.display_name)
    setAge(user.age ? String(user.age) : '')
    setBio(user.bio ?? '')
  }, [user])

  useEffect(() => {
    if (!selectedAvatar) {
      setLocalAvatarPreview(null)
      return
    }
    const previewUrl = URL.createObjectURL(selectedAvatar)
    setLocalAvatarPreview(previewUrl)
    return () => {
      URL.revokeObjectURL(previewUrl)
    }
  }, [selectedAvatar])

  const avatarSrc = localAvatarPreview ?? user?.avatar_url ?? null
  const joinedLabel = useMemo(() => {
    if (!user?.created_at) {
      return '...'
    }
    return new Date(user.created_at).toLocaleDateString()
  }, [user?.created_at])

  const completeness = computeCompleteness({ displayName, age, bio, avatarSrc })

  async function handleSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setIsSavingProfile(true)

    try {
      const normalizedAge = age.trim() === '' ? null : Number(age)
      if (normalizedAge !== null && Number.isNaN(normalizedAge)) {
        throw new Error('Age must be a number.')
      }

      await apiRequest<User>('/api/auth/profile', {
        method: 'PATCH',
        body: JSON.stringify({
          display_name: displayName.trim(),
          age: normalizedAge,
          bio: bio.trim() || null,
        }),
      })
      await restoreSession()
      toast({ title: 'Profile updated', variant: 'success' })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to update profile.')
    } finally {
      setIsSavingProfile(false)
    }
  }

  async function handleAvatarUpload() {
    if (!selectedAvatar) {
      setError('Select an image before uploading.')
      return
    }

    setError(null)
    setIsUploadingAvatar(true)
    try {
      const formData = new FormData()
      formData.append('avatar', selectedAvatar)
      await apiRequest<User>('/api/auth/profile/avatar', {
        method: 'POST',
        body: formData,
      })
      await restoreSession()
      setSelectedAvatar(null)
      toast({ title: 'Avatar updated', variant: 'success' })
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload avatar.')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  return (
    <AppShell
      title="Profile"
      subtitle="Manage your account and personalize your learning experience."
    >
      {error ? (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="space-y-8">
        {/* ── Profile Hero ── */}
        <Card className="relative overflow-hidden rounded-[34px] border-outline-variant/12 bg-surface-container-low/90 p-0">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(142,162,255,0.14),transparent_40%),radial-gradient(circle_at_80%_0%,rgba(68,226,205,0.10),transparent_35%)]" />

          <div className="relative px-8 pb-8 pt-10 sm:px-10">
            <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start">
              {/* Avatar with upload overlay */}
              <div className="group relative shrink-0">
                {avatarSrc ? (
                  <img
                    src={avatarSrc}
                    alt={user?.display_name ?? 'Profile avatar'}
                    className="size-28 rounded-[26px] border-2 border-outline-variant/15 object-cover shadow-lg sm:size-32"
                  />
                ) : (
                  <div className="flex size-28 items-center justify-center rounded-[26px] border-2 border-outline-variant/15 bg-surface-container text-secondary shadow-lg sm:size-32">
                    <UserCircle2 className="size-14" />
                  </div>
                )}
                <label className="absolute inset-0 flex cursor-pointer items-center justify-center rounded-[26px] bg-black/0 transition-colors group-hover:bg-black/40">
                  <Camera className="size-6 text-white opacity-0 transition-opacity group-hover:opacity-100" />
                  <input
                    type="file"
                    accept=".jpg,.jpeg,.png,.webp,image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(event) => {
                      setSelectedAvatar(event.target.files?.[0] ?? null)
                    }}
                  />
                </label>
              </div>

              {/* Identity + stats */}
              <div className="flex flex-1 flex-col items-center gap-6 sm:items-start">
                <div className="text-center sm:text-left">
                  <p className="font-headline text-3xl font-black text-on-surface sm:text-4xl">
                    {user?.display_name}
                  </p>
                  <p className="mt-1.5 text-sm text-on-surface-variant">{user?.email}</p>
                  {user?.bio && (
                    <p className="mt-3 max-w-lg text-sm leading-7 text-on-surface-variant">{user.bio}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="border-outline-variant/15 gap-2">
                    <Mail className="size-3" />
                    Verified
                  </Badge>
                  <Badge className="border-outline-variant/15 gap-2">
                    <CalendarDays className="size-3" />
                    Joined {joinedLabel}
                  </Badge>
                  {user?.age && (
                    <Badge className="border-outline-variant/15 gap-2">
                      {user.age} years old
                    </Badge>
                  )}
                </div>
              </div>

              {/* Completeness ring */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative flex size-20 items-center justify-center rounded-full border-[6px] border-surface-container-highest">
                  <div
                    className="absolute inset-0 rounded-full transition-all duration-700"
                    style={{
                      background: `conic-gradient(var(--secondary) 0deg ${completeness * 3.6}deg, transparent 0deg)`,
                      WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 6px), black 0)',
                      mask: 'radial-gradient(farthest-side, transparent calc(100% - 6px), black 0)',
                    }}
                  />
                  <span className="font-headline text-lg font-black text-on-surface">{completeness}%</span>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-on-surface-variant">Complete</span>
              </div>
            </div>

            {/* Avatar upload action (only visible when a file is selected) */}
            {selectedAvatar && (
              <div className="mt-6 flex items-center gap-4 rounded-[22px] border border-secondary/15 bg-secondary/5 px-5 py-3">
                <ImagePlus className="size-5 shrink-0 text-secondary" />
                <p className="flex-1 truncate text-sm text-on-surface-variant">
                  {selectedAvatar.name}
                </p>
                <Button
                  size="sm"
                  onClick={handleAvatarUpload}
                  disabled={isUploadingAvatar}
                >
                  {isUploadingAvatar ? <LoaderCircle className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />}
                  {isUploadingAvatar ? 'Uploading…' : 'Upload'}
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* ── Edit Form ── */}
        <Card className="rounded-[34px] border-outline-variant/12 bg-surface-container-low/90 p-8 sm:p-10">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Pencil className="size-5" />
            </div>
            <div>
              <CardTitle>Edit Profile</CardTitle>
              <CardDescription className="mt-0.5">
                Update your name, age, and how your profile appears to others.
              </CardDescription>
            </div>
          </div>

          <form className="mt-8 space-y-6" onSubmit={handleSaveProfile}>
            <div className="grid gap-6 lg:grid-cols-2">
              <Field label="Display name">
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  className={inputClassName}
                  placeholder="Alex Chen"
                  required
                  disabled={isSavingProfile}
                />
              </Field>

              <Field label="Email">
                <input
                  value={user?.email ?? ''}
                  className={`${inputClassName} opacity-60 cursor-not-allowed`}
                  disabled
                  readOnly
                />
              </Field>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Field label="Age">
                <input
                  value={age}
                  onChange={(event) => setAge(event.target.value)}
                  className={inputClassName}
                  placeholder="22"
                  inputMode="numeric"
                  disabled={isSavingProfile}
                />
              </Field>

              <Field label="Profile completeness">
                <div className="flex h-14 items-center gap-4 rounded-2xl border border-outline-variant/25 bg-surface-container px-4">
                  <div className="flex-1"><Progress value={completeness} /></div>
                  <span className="text-sm font-bold text-secondary">{completeness}%</span>
                </div>
              </Field>
            </div>

            <Field label="Bio">
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                className={textAreaClassName}
                placeholder="Tell others a bit about yourself and your learning goals."
                maxLength={280}
                disabled={isSavingProfile}
              />
              <span className="text-right text-xs text-on-surface-variant">
                {bio.length}/280
              </span>
            </Field>

            <div className="flex flex-col gap-3 pt-2 sm:flex-row sm:justify-end">
              <Button type="submit" className="sm:min-w-44" disabled={isSavingProfile}>
                {isSavingProfile ? <LoaderCircle className="size-4 animate-spin" aria-hidden="true" /> : <Save className="size-4" />}
                {isSavingProfile ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </form>
        </Card>
      </div>
    </AppShell>
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

function computeCompleteness({
  displayName,
  age,
  bio,
  avatarSrc,
}: {
  displayName: string
  age: string
  bio: string
  avatarSrc: string | null
}) {
  let score = 25
  if (displayName.trim().length >= 2) {
    score += 25
  }
  if (age.trim() !== '') {
    score += 20
  }
  if (bio.trim() !== '') {
    score += 15
  }
  if (avatarSrc) {
    score += 15
  }
  return Math.min(score, 100)
}
