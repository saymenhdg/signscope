import { ArrowLeft, ArrowRight, Chrome, Github, Sparkles } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { buttonVariants } from '../components/ui/button'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/utils'

type AuthMode = 'login' | 'register' | 'forgot' | 'reset'

type AuthPageProps = {
  mode: AuthMode
}

export function AuthPage({ mode }: AuthPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const { signIn, signInWithProvider, signUp, requestPasswordReset, resetPassword, providers } = useAuth()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [resetUrl, setResetUrl] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const redirectTo = (location.state as { from?: string } | null)?.from ?? '/app/dashboard'
  const isRegister = mode === 'register'
  const isForgot = mode === 'forgot'
  const isReset = mode === 'reset'
  const authError = searchParams.get('authError')
  const resetToken = searchParams.get('token') ?? ''

  useEffect(() => {
    if (authError) {
      setError(authError)
    }
  }, [authError])

  useEffect(() => {
    if (searchParams.get('reset') === 'success') {
      setMessage('Password updated. Sign in with your new password.')
    }
  }, [searchParams])

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setMessage(null)
    setResetUrl(null)

    if ((isRegister || isReset) && password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    if (isReset && !resetToken) {
      setError('This reset link is missing a token. Request a new password reset link.')
      return
    }

    setIsSubmitting(true)
    void (async () => {
      try {
        if (isRegister) {
          await signUp({
            display_name: displayName.trim(),
            email: email.trim(),
            password,
          })
          navigate(redirectTo, { replace: true })
          return
        }

        if (isForgot) {
          const response = await requestPasswordReset(email.trim())
          setMessage(response.detail)
          setResetUrl(response.reset_url)
          return
        }

        if (isReset) {
          await resetPassword(resetToken, password)
          navigate('/login?reset=success', { replace: true })
          return
        }

        await signIn({ email: email.trim(), password })
        navigate(redirectTo, { replace: true })
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Authentication failed.')
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  function title() {
    if (isRegister) return 'Register'
    if (isForgot) return 'Forgot Password'
    if (isReset) return 'Reset Password'
    return 'Sign In'
  }

  function subtitle() {
    if (isRegister) return 'Start your workspace setup.'
    if (isForgot) return 'Generate a reset link for your account.'
    if (isReset) return 'Set a new password for your account.'
    return 'Continue where you left off.'
  }

  function heroTitle() {
    if (isRegister) return 'Create your translation workspace.'
    if (isForgot) return 'Recover access to your workspace.'
    if (isReset) return 'Set a new password and continue.'
    return 'Welcome back to your sign lab.'
  }

  function heroText() {
    if (isRegister) {
      return 'Register once to unlock live translation, lesson tracking, upload review, and progress analytics inside one workspace.'
    }
    if (isForgot) {
      return 'Request a password reset link for your account. In local development, the app shows the reset URL directly because outbound email is not configured.'
    }
    if (isReset) {
      return 'Choose a strong new password, then sign back in to continue training, reviewing, and tracking progress.'
    }
    return 'Sign in to continue training your alphabet model, review recent translations, and monitor learning progress.'
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
              <p className="font-headline text-6xl font-extrabold leading-none tracking-tight text-on-surface">{heroTitle()}</p>
              <p className="max-w-xl text-lg leading-8 text-on-surface-variant">{heroText()}</p>
            </div>

            <div className="grid gap-4 rounded-[30px] border border-outline-variant/20 bg-surface-container-low/70 p-6 backdrop-blur-xl">
              <div className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Inside your account</div>
              <div className="grid gap-4">
                <FeaturePoint label="FastAPI + PostgreSQL session-backed workspace state" />
                <FeaturePoint label="Dashboard, upload queue, learning coach, and progress analytics in one place" />
                <FeaturePoint label="Email/password plus Google and GitHub sign-in when provider keys are configured" />
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
                <p className="font-headline text-3xl font-black text-on-surface">{title()}</p>
                <p className="text-sm text-on-surface-variant">{subtitle()}</p>
              </div>
            </div>

            {providers.length > 0 && !isForgot && !isReset ? (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  {providers.map((provider) => {
                    const Icon = provider.id === 'github' ? Github : Chrome
                    return (
                      <button
                        key={provider.id}
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => {
                          setError(null)
                          signInWithProvider(provider.id, redirectTo)
                        }}
                        className="flex h-14 items-center justify-center gap-3 rounded-2xl border border-outline-variant/25 bg-surface-container px-4 text-sm font-semibold text-on-surface transition-colors hover:border-secondary/35 hover:bg-surface-container-high disabled:cursor-not-allowed disabled:opacity-70"
                      >
                        <Icon className="size-4 text-secondary" />
                        <span>{isRegister ? `Continue with ${provider.label}` : `Sign in with ${provider.label}`}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="my-6 flex items-center gap-4">
                  <div className="h-px flex-1 bg-outline-variant/20" />
                  <span className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Or use email</span>
                  <div className="h-px flex-1 bg-outline-variant/20" />
                </div>
              </>
            ) : null}

            <form className="space-y-5" onSubmit={handleSubmit}>
              {isRegister ? (
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
              ) : null}

              {!isReset ? (
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
              ) : null}

              {!isForgot ? (
                <Field label={isReset ? 'New password' : 'Password'}>
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
              ) : null}

              {isRegister || isReset ? (
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
              ) : null}

              {message ? (
                <div className="rounded-2xl border border-secondary/25 bg-secondary/10 px-4 py-3 text-sm text-secondary">
                  <p>{message}</p>
                  {resetUrl ? (
                    <a href={resetUrl} className="mt-2 inline-block font-semibold underline">
                      Open reset page
                    </a>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">
                  {error}
                </div>
              ) : null}

              <button type="submit" disabled={isSubmitting} className={cn(buttonVariants({ size: 'lg' }), 'w-full rounded-2xl')}>
                <span>
                  {isSubmitting
                    ? 'Processing...'
                    : isRegister
                      ? 'Create Account'
                      : isForgot
                        ? 'Generate Reset Link'
                        : isReset
                          ? 'Update Password'
                          : 'Sign In'}
                </span>
                <ArrowRight className="size-4" />
              </button>
            </form>

            {mode === 'login' ? (
              <div className="mt-6 space-y-3 text-center text-sm text-on-surface-variant">
                <Link to="/forgot-password" className="font-semibold text-secondary transition-colors hover:text-secondary-fixed">
                  Forgot password?
                </Link>
                <p>
                  Don&apos;t have an account?{' '}
                  <Link to="/register" className="font-semibold text-secondary transition-colors hover:text-secondary-fixed">
                    Create one
                  </Link>
                </p>
              </div>
            ) : null}

            {mode === 'register' ? (
              <p className="mt-6 text-center text-sm text-on-surface-variant">
                Already have an account?{' '}
                <Link to="/login" className="font-semibold text-secondary transition-colors hover:text-secondary-fixed">
                  Sign in
                </Link>
              </p>
            ) : null}

            {mode === 'forgot' ? (
              <p className="mt-6 text-center text-sm text-on-surface-variant">
                Remembered your password?{' '}
                <Link to="/login" className="font-semibold text-secondary transition-colors hover:text-secondary-fixed">
                  Go back to sign in
                </Link>
              </p>
            ) : null}

            {mode === 'reset' ? (
              <p className="mt-6 text-center text-sm text-on-surface-variant">
                Need a new link?{' '}
                <Link to="/forgot-password" className="font-semibold text-secondary transition-colors hover:text-secondary-fixed">
                  Request another reset
                </Link>
              </p>
            ) : null}
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
