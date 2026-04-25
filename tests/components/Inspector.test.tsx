import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import Inspector, { type InspectorFeature } from '@/components/review/Inspector'
import type { HoleSummary } from '@/components/review/HoleList'

const buildHoles = (): HoleSummary[] => [
  {
    id: 'hole-1',
    hole_number: 1,
    confidence: 0.9,
    needs_review: false,
    confirmed: false,
    polygon_count: 0,
  },
  {
    id: 'hole-2',
    hole_number: 2,
    confidence: 0.5,
    needs_review: true,
    confirmed: false,
    polygon_count: 0,
  },
  {
    id: 'hole-3',
    hole_number: 3,
    confidence: 0.8,
    needs_review: false,
    confirmed: true,
    polygon_count: 0,
  },
]

const buildFeature = (overrides: Partial<InspectorFeature> = {}): InspectorFeature => ({
  id: 'feat-1',
  feature_type: 'green',
  area_sqm: 500,
  confidence: 0.77,
  hole_number: 2,
  reviewed: false,
  ...overrides,
})

const defaultProps = {
  holes: buildHoles(),
  selectedFeatureId: null as string | null,
  onSelectFeature: () => {},
  onReassignSuccess: () => {},
  onTypeChangeSuccess: () => {},
  onRequestDeleteFeature: () => {},
}

describe('<Inspector /> view switching', () => {
  it('shows the placeholder when no hole is selected', () => {
    render(
      <Inspector
        {...defaultProps}
        hole={null}
        features={[]}
        topology={null}
      />,
    )
    expect(screen.getByText(/select a hole on the left/i)).toBeInTheDocument()
    expect(screen.queryByTestId('reassign-hole-select')).not.toBeInTheDocument()
  })

  it('renders the hole view when a hole is selected and no feature is selected', () => {
    const holes = buildHoles()
    render(
      <Inspector
        {...defaultProps}
        hole={holes[1]}
        features={[buildFeature()]}
        topology={{ has_green: true, has_tee: false, has_fairway: false, has_bunker: false }}
      />,
    )
    expect(screen.getByRole('heading', { name: /Hole 2/i })).toBeInTheDocument()
    expect(screen.getByText(/Polygons \(1\)/)).toBeInTheDocument()
    expect(screen.getByText(/Topology check/i)).toBeInTheDocument()
    expect(screen.queryByTestId('reassign-hole-select')).not.toBeInTheDocument()
  })

  it('renders the polygon view when a feature is selected', () => {
    const holes = buildHoles()
    const feature = buildFeature()
    render(
      <Inspector
        {...defaultProps}
        hole={holes[1]}
        features={[feature]}
        topology={null}
        selectedFeatureId={feature.id}
      />,
    )
    expect(screen.getByRole('heading', { name: /Polygon/i })).toBeInTheDocument()
    expect(screen.getByTestId('reassign-hole-select')).toBeInTheDocument()
    expect(screen.getByTestId('change-type-select')).toBeInTheDocument()
    expect(screen.getByTestId('delete-polygon-open')).toBeInTheDocument()
  })
})

describe('<Inspector /> dropdown population', () => {
  it('reassign-hole dropdown lists every hole in ascending hole-number order', () => {
    const holes = buildHoles()
    const feature = buildFeature()
    render(
      <Inspector
        {...defaultProps}
        hole={holes[1]}
        features={[feature]}
        topology={null}
        selectedFeatureId={feature.id}
      />,
    )
    const select = screen.getByTestId('reassign-hole-select') as HTMLSelectElement
    const labels = within(select)
      .getAllByRole('option')
      .map((o) => o.textContent)
    expect(labels).toEqual(['Hole 1', 'Hole 2', 'Hole 3'])
  })

  it('reassign-hole dropdown defaults to the current hole of the feature', () => {
    const holes = buildHoles()
    const feature = buildFeature({ hole_number: 3 })
    render(
      <Inspector
        {...defaultProps}
        hole={holes[2]}
        features={[feature]}
        topology={null}
        selectedFeatureId={feature.id}
      />,
    )
    const select = screen.getByTestId('reassign-hole-select') as HTMLSelectElement
    expect(select.value).toBe('hole-3')
  })

  it('change-type dropdown lists the five feature_type options', () => {
    const holes = buildHoles()
    const feature = buildFeature({ feature_type: 'bunker' })
    render(
      <Inspector
        {...defaultProps}
        hole={holes[1]}
        features={[feature]}
        topology={null}
        selectedFeatureId={feature.id}
      />,
    )
    const select = screen.getByTestId('change-type-select') as HTMLSelectElement
    const values = within(select)
      .getAllByRole('option')
      .map((o) => (o as HTMLOptionElement).value)
    expect(values).toEqual(['green', 'fairway', 'tee_box', 'bunker', 'water_hazard'])
    expect(select.value).toBe('bunker')
  })
})
