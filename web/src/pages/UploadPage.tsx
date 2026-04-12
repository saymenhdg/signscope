import { CloudUpload, Download, Loader2, Play, Square, Sparkles } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { Skeleton } from '../components/ui/skeleton'
import { useToast } from '../components/ui/toast'
import { apiRequest } from '../lib/api'
import type { PredictResponse } from '../lib/types'

type TranscriptSegment = {
  timecode: string
  letter: string
  confidence: number
}

export function UploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const abortRef = useRef(false)
  const { toast } = useToast()

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
  }, [videoUrl])

  function handleFileSelect(file: File | null) {
    if (!file) return
    abortRef.current = true
    setAnalyzing(false)
    setProgress(0)
    setSegments([])
    if (videoUrl) URL.revokeObjectURL(videoUrl)
    const url = URL.createObjectURL(file)
    setSelectedFile(file)
    setVideoUrl(url)
  }

  const analyzeVideo = useCallback(async () => {
    const video = videoRef.current
    const canvas = canvasRef.current
    if (!video || !canvas || !selectedFile) return

    abortRef.current = false
    setAnalyzing(true)
    setSegments([])
    setProgress(0)

    await new Promise<void>((resolve) => {
      video.currentTime = 0
      video.onseeked = () => resolve()
    })

    const duration = video.duration
    const sampleInterval = 0.5
    const totalFrames = Math.floor(duration / sampleInterval)
    const ctx = canvas.getContext('2d')!
    const newSegments: TranscriptSegment[] = []

    for (let i = 0; i < totalFrames && !abortRef.current; i++) {
      const time = i * sampleInterval
      await new Promise<void>((resolve) => {
        video.currentTime = time
        video.onseeked = () => resolve()
      })

      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0)
      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1]

      try {
        const result = await apiRequest<PredictResponse>('/api/alphabet/predict', {
          method: 'POST',
          body: JSON.stringify({ image_base64: base64 }),
        })

        if (result.tracking_detected && result.is_confident) {
          const minutes = Math.floor(time / 60)
          const seconds = Math.floor(time % 60)
          newSegments.push({
            timecode: `${minutes}:${seconds.toString().padStart(2, '0')}`,
            letter: result.predicted_letter,
            confidence: result.confidence * 100,
          })
          setSegments([...newSegments])
        }
      } catch {
        // Frame failed, continue to next.
      }

      setProgress(Math.round(((i + 1) / totalFrames) * 100))
    }

    setAnalyzing(false)
    if (!abortRef.current) {
      toast({
        title: 'Analysis complete',
        description: `Detected ${newSegments.length} signs across ${totalFrames} frames.`,
        variant: 'success',
      })
    }
  }, [selectedFile, toast])

  function stopAnalysis() {
    abortRef.current = true
    setAnalyzing(false)
  }

  function downloadTranscript() {
    if (segments.length === 0) return
    const text = segments.map((s) => `[${s.timecode}] ${s.letter} (${s.confidence.toFixed(1)}%)`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `transcript-${selectedFile?.name ?? 'video'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const assembledWord = segments.map((s) => s.letter).join('')

  return (
    <AppShell
      title="Upload Video Translation"
      subtitle="Upload a sign language video to analyze frame-by-frame with the alphabet recognizer."
    >
      <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-0">
            {videoUrl ? (
              <div className="relative">
                <video
                  ref={videoRef}
                  src={videoUrl}
                  className="w-full rounded-[30px]"
                  controls={!analyzing}
                  muted
                  playsInline
                />
                {analyzing && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-[30px] bg-background/60 backdrop-blur-sm">
                    <div className="text-center">
                      <Loader2 className="mx-auto size-10 animate-spin text-secondary" />
                      <p className="mt-3 font-headline text-lg font-bold text-on-surface">Analyzing frames...</p>
                      <p className="mt-1 text-sm text-on-surface-variant">{progress}% complete</p>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <label className="group block cursor-pointer rounded-[30px] p-12 text-center transition-colors hover:bg-surface-container/50">
                <input
                  type="file"
                  accept=".mp4,.mov,.webm"
                  className="hidden"
                  onChange={(event) => handleFileSelect(event.target.files?.[0] ?? null)}
                />
                <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-surface-container text-secondary shadow-lg transition-transform duration-300 group-hover:scale-110">
                  <CloudUpload className="size-8" />
                </div>
                <p className="mt-6 font-headline text-2xl font-bold text-on-surface">Drag and drop a video to translate</p>
                <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-on-surface-variant">
                  MP4, MOV, or WEBM. Each frame is analyzed through the alphabet landmark model.
                </p>
                <div className="mt-8 inline-flex rounded-2xl border border-secondary/10 bg-gradient-to-br from-primary to-primary-container px-6 py-3 font-semibold text-[#0b1326]">
                  Browse Files
                </div>
              </label>
            )}
          </Card>

          <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Analysis Controls</CardTitle>
                <CardDescription>Select a video, then run the frame-by-frame recognizer.</CardDescription>
              </div>
              <Badge className={analyzing ? 'border-tertiary/10 bg-tertiary/10 text-tertiary' : 'border-secondary/10 bg-secondary/10 text-secondary'}>
                {analyzing ? 'Analyzing' : selectedFile ? 'Ready' : 'No File'}
              </Badge>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <UploadStat label="Selected file" value={selectedFile?.name ?? 'None'} />
              <UploadStat label="Detected signs" value={String(segments.length)} />
              <UploadStat label="Progress" value={`${progress}%`} />
            </div>
            <div className="mt-6">
              <div className="h-3 overflow-hidden rounded-full bg-surface-container-highest">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-secondary to-primary shadow-[0_0_12px_rgba(68,226,205,0.35)] transition-[width] duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
            <div className="mt-6 flex gap-3">
              {!analyzing ? (
                <>
                  <Button onClick={analyzeVideo} disabled={!selectedFile}>
                    <Play className="size-4" />
                    Analyze Video
                  </Button>
                  <label className="cursor-pointer">
                    <input
                      type="file"
                      accept=".mp4,.mov,.webm"
                      className="hidden"
                      onChange={(event) => handleFileSelect(event.target.files?.[0] ?? null)}
                    />
                    <span className="inline-flex items-center justify-center gap-2 rounded-2xl border border-outline-variant/25 bg-surface-container-high px-4 py-2 text-sm font-semibold text-on-surface transition-all hover:bg-surface-container-highest">
                      <CloudUpload className="size-4" />
                      {selectedFile ? 'Change File' : 'Select File'}
                    </span>
                  </label>
                </>
              ) : (
                <Button variant="secondary" onClick={stopAnalysis}>
                  <Square className="size-4" />
                  Stop
                </Button>
              )}
            </div>
          </Card>
        </div>

        <Card className="sticky top-28 h-fit rounded-[30px] border-outline-variant/12 bg-surface-container/95 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Live Transcript</CardTitle>
              <CardDescription>Signs detected from video frames.</CardDescription>
            </div>
            <Sparkles className="size-5 text-secondary" />
          </div>

          {assembledWord && (
            <div className="mt-6 rounded-3xl border border-secondary/15 bg-secondary/10 p-5">
              <p className="text-xs font-bold uppercase tracking-[0.24em] text-secondary">Assembled</p>
              <p className="mt-2 font-headline text-2xl font-bold tracking-widest text-on-surface">{assembledWord}</p>
            </div>
          )}

          <div className="mt-6 max-h-[50vh] space-y-3 overflow-y-auto">
            {segments.length > 0 ? (
              segments.map((segment, i) => (
                <div key={i} className="flex items-center gap-4 rounded-2xl bg-surface-container-high/45 p-4">
                  <span className="shrink-0 font-mono text-xs text-secondary">{segment.timecode}</span>
                  <span className="font-headline text-lg font-bold text-on-surface">{segment.letter}</span>
                  <span className="ml-auto text-xs text-on-surface-variant">{segment.confidence.toFixed(1)}%</span>
                </div>
              ))
            ) : analyzing ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="rounded-2xl bg-surface-container-high/45 p-4">
                  <Skeleton className="h-5 w-full" />
                </div>
              ))
            ) : (
              <div className="rounded-2xl bg-surface-container-high/45 p-5 text-center text-sm text-on-surface-variant">
                {selectedFile ? 'Click "Analyze Video" to start detection.' : 'Select a video to begin.'}
              </div>
            )}
          </div>

          <div className="mt-6 grid gap-3">
            <Button
              variant="secondary"
              className="w-full justify-center"
              disabled={segments.length === 0}
              onClick={downloadTranscript}
            >
              <Download className="size-4 text-secondary" />
              Download Transcript
            </Button>
          </div>
        </Card>
      </div>

      <canvas ref={canvasRef} className="hidden" />
    </AppShell>
  )
}

function UploadStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-outline-variant/10 bg-surface-container p-5">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</p>
      <p className="mt-3 break-all font-semibold text-on-surface">{value}</p>
    </div>
  )
}
