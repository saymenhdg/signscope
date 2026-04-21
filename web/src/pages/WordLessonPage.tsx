import { AnimatePresence, motion } from 'framer-motion'
import {
  BookOpenCheck,
  Camera,
  CheckCircle2,
  Loader2,
  PlayCircle,
  RefreshCcw,
  Shuffle,
  Sparkles,
  Trophy,
  Video,
  WandSparkles,
  XCircle,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { LearnSubnav } from '../components/learning/learn-subnav'
import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { useToast } from '../components/ui/toast'
import { apiRequest, API_BASE } from '../lib/api'
import { queryClient } from '../lib/query'
import type {
  HealthResponse,
  WordLessonItem,
  WordLessonResponse,
  WordPredictResponse,
  WordVocabularyResponse,
} from '../lib/types'
import { cn } from '../lib/utils'

const CAPTURE_FRAMES = 24
const CAPTURE_INTERVAL_MS = 70 // approx. 1.7 s total capture window
const CAPTURE_MAX_WIDTH = 480
const CAPTURE_QUALITY = 0.7

type Mode = 'study' | 'practice'

type SessionStats = {
  attempts: number
  correct: number
}

type AttemptRecord = {
  expected_label: string | null
  predicted_label: string
  confidence: number
  is_confident: boolean
  is_correct: boolean | null
  tracking_detected: boolean
  valid_frame_ratio: number
}

export function WordLessonPage() {
  const { toast } = useToast()

  const [mode, setMode] = useState<Mode>('study')
  const [payload, setPayload] = useState<WordLessonResponse | null>(null)
  const [vocabulary, setVocabulary] = useState<WordVocabularyResponse | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [reviewed, setReviewed] = useState<string[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [targetWord, setTargetWord] = useState<string | null>(null)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [isCapturing, setIsCapturing] = useState(false)
  const [captureProgress, setCaptureProgress] = useState(0)
  const [isPredicting, setIsPredicting] = useState(false)
  const [result, setResult] = useState<WordPredictResponse | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [sessionStats, setSessionStats] = useState<SessionStats>({ attempts: 0, correct: 0 })
  const [celebrate, setCelebrate] = useState(false)

  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const captureCancelRef = useRef(false)
  const sessionStartRef = useRef<number | null>(null)
  const attemptLogRef = useRef<AttemptRecord[]>([])
  const sessionSavingRef = useRef(false)
  const previousModeRef = useRef<Mode>('study')

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const lessonPayload = await apiRequest<WordLessonResponse>('/api/learn/words')
        if (cancelled) return
        setPayload(lessonPayload)

        const [vocabResult, healthResult] = await Promise.allSettled([
          apiRequest<WordVocabularyResponse>('/api/word/vocabulary'),
          apiRequest<HealthResponse>('/api/health'),
        ])
        if (cancelled) return

        const vocabPayload =
          vocabResult.status === 'fulfilled'
            ? vocabResult.value
            : {
                labels: lessonPayload.items.map((item) => item.label),
                sequence_length: CAPTURE_FRAMES,
                feature_dim: 0,
                ready: false,
              }
        const healthPayload =
          healthResult.status === 'fulfilled'
            ? healthResult.value
            : {
                status: 'degraded',
                alphabet_model_ready: false,
                image_model_ready: false,
                landmark_model_ready: false,
                word_model_ready: false,
                word_labels: [],
                labels: [],
                oauth_providers: [],
              }

        setVocabulary(vocabPayload)
        setHealth(healthPayload)

        const initialTarget = pickInitialTarget(lessonPayload.items, vocabPayload.labels)
        setTargetWord(initialTarget)
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Failed to load word studio.')
        }
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    return () => {
      void persistSessionSnapshot()
      stopCamera()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (previousModeRef.current === 'practice' && mode !== 'practice') {
      void persistSessionSnapshot()
      stopCamera()
    }
    previousModeRef.current = mode
  }, [mode])

  useEffect(() => {
    setResult(null)
    setRequestError(null)
  }, [targetWord])

  const reviewedSet = useMemo(() => new Set(reviewed), [reviewed])
  const lessonItems = payload?.items ?? []
  const total = lessonItems.length
  const percent = total > 0 ? (reviewed.length / total) * 100 : 0

  const supportedLessonItems = useMemo(() => {
    if (!vocabulary) return lessonItems
    const supported = new Set(vocabulary.labels.map((label) => label.toUpperCase()))
    return lessonItems.filter((item) => supported.has(item.label.toUpperCase()))
  }, [lessonItems, vocabulary])

  const targetLessonItem = useMemo(() => {
    if (!targetWord) return null
    return lessonItems.find((item) => item.label.toUpperCase() === targetWord.toUpperCase()) ?? null
  }, [lessonItems, targetWord])

  const accuracy = sessionStats.attempts > 0 ? (sessionStats.correct / sessionStats.attempts) * 100 : 0

  function toggleReviewed(label: string) {
    setReviewed((current) =>
      current.includes(label) ? current.filter((item) => item !== label) : [...current, label],
    )
  }

  async function startCamera() {
    try {
      setCameraError(null)
      setRequestError(null)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
      }
      if (sessionStartRef.current === null) {
        sessionStartRef.current = Date.now()
      }
      setCameraActive(true)
    } catch (error) {
      setCameraError(error instanceof Error ? error.message : 'Unable to access the camera.')
    }
  }

  function stopCamera() {
    captureCancelRef.current = true
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
    setIsCapturing(false)
    setCaptureProgress(0)
  }

  const captureCurrentFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null
    if (videoRef.current.videoWidth === 0) return null
    const sourceWidth = videoRef.current.videoWidth
    const sourceHeight = videoRef.current.videoHeight
    const scale = Math.min(1, CAPTURE_MAX_WIDTH / sourceWidth)
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale))
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale))
    canvasRef.current.width = targetWidth
    canvasRef.current.height = targetHeight
    const context = canvasRef.current.getContext('2d')
    if (!context) return null
    context.drawImage(videoRef.current, 0, 0, targetWidth, targetHeight)
    return canvasRef.current.toDataURL('image/jpeg', CAPTURE_QUALITY)
  }, [])

  async function recordAndPredict() {
    if (!cameraActive || !targetWord) return
    if (!health?.word_model_ready) {
      toast({
        title: 'Word model is still loading',
        description: 'Try again in a few seconds.',
        variant: 'error',
      })
      return
    }
    if (isCapturing || isPredicting) return

    setResult(null)
    setRequestError(null)
    setIsCapturing(true)
    setCaptureProgress(0)
    captureCancelRef.current = false

    const frames: string[] = []
    for (let i = 0; i < CAPTURE_FRAMES; i += 1) {
      if (captureCancelRef.current) {
        setIsCapturing(false)
        return
      }
      const frame = captureCurrentFrame()
      if (frame) {
        frames.push(frame)
      }
      setCaptureProgress(Math.round(((i + 1) / CAPTURE_FRAMES) * 100))
      await sleep(CAPTURE_INTERVAL_MS)
    }
    setIsCapturing(false)

    if (frames.length < 4) {
      setRequestError('Could not capture enough frames. Check the camera and try again.')
      return
    }

    setIsPredicting(true)
    try {
      const response = await apiRequest<WordPredictResponse>('/api/word/predict-frames', {
        method: 'POST',
        body: JSON.stringify({
          images_base64: frames,
          target_word: targetWord,
          top_k: 5,
        }),
      })
      setResult(response)
      const attemptRecord: AttemptRecord = {
        expected_label: targetWord,
        predicted_label: response.predicted_word,
        confidence: response.confidence,
        is_confident: response.is_confident,
        is_correct: response.matches_target,
        tracking_detected: response.tracking_detected,
        valid_frame_ratio: response.valid_frame_ratio,
      }
      attemptLogRef.current = [...attemptLogRef.current, attemptRecord]
      void persistAttempt(attemptRecord)
      setSessionStats((current) => ({
        attempts: current.attempts + 1,
        correct: current.correct + (response.matches_target ? 1 : 0),
      }))
      if (response.matches_target) {
        setCelebrate(true)
        window.setTimeout(() => setCelebrate(false), 1400)
        toast({
          title: `${response.predicted_word} locked in`,
          description: `Confidence ${(response.confidence * 100).toFixed(0)}%`,
          variant: 'success',
        })
      } else if (!response.is_confident) {
        toast({
          title: 'Hold steady',
          description: response.feedback,
        })
      } else {
        toast({
          title: `Saw ${response.predicted_word}`,
          description: `Target was ${targetWord}.`,
          variant: 'error',
        })
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Prediction failed.')
    } finally {
      setIsPredicting(false)
    }
  }

  function randomizeTarget() {
    const pool = (supportedLessonItems.length > 0 ? supportedLessonItems : lessonItems).map(
      (item) => item.label,
    )
    const vocabPool = vocabulary?.labels ?? []
    const candidates = pool.length > 0 ? pool : vocabPool
    if (candidates.length === 0) return
    const next = candidates[Math.floor(Math.random() * candidates.length)] ?? candidates[0]
    setTargetWord(next ?? null)
  }

  function resetSession() {
    void persistSessionSnapshot()
    setSessionStats({ attempts: 0, correct: 0 })
    setResult(null)
    attemptLogRef.current = []
    sessionStartRef.current = Date.now()
  }

  async function persistAttempt(attempt: AttemptRecord) {
    try {
      await apiRequest('/api/learn/attempt', {
        method: 'POST',
        body: JSON.stringify({
          track: 'words',
          category: 'Word Studio',
          expected_label: attempt.expected_label,
          predicted_label: attempt.predicted_label,
          confidence: attempt.confidence,
          is_confident: attempt.is_confident,
          is_correct: attempt.is_correct,
          tracking_detected: attempt.tracking_detected,
          valid_frame_ratio: attempt.valid_frame_ratio,
        }),
      })
    } catch {
      // Best-effort analytics tracking.
    }
  }

  async function persistSessionSnapshot() {
    if (sessionSavingRef.current) {
      return
    }
    const attemptsSnapshot = attemptLogRef.current.slice()
    if (attemptsSnapshot.length === 0) {
      return
    }

    sessionSavingRef.current = true
    const correctCount = attemptsSnapshot.filter((attempt) => attempt.is_correct).length
    const startedAt = sessionStartRef.current ?? Date.now()
    const durationSeconds = Math.max(1, Math.round((Date.now() - startedAt) / 1000))

    try {
      await apiRequest('/api/learn/session', {
        method: 'POST',
        body: JSON.stringify({
          track: 'words',
          category: 'Word Studio',
          source_type: 'word-practice',
          unit_title: 'Word Studio',
          accuracy: attemptsSnapshot.length > 0 ? (correctCount / attemptsSnapshot.length) * 100 : 0,
          completed_items: attemptsSnapshot.length,
          correct_items: correctCount,
          attempts_count: attemptsSnapshot.length,
          duration_seconds: durationSeconds,
          summary: `${correctCount}/${attemptsSnapshot.length} graded word attempts matched the target.`,
        }),
      })
      attemptLogRef.current = []
      sessionStartRef.current = Date.now()
      await queryClient.invalidateQueries({ queryKey: ['dashboard-overview'] })
      await queryClient.invalidateQueries({ queryKey: ['progress-overview'] })
    } catch {
      // Best-effort analytics tracking.
    } finally {
      sessionSavingRef.current = false
    }
  }

  return (
    <AppShell
      title="Word Studio"
      subtitle="Study reference clips, then switch to live practice. The backend runs MediaPipe and our trained word recognizer on the frames you capture."
    >
      <LearnSubnav className="mb-6" />

      {loadError && (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">
          {loadError}
        </div>
      )}

      <ModeToggle mode={mode} onChange={setMode} />

      <AnimatePresence mode="wait">
        {mode === 'study' ? (
          <motion.div
            key="study"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <StudyMode
              payload={payload}
              reviewedSet={reviewedSet}
              toggleReviewed={toggleReviewed}
              reviewedCount={reviewed.length}
              total={total}
              percent={percent}
            />
          </motion.div>
        ) : (
          <motion.div
            key="practice"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.25, ease: 'easeOut' }}
          >
            <PracticeMode
              health={health}
              vocabulary={vocabulary}
              targetWord={targetWord}
              setTargetWord={setTargetWord}
              targetLessonItem={targetLessonItem}
              videoRef={videoRef}
              canvasRef={canvasRef}
              cameraActive={cameraActive}
              cameraError={cameraError}
              startCamera={startCamera}
              stopCamera={stopCamera}
              recordAndPredict={recordAndPredict}
              randomizeTarget={randomizeTarget}
              resetSession={resetSession}
              isCapturing={isCapturing}
              captureProgress={captureProgress}
              isPredicting={isPredicting}
              result={result}
              requestError={requestError}
              sessionStats={sessionStats}
              accuracy={accuracy}
              celebrate={celebrate}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </AppShell>
  )
}

function ModeToggle({ mode, onChange }: { mode: Mode; onChange: (next: Mode) => void }) {
  const items: { id: Mode; label: string; description: string; icon: typeof BookOpenCheck }[] = [
    {
      id: 'study',
      label: 'Study',
      description: 'Loop reference clips and lock in the motion',
      icon: BookOpenCheck,
    },
    {
      id: 'practice',
      label: 'Practice',
      description: 'Sign into the camera and grade yourself',
      icon: Camera,
    },
  ]
  return (
    <div className="mb-8 grid gap-3 rounded-[28px] border border-outline-variant/15 bg-surface-container-low/90 p-3 shadow-sm sm:grid-cols-2">
      {items.map((item) => {
        const Icon = item.icon
        const active = item.id === mode
        return (
          <motion.button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            whileHover={{ scale: 1.01 }}
            whileTap={{ scale: 0.985 }}
            className={cn(
              'relative flex items-center gap-4 rounded-[24px] border px-5 py-4 text-left transition-colors',
              active
                ? 'border-secondary/30 bg-secondary/10 text-on-surface'
                : 'border-outline-variant/15 bg-surface-container text-on-surface-variant hover:border-secondary/20 hover:text-on-surface',
            )}
          >
            <div
              className={cn(
                'flex size-11 items-center justify-center rounded-2xl border transition-colors',
                active
                  ? 'border-secondary/30 bg-secondary/15 text-secondary'
                  : 'border-outline-variant/20 bg-surface-container-high text-on-surface-variant',
              )}
            >
              <Icon className="size-5" />
            </div>
            <div className="flex-1">
              <p className="font-headline text-lg font-black text-on-surface">{item.label}</p>
              <p className="text-xs text-on-surface-variant">{item.description}</p>
            </div>
            {active && (
              <motion.span
                layoutId="word-mode-active"
                className="pointer-events-none absolute inset-0 rounded-[24px] ring-1 ring-secondary/30"
                transition={{ type: 'spring', stiffness: 360, damping: 30 }}
              />
            )}
          </motion.button>
        )
      })}
    </div>
  )
}

function StudyMode({
  payload,
  reviewedSet,
  toggleReviewed,
  reviewedCount,
  total,
  percent,
}: {
  payload: WordLessonResponse | null
  reviewedSet: Set<string>
  toggleReviewed: (label: string) => void
  reviewedCount: number
  total: number
  percent: number
}) {
  return (
    <>
      <section className="grid gap-8 xl:grid-cols-[0.78fr_1.22fr]">
        <Card className="rounded-[34px] border-outline-variant/12 bg-[linear-gradient(160deg,rgba(68,226,205,0.12),rgba(11,19,38,0.94)_55%),linear-gradient(180deg,#131b2e_0%,#091122_100%)] p-8">
          <Badge className="border-secondary/10 bg-secondary/10 text-secondary">Core vocabulary</Badge>
          <h2 className="mt-5 font-headline text-4xl font-extrabold tracking-tight text-on-surface">
            Build a small word set the live model can actually grade.
          </h2>
          <p className="mt-5 text-base leading-8 text-on-surface-variant">
            These words come from the best-performing word checkpoint in the workspace. Loop the clip,
            rehearse in a mirror, and then flip to Practice to grade yourself against the recognizer.
          </p>

          <div className="mt-10 space-y-3">
            <div className="flex items-center justify-between text-sm text-on-surface-variant">
              <span>Reviewed words</span>
              <span>
                {reviewedCount}/{total}
              </span>
            </div>
            <Progress value={percent} />
          </div>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            <StudioMetric label="Words in set" value={String(total || '...')} />
            <StudioMetric label="Reviewed today" value={String(reviewedCount)} />
          </div>

          <div className="mt-8 rounded-[26px] border border-outline-variant/10 bg-[#10182b]/60 p-5">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Model note</p>
            <p className="mt-3 text-sm leading-7 text-on-surface-variant">
              {payload?.note ?? 'Loading the curated word track.'}
            </p>
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          {(payload?.items ?? []).map((item, index) => (
            <motion.div
              key={item.label}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.02 * index, duration: 0.25, ease: 'easeOut' }}
            >
              <WordCard
                item={item}
                reviewed={reviewedSet.has(item.label)}
                onToggleReviewed={() => toggleReviewed(item.label)}
              />
            </motion.div>
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
              <div
                key={drill.title}
                className="rounded-[26px] border border-outline-variant/10 bg-surface-container p-5"
              >
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
            <WordCoachStep
              title="Watch the reference clip"
              detail="Loop the sample once or twice until the hand path and finishing pose make sense."
            />
            <WordCoachStep
              title="Switch to Practice"
              detail="Grab a well-lit spot, step back so your full torso is visible, and press Record Sign."
            />
            <WordCoachStep
              title="Use phrase ladders last"
              detail="After individual words lock in, combine two or three into a phrase and keep the transitions deliberate."
            />
          </div>
        </Card>
      </section>
    </>
  )
}

type PracticeModeProps = {
  health: HealthResponse | null
  vocabulary: WordVocabularyResponse | null
  targetWord: string | null
  setTargetWord: (next: string | null) => void
  targetLessonItem: WordLessonItem | null
  videoRef: React.RefObject<HTMLVideoElement | null>
  canvasRef: React.RefObject<HTMLCanvasElement | null>
  cameraActive: boolean
  cameraError: string | null
  startCamera: () => Promise<void>
  stopCamera: () => void
  recordAndPredict: () => Promise<void>
  randomizeTarget: () => void
  resetSession: () => void
  isCapturing: boolean
  captureProgress: number
  isPredicting: boolean
  result: WordPredictResponse | null
  requestError: string | null
  sessionStats: SessionStats
  accuracy: number
  celebrate: boolean
}

function PracticeMode(props: PracticeModeProps) {
  const {
    health,
    vocabulary,
    targetWord,
    setTargetWord,
    targetLessonItem,
    videoRef,
    canvasRef,
    cameraActive,
    cameraError,
    startCamera,
    stopCamera,
    recordAndPredict,
    randomizeTarget,
    resetSession,
    isCapturing,
    captureProgress,
    isPredicting,
    result,
    requestError,
    sessionStats,
    accuracy,
    celebrate,
  } = props

  const confidenceWidth = result ? Math.round(result.confidence * 100) : 0
  const modelReady = Boolean(health?.word_model_ready)

  return (
    <div className="grid gap-8 xl:grid-cols-[1.35fr_0.65fr]">
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-outline-variant/15 bg-surface-container-low/90 px-6 py-4 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 rounded-full border border-secondary/20 bg-secondary/10 px-3 py-1.5">
              <span
                className={cn(
                  'size-2.5 rounded-full',
                  cameraActive ? 'bg-secondary animate-pulse' : 'bg-outline',
                )}
              />
              <span className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                {cameraActive ? 'Camera Active' : 'Camera Offline'}
              </span>
            </div>
            <p className="text-sm text-on-surface-variant">
              {modelReady
                ? `Model ready - ${vocabulary?.labels.length ?? 0} words trained`
                : 'Word model is still warming up'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {cameraActive ? (
              <Button variant="secondary" onClick={stopCamera}>
                <Video className="size-4" />
                Stop Camera
              </Button>
            ) : (
              <Button onClick={startCamera}>
                <Camera className="size-4" />
                Start Camera
              </Button>
            )}
          </div>
        </div>

        <Card className="overflow-hidden rounded-[32px] border-outline-variant/12 bg-surface-container-lowest/90 p-0">
          <div className="relative aspect-video overflow-hidden bg-[linear-gradient(180deg,#192235_0%,#0b1326_100%)]">
            <video
              ref={videoRef}
              className="h-full w-full object-cover opacity-90"
              playsInline
              muted
              autoPlay
            />
            <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(68,226,205,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(68,226,205,0.08)_1px,transparent_1px)] [background-size:40px_40px]" />

            <div className="absolute left-6 top-6 rounded-2xl border border-outline-variant/10 bg-[#31394d]/60 px-4 py-2 backdrop-blur-xl">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Target word</p>
              <p className="mt-1 font-headline text-2xl font-black text-on-surface">
                {targetWord ?? '-'}
              </p>
            </div>

            <AnimatePresence>
              {isCapturing && (
                <motion.div
                  key="capture-ring"
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="absolute right-6 top-6 flex items-center gap-3 rounded-full border border-error/40 bg-error/15 px-4 py-2 backdrop-blur-xl"
                >
                  <span className="size-2.5 animate-pulse rounded-full bg-error" />
                  <span className="text-xs font-bold uppercase tracking-[0.24em] text-error">
                    Recording {captureProgress}%
                  </span>
                </motion.div>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {celebrate && (
                <motion.div
                  key="celebrate"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ type: 'spring', stiffness: 260, damping: 22 }}
                  className="absolute inset-0 flex items-center justify-center"
                >
                  <div className="rounded-full border border-secondary/30 bg-secondary/15 px-10 py-5 backdrop-blur-xl">
                    <p className="font-headline text-4xl font-black text-secondary">Perfect!</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#060e20] via-[#060e20]/80 to-transparent px-6 py-6">
              <div className="grid gap-5 md:grid-cols-[0.7fr_0.3fr] md:items-end">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Live feedback</p>
                  <AnimatePresence mode="wait">
                    <motion.p
                      key={result?.feedback ?? 'idle'}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                      className="mt-3 max-w-3xl text-sm leading-7 text-on-surface-variant"
                    >
                      {result?.feedback ?? 'Start the camera, pick a target word, then press Record Sign.'}
                    </motion.p>
                  </AnimatePresence>
                </div>
                <div className="grid gap-3">
                  <Badge
                    className={cn(
                      'w-fit',
                      result?.is_confident
                        ? result.matches_target
                          ? 'border-secondary/30 bg-secondary/15 text-secondary'
                          : 'border-error/30 bg-error/10 text-error'
                        : 'border-outline-variant/20 bg-surface-container/50 text-on-surface-variant',
                    )}
                  >
                    {result ? result.predicted_word || '...' : 'Awaiting capture'}
                  </Badge>
                  <div className="rounded-[22px] border border-outline-variant/10 bg-[#2d3449]/45 p-4">
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                      Confidence
                    </p>
                    <p className="mt-2 text-3xl font-black text-on-surface">{confidenceWidth}%</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>
        <canvas ref={canvasRef} className="hidden" />

        {(cameraError || requestError) && (
          <div className="rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">
            {cameraError ?? requestError}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <PracticeStat label="Attempts" value={String(sessionStats.attempts)} />
          <PracticeStat label="Correct" value={String(sessionStats.correct)} />
          <PracticeStat label="Accuracy" value={`${accuracy.toFixed(0)}%`} />
        </div>

        {result && (
          <Card className="rounded-[28px] border-outline-variant/12 bg-surface-container/95 p-6">
            <CardTitle className="mb-4">Top predictions</CardTitle>
            <div className="space-y-3">
              {result.top_predictions.map((prediction, index) => (
                <motion.div
                  key={prediction.label}
                  initial={{ opacity: 0, x: -6 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.04 }}
                >
                  <div className="flex items-center justify-between gap-4 rounded-[20px] border border-outline-variant/10 bg-surface-container-low px-4 py-3">
                    <div className="flex items-center gap-3">
                      <span
                        className={cn(
                          'flex size-8 items-center justify-center rounded-full text-xs font-bold',
                          index === 0
                            ? 'bg-secondary/15 text-secondary'
                            : 'bg-surface-container-high text-on-surface-variant',
                        )}
                      >
                        {index + 1}
                      </span>
                      <span className="font-semibold text-on-surface">{prediction.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-surface-container-high">
                        <motion.div
                          className="h-full rounded-full bg-secondary"
                          initial={{ width: 0 }}
                          animate={{ width: `${prediction.score * 100}%` }}
                          transition={{ duration: 0.35, ease: 'easeOut' }}
                        />
                      </div>
                      <span className="font-mono text-xs text-on-surface-variant">
                        {(prediction.score * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </Card>
        )}
      </div>

      <div className="space-y-6">
        <Card className="overflow-hidden rounded-[30px] border-outline-variant/12 bg-surface-container/95 p-0">
          <div className="relative aspect-video overflow-hidden bg-[linear-gradient(160deg,#172034_0%,#091122_100%)]">
            {targetLessonItem?.reference_video_path ? (
              <video
                key={targetLessonItem.reference_video_path}
                src={`${API_BASE}${targetLessonItem.reference_video_path}`}
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
            <div className="absolute inset-0 bg-gradient-to-t from-[#060e20] via-[#060e20]/40 to-transparent" />
            <div className="absolute bottom-5 left-5 right-5">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Reference</p>
              <p className="mt-2 font-headline text-3xl font-extrabold tracking-tight text-white">
                {targetWord ?? '-'}
              </p>
              {targetLessonItem?.coach_tip && (
                <p className="mt-2 text-sm text-white/80 line-clamp-2">{targetLessonItem.coach_tip}</p>
              )}
            </div>
          </div>
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container/95 p-7">
          <CardTitle>Target</CardTitle>
          <CardDescription>Pick a word, then sign it clearly into the camera.</CardDescription>
          <div className="mt-5 grid gap-3">
            <label className="grid gap-2">
              <span className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">
                Word
              </span>
              <select
                value={targetWord ?? ''}
                onChange={(event) => setTargetWord(event.target.value || null)}
                className="h-14 rounded-2xl border border-outline-variant/20 bg-surface-container px-4 text-on-surface outline-none transition-colors focus:border-secondary/60"
              >
                {(vocabulary?.labels ?? []).map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <Button variant="secondary" onClick={randomizeTarget}>
                <Shuffle className="size-4" />
                Random Word
              </Button>
              <Button variant="outline" onClick={resetSession}>
                <RefreshCcw className="size-4" />
                Reset Score
              </Button>
            </div>

            <motion.div whileHover={{ scale: cameraActive ? 1.01 : 1 }} whileTap={{ scale: 0.98 }}>
              <Button
                className="w-full"
                disabled={!cameraActive || !modelReady || isCapturing || isPredicting}
                onClick={() => {
                  void recordAndPredict()
                }}
              >
                {isCapturing ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Recording {captureProgress}%
                  </>
                ) : isPredicting ? (
                  <>
                    <Loader2 className="size-4 animate-spin" />
                    Grading sign...
                  </>
                ) : (
                  <>
                    <Video className="size-4" />
                    Record Sign
                  </>
                )}
              </Button>
            </motion.div>

            {isCapturing && (
              <div className="space-y-2">
                <Progress value={captureProgress} />
                <p className="text-center text-xs text-on-surface-variant">
                  Keep signing - the model uses the whole clip.
                </p>
              </div>
            )}
          </div>
        </Card>

        <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container/95 p-7">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Session stats</CardTitle>
              <CardDescription>Reset when you switch focus.</CardDescription>
            </div>
            {result?.matches_target ? (
              <CheckCircle2 className="size-5 text-secondary" />
            ) : result?.is_confident ? (
              <XCircle className="size-5 text-error" />
            ) : (
              <Trophy className="size-5 text-on-surface-variant" />
            )}
          </div>
          <div className="mt-5 space-y-3">
            <div className="flex items-center justify-between text-sm text-on-surface-variant">
              <span>Accuracy</span>
              <span>{accuracy.toFixed(1)}%</span>
            </div>
            <Progress value={accuracy} />
            {result && (
              <div className="rounded-[20px] border border-outline-variant/10 bg-surface-container-low p-4 text-xs text-on-surface-variant">
                Valid frame ratio: <span className="text-on-surface">{(result.valid_frame_ratio * 100).toFixed(0)}%</span>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
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

function PracticeStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-[24px] border-outline-variant/10 bg-surface-container-low/90 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</p>
      <p className="mt-3 font-headline text-3xl font-black text-on-surface">{value}</p>
    </Card>
  )
}

function pickInitialTarget(items: WordLessonItem[], vocabularyLabels: string[]): string | null {
  const vocabSet = new Set(vocabularyLabels.map((label) => label.toUpperCase()))
  for (const item of items) {
    if (vocabSet.has(item.label.toUpperCase())) {
      return item.label
    }
  }
  return vocabularyLabels[0] ?? null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
