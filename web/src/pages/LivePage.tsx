import {
  Camera,
  CheckCircle2,
  Hand,
  RefreshCcw,
  RotateCcw,
  Settings2,
  Video,
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

import { LearnSubnav } from '../components/learning/learn-subnav'
import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { apiRequest, API_BASE } from '../lib/api'
import type { HealthResponse, PredictResponse } from '../lib/types'
import { cn } from '../lib/utils'

const LIVE_POLL_INTERVAL_MS = 450
const LIVE_CAPTURE_MAX_WIDTH = 640
const LIVE_CAPTURE_QUALITY = 0.82
const LIVE_STABLE_FRAMES = 3
const LIVE_CONFIDENCE_THRESHOLD = 0.45
const LIVE_MARGIN_THRESHOLD = 0.1

type LivePageProps = {
  title?: string
  subtitle?: string
  showLearnSubnav?: boolean
}

export function LivePage({
  title = 'Live Translation Workspace',
  subtitle = 'This page reuses the stitched live-translation layout and connects it directly to the FastAPI alphabet predictor.',
  showLearnSubnav = false,
}: LivePageProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const loopTimeoutRef = useRef<number | null>(null)
  const requestInFlightRef = useRef(false)
  const stableCandidateRef = useRef<string | null>(null)
  const stableCandidateCountRef = useRef(0)
  const committedPredictionRef = useRef<string | null>(null)

  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [labels, setLabels] = useState<string[]>([])
  const [targetLetter, setTargetLetter] = useState('A')
  const [result, setResult] = useState<PredictResponse | null>(null)
  const deferredResult = useDeferredValue(result)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [attempts, setAttempts] = useState(0)
  const [correct, setCorrect] = useState(0)
  const [stablePrediction, setStablePrediction] = useState<string | null>(null)
  const [stabilityCount, setStabilityCount] = useState(0)
  const [, startTransition] = useTransition()

  useEffect(() => {
    void loadBootstrap()
    return () => {
      stopCamera()
    }
  }, [])

  useEffect(() => {
    resetPredictionLock(false)
    setResult(null)
  }, [targetLetter])

  const runPredictionLoop = useEffectEvent(async () => {
    if (!cameraActive || !health?.alphabet_model_ready || requestInFlightRef.current) {
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
        credentials: 'include',
        body: JSON.stringify({
          image_base64: imageBase64,
          target_letter: targetLetter,
          threshold: LIVE_CONFIDENCE_THRESHOLD,
          min_margin: LIVE_MARGIN_THRESHOLD,
          include_annotated_image: true,
        }),
      })

      if (!response.ok) {
        const payload = (await response.json()) as { detail?: string }
        throw new Error(payload.detail ?? 'Live prediction failed.')
      }

      const payload = (await response.json()) as PredictResponse
      startTransition(() => {
        setResult(payload)
        setRequestError(null)
      })
      updatePredictionStability(payload)
    } catch (loopError) {
      setRequestError(loopError instanceof Error ? loopError.message : 'Live prediction failed.')
    } finally {
      requestInFlightRef.current = false
    }
  })

  useEffect(() => {
    if (!cameraActive || !health?.alphabet_model_ready) {
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
  }, [cameraActive, health?.alphabet_model_ready, runPredictionLoop])

  async function loadBootstrap() {
    try {
      const [healthPayload, lettersPayload] = await Promise.all([
        apiRequest<HealthResponse>('/api/health'),
        apiRequest<{ labels: string[] }>('/api/alphabet/letters'),
      ])
      setHealth(healthPayload)
      setLabels(lettersPayload.labels)
      if (lettersPayload.labels.length > 0) {
        setTargetLetter(lettersPayload.labels[0] ?? 'A')
      }
    } catch (loadError) {
      setRequestError(loadError instanceof Error ? loadError.message : 'Failed to connect to the API.')
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
      resetPredictionLock(true)
      setResult(null)
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
    requestInFlightRef.current = false
    streamRef.current?.getTracks().forEach((track) => track.stop())
    streamRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    resetPredictionLock(true)
    setResult(null)
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
    const lockedPrediction = nextCount >= LIVE_STABLE_FRAMES ? reliableLabel : null

    startTransition(() => {
      setStabilityCount(nextCount)
      setStablePrediction(lockedPrediction)
    })

    if (lockedPrediction === null || committedPredictionRef.current === lockedPrediction) {
      return
    }

    committedPredictionRef.current = lockedPrediction
    startTransition(() => {
      setAttempts((current) => current + 1)
      if (payload.matches_target) {
        setCorrect((current) => current + 1)
      }
    })
  }

  function randomizeLetter() {
    if (labels.length === 0) {
      return
    }
    const nextLetter = labels[Math.floor(Math.random() * labels.length)] ?? labels[0]
    if (!nextLetter) {
      return
    }
    committedPredictionRef.current = null
    setTargetLetter(nextLetter)
  }

  function resetScoreboard() {
    committedPredictionRef.current = null
    setAttempts(0)
    setCorrect(0)
    resetPredictionLock(false)
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

  const accuracy = attempts > 0 ? (correct / attempts) * 100 : 0
  const confidence = deferredResult ? deferredResult.confidence * 100 : 0
  const stabilityProgress = Math.min(100, (stabilityCount / LIVE_STABLE_FRAMES) * 100)
  const liveGuess = deferredResult?.is_confident ? deferredResult.predicted_letter : '...'

  return (
    <AppShell
      title={title}
      subtitle={subtitle}
    >
      {showLearnSubnav ? <LearnSubnav className="mb-6" /> : null}

      <div className="grid gap-8 xl:grid-cols-[1.25fr_0.75fr]">
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[28px] border border-outline-variant/15 bg-surface-container-low/90 px-6 py-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2 rounded-full border border-secondary/20 bg-secondary/10 px-3 py-1.5">
                <span className={cn('size-2.5 rounded-full', cameraActive ? 'bg-secondary animate-pulse' : 'bg-outline')} />
                <span className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">
                  {cameraActive ? 'Camera Active' : 'Camera Offline'}
                </span>
              </div>
              <p className="text-sm text-on-surface-variant">
                {health?.alphabet_model_ready ? 'Detecting alphabet signs...' : 'Model booting'}
              </p>
            </div>
            <div className="flex items-center gap-4">
              <div className="hidden items-center gap-3 sm:flex">
                <span className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">AI Confidence</span>
                <div className="h-2 w-28 overflow-hidden rounded-full bg-surface-container-highest">
                  <div className="h-full rounded-full bg-secondary" style={{ width: `${confidence}%` }} />
                </div>
                <span className="text-sm font-bold text-secondary">{confidence.toFixed(0)}%</span>
              </div>
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
              <video ref={videoRef} className="h-full w-full object-cover opacity-85" playsInline muted autoPlay />
              <div className="pointer-events-none absolute inset-0 opacity-35 [background-image:linear-gradient(rgba(68,226,205,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(68,226,205,0.08)_1px,transparent_1px)] [background-size:40px_40px]" />
              <div className="absolute left-6 top-6 rounded-2xl border border-outline-variant/10 bg-[#31394d]/60 px-4 py-2 backdrop-blur-xl">
                <div className="flex items-center gap-2">
                  <Settings2 className="size-4 text-secondary" />
                  <span className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Target {targetLetter}</span>
                </div>
              </div>
              <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-[#060e20] via-[#060e20]/80 to-transparent px-6 py-6">
                <div className="grid gap-5 md:grid-cols-[0.7fr_0.3fr] md:items-end">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Live Prediction</p>
                    <p className="mt-3 font-headline text-5xl font-extrabold tracking-tight text-on-surface">{liveGuess}</p>
                    <p className="mt-3 max-w-3xl text-sm leading-7 text-on-surface-variant">
                      {deferredResult?.feedback ?? 'Activate the camera and hold one clear handshape in the center of the frame.'}
                    </p>
                  </div>
                  <div className="grid gap-3">
                    <Badge className="w-fit border-secondary/10 bg-secondary/10 text-secondary">Locked {stablePrediction ?? '...'}</Badge>
                    <div className="rounded-[22px] border border-outline-variant/10 bg-[#2d3449]/45 p-4">
                      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Confidence Gate</p>
                      <p className="mt-2 text-3xl font-black text-on-surface">{confidence.toFixed(1)}%</p>
                    </div>
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

          <div className="grid gap-4 sm:grid-cols-3">
            <LiveStat label="Tracking" value={deferredResult ? (deferredResult.tracking_detected ? 'ON' : 'OFF') : '...'} />
            <LiveStat label="Current Guess" value={liveGuess} />
            <LiveStat label="Stable Lock" value={stablePrediction ?? '...'} />
          </div>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container/95 p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Configuration</CardTitle>
                <CardDescription>Live alphabet coaching backed by the FastAPI model.</CardDescription>
              </div>
              <Hand className="size-5 text-secondary" />
            </div>
            <div className="mt-7 space-y-5">
              <label className="grid gap-2">
                <span className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">Target Letter</span>
                <select
                  value={targetLetter}
                  onChange={(event) => {
                    committedPredictionRef.current = null
                    setTargetLetter(event.target.value)
                  }}
                  className="h-14 rounded-2xl border border-outline-variant/20 bg-surface-container px-4 text-on-surface outline-none transition-colors focus:border-secondary/60"
                >
                  {labels.map((label) => (
                    <option key={label} value={label}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="secondary" onClick={randomizeLetter}>
                  <RefreshCcw className="size-4" />
                  Random Letter
                </Button>
                <Button variant="outline" onClick={resetScoreboard}>
                  <RotateCcw className="size-4" />
                  Reset Score
                </Button>
              </div>

              <div className="space-y-3 rounded-[24px] border border-outline-variant/10 bg-surface-container-low p-5">
                <div className="flex items-center justify-between text-sm text-on-surface-variant">
                  <span>Stability lock</span>
                  <span>
                    {Math.min(stabilityCount, LIVE_STABLE_FRAMES)}/{LIVE_STABLE_FRAMES}
                  </span>
                </div>
                <Progress value={stabilityProgress} />
                <div className="flex items-center justify-between text-sm text-on-surface-variant">
                  <span>Session accuracy</span>
                  <span>{accuracy.toFixed(1)}%</span>
                </div>
                <Progress value={accuracy} />
              </div>
            </div>
          </Card>

          <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container/95 p-7">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Recognition Output</CardTitle>
                <CardDescription>Stable reads are counted once per lock.</CardDescription>
              </div>
              {deferredResult ? (
                deferredResult.matches_target ? (
                  <CheckCircle2 className="size-5 text-secondary" />
                ) : (
                  <XCircle className="size-5 text-tertiary" />
                )
              ) : (
                <RefreshCcw className="size-5 text-on-surface-variant" />
              )}
            </div>

            <div className="mt-7 grid gap-4 sm:grid-cols-2">
              <LiveStat label="Locked Reads" value={String(attempts)} />
              <LiveStat label="Target Hits" value={String(correct)} />
            </div>

            <div className="mt-7 overflow-hidden rounded-[26px] border border-outline-variant/10 bg-surface-container-low">
              {deferredResult?.annotated_image_base64 ? (
                <img
                  src={deferredResult.annotated_image_base64}
                  alt="Annotated model frame"
                  className="aspect-[4/3] w-full object-cover"
                />
              ) : (
                <div className="flex aspect-[4/3] items-center justify-center px-6 text-center text-sm text-on-surface-variant">
                  The backend-annotated frame will appear here once prediction starts.
                </div>
              )}
            </div>

            <div className="mt-6 space-y-3">
              {(deferredResult?.top_predictions ?? []).map((prediction) => (
                <div
                  key={prediction.label}
                  className="flex items-center justify-between rounded-[22px] border border-outline-variant/10 bg-surface-container-low px-4 py-3"
                >
                  <span className="font-semibold text-on-surface">{prediction.label}</span>
                  <span className="font-mono text-sm text-on-surface-variant">{(prediction.score * 100).toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  )
}

function LiveStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="rounded-[24px] border-outline-variant/10 bg-surface-container-low/90 p-5">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</p>
      <p className="mt-3 font-headline text-3xl font-black text-on-surface">{value}</p>
    </Card>
  )
}
