import { ArrowLeft, ArrowRight, Sparkles } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'

import { buttonVariants } from '../components/ui/button'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/utils'

type AuthMode = 'login' | 'register'

type AuthPageProps = {
  mode: AuthMode
}

export function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { signIn, signUp } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/app/dashboard'
  const isRegister = mode === 'register'

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)

    if (isRegister && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setIsSubmitting(true)
    void (async () => {
      try {
        if (isRegister) {
          await signUp({
            display_name: displayName.trim(),
            email,
            password,
          })
        } else {
          await signIn({ email, password })
        }
        navigate(redirectTo, { replace: true })
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Authentication failed.')
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  return (
    <div className="min-h-screen bg-background text-on-background">
      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative hidden overflow-hidden bg-[linear-gradient(180deg,#0b1326_0%,#131b2e_100%)] px-10 py-12 lg:block">
          <div className="absolute -left-20 top-0 size-72 rounded-full bg-primary/12 blur-[110px]" />
          <div className="absolute bottom-0 right-0 size-80 rounded-full bg-secondary/10 blur-[130px]" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-container text-[#0b1326]">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="font-headline text-2xl font-black tracking-tight text-primary">SignSpeak AI</p>
                <p className="text-xs uppercase tracking-[0.24em] text-on-surface-variant">Secure workspace access</p>
              </div>
            </div>

            <div className="space-y-6">
              <p className="font-headline text-6xl font-extrabold leading-none tracking-tight text-on-surface">
                {isRegister ? 'Create your translation workspace.' : 'Welcome back to your sign lab.'}
              </p>
              <p className="max-w-xl text-lg leading-8 text-on-surface-variant">
                {isRegister
                  ? 'Register once to unlock live translation, upload review, and progress analytics inside the same workspace.'
                  : 'Sign in to continue training your alphabet model, review recent translations, and monitor progress.'}
              </p>
            </div>

            <div className="grid gap-4 rounded-[30px] border border-outline-variant/20 bg-surface-container-low/70 p-6 backdrop-blur-xl">
              <div className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Inside your account</div>
              <div className="grid gap-4">
                <FeaturePoint label="Live webcam recognition with FastAPI-backed predictions" />
                <FeaturePoint label="Dashboard, upload queue, and progress analytics in one place" />
                <FeaturePoint label="Session-based authentication with protected routes" />
              </div>
            </div>
          </div>
        </section>

        <section className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-xl rounded-[34px] border border-outline-variant/20 bg-surface-container-low/88 p-7 shadow-[0_30px_80px_rgba(15,23,42,0.48)] backdrop-blur-2xl sm:p-9">
            <div className="mb-8 flex items-center justify-between">
              <Link to="/" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'rounded-2xl')}>
                <ArrowLeft className="size-4" />
                Back
              </Link>
              <div className="text-right">
                <p className="font-headline text-3xl font-black text-on-surface">
                  {isRegister ? 'Register' : 'Sign In'}
                </p>
                <p className="text-sm text-on-surface-variant">
                  {isRegister ? 'Start your workspace setup.' : 'Continue where you left off.'}
                </p>
              </div>
            </div>

            <form className="space-y-5" onSubmit={handleSubmit}>
              {isRegister && (
                <Field label="Display name">
                <input
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  required
                  disabled={isSubmitting}
                  className={inputClassName}
                  placeholder="Alex Chen"
                />
                </Field>
              )}

              <Field label="Email">
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  type="email"
                  required
                  disabled={isSubmitting}
                  className={inputClassName}
                  placeholder="you@example.com"
                />
              </Field>

              <Field label="Password">
                <input
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  type="password"
                  required
                  disabled={isSubmitting}
                  className={inputClassName}
                  placeholder="Minimum 8 characters"
                />
              </Field>

              {isRegister && (
                <Field label="Confirm password">
                  <input
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    type="password"
                    required
                    disabled={isSubmitting}
                    className={inputClassName}
                    placeholder="Repeat your password"
                  />
                </Field>
              )}

              {error && (
                <div className="rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isSubmitting}
                className={cn(buttonVariants({ size: 'lg' }), 'w-full rounded-2xl')}
              >
                <span>{isSubmitting ? 'Processing...' : isRegister ? 'Create Account' : 'Sign In'}</span>
                <ArrowRight className="size-4" />
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-on-surface-variant">
              {isRegister ? 'Already have an account?' : "Don't have an account?"}{' '}
              <Link
                to={isRegister ? '/login' : '/register'}
                className="font-semibold text-secondary transition-colors hover:text-secondary-fixed"
              >
                {isRegister ? 'Sign in' : 'Create one'}
              </Link>
            </p>
          </div>
        </section>
      </div>
    </div>
  )
}

function FeaturePoint({ label }: { label: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 size-2 rounded-full bg-secondary" />
      <p className="text-sm leading-7 text-on-surface-variant">{label}</p>
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

const inputClassName =
  'h-14 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 text-base text-on-surface outline-none transition-colors placeholder:text-on-surface-variant/70 focus:border-secondary/60'
