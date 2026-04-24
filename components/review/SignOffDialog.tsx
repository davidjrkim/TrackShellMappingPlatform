'use client'

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { HoleSummary } from './HoleList'

type CorrectionRow = {
  id: string
  correction_type: string
}

type Props = {
  courseId: string
  holes: HoleSummary[]
  onCancel: () => void
  onSignedOff: () => void
}

const COUNT_LABEL: Record<string, string> = {
  hole_reassignment: 'Hole reassignments',
  type_change: 'Type changes',
  geometry_edit: 'Geometry edits',
  polygon_delete: 'Polygons deleted',
}

const COUNT_ORDER = [
  'hole_reassignment',
  'type_change',
  'geometry_edit',
  'polygon_delete',
] as const

export default function SignOffDialog({
  courseId,
  holes,
  onCancel,
  onSignedOff,
}: Props) {
  const router = useRouter()

  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [blockingHoles, setBlockingHoles] = useState<number[] | null>(null)

  // Holes that will auto-confirm on sign-off — anything not yet confirmed
  // (the API gate has already guaranteed none of them are needs_review=true).
  const autoConfirmCount = useMemo(
    () => holes.filter((h) => !h.confirmed).length,
    [holes],
  )

  useEffect(() => {
    let cancelled = false
    fetch(`/api/corrections?courseId=${courseId}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load corrections (${r.status})`)
        return r.json() as Promise<{ corrections: CorrectionRow[] }>
      })
      .then((data) => {
        if (cancelled) return
        const byType: Record<string, number> = {}
        for (const c of data.corrections) {
          byType[c.correction_type] = (byType[c.correction_type] ?? 0) + 1
        }
        setCounts(byType)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err instanceof Error ? err.message : 'Failed to load corrections')
      })
    return () => {
      cancelled = true
    }
  }, [courseId])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (!submitting) onCancel()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [onCancel, submitting])

  const onSubmit = async () => {
    if (submitting) return
    setSubmitting(true)
    setSubmitError(null)
    setBlockingHoles(null)
    try {
      const res = await fetch(`/api/courses/${courseId}/review/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: notes.trim() || undefined }),
      })
      if (res.status === 400) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string
          blocking_holes?: unknown
        }
        const blocking = Array.isArray(body.blocking_holes)
          ? body.blocking_holes.filter((n): n is number => typeof n === 'number')
          : []
        setBlockingHoles(blocking)
        setSubmitError(body.error ?? 'Cannot sign off — flagged holes remain')
        return
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string }
        setSubmitError(body.error ?? `Sign-off failed (${res.status})`)
        return
      }
      onSignedOff()
      router.push(`/dashboard/courses/${courseId}/overview`)
      router.refresh()
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Sign-off failed')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="signoff-title"
      data-testid="signoff-dialog"
    >
      <div className="bg-white rounded-lg w-full max-w-lg p-6 shadow-xl">
        <h3 id="signoff-title" className="text-base font-semibold text-gray-900">
          Sign off course
        </h3>
        <p className="text-sm text-gray-600 mt-1">
          Review the correction summary and add any notes before marking this
          course as reviewed.
        </p>

        <section className="mt-4">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Correction summary
          </h4>
          {loadError ? (
            <p className="text-xs text-red-700" role="alert" data-testid="signoff-load-error">
              {loadError}
            </p>
          ) : counts == null ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
              {COUNT_ORDER.map((type) => (
                <div key={type} className="flex items-center justify-between gap-3">
                  <dt className="text-gray-600">{COUNT_LABEL[type]}</dt>
                  <dd
                    className="text-gray-900 font-medium tabular-nums"
                    data-testid={`signoff-count-${type}`}
                  >
                    {counts[type] ?? 0}
                  </dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 col-span-2 pt-1.5 mt-1.5 border-t border-gray-100">
                <dt className="text-gray-600">Auto-confirmed on sign-off</dt>
                <dd
                  className="text-gray-900 font-medium tabular-nums"
                  data-testid="signoff-auto-confirm-count"
                >
                  {autoConfirmCount}
                </dd>
              </div>
            </dl>
          )}
        </section>

        <section className="mt-5">
          <label
            htmlFor="signoff-notes"
            className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5"
          >
            Reviewer notes (optional)
          </label>
          <textarea
            id="signoff-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            disabled={submitting}
            rows={3}
            className="w-full text-sm rounded-md border border-gray-300 px-2 py-1.5 bg-white disabled:bg-gray-100"
            placeholder="Anything the next reviewer / publisher should know…"
            data-testid="signoff-notes"
          />
        </section>

        {submitError && (
          <div
            role="alert"
            className="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            data-testid="signoff-error"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="leading-relaxed">{submitError}</span>
              <button
                type="button"
                onClick={onSubmit}
                disabled={submitting}
                className="flex-none px-2 py-0.5 rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="signoff-retry"
              >
                Retry
              </button>
            </div>
            {blockingHoles && blockingHoles.length > 0 && (
              <p className="mt-1.5" data-testid="signoff-blocking-holes">
                Still blocking: {blockingHoles.map((n) => `Hole ${n}`).join(', ')}
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="signoff-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onSubmit}
            disabled={submitting || counts == null}
            className="px-3 py-1.5 text-sm rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            data-testid="signoff-confirm"
          >
            {submitting ? 'Signing off…' : 'Mark Course Reviewed'}
          </button>
        </div>
      </div>
    </div>
  )
}
