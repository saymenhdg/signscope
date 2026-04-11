import { CalendarDays, Camera, Mail, Save, UserCircle2 } from 'lucide-react'
import { type ReactNode, useEffect, useMemo, useState } from 'react'

import { AppShell } from '../components/app-shell'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { apiRequest } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { User } from '../lib/types'

const inputClassName =
  'h-14 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 text-base text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-secondary/60'

const textAreaClassName =
  'min-h-32 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 py-3 text-base text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-secondary/60'

export function ProfilePage() {
  const { user, restoreSession } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [age, setAge] = useState('')
  const [bio, setBio] = useState('')
  const [selectedAvatar, setSelectedAvatar] = useState<File | null>(null)
  const [localAvatarPreview, setLocalAvatarPreview] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
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

  async function handleSaveProfile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaveMessage(null)
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
      setSaveMessage('Profile updated.')
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
    setSaveMessage(null)
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
      setSaveMessage('Avatar updated.')
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Failed to upload avatar.')
    } finally {
      setIsUploadingAvatar(false)
    }
  }

  return (
    <AppShell
      title="Profile"
      subtitle="Edit your account details, set your age, and upload a profile image for the workspace."
    >
      {(error ?? saveMessage) ? (
        <div
          className={
            error
              ? 'mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error'
              : 'mb-6 rounded-2xl border border-secondary/20 bg-secondary/10 px-4 py-3 text-sm text-secondary'
          }
        >
          {error ?? saveMessage}
        </div>
      ) : null}

      <div className="grid gap-8 xl:grid-cols-[0.72fr_1.28fr]">
        <Card className="rounded-[34px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex flex-col items-center text-center">
            {avatarSrc ? (
              <img
                src={avatarSrc}
                alt={user?.display_name ?? 'Profile avatar'}
                className="size-36 rounded-[30px] border border-outline-variant/15 object-cover shadow-lg"
              />
            ) : (
              <div className="flex size-36 items-center justify-center rounded-[30px] border border-outline-variant/15 bg-surface-container text-secondary shadow-lg">
                <UserCircle2 className="size-16" />
              </div>
            )}

            <p className="mt-6 font-headline text-3xl font-black text-on-surface">{user?.display_name}</p>
            <p className="mt-2 text-sm text-on-surface-variant">{user?.email}</p>
          </div>

          <div className="mt-8 space-y-4">
            <ProfileFact icon={Mail} label="Email" value={user?.email ?? '...'} />
            <ProfileFact icon={CalendarDays} label="Joined" value={joinedLabel} />
            <ProfileFact icon={UserCircle2} label="Age" value={user?.age ? String(user.age) : 'Not set'} />
          </div>

          <div className="mt-8 rounded-[26px] border border-outline-variant/10 bg-surface-container p-5">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Profile image</p>
            <p className="mt-3 text-sm leading-7 text-on-surface-variant">
              Upload a JPG, PNG, or WEBP image up to 5 MB. It will appear across the workspace profile entry points.
            </p>

            <label className="mt-5 flex cursor-pointer items-center justify-center gap-3 rounded-2xl border border-outline-variant/20 bg-surface-container-high px-4 py-3 text-sm font-semibold text-on-surface transition-colors hover:bg-surface-container-highest">
              <Camera className="size-4 text-secondary" />
              <span>{selectedAvatar ? selectedAvatar.name : 'Choose image'}</span>
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.webp,image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) => {
                  setSelectedAvatar(event.target.files?.[0] ?? null)
                }}
              />
            </label>

            <Button className="mt-4 w-full" onClick={handleAvatarUpload} disabled={!selectedAvatar || isUploadingAvatar}>
              <Camera className="size-4" />
              {isUploadingAvatar ? 'Uploading...' : 'Upload Avatar'}
            </Button>
          </div>
        </Card>

        <Card className="rounded-[34px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <CardTitle>Edit Profile</CardTitle>
          <CardDescription className="mt-2">
            Update how your account appears inside the learning and translation workspace.
          </CardDescription>

          <form className="mt-8 space-y-5" onSubmit={handleSaveProfile}>
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

            <div className="grid gap-5 lg:grid-cols-2">
              <Field label="Email">
                <input
                  value={user?.email ?? ''}
                  className={`${inputClassName} opacity-75`}
                  disabled
                  readOnly
                />
              </Field>

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
            </div>

            <Field label="Bio">
              <textarea
                value={bio}
                onChange={(event) => setBio(event.target.value)}
                className={textAreaClassName}
                placeholder="Add a short profile note for your learning goals."
                maxLength={280}
                disabled={isSavingProfile}
              />
            </Field>

            <div className="flex items-center justify-between gap-4 rounded-[24px] border border-outline-variant/10 bg-surface-container p-5">
              <div>
                <p className="font-semibold text-on-surface">Profile completeness</p>
                <p className="mt-1 text-sm text-on-surface-variant">
                  Add age, bio, and an image so the profile feels complete across the app.
                </p>
              </div>
              <div className="text-right">
                <p className="font-headline text-3xl font-black text-secondary">
                  {computeCompleteness({ displayName, age, bio, avatarSrc })}%
                </p>
              </div>
            </div>

            <Button type="submit" className="w-full sm:w-auto" disabled={isSavingProfile}>
              <Save className="size-4" />
              {isSavingProfile ? 'Saving...' : 'Save Changes'}
            </Button>
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

function ProfileFact({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Mail
  label: string
  value: string
}) {
  return (
    <div className="flex items-center gap-4 rounded-[24px] border border-outline-variant/10 bg-surface-container p-4">
      <div className="flex size-11 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</p>
        <p className="mt-1 truncate text-sm font-semibold text-on-surface">{value}</p>
      </div>
    </div>
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
