/**
 * @jest-environment node
 *
 * Verifies the debug Sentry route calls captureException with the
 * deliberately thrown error. Asserts US-021 AC: "A deliberately thrown
 * error from an API route is captured (verifiable by checking
 * captureException is called — unit test with mocked Sentry)".
 */

jest.mock('@sentry/nextjs', () => ({
  captureException: jest.fn(),
  init: jest.fn(),
}))

import * as Sentry from '@sentry/nextjs'
import { GET } from '@/app/api/debug/sentry/route'

describe('GET /api/debug/sentry', () => {
  beforeEach(() => {
    ;(Sentry.captureException as jest.Mock).mockClear()
  })

  it('calls Sentry.captureException with the thrown error', async () => {
    const res = await GET()

    expect(Sentry.captureException).toHaveBeenCalledTimes(1)
    const arg = (Sentry.captureException as jest.Mock).mock.calls[0][0]
    expect(arg).toBeInstanceOf(Error)
    expect((arg as Error).message).toBe('Deliberate Sentry test error')
    expect(res.status).toBe(500)
  })
})
