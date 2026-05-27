import { ArrowLeft, ArrowRight, Chrome, Github, LoaderCircle, Sparkles } from 'lucide-react'
import { type ReactNode, useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'

import { buttonVariants } from '../components/ui/button'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/utils'

type AuthMode = 'login' | 'register' | 'forgot' | 'reset'

type AuthPageProps = {
  mode: AuthMode
  audience?: 'student' | 'teacher' | 'admin'
}

function defaultRedirectPath(role: 'student' | 'teacher' | 'admin') {
  if (role === 'teacher') return '/app/teacher'
  if (role === 'admin') return '/app/admin'
  return '/app/dashboard'
}

export function AuthPage({ mode, audience = 'student' }: AuthPageProps) {
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

  const isRegister = mode === 'register'
  const isForgot = mode === 'forgot'
  const isReset = mode === 'reset'
  const isTeacherAudience = audience === 'teacher'
  const isAdminAudience = audience === 'admin'
  const authError = searchParams.get('authError')
  const resetToken = searchParams.get('token') ?? ''
  const fallbackRedirect = isTeacherAudience ? '/app/teacher' : isAdminAudience ? '/app/admin' : '/app/dashboard'
  const requestedRedirect = (location.state as { from?: string } | null)?.from
  const redirectTo = requestedRedirect ?? fallbackRedirect

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
          const user = await signUp({
            display_name: displayName.trim(),
            email: email.trim(),
            password,
            role: audience,
          })
          navigate(requestedRedirect ?? defaultRedirectPath(user.role), { replace: true })
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

        const user = await signIn({ email: email.trim(), password, role: isTeacherAudience ? 'teacher' : isAdminAudience ? 'admin' : undefined })
        navigate(requestedRedirect ?? defaultRedirectPath(user.role), { replace: true })
      } catch (submitError) {
        setError(submitError instanceof Error ? submitError.message : 'Authentication failed.')
      } finally {
        setIsSubmitting(false)
      }
    })()
  }

  function title() {
    if (isAdminAudience) return 'Admin Sign In'
    if (isTeacherAudience && isRegister) return 'Teacher Register'
    if (isTeacherAudience) return 'Teacher Sign In'
    if (isRegister) return 'Register'
    if (isForgot) return 'Forgot Password'
    if (isReset) return 'Reset Password'
    return 'Sign In'
  }

  function subtitle() {
    if (isAdminAudience) return 'Access the admin workspace.'
    if (isTeacherAudience && isRegister) return 'Set up your teaching profile.'
    if (isTeacherAudience) return 'Access your teaching dashboard.'
    if (isRegister) return 'Create your free account.'
    if (isForgot) return "We'll help you get back in."
    if (isReset) return 'Choose a new password.'
    return 'Continue where you left off.'
  }

  function heroTitle() {
    if (isAdminAudience) return 'System administration access.'
    if (isTeacherAudience && isRegister) return 'Start teaching sign language.'
    if (isTeacherAudience) return 'Welcome back, teacher.'
    if (isRegister) return 'Start your sign language journey.'
    if (isForgot) return 'Forgot your password?'
    if (isReset) return 'Set a new password and continue.'
    return 'Welcome back.'
  }

  function heroText() {
    if (isAdminAudience) {
      return 'Sign in to manage model operations, system analytics, platform users, and deployment-level settings.'
    }
    if (isTeacherAudience && isRegister) {
      return 'Create your teacher account to set up your profile, manage lesson availability, and connect with students learning sign language.'
    }
    if (isTeacherAudience) {
      return 'Sign in to manage your teaching profile, schedule lessons, and communicate with your students.'
    }
    if (isRegister) {
      return 'Create a free account to access guided lessons, practice with live camera recognition, and track your sign language progress.'
    }
    if (isForgot) {
      return "Enter your email address and we'll send you a link to reset your password."
    }
    if (isReset) {
      return 'Choose a strong new password, then sign back in to continue learning.'
    }
    return 'Sign in to continue your lessons, practice with the camera, and track your progress.'
  }

  return (
    <div className="min-h-screen bg-background text-on-background">
      <div className="grid min-h-screen lg:grid-cols-[0.95fr_1.05fr]">
        <section className="relative hidden overflow-hidden bg-[linear-gradient(180deg,var(--background)_0%,var(--surface-low)_100%)] px-10 py-12 lg:block">
          <div className="absolute -left-20 top-0 size-72 rounded-full bg-primary/12 blur-[110px]" />
          <div className="absolute bottom-0 right-0 size-80 rounded-full bg-secondary/10 blur-[130px]" />
          <div className="relative flex h-full flex-col justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-container text-[#0b1326]">
                <Sparkles className="size-5" />
              </div>
              <div>
                <p className="font-headline text-2xl font-black tracking-tight text-primary">SignSpeak AI</p>
                <p className="text-xs uppercase tracking-[0.24em] text-on-surface-variant">Sign language learning platform</p>
              </div>
            </div>

            <div className="space-y-6">
              <p className="font-headline text-6xl font-extrabold leading-none tracking-tight text-on-surface">{heroTitle()}</p>
              <p className="max-w-xl text-lg leading-8 text-on-surface-variant">{heroText()}</p>
            </div>

            <div className="grid gap-4 rounded-[30px] border border-outline-variant/20 bg-surface-container-low/70 p-6 backdrop-blur-xl">
              <div className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">What you'll get</div>
              <div className="grid gap-4">
                <FeaturePoint label="Your learning progress saved securely across sessions" />
                <FeaturePoint label="Guided lessons, live camera practice, and progress tracking in one place" />
                <FeaturePoint label="Sign in with email, or use your Google or GitHub account" />
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

            {providers.length > 0 && !isForgot && !isReset && !isTeacherAudience && !isAdminAudience ? (
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
                <div className="rounded-2xl border border-secondary/25 bg-secondary/10 px-4 py-3 text-sm text-secondary" role="status">
                  <p>{message}</p>
                  {resetUrl ? (
                    <a href={resetUrl} className="mt-2 inline-block font-semibold underline">
                      Open reset page
                    </a>
                  ) : null}
                </div>
              ) : null}

              {error ? (
                <div className="rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">
                  {error}
                </div>
              ) : null}

              <button type="submit" disabled={isSubmitting} className={cn(buttonVariants({ size: 'lg' }), 'w-full rounded-2xl')}>
                {isSubmitting ? (
                  <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
                ) : null}
                <span>
                  {isSubmitting
                    ? 'Processing…'
                    : isRegister
                      ? isTeacherAudience
                        ? 'Create Teacher Account'
                        : 'Create Account'
                      : isForgot
                        ? 'Send Reset Link'
                        : isReset
                          ? 'Update Password'
                          : isTeacherAudience
                            ? 'Sign In as Teacher'
                            : isAdminAudience
                              ? 'Sign In as Admin'
                            : 'Sign In'}
                </span>
                {!isSubmitting ? <ArrowRight className="size-4" /> : null}
              </button>
            </form>

            {mode === 'login' ? (
              <div className="mt-6 space-y-3 text-center text-sm text-on-surface-variant">
                <Link to="/forgot-password" className="font-semibold text-secondary transition-colors hover:text-secondary-fixed">
                  Forgot password?
                </Link>
                <p>
                  Don&apos;t have an account?{' '}
                  <Link
                    to={isTeacherAudience ? '/teacher/register' : '/register'}
                    className="font-semibold text-secondary transition-colors hover:text-secondary-fixed"
                  >
                    {isTeacherAudience ? 'Create a teacher account' : 'Create one'}
                  </Link>
                </p>
                {!isTeacherAudience && !isAdminAudience ? (
                  <p>
                    Are you teaching on the platform?{' '}
                    <Link to="/teacher/login" className="font-semibold text-secondary transition-colors hover:text-secondary-fixed">
                      Teacher sign in
                    </Link>
                  </p>
                ) : null}
              </div>
            ) : null}

            {mode === 'register' ? (
              <p className="mt-6 text-center text-sm text-on-surface-variant">
                Already have an account?{' '}
                <Link
                  to={isTeacherAudience ? '/teacher/login' : '/login'}
                  className="font-semibold text-secondary transition-colors hover:text-secondary-fixed"
                >
                  {isTeacherAudience ? 'Teacher sign in' : 'Sign in'}
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
