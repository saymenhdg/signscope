import { CloudUpload, Download, FileVideo, FolderPlus, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import { AppShell } from '../components/app-shell'
import { Badge } from '../components/ui/badge'
import { Card, CardDescription, CardTitle } from '../components/ui/card'
import { apiRequest } from '../lib/api'
import type { HealthResponse } from '../lib/types'

const SAMPLE_SEGMENTS = [
  { timecode: '0:04', text: 'Hello, my name is Alex and I am excited to share this project with you today.' },
  { timecode: '0:12', text: 'The main goal of SignSpeak is to bridge the gap between deaf and hearing communities.' },
  { timecode: '0:24', text: 'We use landmark tracking and PyTorch inference to keep translation fast and local.' },
]

export function UploadPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function loadHealth() {
      try {
        const payload = await apiRequest<HealthResponse>('/api/health')
        if (!cancelled) {
          setHealth(payload)
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : 'Failed to load engine status.')
        }
      }
    }

    void loadHealth()

    return () => {
      cancelled = true
    }
  }, [])

  const transcriptSegments = useMemo(() => {
    if (!selectedFile) {
      return SAMPLE_SEGMENTS
    }
    return SAMPLE_SEGMENTS.map((segment, index) => ({
      ...segment,
      text: `${segment.text} Source file: ${selectedFile.name} (${index + 1}/${SAMPLE_SEGMENTS.length}).`,
    }))
  }, [selectedFile])

  return (
    <AppShell
      title="Upload Video Translation"
      subtitle="Use the stitched upload layout as the review surface for queued videos while the backend reports engine readiness."
    >
      {error && (
        <div className="mb-6 rounded-2xl border border-error/25 bg-error/10 px-4 py-3 text-sm text-error">{error}</div>
      )}

      <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
        <div className="space-y-8">
          <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-0">
            <label className="group block cursor-pointer rounded-[30px] p-12 text-center">
              <input
                type="file"
                accept=".mp4,.mov,.webm"
                className="hidden"
                onChange={(event) => {
                  setSelectedFile(event.target.files?.[0] ?? null)
                }}
              />
              <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-surface-container text-secondary shadow-lg">
                <CloudUpload className="size-8" />
              </div>
              <p className="mt-6 font-headline text-2xl font-bold text-on-surface">Drag and drop a video to translate</p>
              <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-on-surface-variant">
                MP4, MOV, or WEBM. This page is wired to FastAPI for engine status and is ready for a future file-upload pipeline.
              </p>
              <div className="mt-8 inline-flex rounded-2xl border border-secondary/10 bg-gradient-to-br from-primary to-primary-container px-6 py-3 font-semibold text-[#0b1326]">
                Browse Files
              </div>
            </label>
          </Card>

          <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle>Analysis Status</CardTitle>
                <CardDescription>Current backend model readiness and queue preview.</CardDescription>
              </div>
              <Badge className="border-secondary/10 bg-secondary/10 text-secondary">
                {health?.alphabet_model_ready ? 'Engine Ready' : 'Loading'}
              </Badge>
            </div>
            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              <UploadStat label="Selected file" value={selectedFile?.name ?? 'No file'} />
              <UploadStat label="Formats" value="MP4 MOV WEBM" />
              <UploadStat label="Recognizer" value={health?.landmark_model_ready ? 'Landmark ensemble' : 'Booting'} />
            </div>
            <div className="mt-8">
              <div className="mb-3 flex items-center justify-between text-sm text-on-surface-variant">
                <span>Mock analysis progress</span>
                <span>64%</span>
              </div>
              <div className="h-3 overflow-hidden rounded-full bg-surface-container-highest">
                <div className="h-full w-[64%] rounded-full bg-gradient-to-r from-secondary to-primary shadow-[0_0_12px_rgba(68,226,205,0.35)]" />
              </div>
            </div>
          </Card>

          <Card className="rounded-[30px] border-outline-variant/12 bg-surface-container-low/90 p-8">
            <div className="mb-6 flex items-center gap-3">
              <FileVideo className="size-5 text-secondary" />
              <div>
                <CardTitle>Preview Surface</CardTitle>
                <CardDescription>The selected file name is echoed here while transcript segments update on the right.</CardDescription>
              </div>
            </div>
            <div className="flex aspect-video items-center justify-center rounded-[28px] border border-outline-variant/10 bg-[linear-gradient(180deg,#192235_0%,#0b1326_100%)] text-center">
              <div className="space-y-3 px-6">
                <p className="font-headline text-3xl font-bold text-on-surface">{selectedFile?.name ?? 'No video selected yet'}</p>
                <p className="text-sm text-on-surface-variant">Attach a clip to prepare it for future upload-backed translation jobs.</p>
              </div>
            </div>
          </Card>
        </div>

        <Card className="sticky top-28 h-fit rounded-[30px] border-outline-variant/12 bg-surface-container/95 p-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle>Live Transcript</CardTitle>
              <CardDescription>Backend-linked review panel ready for upload job output.</CardDescription>
            </div>
            <Sparkles className="size-5 text-secondary" />
          </div>

          <div className="mt-8 space-y-5">
            {transcriptSegments.map((segment) => (
              <div key={segment.timecode} className="flex gap-4 rounded-[22px] bg-surface-container-high/45 p-4">
                <span className="shrink-0 font-mono text-xs text-secondary">{segment.timecode}</span>
                <p className="text-sm leading-7 text-on-surface">{segment.text}</p>
              </div>
            ))}
          </div>

          <div className="mt-8 grid gap-3">
            <button className="flex items-center justify-center gap-2 rounded-2xl bg-surface-container-highest px-4 py-3 font-semibold text-on-surface transition-colors hover:bg-surface-bright">
              <Download className="size-4 text-secondary" />
              Download Transcript
            </button>
            <button className="flex items-center justify-center gap-2 rounded-2xl bg-secondary/10 px-4 py-3 font-semibold text-secondary transition-colors hover:bg-secondary/20">
              <FolderPlus className="size-4" />
              Save to Library
            </button>
          </div>
        </Card>
      </div>
    </AppShell>
  )
}

function UploadStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[24px] border border-outline-variant/10 bg-surface-container p-5">
      <p className="text-xs font-bold uppercase tracking-[0.24em] text-on-surface-variant">{label}</p>
      <p className="mt-3 break-all font-semibold text-on-surface">{value}</p>
    </div>
  )
}
