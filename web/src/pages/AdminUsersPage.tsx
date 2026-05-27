import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, LoaderCircle, Pencil, Shield, Users, X } from 'lucide-react'
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'

import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { useToast } from '../components/ui/toast'
import { apiRequest } from '../lib/api'
import type { AdminUserListItem, AdminUserUpdatePayload, AdminUsersResponse } from '../lib/types'

const inputClassName =
  'h-14 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 text-base text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-secondary/60'
const textAreaClassName =
  'min-h-32 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 py-3 text-base text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-secondary/60'

export function AdminUsersPage() {
  const queryClient = useQueryClient()
  const { toast } = useToast()
  const { data, error } = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiRequest<AdminUsersResponse>('/api/admin/users'),
  })
  const [selectedUser, setSelectedUser] = useState<AdminUserListItem | null>(null)
  const [displayName, setDisplayName] = useState('')
  const [role, setRole] = useState<'student' | 'teacher' | 'admin'>('student')
  const [age, setAge] = useState('')
  const [bio, setBio] = useState('')
  const [isEmailVerified, setIsEmailVerified] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  useEffect(() => {
    if (!selectedUser) return
    setDisplayName(selectedUser.display_name)
    setRole(selectedUser.role)
    setAge(selectedUser.age === null ? '' : String(selectedUser.age))
    setBio(selectedUser.bio ?? '')
    setIsEmailVerified(selectedUser.is_email_verified)
    setFormError(null)
  }, [selectedUser])

  const mutation = useMutation({
    mutationFn: ({ userId, payload }: { userId: number; payload: AdminUserUpdatePayload }) =>
      apiRequest<AdminUserListItem>(`/api/admin/users/${userId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-overview'] })
      await queryClient.invalidateQueries({ queryKey: ['admin-teachers'] })
      toast({ title: 'User updated', variant: 'success' })
      setSelectedUser(null)
    },
  })

  async function handleSave() {
    if (!selectedUser) return
    setFormError(null)
    try {
      const payload: AdminUserUpdatePayload = {
        display_name: displayName.trim(),
        role,
        age: age.trim() ? Number(age) : null,
        bio: bio.trim() || null,
        is_email_verified: isEmailVerified,
      }
      await mutation.mutateAsync({ userId: selectedUser.id, payload })
    } catch (saveError) {
      setFormError(saveError instanceof Error ? saveError.message : 'Failed to update user.')
    }
  }

  return (
    <AppShell title="Users" subtitle="Manage account roles and profile data for students, teachers, and admins.">
      {error ? (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
          {error instanceof Error ? error.message : 'Failed to load users.'}
        </div>
      ) : null}

      <Card className="rounded-[30px] border-outline-variant/12 p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <CardTitle>All Users</CardTitle>
            <CardDescription>Edit display names, roles, bios, and verification state.</CardDescription>
          </div>
          <Users className="size-5 text-secondary" />
        </div>

        <div className="mt-6 space-y-4">
          {data ? (
            data.users.map((user) => (
              <div key={user.id} className="rounded-[20px] border border-outline-variant/10 bg-surface-container p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-semibold text-on-surface">{user.display_name}</p>
                      <Badge className="border-outline-variant/15 bg-background/45 text-on-surface-variant">{user.role}</Badge>
                      {user.is_email_verified ? (
                        <Badge className="border-secondary/10 bg-secondary/10 text-secondary">
                          <CheckCheck className="mr-1 size-3" />
                          verified
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 truncate text-sm text-on-surface-variant">{user.email}</p>
                    {user.bio ? <p className="mt-3 text-sm leading-7 text-on-surface-variant">{user.bio}</p> : null}
                  </div>
                  <Button variant="secondary" size="sm" onClick={() => setSelectedUser(user)}>
                    <Pencil className="size-4" />
                    Edit
                  </Button>
                </div>
              </div>
            ))
          ) : (
            Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-28 rounded-[20px]" />)
          )}
        </div>
      </Card>

      {selectedUser ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onClick={() => setSelectedUser(null)}>
          <div
            className="w-full max-w-3xl rounded-[32px] border border-outline-variant/15 bg-surface-container-low/95 p-8 shadow-[0_40px_110px_rgba(4,8,20,0.6)]"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label={`Edit ${selectedUser.display_name}`}
          >
            <div className="mb-8 flex items-start justify-between gap-4">
              <div>
                <h2 className="font-headline text-3xl font-black text-on-surface">Edit User</h2>
                <p className="mt-2 text-sm text-on-surface-variant">{selectedUser.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedUser(null)}
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
              <div className="grid gap-5 lg:grid-cols-2">
                <Field label="Role">
                  <select value={role} onChange={(event) => setRole(event.target.value as 'student' | 'teacher' | 'admin')} className={inputClassName}>
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="admin">Admin</option>
                  </select>
                </Field>
                <Field label="Age">
                  <input value={age} onChange={(event) => setAge(event.target.value)} className={inputClassName} inputMode="numeric" placeholder="Optional" />
                </Field>
              </div>
              <Field label="Bio">
                <textarea value={bio} onChange={(event) => setBio(event.target.value)} className={textAreaClassName} placeholder="Short account bio" />
              </Field>
              <div className="flex items-center justify-between rounded-3xl border border-outline-variant/10 bg-surface-container p-5">
                <div>
                  <p className="font-semibold text-on-surface">Email verification</p>
                  <p className="mt-1 text-sm text-on-surface-variant">Mark whether this account should count as verified.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setIsEmailVerified((current) => !current)}
                  className={`relative inline-flex h-8 w-[3.75rem] items-center rounded-full transition-colors ${isEmailVerified ? 'bg-secondary' : 'bg-surface-container-highest'}`}
                  aria-pressed={isEmailVerified}
                  aria-label="Toggle email verification"
                >
                  <span className={`inline-block size-6 transform rounded-full bg-background shadow transition-transform ${isEmailVerified ? 'translate-x-8' : 'translate-x-1'}`} />
                </button>
              </div>
            </div>

            <div className="mt-8 flex justify-end gap-3">
              <Button variant="secondary" onClick={() => setSelectedUser(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={mutation.isPending}>
                {mutation.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Shield className="size-4" />}
                {mutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
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
