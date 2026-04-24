import { render, screen } from '@testing-library/react'
import '@testing-library/jest-dom'
import StatusBadge from '@/components/ui/StatusBadge'

const EXPECTED = {
  unmapped:   { label: 'Unmapped',   dot: 'bg-gray-400' },
  processing: { label: 'Processing', dot: 'bg-blue-500' },
  segmented:  { label: 'Segmented',  dot: 'bg-indigo-500' },
  assigned:   { label: 'Assigned',   dot: 'bg-amber-500' },
  reviewed:   { label: 'Reviewed',   dot: 'bg-teal-500' },
  published:  { label: 'Published',  dot: 'bg-green-500' },
  failed:     { label: 'Failed',     dot: 'bg-red-500' },
}

describe('StatusBadge', () => {
  for (const [status, { label, dot }] of Object.entries(EXPECTED)) {
    it(`renders the ${status} colour + label`, () => {
      const { container, unmount } = render(<StatusBadge status={status} />)
      const badge = screen.getByTestId('status-badge')
      expect(badge).toHaveAttribute('data-status', status)
      expect(badge).toHaveTextContent(label)
      // Coloured dot uses the expected Tailwind class
      const colouredDot = container.querySelector(`.${dot}`)
      expect(colouredDot).not.toBeNull()
      unmount()
    })
  }

  it('falls back to a neutral style for unknown status', () => {
    render(<StatusBadge status="mystery" />)
    const badge = screen.getByTestId('status-badge')
    expect(badge).toHaveAttribute('data-status', 'mystery')
    expect(badge).toHaveTextContent('mystery')
  })
})
