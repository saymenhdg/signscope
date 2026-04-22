import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpenCheck,
  Camera,
  CheckCircle2,
  ChevronRight,
  ChevronsLeftRight,
  ImageIcon,
  LoaderCircle,
  PlayCircle,
  RefreshCcw,
  SkipForward,
  Sparkles,
  XCircle,
} from 'lucide-react'
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
  useTransition,
} from 'react'

import { HandGuideOverlay } from '../components/learning/HandGuideOverlay'
import { LearnSubnav } from '../components/learning/learn-subnav'
import { SlidingCards, type SlidingCardsHandle } from '../components/learning/SlidingCards'
import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { apiRequest, API_BASE } from '../lib/api'
import { queryClient } from '../lib/query'
import type { AlphabetLessonItem, AlphabetLessonResponse, HealthResponse, PredictResponse } from '../lib/types'
import { cn } from '../lib/utils'

const LIVE_POLL_INTERVAL_MS = 360
const LIVE_CAPTURE_MAX_WIDTH = 640
const LIVE_CAPTURE_QUALITY = 0.84
const ADVANCE_DELAY_MS = 900

type Mode = 'study' | 'practice'

type AttemptRecord = {
  expected_label: string
  predicted_label: string
  confidence: number
  is_confident: boolean
  is_correct: boolean
  tracking_detected: boolean
}

export function AlphabetLessonPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopTimeoutRef = useRef<number | null>(null)
  const advanceTimeoutRef = useRef<number | null>(null)
  const requestInFlightRef = useRef(false)
  const stableCandidateRef = useRef<string | null>(null)
  const stableCandidateCountRef = useRef(0)
  const committedPredictionRef = useRef<string | null>(null)
  const sessionStartRef = useRef<number | null>(null)
  const sessionRecordedRef = useRef(false)
  const attemptLogRef = useRef<AttemptRecord[]>([])

  const [mode, setMode] = useState<Mode>('study')
  const [lesson, setLesson] = useState<AlphabetLessonResponse | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [reviewed, setReviewed] = useState<string[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)
  const [result, setResult] = useState<PredictResponse | null>(null)
  const deferredResult = useDeferredValue(result)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [stablePrediction, setStablePrediction] = useState<string | null>(null)
  const [stabilityCount, setStabilityCount] = useState(0)
  const [completedLabels, setCompletedLabels] = useState<string[]>([])
  const [sessionSaved, setSessionSaved] = useState(false)
  const [lessonComplete, setLessonComplete] = useState(false)
  const [, startTransition] = useTransition()

  const items = lesson?.sequence ?? []
  const reviewedSet = useMemo(() => new Set(reviewed), [reviewed])
  const reviewedPercent = items.length ? (reviewed.length / items.length) * 100 : 0
  const currentItem = lesson?.sequence[currentIndex] ?? null
  const stableFrames = lesson?.stable_frames ?? 3
  const threshold = lesson?.threshold ?? 0.45
  const minMargin = lesson?.min_margin ?? 0.1

  useEffect(() => {
    void loadLesson()
    return () => stopCamera()
  }, [])

  useEffect(() => {
    if (mode !== 'practice') stopCamera()
  }, [mode])

  useEffect(() => {
    resetPredictionLock(false)
    setResult(null)
  }, [currentItem?.label])

  const runPredictionLoop = useEffectEvent(async () => {
    if (!cameraActive || !health?.alphabet_model_ready || requestInFlightRef.current || !currentItem) return
    const imageBase64 = captureCurrentFrame()
    if (!imageBase64) return
    requestInFlightRef.current = true
    try {
      const response = await fetch(`${API_BASE}/api/alphabet/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          image_base64: imageBase64,
          target_letter: currentItem.label,
          threshold,
          min_margin: minMargin,
          include_annotated_image: true,
        }),
      })
      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string }
        throw new Error(payload.detail ?? 'Alphabet prediction failed.')
      }
      const payload = (await response.json()) as PredictResponse
      startTransition(() => {
        setResult(payload)
        setRequestError(null)
      })
      updatePredictionStability(payload)
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Alphabet prediction failed.')
    } finally {
      requestInFlightRef.current = false
    }
  })

  useEffect(() => {
    if (!cameraActive || !health?.alphabet_model_ready || !currentItem || mode !== 'practice') {
      if (loopTimeoutRef.current !== null) {
        window.clearTimeout(loopTimeoutRef.current)
        loopTimeoutRef.current = null
      }
      return
    }
    let cancelled = false
    const tick = async () => {
      if (cancelled) return
      await runPredictionLoop()
      if (!cancelled) loopTimeoutRef.current = window.setTimeout(tick, LIVE_POLL_INTERVAL_MS)
    }
    void tick()
    return () => {
      cancelled = true
      if (loopTimeoutRef.current !== null) window.clearTimeout(loopTimeoutRef.current)
      loopTimeoutRef.current = null
      requestInFlightRef.current = false
    }
  }, [cameraActive, currentItem, health?.alphabet_model_ready, mode, runPredictionLoop])

  async function loadLesson() {
    try {
      const lessonPayload = await apiRequest<AlphabetLessonResponse>('/api/learn/alphabet')
      const [healthResult] = await Promise.allSettled([
        apiRequest<HealthResponse>('/api/health'),
      ])
      setLesson(lessonPayload)
      if (healthResult.status === 'fulfilled') {
        setHealth(healthResult.value)
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Failed to load the alphabet coach.')
    }
  }

  function toggleReviewed(label: string) {
    setReviewed((value) => (value.includes(label) ? value.filter((item) => item !== label) : [...value, label]))
  }

  async function startCamera() {
    try {
      setCameraError(null)
      setRequestError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      if (sessionStartRef.current === null) sessionStartRef.current = Date.now()
      resetPredictionLock(true)
      setResult(null)
      setLessonComplete(false)
      setCameraActive(true)
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'Unable to access the camera.')
    }
  }

  function stopCamera() {
    if (loopTimeoutRef.current !== null) window.clearTimeout(loopTimeoutRef.current)
    if (advanceTimeoutRef.current !== null) window.clearTimeout(advanceTimeoutRef.current)
    loopTimeoutRef.current = null
    advanceTimeoutRef.current = null
    requestInFlightRef.current = false
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) videoRef.current.srcObject = null
    setCameraActive(false)
  }

  function resetPredictionLock(clearCommitted: boolean) {
    stableCandidateRef.current = null
    stableCandidateCountRef.current = 0
    if (clearCommitted) committedPredictionRef.current = null
    startTransition(() => {
      setStablePrediction(null)
      setStabilityCount(0)
    })
  }

  function updatePredictionStability(payload: PredictResponse) {
    const reliableLabel = payload.is_confident ? payload.predicted_letter : null
    if (!reliableLabel) {
      stableCandidateRef.current = null
      stableCandidateCountRef.current = 0
      startTransition(() => {
        setStablePrediction(null)
        setStabilityCount(0)
      })
      return
    }
    if (stableCandidateRef.current === reliableLabel) stableCandidateCountRef.current += 1
    else {
      stableCandidateRef.current = reliableLabel
      stableCandidateCountRef.current = 1
    }
    const nextCount = stableCandidateCountRef.current
    const lockedPrediction = nextCount >= stableFrames ? reliableLabel : null
    startTransition(() => {
      setStabilityCount(nextCount)
      setStablePrediction(lockedPrediction)
    })
    if (lockedPrediction === null || committedPredictionRef.current === lockedPrediction || !currentItem) return

    committedPredictionRef.current = lockedPrediction
    const attemptRecord: AttemptRecord = {
      expected_label: currentItem.label,
      predicted_label: lockedPrediction,
      confidence: payload.confidence,
      is_confident: payload.is_confident,
      is_correct: lockedPrediction === currentItem.label,
      tracking_detected: payload.tracking_detected,
    }
    attemptLogRef.current = [...attemptLogRef.current, attemptRecord]
    void persistAttempt(attemptRecord)
    startTransition(() => setAttempts((value) => value + 1))

    if (lockedPrediction === currentItem.label) {
      startTransition(() => {
        setCorrect((value) => value + 1)
        setCompletedLabels((value) => (value.includes(currentItem.label) ? value : [...value, currentItem.label]))
      })
      if (advanceTimeoutRef.current !== null) window.clearTimeout(advanceTimeoutRef.current)
      advanceTimeoutRef.current = window.setTimeout(() => {
        if (lesson && currentIndex + 1 < lesson.sequence.length) {
          setCurrentIndex((value) => value + 1)
          committedPredictionRef.current = null
          setResult(null)
        } else {
          void finishLesson()
        }
      }, ADVANCE_DELAY_MS)
      return
    }
  }

  async function finishLesson() {
    stopCamera()
    setLessonComplete(true)
    if (sessionRecordedRef.current) return
    sessionRecordedRef.current = true
    const durationSeconds = sessionStartRef.current ? Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 1000)) : 60
    const attemptSnapshot = attemptLogRef.current.slice()
    const correctCount = attemptSnapshot.filter((attempt) => attempt.is_correct).length
    const accuracy = attemptSnapshot.length > 0 ? (correctCount / attemptSnapshot.length) * 100 : 100
    try {
      await apiRequest('/api/learn/session', {
        method: 'POST',
        body: JSON.stringify({
          track: 'alphabet',
          category: 'Alphabet Coach',
          source_type: 'alphabet-coach',
          unit_title: 'Alphabet Coach',
          accuracy,
          completed_items: Math.max(1, attemptSnapshot.length || completedLabels.length || lesson?.sequence.length || 1),
          correct_items: correctCount,
          attempts_count: attemptSnapshot.length,
          duration_seconds: durationSeconds,
          summary: `Completed alphabet coach: ${correctCount}/${Math.max(1, attemptSnapshot.length)} graded locks matched the target.`,
        }),
      })
      setSessionSaved(true)
      await queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      await queryClient.invalidateQueries({ queryKey: ['progress-overview'] })
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Failed to save the lesson session.')
    }
  }

  async function persistAttempt(attempt: AttemptRecord) {
    try {
      await apiRequest('/api/learn/attempt', {
        method: 'POST',
        body: JSON.stringify({
          track: 'alphabet',
          category: 'Alphabet Coach',
          expected_label: attempt.expected_label,
          predicted_label: attempt.predicted_label,
          confidence: attempt.confidence,
          is_confident: attempt.is_confident,
          is_correct: attempt.is_correct,
          tracking_detected: attempt.tracking_detected,
          valid_frame_ratio: null,
        }),
      })
    } catch {
      return
    }
  }

  function restartLesson() {
    if (advanceTimeoutRef.current !== null) window.clearTimeout(advanceTimeoutRef.current)
    stopCamera()
    sessionStartRef.current = null
    sessionRecordedRef.current = false
    committedPredictionRef.current = null
    attemptLogRef.current = []
    setCurrentIndex(0)
    setAttempts(0)
    setCorrect(0)
    setCompletedLabels([])
    setResult(null)
    setStablePrediction(null)
    setStabilityCount(0)
    setSessionSaved(false)
    setLessonComplete(false)
  }

  function skipLetter() {
    if (!lesson || !currentItem) return
    committedPredictionRef.current = null
    if (currentIndex + 1 >= lesson.sequence.length) {
      void finishLesson()
      return
    }
    setCurrentIndex((value) => value + 1)
    setResult(null)
  }

  function captureCurrentFrame() {
    if (!videoRef.current || !canvasRef.current || videoRef.current.videoWidth === 0) return null
    const sourceWidth = videoRef.current.videoWidth
    const sourceHeight = videoRef.current.videoHeight
    const scale = Math.min(1, LIVE_CAPTURE_MAX_WIDTH / sourceWidth)
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale))
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale))
    canvasRef.current.width = targetWidth
    canvasRef.current.height = targetHeight
    const context = canvasRef.current.getContext('2d')
    if (!context) return null
    context.drawImage(videoRef.current, 0, 0, targetWidth, targetHeight)
    return canvasRef.current.toDataURL('image/jpeg', LIVE_CAPTURE_QUALITY)
  }

  const completionPercent = items.length ? (completedLabels.length / items.length) * 100 : 0
  const sessionAccuracy = attempts > 0 ? (correct / attempts) * 100 : 0
  const stabilityPercent = Math.min(100, (stabilityCount / stableFrames) * 100)
  const liveGuess = deferredResult?.is_confident ? deferredResult.predicted_letter : '...'

  return (
    <AppShell title="Alphabet Coach" subtitle="Study each letter, then practice with your camera — the AI confirms when you've got it right.">
      <LearnSubnav className="mb-6" />
      {requestError && mode === 'study' ? (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">{requestError}</div>
      ) : null}
      <ModeToggle mode={mode} onChange={setMode} />
      <AnimatePresence mode="wait">
        {mode === 'study' ? (
          <motion.div key="study" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
            <StudyMode lesson={lesson} reviewedSet={reviewedSet} toggleReviewed={toggleReviewed} reviewedCount={reviewed.length} total={items.length} percent={reviewedPercent} />
          </motion.div>
        ) : (
          <motion.div key="practice" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }} transition={{ duration: 0.25, ease: 'easeOut' }}>
            <PracticeMode lesson={lesson} health={health} currentItem={currentItem} videoRef={videoRef} canvasRef={canvasRef} cameraActive={cameraActive} cameraError={cameraError} requestError={requestError} startCamera={startCamera} stopCamera={stopCamera} restartLesson={restartLesson} skipLetter={skipLetter} result={deferredResult} lessonComplete={lessonComplete} stablePrediction={stablePrediction} liveGuess={liveGuess} completionPercent={completionPercent} stabilityPercent={stabilityPercent} stabilityCount={stabilityCount} stableFrames={stableFrames} sessionAccuracy={sessionAccuracy} currentIndex={currentIndex} attempts={attempts} correct={correct} completedLabels={completedLabels} sessionSaved={sessionSaved} />
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  )
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (next: Mode) => void }) {
  const items = [
    { id: 'study' as const, label: 'Study', description: 'Review the cue, reference clip, and guide', icon: BookOpenCheck },
    { id: 'practice' as const, label: 'Practice', description: 'Open the camera and get live feedback on your signs', icon: Camera },
  ]
  return (
    <div className="mb-8 grid gap-3 rounded-[28px] border border-outline-variant/15 bg-surface-container-low/90 p-3 shadow-sm sm:grid-cols-2">
      {items.map((item) => {
        const Icon = item.icon
        const active = item.id === mode
        return (
          <motion.button key={item.id} type="button" onClick={() => onChange(item.id)} whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.985 }} className={cn('relative flex items-center gap-4 rounded-[24px] border px-5 py-4 text-left transition-colors', active ? 'border-secondary/30 bg-secondary/10 text-on-surface' : 'border-outline-variant/15 bg-surface-container text-on-surface-variant hover:border-secondary/20 hover:text-on-surface')}>
            <div className={cn('flex size-11 items-center justify-center rounded-2xl border transition-colors', active ? 'border-secondary/30 bg-secondary/15 text-secondary' : 'border-outline-variant/20 bg-surface-container-high text-on-surface-variant')}>
              <Icon className="size-5" />
            </div>
            <div className="flex-1">
              <p className="font-headline text-lg font-black text-on-surface">{item.label}</p>
              <p className="text-xs text-on-surface-variant">{item.description}</p>
            </div>
            {active ? <motion.span layoutId="alphabet-mode-active" className="pointer-events-none absolute inset-0 rounded-[24px] ring-1 ring-secondary/30" transition={{ type: 'spring', stiffness: 360, damping: 30 }} /> : null}
          </motion.button>
        )
      })}
    </div>
  )
}

function StudyMode({
  lesson,
  reviewedSet,
  toggleReviewed,
  reviewedCount,
  total,
  percent,
}: {
  lesson: AlphabetLessonResponse | null
  reviewedSet: Set<string>
  toggleReviewed: (label: string) => void
  reviewedCount: number
  total: number
  percent: number
}) {
  const sequence = lesson?.sequence ?? []
  const deckRef = useRef<SlidingCardsHandle | null>(null)
  const [activeIndex, setActiveIndex] = useState(0)
  const activeItem = sequence[activeIndex] ?? null

  useEffect(() => {
    if (sequence.length === 0) {
      setActiveIndex(0)
      return
    }
    setActiveIndex((value) => Math.min(value, sequence.length - 1))
  }, [sequence.length])

  const deckCards = useMemo(
    () =>
      sequence.map((item, index) => ({
        id: item.label,
        content: (
          <div className="flex h-full flex-col p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Card {index + 1}</p>
                <p className="mt-2 font-headline text-6xl font-extrabold tracking-tight text-white">{item.label}</p>
              </div>
              <div className="flex items-center gap-2">
                {item.motion_letter ? <Badge className="border-tertiary/10 bg-tertiary/10 text-tertiary">Motion</Badge> : <Badge className="border-white/8 bg-[#0b1326]/55 text-on-surface">Static</Badge>}
                {reviewedSet.has(item.label) ? <Badge className="border-secondary/10 bg-secondary/10 text-secondary">Reviewed</Badge> : null}
              </div>
            </div>

            <div className="relative mt-5 flex-1 overflow-hidden rounded-[28px] border border-outline-variant/10 bg-surface-container">
              {index === activeIndex ? (
                <>
                  <AlphabetReferenceMedia
                    item={item}
                    preferVideo
                    className="h-full min-h-[22rem] w-full transition-transform duration-500 hover:scale-[1.02]"
                  />
                  <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#060e20]/28 via-transparent to-transparent" />
                </>
              ) : (
                <div className="flex h-full min-h-[22rem] items-end bg-[radial-gradient(circle_at_top,rgba(68,226,205,0.08),transparent_42%),linear-gradient(180deg,#10182b_0%,#091122_100%)] p-6">
                  <div className="w-full rounded-[22px] border border-white/8 bg-[#08101f]/82 px-5 py-4 backdrop-blur-xl">
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Upcoming</p>
                    <div className="mt-3 flex items-end justify-between gap-4">
                      <p className="font-headline text-5xl font-extrabold tracking-tight text-white">{item.label}</p>
                      {item.motion_letter ? (
                        <Badge className="border-tertiary/10 bg-tertiary/10 text-tertiary">Motion</Badge>
                      ) : (
                        <Badge className="border-white/8 bg-[#0b1326]/55 text-on-surface">Static</Badge>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        ),
      })),
    [activeIndex, reviewedSet, sequence],
  )

  function showPrevious() {
    deckRef.current?.previous()
  }

  function showNext() {
    deckRef.current?.next()
  }

  return (
    <>
      <section className="space-y-6">
        <Card className="rounded-[30px] border-outline-variant/12 bg-[linear-gradient(140deg,rgba(68,226,205,0.08),rgba(19,27,46,0.94)_42%,rgba(9,17,34,0.98))] px-6 py-5">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <Badge className="border-secondary/10 bg-secondary/10 text-secondary">Alphabet Study</Badge>
              <h2 className="mt-4 font-headline text-4xl font-extrabold tracking-tight text-on-surface">Study one letter at a time.</h2>
              <p className="mt-3 text-sm leading-7 text-on-surface-variant">
                Swipe through the deck, compare the sign reference with the guide, then mark the card reviewed before moving on.
              </p>
            </div>
            <div className="w-full max-w-xl space-y-3">
              <div className="flex items-center justify-between text-sm text-on-surface-variant">
                <span>{reviewedCount} of {total} reviewed</span>
                <span>{activeItem ? `Card ${activeIndex + 1} of ${sequence.length}` : 'Loading deck'}</span>
              </div>
              <Progress value={percent} />
            </div>
          </div>
        </Card>

        <div className="grid gap-6 xl:grid-cols-[1.15fr_0.5fr]">
          <Card className="relative overflow-hidden rounded-[34px] border-outline-variant/12 bg-[radial-gradient(circle_at_top,rgba(189,194,255,0.08),transparent_36%),linear-gradient(180deg,rgba(19,27,46,0.92),rgba(9,17,34,0.98))] p-5 sm:p-6">
            <div className="pointer-events-none absolute inset-x-10 top-0 h-28 rounded-full bg-primary/10 blur-3xl" />
            <div className="mb-4 flex items-center justify-between gap-4 rounded-[24px] border border-white/8 bg-[#10182b]/75 px-4 py-3 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="flex size-11 items-center justify-center rounded-2xl border border-secondary/15 bg-secondary/10 text-secondary">
                  <ChevronsLeftRight className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Swipe or click</p>
                  <p className="text-sm text-on-surface-variant">Drag the top card or use the controls below to move through the deck.</p>
                </div>
              </div>
              <Badge className="border-primary/10 bg-primary/10 text-primary">
                {activeItem?.reference_video_path ? 'Video reference' : 'Still reference'}
              </Badge>
            </div>

            <SlidingCards
              ref={deckRef}
              cards={deckCards}
              onActiveChange={setActiveIndex}
              onCardClick={setActiveIndex}
              visibleCount={4}
              className="bg-[linear-gradient(160deg,#172034_0%,#091122_100%)] p-3 sm:p-4"
            />

            <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <Button variant="outline" onClick={showPrevious}>
                Previous
              </Button>
              <Button
                variant={activeItem && reviewedSet.has(activeItem.label) ? 'secondary' : 'outline'}
                className={cn(activeItem && reviewedSet.has(activeItem.label) && 'border-secondary/10 bg-secondary/10 text-secondary')}
                onClick={() => {
                  if (!activeItem) return
                  toggleReviewed(activeItem.label)
                }}
              >
                {activeItem && reviewedSet.has(activeItem.label) ? <CheckCircle2 className="size-4" /> : <BookOpenCheck className="size-4" />}
                {activeItem && reviewedSet.has(activeItem.label) ? 'Reviewed' : 'Mark reviewed'}
              </Button>
              <Button variant="secondary" onClick={showNext}>
                Next
              </Button>
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/95 p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <CardTitle>Guide</CardTitle>
                  <CardDescription>Use this panel as the fixed comparison target while you swipe the deck.</CardDescription>
                </div>
                <ImageIcon className="size-5 text-secondary" />
              </div>
              <div className="mt-6 rounded-[24px] border border-outline-variant/10 bg-surface-container p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-headline text-3xl font-black text-on-surface">{activeItem?.label ?? 'A'}</p>
                    <p className="mt-1 text-sm text-on-surface-variant">{activeItem?.motion_letter ? 'Motion-sensitive letter' : 'Static handshape'}</p>
                  </div>
                  {activeItem?.motion_letter ? <Badge className="border-tertiary/10 bg-tertiary/10 text-tertiary">Motion</Badge> : null}
                </div>
                <div className="mt-4 grid gap-4">
                  <div className="overflow-hidden rounded-[22px] border border-outline-variant/10 bg-[linear-gradient(180deg,#172034_0%,#091122_100%)]">
                    <div className="flex items-center justify-between border-b border-outline-variant/10 px-4 py-3">
                      <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                        {activeItem?.motion_letter ? 'Motion cue' : 'Handshape cue'}
                      </p>
                      <span className="text-xs text-on-surface-variant">Match the handshape</span>
                    </div>
                    <div className="relative aspect-square">
                      {activeItem ? <HandGuideOverlay label={activeItem.label} points={activeItem.guide_points} connections={lesson?.connections ?? []} className="scale-[0.92]" /> : null}
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-[20px] border border-outline-variant/10 bg-surface-container-low px-4 py-4">
                  <p className="text-sm leading-7 text-on-surface-variant">{activeItem?.cue ?? 'Loading the current learning cue.'}</p>
                </div>
                <div className="mt-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Alphabet queue</p>
                    <span className="text-xs text-on-surface-variant">Jump to any letter</span>
                  </div>
                  <div className="grid grid-cols-5 gap-3">
                    {sequence.map((item, index) => {
                      const active = index === activeIndex
                      const reviewed = reviewedSet.has(item.label)
                      return (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => deckRef.current?.goTo(index)}
                          className={cn(
                            'flex h-14 items-center justify-center rounded-2xl border text-center font-headline text-lg font-bold transition-colors',
                            active && 'border-primary/20 bg-primary/12 text-primary',
                            reviewed && !active && 'border-secondary/15 bg-secondary/12 text-secondary',
                            !active && !reviewed && 'border-outline-variant/15 bg-surface-container text-on-surface-variant',
                          )}
                        >
                          {item.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/95 p-6">
              <div className="grid gap-4 sm:grid-cols-3 xl:grid-cols-1">
                <FlashStat label="Current Card" value={activeItem ? `${activeIndex + 1}/${sequence.length}` : '--'} detail="Stay focused on one sign at a time." />
                <FlashStat label="Reviewed" value={`${reviewedCount}`} detail="A light checklist before moving into practice." />
                <FlashStat label="Note" value={activeItem?.motion_letter ? 'Motion' : 'Static'} detail={activeItem?.reference_video_path ? 'This card uses a looping reference clip to show the full handshape and motion.' : 'This card uses a still reference because no local clip is available yet.'} />
              </div>
            </Card>

            <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/95 p-6">
              <div className="space-y-4">
                <CoachStep title="Front side first" detail="Look at the sign reference and form the handshape before you check the guide." />
                <CoachStep title="Guide second" detail="Use the guide panel only to correct finger spread, thumb placement, and palm angle." />
                <CoachStep title="Then practice" detail="Once a letter feels comfortable, switch to Practice and test it with the camera." />
              </div>
            </Card>
          </div>
        </div>
      </section>
    </>
  )
}

function PracticeMode({
  lesson,
  health,
  currentItem,
  videoRef,
  canvasRef,
  cameraActive,
  cameraError,
  requestError,
  startCamera,
  stopCamera,
  restartLesson,
  skipLetter,
  result,
  lessonComplete,
  stablePrediction,
  liveGuess,
  completionPercent,
  stabilityPercent,
  stabilityCount,
  stableFrames,
  sessionAccuracy,
  currentIndex,
  attempts,
  correct,
  completedLabels,
  sessionSaved,
}: {
  lesson: AlphabetLessonResponse | null
  health: HealthResponse | null
  currentItem: AlphabetLessonItem | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  cameraActive: boolean
  cameraError: string | null
  requestError: string | null
  startCamera: () => Promise<void>
  stopCamera: () => void
  restartLesson: () => void
  skipLetter: () => void
  result: PredictResponse | null
  lessonComplete: boolean
  stablePrediction: string | null
  liveGuess: string
  completionPercent: number
  stabilityPercent: number
  stabilityCount: number
  stableFrames: number
  sessionAccuracy: number
  currentIndex: number
  attempts: number
  correct: number
  completedLabels: string[]
  sessionSaved: boolean
}) {
  return (
    <div className="grid gap-8 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-outline-variant/15 bg-surface-container-low/90 px-6 py-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-full border border-secondary/20 bg-secondary/10 px-3 py-1.5">
              <span className={cn('size-2.5 rounded-full', cameraActive ? 'bg-secondary animate-pulse' : 'bg-outline')} />
              <span className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">{cameraActive ? 'Camera Active' : 'Camera Offline'}</span>
            </div>
            <p className="text-sm text-on-surface-variant">{health?.alphabet_model_ready ? 'Ready for guided practice' : 'Getting ready...'}</p>
          </div>
          <div className="flex items-center gap-3">
            {cameraActive ? (
              <Button variant="secondary" onClick={stopCamera}><Camera className="size-4" />Stop Camera</Button>
            ) : (
              <Button onClick={() => { void startCamera() }}><Camera className="size-4" />Start Camera</Button>
            )}
          </div>
        </div>

        <Card className="overflow-hidden rounded-[32px] border-outline-variant/12 bg-surface-container-lowest/90 p-0">
          <div className="relative aspect-video overflow-hidden bg-[linear-gradient(180deg,#1a2237_0%,#0b1326_100%)]">
            <video ref={videoRef} className="h-full w-full scale-x-[-1] object-cover opacity-90" playsInline muted autoPlay />
          </div>
        </Card>
        <canvas ref={canvasRef} className="hidden" />
        {(cameraError ?? requestError) ? <div className="rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error" role="alert">{cameraError ?? requestError}</div> : null}

        <div className="grid gap-4 sm:grid-cols-4">
          <LessonStat label="Target" value={currentItem?.label ?? '...'} />
          <LessonStat label="Live Guess" value={liveGuess} />
          <LessonStat label="Stable Lock" value={stablePrediction ?? '...'} />
          <LessonStat label="Tracking" value={result ? (result.tracking_detected ? 'ON' : 'OFF') : '...'} />
        </div>
      </div>

      <div className="space-y-6">
        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container/95 p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Session Progress</CardTitle>
              <CardDescription>The lesson advances automatically after a stable confirmed match.</CardDescription>
            </div>
            {lessonComplete ? <CheckCircle2 className="size-5 text-secondary" /> : <Sparkles className="size-5 text-secondary" />}
          </div>
          <div className="mt-7 space-y-5">
            <MetricProgress label="Lesson completion" value={completionPercent} text={`${completionPercent.toFixed(0)}%`} />
            <MetricProgress label="Stability gate" value={stabilityPercent} text={`${Math.min(stabilityCount, stableFrames)}/${stableFrames}`} />
            <MetricProgress label="Session accuracy" value={sessionAccuracy} text={`${sessionAccuracy.toFixed(1)}%`} />
            <div className="grid gap-3 sm:grid-cols-2">
              <Button variant="secondary" onClick={skipLetter} disabled={!lesson || lessonComplete}><SkipForward className="size-4" />Skip Letter</Button>
              <Button variant="outline" onClick={restartLesson}><RefreshCcw className="size-4" />Reset Session</Button>
            </div>
          </div>
        </Card>

        <Card className="overflow-hidden rounded-[30px] border-outline-variant/12 bg-surface-container/95 p-0">
          <div className="relative aspect-video overflow-hidden bg-[linear-gradient(160deg,#172034_0%,#091122_100%)]">
            <AlphabetReferenceMedia item={currentItem} className="size-full" />
            <div className="absolute inset-0 bg-gradient-to-t from-[#060e20] via-[#060e20]/40 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Reference</p>
              <p className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-white">{currentItem?.label ?? '-'}</p>
              <p className="mt-2 text-sm text-white/80 line-clamp-3">{currentItem?.cue ?? 'Loading cue.'}</p>
            </div>
          </div>
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container/95 p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Alphabet Queue</CardTitle>
              <CardDescription>Confirmed letters glow while the current target stays pinned.</CardDescription>
            </div>
            {result ? (result.matches_target ? <CheckCircle2 className="size-5 text-secondary" /> : <XCircle className="size-5 text-tertiary" />) : <LoaderCircle className="size-5 text-on-surface-variant" />}
          </div>
          <div className="mt-7 flex flex-wrap gap-3">
            {(lesson?.sequence ?? []).map((item, index) => {
              const completed = completedLabels.includes(item.label)
              const active = index === currentIndex && !lessonComplete
              return <div key={item.label} className={cn('flex min-w-12 items-center justify-center rounded-2xl border px-4 py-3 font-headline text-xl font-bold transition-colors', completed && 'border-secondary/15 bg-secondary/12 text-secondary', active && 'border-primary/20 bg-primary/12 text-primary', !completed && !active && 'border-outline-variant/15 bg-surface-container-low text-on-surface-variant')}>{item.label}</div>
            })}
          </div>
          <div className="mt-7 grid gap-4 sm:grid-cols-2">
            <LessonStat label="Attempts" value={String(attempts)} />
            <LessonStat label="Confirmed" value={String(correct)} />
          </div>
          <div className="mt-6 overflow-hidden rounded-[26px] border border-outline-variant/10 bg-surface-container-low">
            {result?.annotated_image_base64 ? (
              <img src={result.annotated_image_base64} alt="Annotated model frame" className="aspect-[4/3] w-full object-cover" />
            ) : (
              <div className="flex aspect-[4/3] items-center justify-center px-6 text-center text-sm text-on-surface-variant">The tracked hand frame appears here once live prediction begins.</div>
            )}
          </div>
          {lessonComplete ? (
            <div className="mt-6 rounded-[24px] border border-secondary/15 bg-secondary/10 p-5">
              <p className="font-semibold text-secondary">Session complete{sessionSaved ? ' and saved.' : '.'}</p>
              <p className="mt-2 text-sm leading-7 text-on-surface-variant">{sessionSaved ? 'This alphabet run has been written back to your account progress.' : 'If saving fails, the lesson itself is still complete.'}</p>
            </div>
          ) : null}
        </Card>
      </div>
    </div>
  )
}

function AlphabetReferenceMedia({
  item,
  className,
  preferVideo = true,
}: {
  item: AlphabetLessonItem | null | undefined
  className?: string
  preferVideo?: boolean
}) {
  if (preferVideo && item?.reference_video_path) {
    return (
      <video
        key={`${item.label}-video`}
        src={`${API_BASE}${item.reference_video_path}`}
        className={cn('object-cover', className)}
        autoPlay
        loop
        muted
        playsInline
        preload="metadata"
      />
    )
  }

  if (item?.reference_image_path) {
    return (
      <img
        src={`${API_BASE}${item.reference_image_path}`}
        alt={`Reference for ${item.label}`}
        className={cn('object-cover', className)}
      />
    )
  }

  if (item?.reference_video_path) {
    return (
      <div className={cn('relative overflow-hidden bg-[linear-gradient(180deg,#172034_0%,#091122_100%)]', className)}>
        <video
          key={`${item.label}-still`}
          src={`${API_BASE}${item.reference_video_path}`}
          className="size-full object-cover opacity-70"
          muted
          playsInline
          preload="metadata"
        />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,17,34,0.08),rgba(9,17,34,0.36))]" />
      </div>
    )
  }

  return (
    <div className={cn('flex items-center justify-center text-on-surface-variant', className)}>
      <PlayCircle className="size-12" />
    </div>
  )
}

function FlashStat({
  label,
  value,
  detail,
}: {
  label: string
  value: string
  detail: string
}) {
  return (
    <div className="rounded-[24px] border border-outline-variant/10 bg-[#10182b]/65 p-5 backdrop-blur-xl">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</p>
      <p className="mt-3 font-headline text-3xl font-black text-on-surface">{value}</p>
      <p className="mt-2 text-sm leading-6 text-on-surface-variant">{detail}</p>
    </div>
  )
}

function CoachStep({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="rounded-[24px] border border-outline-variant/10 bg-surface-container p-5">
      <p className="font-semibold text-on-surface">{title}</p>
      <p className="mt-2 text-sm leading-7 text-on-surface-variant">{detail}</p>
    </div>
  )
}

function MetricProgress({ label, value, text }: { label: string; value: number; text: string }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-sm text-on-surface-variant">
        <span>{label}</span>
        <span>{text}</span>
      </div>
      <Progress value={value} />
    </div>
  )
}

function LessonStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-[24px] border-outline-variant/10 bg-surface-container-low/90 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</p>
      <div className="mt-3 flex items-center gap-3">
        <p className="font-headline text-3xl font-black text-on-surface">{value}</p>
        <ChevronRight className="size-4 text-secondary" />
      </div>
    </Card>
  )
}
