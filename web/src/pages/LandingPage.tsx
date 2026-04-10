import {
  ArrowRight,
  Bolt,
  BookOpen,
  Camera,
  Globe2,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '../components/ui/badge'
import { buttonVariants } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { useAuth } from '../lib/auth'
import { cn } from '../lib/utils'

const FEATURE_CARDS = [
  {
    title: 'Multilingual Bridge',
    description: 'Translate sign input into spoken-language captions for live conversations and team demos.',
    icon: Globe2,
  },
  {
    title: 'Bulk Upload',
    description: 'Queue recorded clips, review transcripts, and build a reusable translation library.',
    icon: UploadCloud,
  },
  {
    title: 'Learning Platform',
    description: 'Practice letters with live validation, progress tracking, and targeted weak-area drills.',
    icon: BookOpen,
  },
]

export function LandingPage() {
  const { user } = useAuth()

  return (
    <div className="relative min-h-screen overflow-hidden bg-background text-on-background">
      <div className="pointer-events-none absolute -left-28 top-0 size-96 rounded-full bg-primary/10 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-0 right-0 size-[34rem] rounded-full bg-secondary/8 blur-[160px]" />

      <header className="sticky top-0 z-40 border-b border-outline-variant/25 bg-[#0b1326]/88 px-5 py-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary-container text-[#0b1326] shadow-lg shadow-primary/10">
              <Sparkles className="size-5" />
            </div>
            <div>
              <p className="font-headline text-2xl font-black tracking-tight text-primary">SignSpeak AI</p>
              <p className="text-xs uppercase tracking-[0.24em] text-on-surface-variant">Translate the world silently</p>
            </div>
          </div>

          <nav className="hidden items-center gap-2 md:flex">
            <Link to="/" className={buttonVariants({ variant: 'ghost' })}>
              Home
            </Link>
            {user ? (
              <Link to="/app/dashboard" className={buttonVariants()}>
                Open Workspace
              </Link>
            ) : (
              <>
                <Link to="/login" className={buttonVariants({ variant: 'ghost' })}>
                  Sign In
                </Link>
                <Link to="/register" className={buttonVariants()}>
                  Register
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="relative mx-auto grid max-w-7xl gap-16 px-5 pb-24 pt-12 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
        <section className="space-y-8">
          <Badge className="border-secondary/15 bg-secondary/10 text-secondary">Powered by neural gesture recognition</Badge>
          <div className="space-y-5">
            <h1 className="font-headline text-5xl font-extrabold leading-[1.02] tracking-tight text-on-surface sm:text-6xl lg:text-7xl">
              Translate the World <span className="bg-gradient-to-r from-primary to-primary-container bg-clip-text text-transparent">Silently.</span>
            </h1>
            <p className="max-w-2xl text-lg leading-8 text-on-surface-variant sm:text-xl">
              Real-time sign language recognition for webcam, video, and alphabet learning. Authenticate once,
              enter your workspace, and move between live practice, translation history, upload review, and progress analytics.
            </p>
          </div>

          <div className="flex flex-col gap-4 sm:flex-row">
            <Link
              to={user ? '/app/live' : '/register'}
              className={cn(buttonVariants({ size: 'lg' }), 'min-w-48')}
            >
              {user ? 'Start Translating' : 'Create Account'}
              <ArrowRight className="size-4" />
            </Link>
            <Link
              to={user ? '/app/learn' : '/login'}
              className={cn(buttonVariants({ variant: 'secondary', size: 'lg' }), 'min-w-48')}
            >
              <BookOpen className="size-4" />
              {user ? 'Open Learning Hub' : 'Sign In'}
            </Link>
          </div>

          <div className="grid gap-4 border-t border-outline-variant/15 pt-8 sm:grid-cols-3">
            <TrustItem icon={Bolt} label="Real-time AI" />
            <TrustItem icon={ShieldCheck} label="Secure sessions" />
            <TrustItem icon={BookOpen} label="Inclusive learning" />
          </div>
        </section>

        <section className="relative">
          <Card className="overflow-hidden border-outline-variant/15 bg-surface-container-low/90 p-0">
            <div className="relative aspect-[4/3] overflow-hidden rounded-[30px]">
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(189,194,255,0.18),transparent_48%),radial-gradient(circle_at_20%_30%,rgba(68,226,205,0.18),transparent_28%),linear-gradient(180deg,#1a2237_0%,#0b1326_100%)]" />
              <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(68,226,205,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(68,226,205,0.08)_1px,transparent_1px)] [background-size:34px_34px]" />
              <div className="absolute left-6 top-6 rounded-full border border-secondary/15 bg-[#2d3449]/70 px-3 py-1 text-xs font-bold uppercase tracking-[0.24em] text-secondary backdrop-blur-xl">
                Live analysis
              </div>

              <div className="absolute inset-x-6 bottom-6 rounded-[26px] border border-white/5 bg-[#2d3449]/45 p-6 shadow-2xl backdrop-blur-2xl">
                <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-[0.24em] text-secondary">
                  <span>Transcription</span>
                  <span className="text-on-surface-variant">Confidence: 98.4%</span>
                </div>
                <div className="mb-4 h-px bg-white/10" />
                <p className="text-2xl font-medium italic text-white">
                  “Hello, it is wonderful to meet you today. How can I assist you with your project?”
                </p>
                <div className="mt-5 flex items-center gap-4">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-container-highest">
                    <div className="h-full w-2/3 rounded-full bg-secondary" />
                  </div>
                  <Camera className="size-4 text-secondary" />
                </div>
              </div>

              <div className="absolute right-[-1.25rem] top-1/2 hidden rounded-[24px] border border-white/5 bg-[#2d3449]/55 p-4 shadow-xl backdrop-blur-2xl md:block">
                <div className="flex h-12 items-end gap-1">
                  <span className="w-1.5 rounded-full bg-secondary" style={{ height: '25%' }} />
                  <span className="w-1.5 rounded-full bg-secondary" style={{ height: '82%' }} />
                  <span className="w-1.5 rounded-full bg-secondary" style={{ height: '45%' }} />
                  <span className="w-1.5 rounded-full bg-secondary" style={{ height: '70%' }} />
                  <span className="w-1.5 rounded-full bg-secondary" style={{ height: '32%' }} />
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section className="lg:col-span-2">
          <div className="grid gap-6 md:grid-cols-3">
            {FEATURE_CARDS.map((feature) => {
              const Icon = feature.icon
              return (
                <Card
                  key={feature.title}
                  className="h-full rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-7 transition-all hover:border-primary/20 hover:bg-surface-container"
                >
                  <div className="mb-5 flex size-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                    <Icon className="size-5" />
                  </div>
                  <h2 className="font-headline text-2xl font-bold text-on-surface">{feature.title}</h2>
                  <p className="mt-3 text-sm leading-7 text-on-surface-variant">{feature.description}</p>
                </Card>
              )
            })}
          </div>
        </section>
      </main>
    </div>
  )
}

type TrustItemProps = {
  icon: typeof Bolt
  label: string
}

function TrustItem({ icon: Icon, label }: TrustItemProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex size-10 items-center justify-center rounded-xl bg-surface-container text-secondary">
        <Icon className="size-4" />
      </div>
      <span className="text-sm font-medium text-on-surface-variant">{label}</span>
    </div>
  )
}
