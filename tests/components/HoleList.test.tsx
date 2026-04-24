import { render, screen, within } from '@testing-library/react'
import '@testing-library/jest-dom'
import HoleList, { orderHolesForReview } from '@/components/review/HoleList'

describe('orderHolesForReview', () => {
  const hole = (overrides: Partial<{
    id: string
    hole_number: number
    assignment_confidence: number | null
    needs_review: boolean
    confirmed: boolean
    polygon_count: number
  }>) => ({
    id: overrides.id ?? `h${overrides.hole_number}`,
    hole_number: overrides.hole_number ?? 1,
    assignment_confidence: overrides.assignment_confidence ?? 0.9,
    needs_review: overrides.needs_review ?? false,
    confirmed: overrides.confirmed ?? false,
    polygon_count: overrides.polygon_count ?? 0,
  })

  it('flags with needs_review sort to top by ascending confidence', () => {
    const holes = [
      hole({ hole_number: 1, assignment_confidence: 0.95 }),
      hole({ hole_number: 2, assignment_confidence: 0.55, needs_review: true }),
      hole({ hole_number: 3, assignment_confidence: 0.88 }),
      hole({ hole_number: 4, assignment_confidence: 0.40, needs_review: true }),
      hole({ hole_number: 5, assignment_confidence: 0.60, needs_review: true }),
    ]
    const out = orderHolesForReview(holes)
    expect(out.map((h) => h.hole_number)).toEqual([4, 2, 5, 1, 3])
  })

  it('confirmed holes appear below flagged and in hole-number order', () => {
    const holes = [
      hole({ hole_number: 1, confirmed: true }),
      hole({ hole_number: 2, needs_review: true, assignment_confidence: 0.5 }),
      hole({ hole_number: 3, confirmed: true }),
    ]
    const out = orderHolesForReview(holes)
    expect(out.map((h) => h.hole_number)).toEqual([2, 1, 3])
  })

  it('flagged holes that were already confirmed drop out of the flagged group', () => {
    const holes = [
      hole({ hole_number: 1, needs_review: true, confirmed: true, assignment_confidence: 0.3 }),
      hole({ hole_number: 2, needs_review: true, confirmed: false, assignment_confidence: 0.6 }),
    ]
    const out = orderHolesForReview(holes)
    expect(out.map((h) => h.hole_number)).toEqual([2, 1])
  })

  it('ties in confidence fall back to hole number', () => {
    const holes = [
      hole({ hole_number: 5, needs_review: true, assignment_confidence: 0.5 }),
      hole({ hole_number: 2, needs_review: true, assignment_confidence: 0.5 }),
    ]
    const out = orderHolesForReview(holes)
    expect(out.map((h) => h.hole_number)).toEqual([2, 5])
  })
})

describe('<HoleList />', () => {
  const hole = (overrides: Partial<{
    id: string
    hole_number: number
    assignment_confidence: number | null
    needs_review: boolean
    confirmed: boolean
    polygon_count: number
  }>) => ({
    id: overrides.id ?? `h${overrides.hole_number}`,
    hole_number: overrides.hole_number ?? 1,
    assignment_confidence: overrides.assignment_confidence ?? 0.9,
    needs_review: overrides.needs_review ?? false,
    confirmed: overrides.confirmed ?? false,
    polygon_count: overrides.polygon_count ?? 0,
  })

  const holes = [
    hole({ hole_number: 1, confirmed: true }),
    hole({ hole_number: 2, needs_review: true, assignment_confidence: 0.4 }),
    hole({ hole_number: 3, confirmed: true }),
    hole({ hole_number: 4, needs_review: true, assignment_confidence: 0.7 }),
    hole({ hole_number: 5 }),
  ]

  it('renders the rows in review order (flagged ASC confidence first, then hole-number order)', () => {
    render(<HoleList holes={holes} selectedHoleId={null} onSelect={() => {}} />)
    const listbox = screen.getByRole('listbox', { name: /Holes/i })
    const rendered = within(listbox)
      .getAllByRole('option')
      .map((b) => b.getAttribute('data-testid'))
    expect(rendered).toEqual([
      'hole-row-2',
      'hole-row-4',
      'hole-row-1',
      'hole-row-3',
      'hole-row-5',
    ])
  })

  it('progress counter reflects confirmed / total', () => {
    render(<HoleList holes={holes} selectedHoleId={null} onSelect={() => {}} />)
    expect(screen.getByText('2 / 5 confirmed')).toBeInTheDocument()
    expect(screen.getByText('Progress: 2 / 5 ✓')).toBeInTheDocument()
  })

  it('marks flagged rows with data-flagged=true and confirmed rows with data-confirmed=true', () => {
    render(<HoleList holes={holes} selectedHoleId={null} onSelect={() => {}} />)
    expect(screen.getByTestId('hole-row-2')).toHaveAttribute('data-flagged', 'true')
    expect(screen.getByTestId('hole-row-4')).toHaveAttribute('data-flagged', 'true')
    expect(screen.getByTestId('hole-row-1')).toHaveAttribute('data-confirmed', 'true')
    expect(screen.getByTestId('hole-row-3')).toHaveAttribute('data-confirmed', 'true')
    expect(screen.getByTestId('hole-row-5')).toHaveAttribute('data-flagged', 'false')
    expect(screen.getByTestId('hole-row-5')).toHaveAttribute('data-confirmed', 'false')
  })

  it('aria-selected reflects selectedHoleId', () => {
    render(<HoleList holes={holes} selectedHoleId="h4" onSelect={() => {}} />)
    expect(screen.getByTestId('hole-row-4')).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByTestId('hole-row-2')).toHaveAttribute('aria-selected', 'false')
  })
})
