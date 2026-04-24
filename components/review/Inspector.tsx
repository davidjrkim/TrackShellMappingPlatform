'use client'

import type { HoleSummary } from './HoleList'

export type InspectorFeature = {
  id: string
  feature_type: string
  area_sqm: number | null
  confidence_score: number | null
  hole_number: number | null
  reviewed: boolean
}

type Props = {
  hole: HoleSummary | null
  features: InspectorFeature[]
  topology: {
    has_green: boolean
    has_tee: boolean
    has_fairway: boolean
    has_bunker: boolean
  } | null
  selectedFeatureId: string | null
  onSelectFeature: (featureId: string | null) => void
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
  selectedFeatureId,
  onSelectFeature,
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
          onBack={() => onSelectFeature(null)}
        />
      ) : (
        <HoleView hole={hole} features={features} topology={topology} loading={loading} onSelectFeature={onSelectFeature} />
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
}: {
  hole: HoleSummary
  features: InspectorFeature[]
  topology: Props['topology']
  loading: boolean
  onSelectFeature: (id: string) => void
}) {
  const flagged = hole.needs_review && !hole.confirmed

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 py-3 border-b border-gray-200">
        <div className="flex items-baseline justify-between">
          <h2 className="text-base font-semibold text-gray-900">Hole {hole.hole_number}</h2>
          <span className="text-xs text-gray-500">
            Confidence: <span className="font-medium text-gray-800">{formatConfidence(hole.assignment_confidence)}</span>
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
                      {formatArea(f.area_sqm)} · {formatConfidence(f.confidence_score)}
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
        <button
          type="button"
          disabled
          title="Corrections land in Week 6"
          className="w-full px-3 py-2 rounded-md bg-gray-300 text-gray-600 text-sm font-medium cursor-not-allowed"
          data-testid="confirm-hole-disabled"
        >
          Confirm Hole (Week 6)
        </button>
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
  onBack,
}: {
  feature: InspectorFeature
  onBack: () => void
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
        <Row label="Confidence" value={formatConfidence(feature.confidence_score)} />
        <Row label="Reviewed" value={feature.reviewed ? 'Yes' : 'No'} />
      </div>

      <footer className="px-4 py-3 border-t border-gray-200 bg-gray-50">
        <p className="text-xs text-gray-500">Edit actions land in Week 6.</p>
      </footer>
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
