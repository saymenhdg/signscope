import {
  Camera,
  CheckCircle2,
  ChevronRight,
  ImageIcon,
  LoaderCircle,
  RefreshCcw,
  RotateCcw,
  SkipForward,
  Sparkles,
  Target,
  XCircle,
} from 'lucide-react'
import {
  useDeferredValue,
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from 'react'

import { HandGuideOverlay } from '../components/learning/HandGuideOverlay'
import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { apiRequest, API_BASE } from '../lib/api'
import { useAuth } from '../lib/auth'
import type { AlphabetLessonResponse, HealthResponse, PredictResponse } from '../lib/types'
import { cn } from '../lib/utils'

const LIVE_POLL_INTERVAL_MS = 360
const LIVE_CAPTURE_MAX_WIDTH = 640
const LIVE_CAPTURE_QUALITY = 0.84
const ADVANCE_DELAY_MS = 900

export function AlphabetLessonPage() {
  const { token } = useAuth()
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

  const [lesson, setLesson] = useState<AlphabetLessonResponse | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
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
  const [coachMessage, setCoachMessage] = useState('Loading lesson...')
  const [sessionSaved, setSessionSaved] = useState(false)
  const [lessonComplete, setLessonComplete] = useState(false)
  const [, startTransition] = useTransition()

  const currentItem = lesson?.sequence[currentIndex] ?? null
  const stableFrames = lesson?.stable_frames ?? 3
  const threshold = lesson?.threshold ?? 0.45
  const minMargin = lesson?.min_margin ?? 0.1

  useEffect(() => {
    void loadLesson()
    return () => {
      stopCamera()
    }
  }, [])

  useEffect(() => {
    resetPredictionLock(false)
    setResult(null)
    if (currentItem) {
      setCoachMessage(
        currentItem.motion_letter
          ? `${currentItem.label} is a motion letter. Keep the movement slow and visible.`
          : currentItem.cue,
      )
    }
  }, [currentItem?.label])

  const runPredictionLoop = useEffectEvent(async () => {
    if (!cameraActive || !health?.alphabet_model_ready || requestInFlightRef.current || !currentItem) {
      return
    }

    const imageBase64 = captureCurrentFrame()
    if (!imageBase64) {
      return
    }

    requestInFlightRef.current = true
    try {
      const response = await fetch(`${API_BASE}/api/alphabet/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        if (!lessonComplete) {
          setCoachMessage(payload.feedback)
        }
      })
      updatePredictionStability(payload)
    } catch (loopError) {
      setRequestError(loopError instanceof Error ? loopError.message : 'Alphabet prediction failed.')
    } finally {
      requestInFlightRef.current = false
    }
  })

  useEffect(() => {
    if (!cameraActive || !health?.alphabet_model_ready || !currentItem) {
      if (loopTimeoutRef.current !== null) {
        window.clearTimeout(loopTimeoutRef.current)
        loopTimeoutRef.current = null
      }
      return
    }

    let cancelled = false
    const tick = async () => {
      if (cancelled) {
        return
      }
      await runPredictionLoop()
      if (!cancelled) {
        loopTimeoutRef.current = window.setTimeout(tick, LIVE_POLL_INTERVAL_MS)
      }
    }

    void tick()

    return () => {
      cancelled = true
      if (loopTimeoutRef.current !== null) {
        window.clearTimeout(loopTimeoutRef.current)
        loopTimeoutRef.current = null
      }
      requestInFlightRef.current = false
    }
  }, [cameraActive, currentItem, health?.alphabet_model_ready, runPredictionLoop])

  async function loadLesson() {
    try {
      const [lessonPayload, healthPayload] = await Promise.all([
        apiRequest<AlphabetLessonResponse>('/api/learn/alphabet', { token }),
        apiRequest<HealthResponse>('/api/health'),
      ])
      setLesson(lessonPayload)
      setHealth(healthPayload)
      if (lessonPayload.sequence[0]) {
        setCoachMessage(lessonPayload.sequence[0].cue)
      }
    } catch (loadError) {
      setRequestError(loadError instanceof Error ? loadError.message : 'Failed to load the alphabet coach.')
    }
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
      resetPredictionLock(true)
      setResult(null)
      setLessonComplete(false)
      setCameraActive(true)
    } catch (startError) {
      setCameraError(startError instanceof Error ? startError.message : 'Unable to access the camera.')
    }
  }

  function stopCamera() {
    if (loopTimeoutRef.current !== null) {
      window.clearTimeout(loopTimeoutRef.current)
      loopTimeoutRef.current = null
    }
    if (advanceTimeoutRef.current !== null) {
      window.clearTimeout(advanceTimeoutRef.current)
      advanceTimeoutRef.current = null
    }
    requestInFlightRef.current = false
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setCameraActive(false)
  }

  function resetPredictionLock(clearCommitted: boolean) {
    stableCandidateRef.current = null
    stableCandidateCountRef.current = 0
    if (clearCommitted) {
      committedPredictionRef.current = null
    }
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

    if (stableCandidateRef.current === reliableLabel) {
      stableCandidateCountRef.current += 1
    } else {
      stableCandidateRef.current = reliableLabel
      stableCandidateCountRef.current = 1
    }

    const nextCount = stableCandidateCountRef.current
    const lockedPrediction = nextCount >= stableFrames ? reliableLabel : null

    startTransition(() => {
      setStabilityCount(nextCount)
      setStablePrediction(lockedPrediction)
    })

    if (lockedPrediction === null || committedPredictionRef.current === lockedPrediction || !currentItem) {
      return
    }

    committedPredictionRef.current = lockedPrediction
    startTransition(() => {
      setAttempts((current) => current + 1)
    })

    if (lockedPrediction === currentItem.label) {
      startTransition(() => {
        setCorrect((current) => current + 1)
        setCompletedLabels((current) => (current.includes(currentItem.label) ? current : [...current, currentItem.label]))
      })
      const nextItem = lesson?.sequence[currentIndex + 1] ?? null
      setCoachMessage(
        nextItem
          ? `Confirmed ${currentItem.label}. Moving to ${nextItem.label}.`
          : `Confirmed ${currentItem.label}. Lesson complete.`,
      )
      if (advanceTimeoutRef.current !== null) {
        window.clearTimeout(advanceTimeoutRef.current)
      }
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

    setCoachMessage(`${lockedPrediction} is stable. Adjust toward ${currentItem.label}.`)
  }

  async function finishLesson() {
    stopCamera()
    setLessonComplete(true)
    setCoachMessage('Lesson complete. Your session has been captured in the learning history.')
    if (sessionRecordedRef.current || !token) {
      return
    }

    sessionRecordedRef.current = true
    const durationSeconds = sessionStartRef.current ? Math.max(1, Math.round((Date.now() - sessionStartRef.current) / 1000)) : 60
    const accuracy = attempts > 0 ? (correct / attempts) * 100 : 100

    try {
      await apiRequest('/api/learn/session', {
        method: 'POST',
        token,
        body: JSON.stringify({
          track: 'alphabet',
          unit_title: 'Alphabet Coach',
          accuracy,
          completed_items: Math.max(1, completedLabels.length || lesson?.sequence.length || 1),
          duration_seconds: durationSeconds,
          summary: `Completed alphabet coach: ${Math.max(1, completedLabels.length || lesson?.sequence.length || 1)} letters confirmed.`,
        }),
      })
      setSessionSaved(true)
    } catch (saveError) {
      setRequestError(saveError instanceof Error ? saveError.message : 'Failed to save the lesson session.')
    }
  }

  function restartLesson() {
    if (advanceTimeoutRef.current !== null) {
      window.clearTimeout(advanceTimeoutRef.current)
      advanceTimeoutRef.current = null
    }
    stopCamera()
    sessionStartRef.current = null
    sessionRecordedRef.current = false
    committedPredictionRef.current = null
    setCurrentIndex(0)
    setAttempts(0)
    setCorrect(0)
    setCompletedLabels([])
    setResult(null)
    setStablePrediction(null)
    setStabilityCount(0)
    setSessionSaved(false)
    setLessonComplete(false)
    if (lesson?.sequence[0]) {
      setCoachMessage(lesson.sequence[0].cue)
    }
  }

  function skipLetter() {
    if (!lesson || !currentItem) {
      return
    }
    committedPredictionRef.current = null
    if (currentIndex + 1 >= lesson.sequence.length) {
      void finishLesson()
      return
    }
    setCurrentIndex((value) => value + 1)
    setResult(null)
    setCoachMessage(`Skipped ${currentItem.label}. Focus on ${lesson.sequence[currentIndex + 1]?.label}.`)
  }

  function captureCurrentFrame() {
    if (!videoRef.current || !canvasRef.current || videoRef.current.videoWidth === 0) {
      return null
    }
    const sourceWidth = videoRef.current.videoWidth
    const sourceHeight = videoRef.current.videoHeight
    const scale = Math.min(1, LIVE_CAPTURE_MAX_WIDTH / sourceWidth)
    const targetWidth = Math.max(1, Math.round(sourceWidth * scale))
    const targetHeight = Math.max(1, Math.round(sourceHeight * scale))

    canvasRef.current.width = targetWidth
    canvasRef.current.height = targetHeight
    const context = canvasRef.current.getContext('2d')
    if (!context) {
      return null
    }
    context.drawImage(videoRef.current, 0, 0, targetWidth, targetHeight)
    return canvasRef.current.toDataURL('image/jpeg', LIVE_CAPTURE_QUALITY)
  }

  const completionPercent = lesson?.sequence.length ? (completedLabels.length / lesson.sequence.length) * 100 : 0
  const sessionAccuracy = attempts > 0 ? (correct / attempts) * 100 : 0
  const stabilityPercent = Math.min(100, (stabilityCount / stableFrames) * 100)
  const liveGuess = deferredResult?.is_confident ? deferredResult.predicted_letter : '...'

  return (
    <AppShell
      title="Alphabet Coach"
      subtitle="Match the transparent hand guide with your own hand, hold the pose, and let the model automatically advance when the sign is confidently confirmed."
    >
      <section className="grid gap-8 xl:grid-cols-[1.18fr_0.82fr]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[30px] border border-outline-variant/15 bg-surface-container-low/90 px-6 py-4 shadow-sm">
            <div className="flex items-center gap-4">
              <Badge className="border-secondary/10 bg-secondary/10 text-secondary">
                Lesson {Math.min(currentIndex + 1, lesson?.sequence.length ?? 1)} / {lesson?.sequence.length ?? '...'}
              </Badge>
              {currentItem?.motion_letter ? (
                <Badge className="border-tertiary/10 bg-tertiary/10 text-tertiary">Motion letter</Badge>
              ) : null}
              <p className="text-sm text-on-surface-variant">
                {health?.alphabet_model_ready ? 'Live camera coach ready.' : 'Model booting'}
              </p>
            </div>

            <div className="flex items-center gap-3">
              {cameraActive ? (
                <Button variant="secondary" onClick={stopCamera}>
                  <Camera className="size-4" />
                  Stop Camera
                </Button>
              ) : (
                <Button onClick={startCamera}>
                  <Camera className="size-4" />
                  Start Camera
                </Button>
              )}
              <Button variant="outline" onClick={restartLesson}>
                <RotateCcw className="size-4" />
                Restart
              </Button>
            </div>
          </div>

          <Card className="overflow-hidden rounded-[34px] border-outline-variant/12 bg-surface-container-lowest/90 p-0">
            <div className="relative aspect-video overflow-hidden bg-[linear-gradient(180deg,#1a2237_0%,#0b1326_100%)]">
              <video
                ref={videoRef}
                className="h-full w-full scale-x-[-1] object-cover opacity-90"
                playsInline
                muted
                autoPlay
              />
              <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(68,226,205,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(68,226,205,0.08)_1px,transparent_1px)] [background-size:36px_36px]" />

              {currentItem ? (
                <HandGuideOverlay
                  label={currentItem.label}
                  points={currentItem.guide_points}
                  connections={lesson?.connections ?? []}
                  highlighted={stablePrediction === currentItem.label}
                />
              ) : null}

              <div className="absolute left-6 top-6 rounded-[22px] border border-outline-variant/10 bg-[#10182b]/70 px-4 py-3 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <Target className="size-4 text-secondary" />
                  <span className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                    Target {currentItem?.label ?? '...'}
                  </span>
                </div>
              </div>

              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#060e20] via-[#060e20]/78 to-transparent px-6 py-6">
                <div className="grid gap-5 md:grid-cols-[0.72fr_0.28fr] md:items-end">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Coach feedback</p>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-on-surface-variant">
                      {lessonComplete ? coachMessage : cameraActive ? coachMessage : 'Start the camera and align your hand with the guide.'}
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <div className="rounded-[22px] border border-outline-variant/10 bg-[#2d3449]/45 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Live guess</p>
                      <p className="mt-2 font-headline text-4xl font-black text-on-surface">{liveGuess}</p>
                    </div>
                    <Badge className="w-fit border-primary/10 bg-primary/10 text-primary">
                      Locked {stablePrediction ?? '...'}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          </Card>
          <canvas ref={canvasRef} className="hidden" />

          {(cameraError ?? requestError) && (
            <div className="rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">
              {cameraError ?? requestError}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-4">
            <LessonStat label="Target" value={currentItem?.label ?? '...'} />
            <LessonStat label="Live Guess" value={liveGuess} />
            <LessonStat label="Stable Lock" value={stablePrediction ?? '...'} />
            <LessonStat label="Tracking" value={deferredResult ? (deferredResult.tracking_detected ? 'ON' : 'OFF') : '...'} />
          </div>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[32px] border-outline-variant/12 bg-surface-container/95 p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Session Progress</CardTitle>
                <CardDescription>The lesson moves forward automatically after a stable confirmed match.</CardDescription>
              </div>
              {lessonComplete ? <CheckCircle2 className="size-5 text-secondary" /> : <Sparkles className="size-5 text-secondary" />}
            </div>

            <div className="mt-7 space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-on-surface-variant">
                  <span>Lesson completion</span>
                  <span>{completionPercent.toFixed(0)}%</span>
                </div>
                <Progress value={completionPercent} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-on-surface-variant">
                  <span>Stability gate</span>
                  <span>
                    {Math.min(stabilityCount, stableFrames)}/{stableFrames}
                  </span>
                </div>
                <Progress value={stabilityPercent} />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-on-surface-variant">
                  <span>Session accuracy</span>
                  <span>{sessionAccuracy.toFixed(1)}%</span>
                </div>
                <Progress value={sessionAccuracy} />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="secondary" onClick={skipLetter} disabled={!lesson || lessonComplete}>
                  <SkipForward className="size-4" />
                  Skip Letter
                </Button>
                <Button variant="outline" onClick={restartLesson}>
                  <RefreshCcw className="size-4" />
                  Reset Session
                </Button>
              </div>
            </div>
          </Card>

          <Card className="rounded-[32px] border-outline-variant/12 bg-surface-container/95 p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Target Detail</CardTitle>
                <CardDescription>Use the still reference and the cue together, then match the live guide.</CardDescription>
              </div>
              <ImageIcon className="size-5 text-secondary" />
            </div>

            <div className="mt-7 overflow-hidden rounded-[26px] border border-outline-variant/10 bg-surface-container-low">
              {currentItem?.reference_image_path ? (
                <img
                  src={`${API_BASE}${currentItem.reference_image_path}`}
                  alt={`Reference for ${currentItem.label}`}
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center text-sm text-on-surface-variant">Reference image unavailable.</div>
              )}
            </div>

            <div className="mt-6 rounded-[24px] border border-outline-variant/10 bg-surface-container-low p-5">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Current cue</p>
              <p className="mt-3 text-sm leading-7 text-on-surface-variant">{currentItem?.cue ?? 'Loading cue.'}</p>
            </div>

            {lesson?.note && currentItem?.motion_letter ? (
              <div className="mt-5 rounded-[24px] border border-tertiary/15 bg-tertiary/10 p-5 text-sm leading-7 text-tertiary">
                {lesson.note}
              </div>
            ) : null}
          </Card>

          <Card className="rounded-[32px] border-outline-variant/12 bg-surface-container/95 p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Alphabet Queue</CardTitle>
                <CardDescription>Confirmed letters glow; the current target stays pinned in the center lane.</CardDescription>
              </div>
              {deferredResult ? (
                deferredResult.matches_target ? <CheckCircle2 className="size-5 text-secondary" /> : <XCircle className="size-5 text-tertiary" />
              ) : (
                <LoaderCircle className="size-5 text-on-surface-variant" />
              )}
            </div>

            <div className="mt-7 flex flex-wrap gap-3">
              {(lesson?.sequence ?? []).map((item, index) => {
                const completed = completedLabels.includes(item.label)
                const active = index === currentIndex && !lessonComplete
                return (
                  <div
                    key={item.label}
                    className={cn(
                      'flex min-w-12 items-center justify-center rounded-2xl border px-4 py-3 font-headline text-xl font-bold transition-colors',
                      completed && 'border-secondary/15 bg-secondary/12 text-secondary',
                      active && 'border-primary/20 bg-primary/12 text-primary',
                      !completed && !active && 'border-outline-variant/15 bg-surface-container-low text-on-surface-variant',
                    )}
                  >
                    {item.label}
                  </div>
                )
              })}
            </div>

            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              <LessonStat label="Attempts" value={String(attempts)} />
              <LessonStat label="Confirmed" value={String(correct)} />
            </div>

            <div className="mt-6 overflow-hidden rounded-[26px] border border-outline-variant/10 bg-surface-container-low">
              {deferredResult?.annotated_image_base64 ? (
                <img
                  src={deferredResult.annotated_image_base64}
                  alt="Annotated model frame"
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center px-6 text-center text-sm text-on-surface-variant">
                  The backend-annotated frame appears here once live prediction begins.
                </div>
              )}
            </div>

            {lessonComplete ? (
              <div className="mt-6 rounded-[24px] border border-secondary/15 bg-secondary/10 p-5">
                <p className="font-semibold text-secondary">
                  Session complete{sessionSaved ? ' and saved.' : '.'}
                </p>
                <p className="mt-2 text-sm leading-7 text-on-surface-variant">
                  {sessionSaved
                    ? 'This alphabet run has been written back to your account progress.'
                    : 'If saving fails, the lesson itself is still complete.'}
                </p>
              </div>
            ) : null}
          </Card>
        </div>
      </section>
    </AppShell>
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
