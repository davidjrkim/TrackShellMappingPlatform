/**
 * MVP NFR validation — measures ROADMAP.md §"Success Metrics" targets
 * against a running dashboard instance.
 *
 *   library page render           < 1.5s  (GET /dashboard/courses)
 *   map GeoJSON render            < 2.0s  (GET /api/courses/[id]/features/geojson)
 *   correction save round-trip    < 0.5s  (PATCH /api/features/[featureId]/hole)
 *
 * Run against a local or staging server. The script authenticates via a
 * NextAuth session cookie pasted from a logged-in browser session, because
 * the credential provider requires a bcrypt-hashed password and the
 * CSRF/JWT handshake is not worth reimplementing for a perf probe.
 *
 * Usage:
 *   npm run perf:check
 *
 * Required env vars (see README.md §"Performance validation"):
 *   PERF_BASE_URL          — e.g. http://localhost:3000
 *   PERF_SESSION_COOKIE    — full Cookie header value from a logged-in browser
 *   PERF_COURSE_ID         — uuid of a course with features
 *   PERF_FEATURE_ID        — uuid of a feature on that course
 *   PERF_HOLE_ID_A         — current hole of the feature (restored after test)
 *   PERF_HOLE_ID_B         — any other hole on the same course to toggle to
 *
 * Exit code 0 = all targets met, 1 = one or more failed, 2 = script error.
 */

import { performance } from 'node:perf_hooks'

type Result = {
  name: string
  target_ms: number
  actual_ms: number
  pass: boolean
  note: string
}

function requireEnv(name: string): string {
  const v = process.env[name]
  if (!v) throw new Error(`${name} is required — see scripts/perf-check.ts header`)
  return v
}

async function timed(
  name: string,
  target_ms: number,
  fn: () => Promise<Response>,
): Promise<Result> {
  const start = performance.now()
  let res: Response
  try {
    res = await fn()
  } catch (err) {
    const elapsed = performance.now() - start
    return {
      name,
      target_ms,
      actual_ms: elapsed,
      pass: false,
      note: `network error: ${(err as Error).message}`,
    }
  }
  const elapsed = performance.now() - start
  // 200 for API, 302/307 accepted for the library page to allow the middleware
  // redirect measurement path even if the cookie somehow expired mid-run — but
  // we still want to surface it as a note so the operator can refresh.
  const redirected = res.status === 302 || res.status === 307
  const ok = res.status >= 200 && res.status < 300
  const note = ok
    ? ''
    : redirected
      ? `HTTP ${res.status} (likely unauthenticated — cookie expired?)`
      : `HTTP ${res.status}`
  return {
    name,
    target_ms,
    actual_ms: elapsed,
    pass: ok && elapsed < target_ms,
    note,
  }
}

async function main() {
  const baseUrl = requireEnv('PERF_BASE_URL').replace(/\/$/, '')
  const cookie = requireEnv('PERF_SESSION_COOKIE')
  const courseId = requireEnv('PERF_COURSE_ID')
  const featureId = requireEnv('PERF_FEATURE_ID')
  const holeA = requireEnv('PERF_HOLE_ID_A')
  const holeB = requireEnv('PERF_HOLE_ID_B')

  const authHeaders: Record<string, string> = { cookie }
  const jsonHeaders: Record<string, string> = {
    cookie,
    'content-type': 'application/json',
  }

  const results: Result[] = []

  results.push(
    await timed('course library page (< 1.5s)', 1500, () =>
      fetch(`${baseUrl}/dashboard/courses`, { headers: authHeaders }),
    ),
  )

  results.push(
    await timed('GET features GeoJSON (< 2.0s)', 2000, () =>
      fetch(`${baseUrl}/api/courses/${courseId}/features/geojson`, {
        headers: authHeaders,
      }),
    ),
  )

  // Correction round-trip. Toggle to hole B, then restore to hole A so
  // repeat runs leave the DB in the same state. Only the first PATCH is
  // measured — the restore is best-effort cleanup.
  results.push(
    await timed('PATCH feature hole (< 500ms)', 500, () =>
      fetch(`${baseUrl}/api/features/${featureId}/hole`, {
        method: 'PATCH',
        headers: jsonHeaders,
        body: JSON.stringify({ holeId: holeB }),
      }),
    ),
  )
  try {
    await fetch(`${baseUrl}/api/features/${featureId}/hole`, {
      method: 'PATCH',
      headers: jsonHeaders,
      body: JSON.stringify({ holeId: holeA }),
    })
  } catch {
    // Cleanup failure doesn't affect the measurement result.
  }

  // eslint-disable-next-line no-console
  console.table(
    results.map((r) => ({
      check: r.name,
      target_ms: r.target_ms,
      actual_ms: Math.round(r.actual_ms),
      result: r.pass ? 'PASS' : 'FAIL',
      note: r.note,
    })),
  )

  const allPass = results.every((r) => r.pass)
  if (!allPass) {
    // eslint-disable-next-line no-console
    console.error('One or more NFR targets failed.')
    process.exit(1)
  }
  // eslint-disable-next-line no-console
  console.log('All NFR targets met.')
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('perf-check error:', err)
  process.exit(2)
})
