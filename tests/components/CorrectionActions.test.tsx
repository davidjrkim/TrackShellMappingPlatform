/**
 * Component tests for the correction sub-controls inside Inspector — the
 * ReassignHoleControl and ChangeTypeControl combine to implement the
 * "CorrectionActions" AC: Apply disabled until dirty, Cancel reverts local
 * state, non-2xx surfaces an inline error without advancing UI state.
 */
import { render, screen, fireEvent, act } from '@testing-library/react'
import '@testing-library/jest-dom'
import Inspector, { type InspectorFeature } from '@/components/review/Inspector'
import type { HoleSummary } from '@/components/review/HoleList'

const holes: HoleSummary[] = [
  { id: 'hole-1', hole_number: 1, assignment_confidence: 0.9, needs_review: false, confirmed: false, polygon_count: 0 },
  { id: 'hole-2', hole_number: 2, assignment_confidence: 0.5, needs_review: true,  confirmed: false, polygon_count: 0 },
  { id: 'hole-3', hole_number: 3, assignment_confidence: 0.8, needs_review: false, confirmed: true,  polygon_count: 0 },
]

const feature: InspectorFeature = {
  id: 'feat-1',
  feature_type: 'green',
  area_sqm: 500,
  confidence_score: 0.77,
  hole_number: 2,
  reviewed: false,
}

function renderInspectorWithFeature(overrides: Partial<{
  onReassignSuccess: () => void
  onTypeChangeSuccess: () => void
}> = {}) {
  return render(
    <Inspector
      hole={holes[1]}
      features={[feature]}
      topology={null}
      holes={holes}
      selectedFeatureId={feature.id}
      onSelectFeature={() => {}}
      onReassignSuccess={overrides.onReassignSuccess ?? (() => {})}
      onTypeChangeSuccess={overrides.onTypeChangeSuccess ?? (() => {})}
      onRequestDeleteFeature={() => {}}
    />,
  )
}

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
})

type FakeResponse = { ok: boolean; status: number; json: () => Promise<unknown> }

function fakeResponse(status: number, body: unknown): FakeResponse {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function mockFetch(respond: () => FakeResponse) {
  global.fetch = jest.fn(async () => respond() as unknown as Response) as unknown as typeof fetch
}

describe('ReassignHoleControl (CorrectionActions)', () => {
  it('Apply is disabled until a different hole is staged; Cancel resets selection', () => {
    renderInspectorWithFeature()
    const select = screen.getByTestId('reassign-hole-select') as HTMLSelectElement
    const apply = screen.getByTestId('reassign-hole-apply') as HTMLButtonElement
    const cancel = screen.getByTestId('reassign-hole-cancel') as HTMLButtonElement

    // starts matched to the feature's current hole -> not dirty
    expect(select.value).toBe('hole-2')
    expect(apply).toBeDisabled()
    expect(cancel).toBeDisabled()

    fireEvent.change(select, { target: { value: 'hole-1' } })
    expect(apply).not.toBeDisabled()
    expect(cancel).not.toBeDisabled()

    fireEvent.click(cancel)
    expect(select.value).toBe('hole-2')
    expect(apply).toBeDisabled()
    expect(cancel).toBeDisabled()
  })

  it('renders an inline error on non-2xx and does NOT fire onSuccess', async () => {
    const onReassignSuccess = jest.fn()
    mockFetch(() => fakeResponse(409, { error: 'Course locked by another reviewer' }))
    renderInspectorWithFeature({ onReassignSuccess })

    const select = screen.getByTestId('reassign-hole-select') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'hole-3' } })

    await act(async () => {
      fireEvent.click(screen.getByTestId('reassign-hole-apply'))
    })

    const alert = screen.getByTestId('reassign-hole-error')
    expect(alert).toHaveAttribute('role', 'alert')
    expect(alert).toHaveTextContent(/Course locked by another reviewer/i)
    expect(onReassignSuccess).not.toHaveBeenCalled()
    // Staged value stays — user can fix the cause and Retry without re-picking.
    expect(select.value).toBe('hole-3')
  })

  it('calls onSuccess on 2xx with prior hole id', async () => {
    const onReassignSuccess = jest.fn()
    mockFetch(() => fakeResponse(200, { id: feature.id, hole_id: 'hole-1' }))
    renderInspectorWithFeature({ onReassignSuccess })

    fireEvent.change(screen.getByTestId('reassign-hole-select'), { target: { value: 'hole-1' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('reassign-hole-apply'))
    })

    expect(onReassignSuccess).toHaveBeenCalledWith({
      featureId: feature.id,
      newHoleId: 'hole-1',
      priorHoleId: 'hole-2',
    })
    expect(screen.queryByTestId('reassign-hole-error')).not.toBeInTheDocument()
  })
})

describe('ChangeTypeControl (CorrectionActions)', () => {
  it('Apply is disabled until a different type is staged; Cancel resets selection', () => {
    renderInspectorWithFeature()
    const select = screen.getByTestId('change-type-select') as HTMLSelectElement
    const apply = screen.getByTestId('change-type-apply') as HTMLButtonElement
    const cancel = screen.getByTestId('change-type-cancel') as HTMLButtonElement

    expect(select.value).toBe('green')
    expect(apply).toBeDisabled()
    expect(cancel).toBeDisabled()

    fireEvent.change(select, { target: { value: 'bunker' } })
    expect(apply).not.toBeDisabled()
    expect(cancel).not.toBeDisabled()

    fireEvent.click(cancel)
    expect(select.value).toBe('green')
    expect(apply).toBeDisabled()
  })

  it('renders an inline error on non-2xx and does NOT fire onSuccess', async () => {
    const onTypeChangeSuccess = jest.fn()
    mockFetch(() => fakeResponse(422, { error: 'Invalid feature type' }))
    renderInspectorWithFeature({ onTypeChangeSuccess })

    fireEvent.change(screen.getByTestId('change-type-select'), { target: { value: 'water_hazard' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('change-type-apply'))
    })

    const alert = screen.getByTestId('change-type-error')
    expect(alert).toHaveAttribute('role', 'alert')
    expect(alert).toHaveTextContent(/Invalid feature type/i)
    expect(onTypeChangeSuccess).not.toHaveBeenCalled()
  })

  it('calls onSuccess on 2xx with prior type', async () => {
    const onTypeChangeSuccess = jest.fn()
    mockFetch(() => fakeResponse(200, { id: feature.id, feature_type: 'fairway' }))
    renderInspectorWithFeature({ onTypeChangeSuccess })

    fireEvent.change(screen.getByTestId('change-type-select'), { target: { value: 'fairway' } })
    await act(async () => {
      fireEvent.click(screen.getByTestId('change-type-apply'))
    })

    expect(onTypeChangeSuccess).toHaveBeenCalledWith({
      featureId: feature.id,
      priorType: 'green',
    })
  })
})
