/**
 * Pure ordering logic test — no DOM needed.
 */
import { orderHolesForReview } from '@/components/review/HoleList'

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
