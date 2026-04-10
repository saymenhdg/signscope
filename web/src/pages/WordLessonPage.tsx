import { BookOpenCheck, CheckCircle2, PlayCircle, Sparkles, WandSparkles } from 'lucide-react'
import { useEffect, useState } from 'react'

import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { apiRequest, API_BASE } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { WordLessonItem, WordLessonResponse } from '../lib/types'
import { cn } from '../lib/utils'

export function WordLessonPage() {
  const { token } = useAuth()
  const [payload, setPayload] = useState<WordLessonResponse | null>(null)
  const [reviewed, setReviewed] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const response = await apiRequest<WordLessonResponse>('/api/learn/words', { token })
        if (!cancelled) {
          setPayload(response)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load word lessons.')
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [token])

  const reviewedSet = new Set(reviewed)
  const total = payload?.items.length ?? 0
  const percent = total > 0 ? (reviewed.length / total) * 100 : 0

  function toggleReviewed(label: string) {
    setReviewed((current) => (current.includes(label) ? current.filter((item) => item !== label) : [...current, label]))
  }

  return (
    <AppShell
      title="Word Studio"
      subtitle="Study the current reliable vocabulary set through looping reference clips, simple phrase ladders, and focused rehearsal notes. This page is for memorization and review; the alphabet coach is still the live validated track."
    >
      {error && (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
      )}

      <section className="grid gap-8 xl:grid-cols-[0.78fr_1.22fr]">
        <Card className="rounded-[34px] border-outline-variant/12 bg-[linear-gradient(160deg,rgba(68,226,205,0.12),rgba(11,19,38,0.94)_55%),linear-gradient(180deg,#131b2e_0%,#091122_100%)] p-8">
          <Badge className="border-secondary/10 bg-secondary/10 text-secondary">Core vocabulary</Badge>
          <h2 className="mt-5 font-headline text-4xl font-extrabold tracking-tight text-on-surface">
            Build a small word set that the current model can actually support.
          </h2>
          <p className="mt-5 text-base leading-8 text-on-surface-variant">
            The strongest product move right now is a focused vocabulary library, not a huge unreliable dictionary.
            These words come from the best-performing checkpoint in the workspace and are presented with short reference clips.
          </p>

          <div className="mt-10 space-y-3">
            <div className="flex items-center justify-between text-sm text-on-surface-variant">
              <span>Reviewed words</span>
              <span>
                {reviewed.length}/{total}
              </span>
            </div>
            <Progress value={percent} />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <StudioMetric label="Words in set" value={String(total || '...')} />
            <StudioMetric label="Reviewed today" value={String(reviewed.length)} />
          </div>

          <div className="mt-8 rounded-[26px] border border-outline-variant/10 bg-[#10182b]/60 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Model note</p>
            <p className="mt-3 text-sm leading-7 text-on-surface-variant">{payload?.note ?? 'Loading the curated word track.'}</p>
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {(payload?.items ?? []).map((item) => (
            <WordCard
              key={item.label}
              item={item}
              reviewed={reviewedSet.has(item.label)}
              onToggleReviewed={() => {
                toggleReviewed(item.label)
              }}
            />
          ))}
        </div>
      </section>

      <section className="mt-8 grid gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-[34px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Phrase Ladder</CardTitle>
              <CardDescription>Use these combinations after you review the individual clips.</CardDescription>
            </div>
            <WandSparkles className="size-5 text-secondary" />
          </div>

          <div className="mt-8 grid gap-4">
            {(payload?.phrase_drills ?? []).map((drill) => (
              <div key={drill.title} className="rounded-[26px] border border-outline-variant/10 bg-surface-container p-5">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="font-headline text-2xl font-bold text-on-surface">{drill.phrase}</p>
                    <p className="mt-1 text-sm text-on-surface-variant">{drill.title}</p>
                  </div>
                  <Badge className="border-primary/10 bg-primary/10 text-primary">Drill</Badge>
                </div>
                <p className="mt-4 text-sm leading-7 text-on-surface-variant">{drill.focus}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card className="rounded-[34px] border-outline-variant/12 bg-surface-container-low/90 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>How to use this page</CardTitle>
              <CardDescription>Keep the practice loop tight and honest.</CardDescription>
            </div>
            <Sparkles className="size-5 text-secondary" />
          </div>

          <div className="mt-8 space-y-4">
            <WordCoachStep title="Watch the reference clip" detail="Loop the sample once or twice until the hand path and finishing pose make sense." />
            <WordCoachStep title="Repeat in front of your own camera" detail="Focus on one word at a time instead of trying to produce a sentence immediately." />
            <WordCoachStep title="Use phrase ladders second" detail="After single-word review, combine two or three items into a short phrase and keep transitions deliberate." />
          </div>
        </Card>
      </section>
    </AppShell>
  )
}

function WordCard({
  item,
  reviewed,
  onToggleReviewed,
}: {
  item: WordLessonItem
  reviewed: boolean
  onToggleReviewed: () => void
}) {
  return (
    <Card className="overflow-hidden rounded-[34px] border-outline-variant/12 bg-surface-container-low/90 p-0">
      <div className="relative aspect-video overflow-hidden bg-[linear-gradient(160deg,#172034_0%,#091122_100%)]">
        {item.reference_video_path ? (
          <video
            key={item.reference_video_path}
            src={`${API_BASE}${item.reference_video_path}`}
            autoPlay
            muted
            loop
            playsInline
            className="size-full object-cover"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-on-surface-variant">
            <PlayCircle className="size-10" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-[#060e20] via-[#060e20]/45 to-transparent" />
        <div className="absolute left-5 top-5 flex items-center gap-2">
          <Badge className="border-secondary/10 bg-secondary/10 text-secondary">{item.category}</Badge>
          <Badge className="border-white/8 bg-[#0b1326]/55 text-on-surface">{item.difficulty}</Badge>
        </div>
        <div className="absolute bottom-5 left-5 right-5">
          <p className="font-headline text-4xl font-extrabold tracking-tight text-white">{item.label}</p>
          <p className="mt-2 text-sm text-white/78">{item.title}</p>
        </div>
      </div>

      <div className="space-y-5 p-6">
        <p className="text-sm leading-7 text-on-surface-variant">{item.description}</p>

        <div className="rounded-[24px] border border-outline-variant/10 bg-surface-container p-4">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Coach tip</p>
          <p className="mt-3 text-sm leading-7 text-on-surface-variant">{item.coach_tip}</p>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-[24px] border border-outline-variant/10 bg-surface-container p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Phrase anchor</p>
            <p className="mt-2 font-semibold text-on-surface">{item.phrase}</p>
          </div>
          <Button
            variant={reviewed ? 'secondary' : 'outline'}
            className={cn(reviewed && 'border-secondary/10 bg-secondary/10 text-secondary')}
            onClick={onToggleReviewed}
          >
            {reviewed ? <CheckCircle2 className="size-4" /> : <BookOpenCheck className="size-4" />}
            {reviewed ? 'Reviewed' : 'Mark reviewed'}
          </Button>
        </div>
      </div>
    </Card>
  )
}

function StudioMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-white/8 bg-[#10182b]/55 p-5 backdrop-blur-xl">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</p>
      <p className="mt-3 font-headline text-3xl font-black text-on-surface">{value}</p>
    </div>
  )
}

function WordCoachStep({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-outline-variant/10 bg-surface-container p-5">
      <p className="font-semibold text-on-surface">{title}</p>
      <p className="mt-2 text-sm leading-7 text-on-surface-variant">{detail}</p>
    </div>
  )
}
