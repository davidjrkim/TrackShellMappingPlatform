/**
 * @jest-environment node
 *
 * US-019 — org isolation across every correction endpoint.
 *
 * A reviewer whose session is in org A must not be able to read or mutate any
 * feature / hole / course owned by org B. Every correction endpoint goes
 * through a helper that joins through `courses.org_id` (getFeatureForMutation
 * / getHoleForMutation / getLock) or does a preflight course SELECT (GET
 * /corrections); in all cases the cross-org path returns 404. The tests also
 * assert that no mutating side-effect reached the DB — features/holes/courses
 * unchanged and zero corrections rows were written for the target course.
 *
 * Runs against the real Postgres/PostGIS dev container (docker-compose up -d).
 */
import { db } from '@/lib/db'
import { createCourse } from '@/lib/spatial'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
import { getServerSession } from 'next-auth'
const mockSession = getServerSession as jest.MockedFunction<typeof getServerSession>

async function ensureOrg(name: string) {
  return db.organization.upsert({ where: { name }, update: {}, create: { name } })
}
async function ensureUser(email: string, orgId: string) {
  return db.user.upsert({
    where: { email },
    update: { orgId, role: 'reviewer' },
    create: { email, orgId, role: 'reviewer', passwordHash: 'x', name: email },
  })
}
function sessionFor(user: { id: string; orgId: string; email: string }) {
  return {
    user: { id: user.id, orgId: user.orgId, role: 'reviewer', email: user.email, name: user.email },
    expires: '2099-01-01',
  }
}

// Polygon ~9,900 m² near Seoul — above the 20 m² floor PATCH /geometry enforces.
const STARTING_POLYGON_WKT =
  'POLYGON((127.000 37.000, 127.001 37.000, 127.001 37.001, 127.000 37.001, 127.000 37.000))'

const NEW_GEOMETRY = {
  type: 'MultiPolygon' as const,
  coordinates: [[[
    [127.002, 37.002],
    [127.003, 37.002],
    [127.003, 37.003],
    [127.002, 37.003],
    [127.002, 37.002],
  ]]],
}

describe('correction endpoints — org isolation (US-019)', () => {
  let orgA: { id: string }
  let orgB: { id: string }
  // Attacker session user lives in orgA.
  let attacker: { id: string; orgId: string; email: string }
  // Legitimate reviewer lives in orgB — used only to seed the corrections
  // history so we can prove GET /api/corrections doesn't leak it to attacker.
  let victimUser: { id: string; orgId: string; email: string }
  // Resources belong to orgB.
  let courseId: string
  let hole1Id: string
  let hole2Id: string
  let featureId: string

  beforeAll(async () => {
    orgA = await ensureOrg('iso-test-org-a')
    orgB = await ensureOrg('iso-test-org-b')
    const a = await ensureUser('iso-attacker@test.local', orgA.id)
    const v = await ensureUser('iso-victim@test.local', orgB.id)
    attacker = { id: a.id, orgId: orgA.id, email: a.email }
    victimUser = { id: v.id, orgId: orgB.id, email: v.email }

    const c = await createCourse({
      orgId: orgB.id,
      name: 'Iso Test Course (orgB)',
      country: 'KR',
      holeCount: 18,
      bbox: { west: 127.0, south: 37.0, east: 127.1, north: 37.1 },
      dataSource: 'manual',
    })
    courseId = c.id

    const holes = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO holes (id, course_id, hole_number, confidence, needs_review, confirmed)
      VALUES
        (gen_random_uuid(), ${courseId}::uuid, 1, 0.9, false, false),
        (gen_random_uuid(), ${courseId}::uuid, 2, 0.9, false, false)
      RETURNING id
    `
    hole1Id = holes[0].id
    hole2Id = holes[1].id
  })

  afterAll(async () => {
    await db.$executeRaw`DELETE FROM corrections WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM features WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM holes WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM courses WHERE id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM users WHERE email IN ('iso-attacker@test.local','iso-victim@test.local')`
    await db.$executeRaw`DELETE FROM organizations WHERE name IN ('iso-test-org-a','iso-test-org-b')`
    await db.$disconnect()
  })

  // Reset the feature + holes + course state + corrections before every test
  // so a mutation that accidentally landed in one test can't be misread as
  // "still intact" in the next.
  beforeEach(async () => {
    mockSession.mockReset()
    mockSession.mockResolvedValue(sessionFor(attacker) as never)

    await db.$executeRaw`DELETE FROM corrections WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM features WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`
      UPDATE courses
      SET locked_by = NULL, locked_at = NULL, status = 'unmapped'::course_status
      WHERE id = ${courseId}::uuid
    `
    await db.$executeRaw`
      UPDATE holes SET needs_review = false, confirmed = false, confirmation_type = NULL
      WHERE course_id = ${courseId}::uuid
    `

    const rows = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO features (id, hole_id, course_id, feature_type, geometry)
      VALUES (
        gen_random_uuid(),
        ${hole1Id}::uuid,
        ${courseId}::uuid,
        'green'::feature_type_enum,
        ST_Multi(ST_GeomFromText(${STARTING_POLYGON_WKT}, 4326))
      )
      RETURNING id
    `
    featureId = rows[0].id
  })

  async function readFeature() {
    const rows = await db.$queryRaw<{
      hole_id: string | null
      feature_type: string
      geojson: string
    }[]>`
      SELECT hole_id, feature_type::text AS feature_type, ST_AsGeoJSON(geometry) AS geojson
      FROM features WHERE id = ${featureId}::uuid
    `
    return rows[0] ?? null
  }

  async function readCourse() {
    const rows = await db.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM courses WHERE id = ${courseId}::uuid
    `
    return rows[0] ?? null
  }

  async function countCorrections(): Promise<number> {
    const rows = await db.$queryRaw<{ c: bigint }[]>`
      SELECT COUNT(*)::bigint AS c FROM corrections WHERE course_id = ${courseId}::uuid
    `
    return Number(rows[0]?.c ?? 0)
  }

  it('PATCH /hole — returns 404 for cross-org caller and does not mutate', async () => {
    const { PATCH } = await import('@/app/api/features/[featureId]/hole/route')
    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ holeId: hole2Id }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: { featureId } },
    )
    expect(res.status).toBe(404)

    const f = await readFeature()
    expect(f?.hole_id).toBe(hole1Id)
    expect(await countCorrections()).toBe(0)
  })

  it('PATCH /type — returns 404 for cross-org caller and does not mutate', async () => {
    const { PATCH } = await import('@/app/api/features/[featureId]/type/route')
    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ featureType: 'fairway' }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: { featureId } },
    )
    expect(res.status).toBe(404)

    const f = await readFeature()
    expect(f?.feature_type).toBe('green')
    expect(await countCorrections()).toBe(0)
  })

  it('PATCH /geometry — returns 404 for cross-org caller and does not mutate', async () => {
    const before = await readFeature()
    const { PATCH } = await import('@/app/api/features/[featureId]/geometry/route')
    const res = await PATCH(
      new Request('http://localhost', {
        method: 'PATCH',
        body: JSON.stringify({ geometry: NEW_GEOMETRY }),
        headers: { 'content-type': 'application/json' },
      }),
      { params: { featureId } },
    )
    expect(res.status).toBe(404)

    const after = await readFeature()
    expect(after?.geojson).toBe(before?.geojson)
    expect(await countCorrections()).toBe(0)
  })

  it('DELETE /feature — returns 404 for cross-org caller and does not delete', async () => {
    const { DELETE } = await import('@/app/api/features/[featureId]/route')
    const res = await DELETE(
      new Request('http://localhost', { method: 'DELETE' }),
      { params: { featureId } },
    )
    expect(res.status).toBe(404)

    const f = await readFeature()
    expect(f).not.toBeNull()
    expect(await countCorrections()).toBe(0)
  })

  it('POST /confirm — returns 404 for cross-org caller and does not mutate the hole', async () => {
    // Put hole1 into a flagged state so if the write accidentally landed we'd
    // see needs_review=false + confirmed=true post-call.
    await db.$executeRaw`
      UPDATE holes SET needs_review = true, confirmed = false
      WHERE id = ${hole1Id}::uuid
    `

    const { POST } = await import('@/app/api/courses/[id]/holes/[holeId]/confirm/route')
    const res = await POST(
      new Request('http://localhost', { method: 'POST' }),
      { params: { id: courseId, holeId: hole1Id } },
    )
    expect(res.status).toBe(404)

    const hole = await db.$queryRaw<{
      needs_review: boolean
      confirmed: boolean
      confirmation_type: string | null
    }[]>`
      SELECT needs_review, confirmed, confirmation_type::text AS confirmation_type
      FROM holes WHERE id = ${hole1Id}::uuid
    `
    expect(hole[0].needs_review).toBe(true)
    expect(hole[0].confirmed).toBe(false)
    expect(hole[0].confirmation_type).toBeNull()
    expect(await countCorrections()).toBe(0)
  })

  it('POST /review/complete — returns 404 for cross-org caller and leaves course status unchanged', async () => {
    const { POST } = await import('@/app/api/courses/[id]/review/complete/route')
    const res = await POST(
      new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }),
      { params: { id: courseId } },
    )
    expect(res.status).toBe(404)

    const c = await readCourse()
    expect(c?.status).toBe('unmapped')
    expect(await countCorrections()).toBe(0)
  })

  it('GET /corrections — returns 404 for cross-org caller and does not leak orgB rows', async () => {
    // Seed one correction row under the victim's identity so the leak would
    // be observable if the endpoint skipped org isolation.
    await db.$executeRaw`
      INSERT INTO corrections (
        id, feature_id, course_id, correction_type,
        original_hole_number, corrected_hole_number, corrected_by
      ) VALUES (
        gen_random_uuid(),
        ${featureId}::uuid,
        ${courseId}::uuid,
        'hole_reassignment',
        1,
        2,
        ${victimUser.id}::uuid
      )
    `

    const { GET } = await import('@/app/api/corrections/route')
    const res = await GET(
      new Request(`http://localhost/api/corrections?courseId=${courseId}`),
    )
    expect(res.status).toBe(404)
    const body = (await res.json()) as { corrections?: unknown; error?: string }
    expect(body.corrections).toBeUndefined()
  })
})
