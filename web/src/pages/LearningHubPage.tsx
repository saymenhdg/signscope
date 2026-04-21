import { ArrowRight, BookOpenCheck, BrainCircuit, Camera, Sparkles, Type } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { LearnSubnav } from '../components/learning/learn-subnav'
import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { buttonVariants } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { apiRequest } from '../lib/api'
import type { AlphabetLessonResponse, ProgressOverview, WordLessonResponse } from '../lib/types'
import { cn } from '../lib/utils'

export function LearningHubPage() {
  const [progress, setProgress] = useState<ProgressOverview | null>(null)
  const [alphabet, setAlphabet] = useState<AlphabetLessonResponse | null>(null)
  const [words, setWords] = useState<WordLessonResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const [progressPayload, alphabetPayload, wordPayload] = await Promise.all([
          apiRequest<ProgressOverview>('/api/progress/overview'),
          apiRequest<AlphabetLessonResponse>('/api/learn/alphabet'),
          apiRequest<WordLessonResponse>('/api/learn/words'),
        ])
        if (!cancelled) {
          setProgress(progressPayload)
          setAlphabet(alphabetPayload)
          setWords(wordPayload)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load the learning hub.')
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [])

  const alphabetCount = alphabet?.sequence.length ?? 0
  const wordCount = words?.items.length ?? 0
  const alphabetPercent = alphabetCount > 0 ? Math.min(100, ((progress?.totals.signs_mastered ?? 0) / alphabetCount) * 6) : 0
  const wordPercent = wordCount > 0 ? Math.min(100, ((progress?.totals.signs_mastered ?? 0) / wordCount) * 1.7) : 0

  return (
    <AppShell
      title="Learning Hub"
      subtitle="Move between a live alphabet coach and a reference-backed word library. The alphabet track confirms signs in real time and advances automatically when the model is satisfied."
    >
      <LearnSubnav className="mb-6" />

      {error && (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
      )}

      <section className="grid gap-8 xl:grid-cols-[1.08fr_0.92fr]">
        <Card className="overflow-hidden rounded-[34px] border-outline-variant/12 bg-[linear-gradient(135deg,rgba(189,194,255,0.16),rgba(11,19,38,0.92)_52%),linear-gradient(180deg,#131b2e_0%,#091122_100%)] p-8">
          <Badge className="border-secondary/10 bg-secondary/10 text-secondary">Structured learning</Badge>
          <h2 className="mt-5 max-w-2xl font-headline text-4xl font-extrabold tracking-tight text-on-surface sm:text-5xl">
            Learn letters and words with the camera guiding the session.
          </h2>
          <p className="mt-5 max-w-3xl text-base leading-8 text-on-surface-variant">
            The alphabet coach uses a transparent landmark guide over your live camera. Match the handshape,
            hold steady, and the system moves to the next character after the CNN confirms it. The word track
            now uses the linked word video library so Study and Practice work from the same reference set.
          </p>

          <div className="mt-10 grid gap-4 sm:grid-cols-3">
            <HubStat label="Current streak" value={progress ? `${progress.totals.streak_days} days` : '...'} />
            <HubStat label="Signs practiced" value={String(progress?.totals.signs_mastered ?? '...')} />
            <HubStat label="Current level" value={progress ? `Lv ${progress.totals.level}` : '...'} />
          </div>
        </Card>

        <Card className="rounded-[34px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Recommended focus</CardTitle>
              <CardDescription>Use the guided track first, then review the phrase cards.</CardDescription>
            </div>
            <Sparkles className="size-5 text-secondary" />
          </div>

          <div className="mt-8 space-y-5">
            <FocusRow
              icon={Type}
              title="Alphabet Coach"
              detail={`${alphabetCount} guided letters, live confirmation, auto-advance`}
            />
            <FocusRow
              icon={BookOpenCheck}
              title="Core Word Library"
              detail={`${wordCount} words with linked video references and phrase drills`}
            />
            <FocusRow
              icon={Camera}
              title="Live Test"
              detail="Run a focused camera-based check and see whether you can hold the target letter under the model gate."
            />
            <FocusRow
              icon={BrainCircuit}
              title="Progress Loop"
              detail="Completed alphabet sessions are saved back into the FastAPI account data."
            />
          </div>
        </Card>
      </section>

      <section className="mt-8 grid gap-8 xl:grid-cols-3">
        <TrackCard
          title="Alphabet Coach"
          description="Launch the live camera tutor, line your hand up with the transparent guide, and let the model advance letter by letter."
          detail="Camera confirmed"
          cta="Open alphabet coach"
          href="/app/learn/alphabet"
          percent={alphabetPercent}
          masteredLabel={`${alphabetCount} letters`}
          icon={Camera}
          accent="from-primary to-primary-container"
        />

        <TrackCard
          title="Word Studio"
          description="Study the linked word library through looping reference clips, then switch into camera practice against the same vocabulary."
          detail="Reference-driven"
          cta="Open word studio"
          href="/app/learn/words"
          percent={wordPercent}
          masteredLabel={`${wordCount} words`}
          icon={BookOpenCheck}
          accent="from-secondary/80 to-primary/65"
        />

        <TrackCard
          title="Skill Test"
          description="Switch to assessment mode and test how consistently you can hit a target letter without the lesson auto-advance loop."
          detail="Assessment"
          cta="Open test"
          href="/app/learn/test"
          percent={Math.max(progress?.totals.progress_percent ?? 0, progress?.weekly_accuracy.at(-1) ?? 0)}
          masteredLabel="Assessment readiness"
          icon={BrainCircuit}
          accent="from-primary/75 to-secondary/75"
        />
      </section>

      <section className="mt-8 grid gap-8 xl:grid-cols-[0.92fr_1.08fr]">
        <Card className="rounded-[34px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <CardTitle>Why the alphabet track feels different</CardTitle>
          <CardDescription className="mt-2">
            This mode is built like a guided lesson instead of a generic translator screen.
          </CardDescription>

          <div className="mt-8 space-y-4">
            <GuideBullet title="Transparent guide overlay" detail="A canonical hand skeleton stays on top of the live video so the learner can physically line up the pose." />
            <GuideBullet title="Stable hold gate" detail="The model waits for a reliable run of predictions before it counts a letter as complete." />
            <GuideBullet title="Automatic progression" detail="Once the target is confirmed, the session moves to the next character without extra clicks." />
          </div>
        </Card>

        <Card className="rounded-[34px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <CardTitle>Phrase drills</CardTitle>
          <CardDescription className="mt-2">Short phrases built from the current linked word set.</CardDescription>

          <div className="mt-8 grid gap-4">
            {(words?.phrase_drills ?? []).map((drill) => (
              <div key={drill.title} className="rounded-[26px] border border-outline-variant/10 bg-surface-container p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-headline text-xl font-bold text-on-surface">{drill.title}</p>
                    <p className="mt-1 text-xs font-bold uppercase tracking-[0.24em] text-secondary">{drill.phrase}</p>
                  </div>
                  <Link to="/app/learn/words" className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'shrink-0')}>
                    Open
                    <ArrowRight className="size-4" />
                  </Link>
                </div>
                <p className="mt-4 text-sm leading-7 text-on-surface-variant">{drill.focus}</p>
              </div>
            ))}
          </div>
        </Card>
      </section>
    </AppShell>
  )
}

function HubStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-[#10182b]/55 p-5 backdrop-blur-xl">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</p>
      <p className="mt-3 font-headline text-3xl font-black text-on-surface">{value}</p>
    </div>
  )
}

function FocusRow({
  icon: Icon,
  title,
  detail,
}: {
  icon: typeof Sparkles
  title: string
  detail: string
}) {
  return (
    <div className="flex items-start gap-4 rounded-[24px] border border-outline-variant/10 bg-surface-container p-5">
      <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-secondary/10 text-secondary">
        <Icon className="size-5" />
      </div>
      <div>
        <p className="font-semibold text-on-surface">{title}</p>
        <p className="mt-1 text-sm leading-7 text-on-surface-variant">{detail}</p>
      </div>
    </div>
  )
}

function TrackCard({
  title,
  description,
  detail,
  cta,
  href,
  percent,
  masteredLabel,
  icon: Icon,
  accent,
}: {
  title: string
  description: string
  detail: string
  cta: string
  href: string
  percent: number
  masteredLabel: string
  icon: typeof Camera
  accent: string
}) {
  return (
    <Card className="rounded-[34px] border-outline-variant/12 bg-surface-container-low/90 p-8">
      <div className="flex items-start justify-between gap-5">
        <div className={cn('flex size-14 items-center justify-center rounded-[22px] bg-gradient-to-br text-[#0b1326]', accent)}>
          <Icon className="size-6" />
        </div>
        <Badge className="border-secondary/10 bg-secondary/10 text-secondary">{detail}</Badge>
      </div>

      <h3 className="mt-7 font-headline text-3xl font-extrabold tracking-tight text-on-surface">{title}</h3>
      <p className="mt-4 text-sm leading-7 text-on-surface-variant">{description}</p>

      <div className="mt-8 space-y-3">
        <div className="flex items-center justify-between text-sm text-on-surface-variant">
          <span>{masteredLabel}</span>
          <span>{percent.toFixed(0)}%</span>
        </div>
        <Progress value={percent} />
      </div>

      <Link to={href} className={cn(buttonVariants(), 'mt-8 w-fit')}>
        {cta}
        <ArrowRight className="size-4" />
      </Link>
    </Card>
  )
}

function GuideBullet({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-outline-variant/10 bg-surface-container p-5">
      <p className="font-semibold text-on-surface">{title}</p>
      <p className="mt-2 text-sm leading-7 text-on-surface-variant">{detail}</p>
    </div>
  )
}
