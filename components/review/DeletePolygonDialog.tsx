'use client'

import { useEffect, useState } from 'react'

const FEATURE_LABEL: Record<string, string> = {
  green: 'Green',
  fairway: 'Fairway',
  tee_box: 'Tee box',
  bunker: 'Bunker',
  water_hazard: 'Water hazard',
}

type Props = {
  feature: {
    id: string
    feature_type: string
    hole_number: number | null
  }
  onCancel: () => void
  onSuccess: () => void
}

export default function DeletePolygonDialog({ feature, onCancel, onSuccess }: Props) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const onConfirm = async () => {
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/features/${feature.id}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message =
          (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
            ? body.error
            : null) ?? `Delete failed (${res.status})`
        setError(message)
        setSubmitting(false)
        return
      }
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setSubmitting(false)
    }
  }

  const featureLabel = FEATURE_LABEL[feature.feature_type] ?? feature.feature_type
  const holeLabel = feature.hole_number != null ? `Hole ${feature.hole_number}` : 'Unassigned'

  return (
    <div
      className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-polygon-title"
      data-testid="delete-polygon-dialog"
    >
      <div className="bg-white rounded-lg w-full max-w-md p-6 shadow-xl">
        <h3 id="delete-polygon-title" className="text-base font-semibold text-gray-900">
          Delete polygon
        </h3>
        <p className="text-sm text-gray-700 mt-2">
          Delete this <strong>{featureLabel}</strong> polygon on <strong>{holeLabel}</strong>?
        </p>
        <p className="text-xs text-red-700 mt-2" role="note">
          This cannot be undone.
        </p>
        {error && (
          <p role="alert" className="text-xs text-red-700 mt-3" data-testid="delete-polygon-error">
            {error}
          </p>
        )}
        <div className="flex justify-end gap-2 mt-5">
          <button
            type="button"
            onClick={onCancel}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="delete-polygon-cancel"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={submitting}
            className="px-3 py-1.5 text-sm rounded-md bg-red-600 text-white font-medium hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="delete-polygon-confirm"
          >
            {submitting ? 'Deleting…' : 'Delete polygon'}
          </button>
        </div>
      </div>
    </div>
  )
}
