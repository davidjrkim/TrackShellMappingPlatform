'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

type TerminalStatus = 'completed' | 'failed' | 'cancelled'
type LiveStatus = 'queued' | 'running' | TerminalStatus

type ProgressEvent = {
  stage?: string
  progress?: number
  chips_processed?: number
  polygons_generated?: number
  status?: LiveStatus
  errorMessage?: string
  error?: string
}

type Props = {
  jobId: string
  courseId: string
  onDismiss?: () => void
}

const STAGES = [
  'fetch_tiles',
  'segmentation',
  'postprocess',
  'hole_assignment',
  'writeback',
]

function StageList({ current }: { current: string | null }) {
  const idx = current ? STAGES.indexOf(current) : -1
  return (
    <ol className="text-xs space-y-1">
      {STAGES.map((s, i) => {
        const state = i < idx ? 'done' : i === idx ? 'active' : 'pending'
        const color =
          state === 'done' ? 'text-green-600' :
          state === 'active' ? 'text-gray-900 font-medium' :
          'text-gray-400'
        const icon = state === 'done' ? '✓' : state === 'active' ? '•' : '○'
        return (
          <li key={s} className={color}>
            <span className="inline-block w-4">{icon}</span>{s.replace(/_/g, ' ')}
          </li>
        )
      })}
    </ol>
  )
}

export default function LiveJobProgress({ jobId, courseId, onDismiss }: Props) {
  const [status, setStatus] = useState<LiveStatus>('queued')
  const [stage, setStage] = useState<string | null>(null)
  const [progress, setProgress] = useState<number>(0)
  const [chips, setChips] = useState<number | null>(null)
  const [polygons, setPolygons] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const sseRef = useRef<EventSource | null>(null)

  useEffect(() => {
    const es = new EventSource(`/api/jobs/${jobId}/stream`)
    sseRef.current = es

    const onMsg = (ev: MessageEvent) => {
      try {
        const data: ProgressEvent = JSON.parse(ev.data)
        if (data.stage) setStage(data.stage)
        if (typeof data.progress === 'number') setProgress(data.progress)
        if (typeof data.chips_processed === 'number') setChips(data.chips_processed)
        if (typeof data.polygons_generated === 'number') setPolygons(data.polygons_generated)
        if (data.status) {
          setStatus(data.status)
          if (data.status === 'failed') setError(data.errorMessage ?? data.error ?? 'Pipeline failed')
          if (data.status === 'completed' || data.status === 'failed' || data.status === 'cancelled') {
            es.close()
          }
        }
      } catch {
        // ignore malformed
      }
    }

    es.addEventListener('status', onMsg as EventListener)
    es.onmessage = onMsg
    es.onerror = () => {
      // Falls back to polling if SSE fails.
      fetch(`/api/jobs/${jobId}/status`)
        .then((r) => r.json())
        .then((d) => {
          if (d?.job?.status) setStatus(d.job.status)
          if (d?.job?.errorMessage) setError(d.job.errorMessage)
        })
        .catch(() => {})
    }

    return () => { es.close() }
  }, [jobId])

  const terminal = status === 'completed' || status === 'failed' || status === 'cancelled'
  const pct = Math.max(0, Math.min(100, Math.round(progress * 100)))

  return (
    <div className="border border-gray-200 rounded-lg bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">
          {status === 'completed' ? 'Pipeline complete' :
           status === 'failed' ? 'Pipeline failed' :
           status === 'cancelled' ? 'Pipeline cancelled' :
           'Pipeline running'}
        </h3>
        <span className="text-xs text-gray-500">Job {jobId.slice(0, 8)}</span>
      </div>

      {!terminal && (
        <div className="mb-3">
          <div className="h-1.5 w-full bg-gray-100 rounded overflow-hidden">
            <div className="h-full bg-gray-900 transition-all" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-xs text-gray-500 mt-1">{pct}% · {stage?.replace(/_/g, ' ') ?? 'waiting'}</p>
        </div>
      )}

      {status === 'completed' && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-md px-3 py-2 flex items-center justify-between">
          <span>Ready for review — {polygons ?? 0} polygons, {chips ?? 0} chips</span>
          <Link
            href={`/dashboard/courses/${courseId}/review`}
            className="px-2.5 py-1 text-xs rounded-md bg-gray-900 text-white font-medium hover:bg-gray-800"
          >
            Review Holes
          </Link>
        </div>
      )}

      {status === 'failed' && (
        <div className="bg-red-50 border border-red-200 text-red-800 text-sm rounded-md px-3 py-2">
          <div className="font-medium mb-0.5">Pipeline failed</div>
          {error && <div className="text-xs whitespace-pre-wrap">{error.slice(0, 400)}</div>}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={onDismiss}
              className="px-2.5 py-1 text-xs rounded-md bg-white border border-red-300 text-red-700 hover:bg-red-50"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!terminal && (
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-gray-500 mb-1">Stages</p>
            <StageList current={stage} />
          </div>
          <div className="text-xs text-gray-600 space-y-1">
            <div>Chips processed: {chips ?? '—'}</div>
            <div>Polygons generated: {polygons ?? '—'}</div>
          </div>
        </div>
      )}
    </div>
  )
}
