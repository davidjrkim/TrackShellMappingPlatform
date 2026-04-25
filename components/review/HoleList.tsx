'use client'

export type HoleSummary = {
  id: string
  hole_number: number
  confidence: number | null
  needs_review: boolean
  confirmed: boolean
  polygon_count: number
}

type Props = {
  holes: HoleSummary[]
  selectedHoleId: string | null
  onSelect: (holeId: string) => void
}

// PRD 2b §4.1: flagged (needs_review=true AND !confirmed) at top,
// sorted by ascending confidence. All other holes below in
// hole-number order.
export function orderHolesForReview<T extends HoleSummary>(holes: T[]): T[] {
  const flagged = holes
    .filter((h) => h.needs_review && !h.confirmed)
    .sort((a, b) => {
      const ac = a.confidence ?? 1
      const bc = b.confidence ?? 1
      if (ac !== bc) return ac - bc
      return a.hole_number - b.hole_number
    })
  const rest = holes
    .filter((h) => !(h.needs_review && !h.confirmed))
    .sort((a, b) => a.hole_number - b.hole_number)
  return [...flagged, ...rest]
}

function formatConfidence(v: number | null): string {
  if (v == null) return '—'
  return v.toFixed(2)
}

export default function HoleList({ holes, selectedHoleId, onSelect }: Props) {
  const ordered = orderHolesForReview(holes)
  const total = holes.length
  const confirmed = holes.filter((h) => h.confirmed).length

  return (
    <aside
      className="w-60 flex-none border-r border-gray-200 bg-white flex flex-col"
      data-testid="hole-list"
    >
      <header className="px-3 py-2 border-b border-gray-200">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Holes</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          {confirmed} / {total} confirmed
        </p>
      </header>

      <ul className="flex-1 overflow-y-auto" role="listbox" aria-label="Holes">
        {ordered.map((h) => {
          const isSelected = h.id === selectedHoleId
          const isFlagged = h.needs_review && !h.confirmed
          const isConfirmed = h.confirmed

          const base =
            'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm border-b border-gray-100 cursor-pointer transition-colors'
          const colour = isSelected
            ? 'bg-blue-600 text-white'
            : isFlagged
              ? 'bg-amber-50 text-amber-900 hover:bg-amber-100'
              : isConfirmed
                ? 'bg-green-50 text-gray-500 hover:bg-green-100'
                : 'bg-white text-gray-700 hover:bg-gray-50'

          const icon = isConfirmed ? '✓' : isFlagged ? '⚠' : '○'
          const iconColour = isSelected
            ? 'text-white'
            : isFlagged
              ? 'text-amber-600'
              : isConfirmed
                ? 'text-green-600'
                : 'text-gray-400'

          return (
            <li key={h.id}>
              <button
                type="button"
                role="option"
                aria-selected={isSelected}
                onClick={() => onSelect(h.id)}
                className={`${base} ${colour}`}
                data-testid={`hole-row-${h.hole_number}`}
                data-flagged={isFlagged ? 'true' : 'false'}
                data-confirmed={isConfirmed ? 'true' : 'false'}
              >
                <span className="flex items-center gap-2">
                  <span className={`text-xs ${iconColour}`}>{icon}</span>
                  <span className="font-medium">Hole {h.hole_number}</span>
                </span>
                <span className={`text-xs ${isSelected ? 'text-white/80' : 'text-gray-400'}`}>
                  {formatConfidence(h.confidence)}
                </span>
              </button>
            </li>
          )
        })}
      </ul>

      <footer className="px-3 py-2 border-t border-gray-200 text-xs text-gray-500">
        Progress: {confirmed} / {total} ✓
      </footer>
    </aside>
  )
}
