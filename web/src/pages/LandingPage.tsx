import {
  ArrowRight,
  BookOpenCheck,
  CalendarDays,
  Camera,
  ChartColumnBig,
  GraduationCap,
  Hand,
  Menu,
  MessageSquare,
  Sparkles,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'

import { SectionReveal } from '../components/ui/section-reveal'
import { Badge } from '../components/ui/badge'
import { buttonVariants } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/utils'

const STEPS = [
  {
    step: '01',
    title: 'Learn the signs',
    description: 'Follow guided lessons through the ASL alphabet and core vocabulary with reference videos, handshape cues, and structured repetition.',
    icon: BookOpenCheck,
    color: 'primary' as const,
  },
  {
    step: '02',
    title: 'Practice with your camera',
    description: 'Sign in front of your webcam and get instant AI feedback. The model reads your hand in real time and confirms when you nail it.',
    icon: Camera,
    color: 'secondary' as const,
  },
  {
    step: '03',
    title: 'Track your progress',
    description: 'See your streaks, accuracy trends, and weak spots. Know exactly what to practice next instead of guessing.',
    icon: ChartColumnBig,
    color: 'tertiary' as const,
  },
]

const FEATURES = [
  {
    title: 'Alphabet Coach',
    description: 'Swipeable cards with reference media, handshape guides, and a practice mode that auto-advances when the AI confirms your sign.',
    icon: Hand,
    badge: 'Core',
  },
  {
    title: 'Live Recognition',
    description: 'A dedicated camera workspace with real-time predictions, confidence scores, and stability gates so you know your sign is clean.',
    icon: Camera,
    badge: 'AI-powered',
  },
  {
    title: 'Smart Progress',
    description: 'Completion tracking, accuracy breakdowns, and personalized recommendations that turn scattered practice into a clear learning path.',
    icon: ChartColumnBig,
    badge: 'Analytics',
  },
]

const TEACHER_FEATURES = [
  { title: 'Dashboard', description: 'See bookings, student activity, and teaching readiness at a glance.', icon: GraduationCap },
  { title: 'Schedule', description: 'Manage lesson requests and keep your availability visible to students.', icon: CalendarDays },
  { title: 'Messages', description: 'Communicate with students directly inside the platform.', icon: MessageSquare },
]

export function LandingPage() {
  const { user } = useAuth()
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const primaryCta = user ? '/app/dashboard' : '/register'
  const primaryLabel = user ? 'Open Dashboard' : 'Start Learning Free'
  const secondaryCta = user?.role === 'teacher' ? '/app/teacher' : user ? '/app/learn' : '/teacher/register'
  const secondaryLabel = user?.role === 'teacher' ? 'Teacher Workspace' : user ? 'Learning Hub' : 'Join as Teacher'

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-on-background">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-20 top-0 size-[26rem] rounded-full bg-primary/14 blur-[140px]" />
        <div className="absolute right-[-8rem] top-24 size-[24rem] rounded-full bg-secondary/12 blur-[150px]" />
      </div>

      {/* ── Header ── */}
      <header className="sticky top-0 z-40 px-4 py-4 sm:px-8">
        <div className="ui-panel-soft mx-auto flex max-w-7xl items-center justify-between gap-4 rounded-[28px] px-4 py-3 sm:px-5">
          <Link to="/" className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--primary)_0%,var(--primary-container)_62%,var(--secondary)_150%)] text-[#06111d] shadow-[0_18px_42px_rgba(109,127,240,0.24)]">
              <Sparkles className="size-5" />
            </div>
            <span className="font-headline text-xl font-black tracking-tight text-on-surface sm:text-2xl">
              SignSpeak AI
            </span>
          </Link>

          <nav className="hidden items-center gap-2 md:flex">
            <a href="#how-it-works" className={buttonVariants({ variant: 'ghost' })}>How It Works</a>
            <a href="#features" className={buttonVariants({ variant: 'ghost' })}>Features</a>
            <a href="#teachers" className={buttonVariants({ variant: 'ghost' })}>Teachers</a>
            {user ? (
              <Link to="/app/dashboard" className={buttonVariants()}>Open Workspace</Link>
            ) : (
              <>
                <Link to="/login" className={buttonVariants({ variant: 'ghost' })}>Sign In</Link>
                <Link to="/register" className={buttonVariants()}>Get Started</Link>
              </>
            )}
          </nav>

          <button
            type="button"
            className="ui-panel-soft flex size-10 items-center justify-center rounded-2xl text-on-surface-variant md:hidden"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label={mobileMenuOpen ? 'Close menu' : 'Open menu'}
          >
            {mobileMenuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="mx-auto mt-3 max-w-7xl md:hidden">
            <div className="ui-panel rounded-[26px] p-3">
              <div className="grid gap-2">
                <a href="#how-it-works" className={buttonVariants({ variant: 'ghost' })} onClick={() => setMobileMenuOpen(false)}>How It Works</a>
                <a href="#features" className={buttonVariants({ variant: 'ghost' })} onClick={() => setMobileMenuOpen(false)}>Features</a>
                <a href="#teachers" className={buttonVariants({ variant: 'ghost' })} onClick={() => setMobileMenuOpen(false)}>Teachers</a>
                {user ? (
                  <Link to="/app/dashboard" className={buttonVariants()} onClick={() => setMobileMenuOpen(false)}>Open Workspace</Link>
                ) : (
                  <>
                    <Link to="/login" className={buttonVariants({ variant: 'secondary' })} onClick={() => setMobileMenuOpen(false)}>Sign In</Link>
                    <Link to="/register" className={buttonVariants()} onClick={() => setMobileMenuOpen(false)}>Get Started</Link>
                  </>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      <main className="relative mx-auto flex max-w-7xl flex-col gap-24 px-4 pb-32 pt-12 sm:px-8 sm:pt-20">
        {/* ── Hero ── */}
        <SectionReveal className="flex flex-col items-center text-center">
          <Badge className="border-secondary/10 bg-secondary/10 text-secondary">
            AI-powered sign language learning
          </Badge>

          <h1 className="mt-6 max-w-4xl font-headline text-5xl font-extrabold leading-[1.02] tracking-tight text-on-surface sm:text-6xl lg:text-7xl">
            Sign language is a superpower.
            <span className="mt-2 block bg-[linear-gradient(135deg,var(--primary),var(--secondary))] bg-clip-text text-transparent">
              Start learning it today.
            </span>
          </h1>

          <p className="mt-6 max-w-2xl text-lg leading-8 text-on-surface-variant sm:text-xl">
            Practice ASL with guided lessons, get real-time AI feedback through your webcam,
            and track your progress — all in one place.
          </p>

          <div className="mt-10 flex flex-col gap-4 sm:flex-row">
            <Link to={primaryCta} className={cn(buttonVariants({ size: 'lg' }), 'min-w-52')}>
              {primaryLabel}
              <ArrowRight className="size-4" />
            </Link>
            <Link to={secondaryCta} className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'min-w-52')}>
              <GraduationCap className="size-4" />
              {secondaryLabel}
            </Link>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm text-on-surface-variant">
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-secondary" />
              Free to start
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-secondary" />
              No downloads required
            </span>
            <span className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-secondary" />
              Works in your browser
            </span>
          </div>
        </SectionReveal>

        {/* ── How It Works ── */}
        <SectionReveal delay={0.06} id="how-it-works" className="flex flex-col items-center gap-12">
          <div className="text-center">
            <Badge className="border-primary/10 bg-primary/10 text-primary">How it works</Badge>
            <h2 className="mt-5 font-headline text-4xl font-extrabold tracking-tight text-on-surface sm:text-5xl">
              Three steps. One learning loop.
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-on-surface-variant">
              SignSpeak AI is built around a simple cycle: learn the sign, practice it live, and see what to improve.
            </p>
          </div>

          <div className="grid w-full gap-6 lg:grid-cols-3">
            {STEPS.map((item, i) => (
              <StepCard key={item.step} {...item} isLast={i === STEPS.length - 1} />
            ))}
          </div>
        </SectionReveal>

        {/* ── Features ── */}
        <SectionReveal delay={0.1} id="features" className="flex flex-col items-center gap-12">
          <div className="text-center">
            <Badge className="border-secondary/10 bg-secondary/10 text-secondary">Features</Badge>
            <h2 className="mt-5 font-headline text-4xl font-extrabold tracking-tight text-on-surface sm:text-5xl">
              Everything you need to learn ASL
            </h2>
          </div>

          <div className="grid w-full gap-6 md:grid-cols-3">
            {FEATURES.map((item) => (
              <FeatureCard key={item.title} {...item} />
            ))}
          </div>
        </SectionReveal>

        {/* ── Teachers ── */}
        <SectionReveal delay={0.14} id="teachers">
          <Card className="relative overflow-hidden rounded-[36px] p-8 sm:p-12">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_84%_16%,rgba(75,225,199,0.10),transparent_24%),radial-gradient(circle_at_12%_80%,rgba(142,162,255,0.10),transparent_24%)]" />
            <div className="relative grid gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-center">
              <div>
                <Badge className="border-secondary/10 bg-secondary/10 text-secondary">For teachers</Badge>
                <h2 className="mt-5 font-headline text-4xl font-extrabold tracking-tight text-on-surface sm:text-5xl">
                  Teach sign language on your terms
                </h2>
                <p className="mt-5 text-base leading-8 text-on-surface-variant">
                  Set up your public profile, manage lesson requests, and communicate with students —
                  all through a dedicated teacher workspace.
                </p>
                <Link
                  to={user?.role === 'teacher' ? '/app/teacher' : '/teacher/register'}
                  className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'mt-8')}
                >
                  <GraduationCap className="size-4" />
                  {user?.role === 'teacher' ? 'Open Teacher Workspace' : 'Join as a Teacher'}
                </Link>
              </div>

              <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
                {TEACHER_FEATURES.map((item) => (
                  <TeacherFeature key={item.title} {...item} />
                ))}
              </div>
            </div>
          </Card>
        </SectionReveal>

        {/* ── Final CTA ── */}
        <SectionReveal delay={0.18}>
          <div className="flex flex-col items-center gap-8 text-center">
            <h2 className="max-w-3xl font-headline text-4xl font-extrabold tracking-tight text-on-surface sm:text-5xl">
              Ready to start signing?
            </h2>
            <p className="max-w-xl text-base leading-8 text-on-surface-variant">
              Join SignSpeak AI and start learning American Sign Language with real-time AI feedback — right from your browser.
            </p>
            <div className="flex flex-col gap-4 sm:flex-row">
              <Link to={primaryCta} className={cn(buttonVariants({ size: 'lg' }), 'min-w-52')}>
                {primaryLabel}
                <ArrowRight className="size-4" />
              </Link>
              <Link to={secondaryCta} className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'min-w-52')}>
                {secondaryLabel}
              </Link>
            </div>
          </div>
        </SectionReveal>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-outline-variant/12 py-8 text-center text-sm text-on-surface-variant">
        <p>&copy; {new Date().getFullYear()} SignSpeak AI. Built for the deaf and hard-of-hearing community.</p>
      </footer>
    </div>
  )
}

function StepCard({
  step,
  title,
  description,
  icon: Icon,
  color,
  isLast,
}: {
  step: string
  title: string
  description: string
  icon: LucideIcon
  color: 'primary' | 'secondary' | 'tertiary'
  isLast: boolean
}) {
  const colorMap = {
    primary: { bg: 'bg-primary/10', text: 'text-primary', dot: 'bg-primary' },
    secondary: { bg: 'bg-secondary/10', text: 'text-secondary', dot: 'bg-secondary' },
    tertiary: { bg: 'bg-tertiary/10', text: 'text-tertiary', dot: 'bg-tertiary' },
  }
  const c = colorMap[color]

  return (
    <Card className="relative flex h-full flex-col rounded-[32px] p-7">
      <div className="flex items-center gap-4">
        <div className={cn('flex size-12 items-center justify-center rounded-2xl', c.bg, c.text)}>
          <Icon className="size-5" />
        </div>
        <span className={cn('font-headline text-sm font-bold uppercase tracking-[0.2em]', c.text)}>
          {step}
        </span>
      </div>
      <h3 className="mt-5 font-headline text-2xl font-bold text-on-surface">{title}</h3>
      <p className="mt-3 flex-1 text-sm leading-7 text-on-surface-variant">{description}</p>

      {!isLast && (
        <div className="absolute -right-3 top-1/2 z-10 hidden size-6 -translate-y-1/2 items-center justify-center lg:flex">
          <ArrowRight className={cn('size-4', c.text)} />
        </div>
      )}
    </Card>
  )
}

function FeatureCard({
  title,
  description,
  icon: Icon,
  badge,
}: {
  title: string
  description: string
  icon: LucideIcon
  badge: string
}) {
  return (
    <Card className="ui-panel-interactive flex h-full flex-col rounded-[32px] p-7">
      <div className="flex items-start justify-between gap-4">
        <div className="flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <Icon className="size-5" />
        </div>
        <Badge className="border-outline-variant/15 text-on-surface-variant">{badge}</Badge>
      </div>
      <h3 className="mt-6 font-headline text-2xl font-bold text-on-surface">{title}</h3>
      <p className="mt-3 flex-1 text-sm leading-7 text-on-surface-variant">{description}</p>
    </Card>
  )
}

function TeacherFeature({
  title,
  description,
  icon: Icon,
}: {
  title: string
  description: string
  icon: LucideIcon
}) {
  return (
    <div className="ui-panel-soft flex items-start gap-4 rounded-[22px] p-5">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="font-semibold text-on-surface">{title}</p>
        <p className="mt-1 text-sm leading-7 text-on-surface-variant">{description}</p>
      </div>
    </div>
  )
}
