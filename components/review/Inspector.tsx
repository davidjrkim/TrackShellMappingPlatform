'use client'

import { useEffect, useState } from 'react'
import type { HoleSummary } from './HoleList'

export type InspectorFeature = {
  id: string
  feature_type: string
  area_sqm: number | null
  confidence: number | null
  hole_number: number | null
  reviewed: boolean
}

const FEATURE_TYPE_OPTIONS = [
  'green',
  'fairway',
  'tee_box',
  'bunker',
  'water_hazard',
] as const

type Props = {
  hole: HoleSummary | null
  features: InspectorFeature[]
  topology: {
    has_green: boolean
    has_tee: boolean
    has_fairway: boolean
    has_bunker: boolean
  } | null
  holes: HoleSummary[]
  selectedFeatureId: string | null
  onSelectFeature: (featureId: string | null) => void
  onReassignSuccess: (payload: {
    featureId: string
    newHoleId: string
    priorHoleId: string | null
  }) => void
  onTypeChangeSuccess: (payload: {
    featureId: string
    priorType: string
  }) => void
  onRequestDeleteFeature: (feature: InspectorFeature) => void
  onToggleDrawMode: () => void
  drawModeActive?: boolean
  canEditGeometry?: boolean
  onConfirmHole: () => void
  confirmInFlight?: boolean
  loading?: boolean
}

function formatConfidence(v: number | null): string {
  if (v == null) return '—'
  return v.toFixed(2)
}

function formatArea(v: number | null): string {
  if (v == null) return '—'
  if (v >= 1000) return `${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} m²`
  return `${v.toFixed(0)} m²`
}

const FEATURE_LABEL: Record<string, string> = {
  green: 'Green',
  fairway: 'Fairway',
  tee_box: 'Tee box',
  bunker: 'Bunker',
  water_hazard: 'Water hazard',
}

const FEATURE_SWATCH: Record<string, string> = {
  green:        '#1e8449',
  fairway:      '#a9dfbf',
  tee_box:      '#f4d03f',
  bunker:       '#d4a76a',
  water_hazard: '#2e86c1',
}

export default function Inspector({
  hole,
  features,
  topology,
  holes,
  selectedFeatureId,
  onSelectFeature,
  onReassignSuccess,
  onTypeChangeSuccess,
  onRequestDeleteFeature,
  onToggleDrawMode,
  drawModeActive = false,
  canEditGeometry = true,
  onConfirmHole,
  confirmInFlight = false,
  loading = false,
}: Props) {
  const selectedFeature = selectedFeatureId
    ? features.find((f) => f.id === selectedFeatureId) ?? null
    : null

  return (
    <aside
      className="w-80 flex-none border-l border-gray-200 bg-white flex flex-col"
      data-testid="inspector"
    >
      {!hole ? (
        <div className="p-4 text-sm text-gray-500">
          Select a hole on the left to inspect it.
        </div>
      ) : selectedFeature ? (
        <FeatureView
          feature={selectedFeature}
          holes={holes}
          onBack={() => onSelectFeature(null)}
          onReassignSuccess={onReassignSuccess}
          onTypeChangeSuccess={onTypeChangeSuccess}
          onRequestDelete={() => onRequestDeleteFeature(selectedFeature)}
          onToggleDrawMode={onToggleDrawMode}
          drawModeActive={drawModeActive}
          canEditGeometry={canEditGeometry}
        />
      ) : (
        <HoleView
          hole={hole}
          features={features}
          topology={topology}
          loading={loading}
          onSelectFeature={onSelectFeature}
          onConfirmHole={onConfirmHole}
          confirmInFlight={confirmInFlight}
        />
      )}
    </aside>
  )
}

function HoleView({
  hole,
  features,
  topology,
  loading,
  onSelectFeature,
  onConfirmHole,
  confirmInFlight,
}: {
  hole: HoleSummary
  features: InspectorFeature[]
  topology: Props['topology']
  loading: boolean
  onSelectFeature: (id: string) => void
  onConfirmHole: () => void
  confirmInFlight: boolean
}) {
  const flagged = hole.needs_review && !hole.confirmed

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-gray-900">Hole {hole.hole_number}</h2>
          <span className="text-xs text-gray-500">
            Confidence: <span className="font-medium text-gray-800">{formatConfidence(hole.confidence)}</span>
          </span>
        </div>
        {hole.confirmed ? (
          <p className="text-xs text-green-700 mt-1">✓ Confirmed</p>
        ) : flagged ? (
          <p className="text-xs text-amber-700 mt-1">⚠ Flagged for review</p>
        ) : (
          <p className="text-xs text-gray-500 mt-1">High confidence</p>
        )}
      </header>

      <div className="flex-1 overflow-y-auto">
        <section className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Polygons ({features.length})
          </h3>
          {loading ? (
            <p className="text-xs text-gray-400">Loading…</p>
          ) : features.length === 0 ? (
            <p className="text-xs text-gray-400">No polygons assigned to this hole.</p>
          ) : (
            <ul className="space-y-1.5">
              {features.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => onSelectFeature(f.id)}
                    className="w-full flex items-center justify-between gap-2 text-left px-2 py-1.5 rounded-md hover:bg-gray-50 text-sm"
                    data-testid={`polygon-row-${f.id}`}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden
                        className="inline-block w-2.5 h-2.5 rounded-sm"
                        style={{ backgroundColor: FEATURE_SWATCH[f.feature_type] ?? '#888' }}
                      />
                      <span className="text-gray-800">
                        {FEATURE_LABEL[f.feature_type] ?? f.feature_type}
                      </span>
                    </span>
                    <span className="text-xs text-gray-500 tabular-nums">
                      {formatArea(f.area_sqm)} · {formatConfidence(f.confidence)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">
            Topology check
          </h3>
          {topology ? (
            <ul className="text-sm space-y-1">
              <TopologyRow ok={topology.has_green} label="Has green" />
              <TopologyRow ok={topology.has_tee} label="Has tee box" />
              <TopologyRow ok={topology.has_fairway} label="Has fairway" warn />
              <TopologyRow ok={topology.has_bunker} label="Has bunker" info />
            </ul>
          ) : (
            <p className="text-xs text-gray-400">No polygons assigned.</p>
          )}
        </section>
      </div>

      <footer className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        {hole.confirmed ? (
          <button
            type="button"
            disabled
            className="w-full px-3 py-2 rounded-md bg-green-100 text-green-800 text-sm font-medium cursor-default"
            data-testid="confirm-hole-confirmed"
          >
            ✓ Hole Confirmed
          </button>
        ) : (
          <button
            type="button"
            onClick={onConfirmHole}
            disabled={confirmInFlight}
            title="Confirm hole (Enter)"
            className="w-full px-3 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
            data-testid="confirm-hole"
          >
            {confirmInFlight ? 'Confirming…' : 'Confirm Hole'}
          </button>
        )}
      </footer>
    </div>
  )
}

function TopologyRow({
  ok,
  label,
  warn = false,
  info = false,
}: {
  ok: boolean
  label: string
  warn?: boolean
  info?: boolean
}) {
  if (ok) {
    return (
      <li className="flex items-center gap-2 text-green-700">
        <span aria-hidden>✅</span> {label}
      </li>
    )
  }
  if (warn) {
    return (
      <li className="flex items-center gap-2 text-amber-700">
        <span aria-hidden>⚠</span> Missing: {label}
      </li>
    )
  }
  if (info) {
    return (
      <li className="flex items-center gap-2 text-gray-500">
        <span aria-hidden>—</span> No {label.toLowerCase()}
      </li>
    )
  }
  return (
    <li className="flex items-center gap-2 text-red-700">
      <span aria-hidden>✕</span> Missing: {label}
    </li>
  )
}

function FeatureView({
  feature,
  holes,
  onBack,
  onReassignSuccess,
  onTypeChangeSuccess,
  onRequestDelete,
  onToggleDrawMode,
  drawModeActive,
  canEditGeometry,
}: {
  feature: InspectorFeature
  holes: HoleSummary[]
  onBack: () => void
  onReassignSuccess: Props['onReassignSuccess']
  onTypeChangeSuccess: Props['onTypeChangeSuccess']
  onRequestDelete: () => void
  onToggleDrawMode: () => void
  drawModeActive: boolean
  canEditGeometry: boolean
}) {
  return (
    <div className="flex flex-col h-full">
      <header className="px-4 py-3 border-b border-gray-200">
        <button
          type="button"
          onClick={onBack}
          className="text-xs text-gray-500 hover:text-gray-800"
        >
          ← Back to Hole {feature.hole_number ?? '—'}
        </button>
        <h2 className="text-base font-semibold text-gray-900 mt-1">Polygon</h2>
        <p className="text-xs text-gray-500 mt-0.5 font-mono">{feature.id.slice(0, 8)}…</p>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 text-sm">
        <Row label="Feature type" value={FEATURE_LABEL[feature.feature_type] ?? feature.feature_type} />
        <Row label="Assigned hole" value={feature.hole_number != null ? `Hole ${feature.hole_number}` : 'Unassigned'} />
        <Row label="Area" value={formatArea(feature.area_sqm)} />
        <Row label="Confidence" value={formatConfidence(feature.confidence)} />
        <Row label="Reviewed" value={feature.reviewed ? 'Yes' : 'No'} />

        <ReassignHoleControl
          feature={feature}
          holes={holes}
          onSuccess={onReassignSuccess}
        />

        <ChangeTypeControl
          feature={feature}
          onSuccess={onTypeChangeSuccess}
        />

        <div className="pt-3 mt-2 border-t border-gray-100 space-y-2">
          <button
            type="button"
            onClick={onToggleDrawMode}
            disabled={!canEditGeometry}
            title={canEditGeometry ? 'Edit geometry (D)' : 'Geometry unavailable'}
            className={
              drawModeActive
                ? 'w-full px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed'
                : 'w-full px-3 py-1.5 text-xs rounded-md border border-blue-300 text-blue-700 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed'
            }
            data-testid="edit-geometry-toggle"
          >
            {drawModeActive ? 'Editing… (Esc to cancel)' : 'Edit geometry'}
          </button>
          <button
            type="button"
            onClick={onRequestDelete}
            className="w-full px-3 py-1.5 text-xs rounded-md border border-red-300 text-red-700 hover:bg-red-50"
            data-testid="delete-polygon-open"
          >
            Delete polygon
          </button>
        </div>
      </div>
    </div>
  )
}

function ReassignHoleControl({
  feature,
  holes,
  onSuccess,
}: {
  feature: InspectorFeature
  holes: HoleSummary[]
  onSuccess: Props['onReassignSuccess']
}) {
  const orderedHoles = [...holes].sort((a, b) => a.hole_number - b.hole_number)
  const currentHole = orderedHoles.find((h) => h.hole_number === feature.hole_number)
  const currentHoleId = currentHole?.id ?? ''

  const [selectedHoleId, setSelectedHoleId] = useState<string>(currentHoleId)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Reset local selection when the underlying feature changes (different polygon
  // selected, or a successful mutation lands new hole_number from the server).
  useEffect(() => {
    setSelectedHoleId(currentHoleId)
    setError(null)
  }, [feature.id, currentHoleId])

  const dirty = selectedHoleId !== '' && selectedHoleId !== currentHoleId
  const disabled = submitting || !dirty

  const onApply = async () => {
    if (!dirty) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/features/${feature.id}/hole`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ holeId: selectedHoleId }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message =
          (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
            ? body.error
            : null) ?? `Reassign failed (${res.status})`
        setError(message)
        return
      }
      onSuccess({
        featureId: feature.id,
        newHoleId: selectedHoleId,
        priorHoleId: currentHoleId || null,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Reassign failed')
    } finally {
      setSubmitting(false)
    }
  }

  const onCancel = () => {
    setSelectedHoleId(currentHoleId)
    setError(null)
  }

  return (
    <div className="pt-3 mt-2 border-t border-gray-100">
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
        Reassign to hole
      </label>
      <select
        value={selectedHoleId}
        onChange={(e) => setSelectedHoleId(e.target.value)}
        disabled={submitting}
        className="w-full text-sm rounded-md border border-gray-300 px-2 py-1.5 bg-white disabled:bg-gray-100"
        data-testid="reassign-hole-select"
      >
        {currentHoleId === '' && <option value="">Unassigned</option>}
        {orderedHoles.map((h) => (
          <option key={h.id} value={h.id}>
            Hole {h.hole_number}
          </option>
        ))}
      </select>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          data-testid="reassign-hole-apply"
        >
          {submitting ? 'Applying…' : 'Apply'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting || !dirty}
          className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="reassign-hole-cancel"
        >
          Cancel
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="mt-2 flex items-start justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800"
          data-testid="reassign-hole-error"
        >
          <span className="leading-relaxed">{error}</span>
          <button
            type="button"
            onClick={onApply}
            disabled={submitting}
            className="flex-none px-2 py-0.5 rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="reassign-hole-retry"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function ChangeTypeControl({
  feature,
  onSuccess,
}: {
  feature: InspectorFeature
  onSuccess: Props['onTypeChangeSuccess']
}) {
  const currentType = feature.feature_type
  const [selectedType, setSelectedType] = useState<string>(currentType)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setSelectedType(currentType)
    setError(null)
  }, [feature.id, currentType])

  const dirty = selectedType !== currentType
  const disabled = submitting || !dirty

  const onApply = async () => {
    if (!dirty) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/features/${feature.id}/type`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ featureType: selectedType }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message =
          (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
            ? body.error
            : null) ?? `Type change failed (${res.status})`
        setError(message)
        return
      }
      onSuccess({ featureId: feature.id, priorType: currentType })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Type change failed')
    } finally {
      setSubmitting(false)
    }
  }

  const onCancel = () => {
    setSelectedType(currentType)
    setError(null)
  }

  return (
    <div className="pt-3 mt-2 border-t border-gray-100">
      <label className="block text-xs font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
        Feature type
      </label>
      <select
        value={selectedType}
        onChange={(e) => setSelectedType(e.target.value)}
        disabled={submitting}
        className="w-full text-sm rounded-md border border-gray-300 px-2 py-1.5 bg-white disabled:bg-gray-100"
        data-testid="change-type-select"
      >
        {FEATURE_TYPE_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {FEATURE_LABEL[t] ?? t}
          </option>
        ))}
      </select>
      <div className="mt-2 flex gap-2">
        <button
          type="button"
          onClick={onApply}
          disabled={disabled}
          className="px-3 py-1.5 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed"
          data-testid="change-type-apply"
        >
          {submitting ? 'Applying…' : 'Apply'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting || !dirty}
          className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          data-testid="change-type-cancel"
        >
          Cancel
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="mt-2 flex items-start justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1.5 text-xs text-red-800"
          data-testid="change-type-error"
        >
          <span className="leading-relaxed">{error}</span>
          <button
            type="button"
            onClick={onApply}
            disabled={submitting}
            className="flex-none px-2 py-0.5 rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="change-type-retry"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-gray-500">{label}</dt>
      <dd className="text-gray-900 font-medium">{value}</dd>
    </div>
  )
}
