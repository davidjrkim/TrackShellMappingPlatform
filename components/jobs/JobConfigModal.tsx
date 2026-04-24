'use client'

import { useState } from 'react'

type JobType = 'segmentation' | 'hole_assignment' | 'full_pipeline'

type Props = {
  open: boolean
  onClose: () => void
  onStart: (jobId: string) => void
  courseId: string
  courseStatus: string
  role: 'admin' | 'reviewer' | string
}

const JOB_TYPES: { value: JobType; label: string; description: string }[] = [
  { value: 'full_pipeline', label: 'Full pipeline', description: 'Segmentation + hole assignment' },
  { value: 'segmentation', label: 'Segmentation only', description: 'Generate polygons, skip hole assignment' },
  { value: 'hole_assignment', label: 'Hole assignment only', description: 'Re-assign existing polygons' },
]

const TILE_SOURCES = ['mapbox-satellite', 'esri-world-imagery', 'google-satellite']

export default function JobConfigModal({ open, onClose, onStart, courseId, courseStatus, role }: Props) {
  const [jobType, setJobType] = useState<JobType>('full_pipeline')
  const [force, setForce] = useState(false)
  const [tileSource, setTileSource] = useState(TILE_SOURCES[0])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const requiresForce = courseStatus === 'reviewed' || courseStatus === 'published'
  const forceGatedToAdmin = requiresForce && role !== 'admin'

  async function onSubmit() {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch('/api/jobs/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseId, jobType, force: requiresForce ? true : force, tileSource }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data?.error ?? `Failed (${res.status})`)
        setSubmitting(false)
        return
      }
      onStart(data.jobId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error')
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-xl">
        <h3 className="text-base font-semibold text-gray-900">Run pipeline job</h3>

        <div className="mt-4">
          <p className="text-xs font-medium text-gray-700 mb-2">Job type</p>
          <div className="space-y-1.5">
            {JOB_TYPES.map((t) => (
              <label key={t.value} className="flex items-start gap-2 p-2 rounded-md border border-gray-200 hover:bg-gray-50 cursor-pointer">
                <input
                  type="radio"
                  name="jobType"
                  value={t.value}
                  checked={jobType === t.value}
                  onChange={() => setJobType(t.value)}
                  className="mt-0.5"
                />
                <span>
                  <span className="block text-sm text-gray-900">{t.label}</span>
                  <span className="block text-xs text-gray-500">{t.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>

        <div className="mt-4">
          <label className="text-xs font-medium text-gray-700">Tile source</label>
          <select
            value={tileSource}
            onChange={(e) => setTileSource(e.target.value)}
            className="mt-1 w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm"
          >
            {TILE_SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {requiresForce ? (
          <div className="mt-4 p-2.5 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-900">
            Course is <strong>{courseStatus}</strong>. A re-run will require <code>force=true</code>.
            {forceGatedToAdmin && <div className="mt-1">Only admins may force a re-run.</div>}
          </div>
        ) : (
          <label className="mt-4 flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" checked={force} onChange={(e) => setForce(e.target.checked)} />
            Force re-run (overwrites existing polygons)
          </label>
        )}

        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || forceGatedToAdmin}
            className="px-3 py-1.5 text-sm rounded-md bg-gray-900 text-white font-medium hover:bg-gray-800 disabled:opacity-50"
            data-testid="job-run-submit"
          >
            {submitting ? 'Starting…' : 'Start job'}
          </button>
        </div>
      </div>
    </div>
  )
}
