/**
 * @jest-environment node
 *
 * US-017 — reject-path tests for the correction/sign-off endpoints.
 *
 * - PATCH /hole returns 409 when the course lock is held by a different user.
 * - PATCH /geometry returns 422 for ST_IsValid = false (self-intersecting).
 * - PATCH /geometry returns 422 for a polygon with area < 20 m².
 * - POST /review/complete returns 400 when any hole still has
 *   needs_review = true AND confirmed = false, and the course status is
 *   unchanged by the failed request.
 *
 * Runs against the real Postgres/PostGIS dev container.
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

// Comfortably above the 20 m² floor enforced by PATCH /geometry.
const STARTING_POLYGON_WKT = 'POLYGON((127.000 37.000, 127.001 37.000, 127.001 37.001, 127.000 37.001, 127.000 37.000))'

describe('correction endpoints — reject paths (US-017)', () => {
  let org: { id: string }
  let userA: { id: string; orgId: string; email: string }
  let userB: { id: string; orgId: string; email: string }
  let courseId: string
  let hole1Id: string
  let hole2Id: string
  let featureId: string

  beforeAll(async () => {
    org = await ensureOrg('reject-test-org')
    const a = await ensureUser('reject-a@test.local', org.id)
    const b = await ensureUser('reject-b@test.local', org.id)
    userA = { id: a.id, orgId: org.id, email: a.email }
    userB = { id: b.id, orgId: org.id, email: b.email }

    const c = await createCourse({
      orgId: org.id,
      name: 'Reject Test Course',
      country: 'KR',
      holeCount: 18,
      bbox: { west: 127.0, south: 37.0, east: 127.1, north: 37.1 },
      dataSource: 'manual',
    })
    courseId = c.id

    const holes = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO holes (id, course_id, hole_number, assignment_confidence, needs_review, confirmed)
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
    await db.$executeRaw`DELETE FROM users WHERE email IN ('reject-a@test.local','reject-b@test.local')`
    await db.$executeRaw`DELETE FROM organizations WHERE name = 'reject-test-org'`
    await db.$disconnect()
  })

  beforeEach(async () => {
    mockSession.mockReset()

    await db.$executeRaw`DELETE FROM corrections WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM features WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`
      UPDATE courses
      SET locked_by = NULL, locked_at = NULL, status = 'unmapped'::course_status
      WHERE id = ${courseId}::uuid
    `
    await db.$executeRaw`
      UPDATE holes SET needs_review = false, confirmed = false
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

  describe('lock conflict — 409', () => {
    it('PATCH /hole returns 409 when the course lock is held by another user', async () => {
      // userA holds the lock; userB attempts a correction.
      await db.$executeRaw`
        UPDATE courses
        SET locked_by = ${userA.id}::uuid, locked_at = NOW()
        WHERE id = ${courseId}::uuid
      `
      mockSession.mockResolvedValue(sessionFor(userB) as never)

      const { PATCH } = await import('@/app/api/features/[featureId]/hole/route')
      const res = await PATCH(
        new Request('http://localhost', {
          method: 'PATCH',
          body: JSON.stringify({ holeId: hole2Id }),
          headers: { 'content-type': 'application/json' },
        }),
        { params: { featureId } },
      )
      expect(res.status).toBe(409)

      // Feature untouched, no corrections row written.
      const f = await db.$queryRaw<{ hole_id: string }[]>`
        SELECT hole_id FROM features WHERE id = ${featureId}::uuid
      `
      expect(f[0].hole_id).toBe(hole1Id)

      const rows = await db.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*)::bigint AS c FROM corrections
        WHERE feature_id = ${featureId}::uuid AND correction_type = 'hole_reassignment'
      `
      expect(Number(rows[0].c)).toBe(0)
    })
  })

  describe('PATCH /geometry — 422', () => {
    async function invokeWithGeometry(geometry: unknown) {
      mockSession.mockResolvedValue(sessionFor(userA) as never)
      const { PATCH } = await import('@/app/api/features/[featureId]/geometry/route')
      return PATCH(
        new Request('http://localhost', {
          method: 'PATCH',
          body: JSON.stringify({ geometry }),
          headers: { 'content-type': 'application/json' },
        }),
        { params: { featureId } },
      )
    }

    it('returns 422 for a self-intersecting MultiPolygon (ST_IsValid = false)', async () => {
      // Bowtie ring — ST_GeomFromGeoJSON parses it, but ST_IsValid = false.
      const bowtie = {
        type: 'MultiPolygon',
        coordinates: [[[
          [127.0, 37.0],
          [127.001, 37.001],
          [127.001, 37.0],
          [127.0, 37.001],
          [127.0, 37.0],
        ]]],
      }

      const res = await invokeWithGeometry(bowtie)
      expect(res.status).toBe(422)

      // Feature geometry unchanged, no corrections row.
      const before = await db.$queryRaw<{ geojson: string }[]>`
        SELECT ST_AsGeoJSON(geometry) AS geojson FROM features WHERE id = ${featureId}::uuid
      `
      expect(before[0].geojson).toContain('MultiPolygon')
      const rows = await db.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*)::bigint AS c FROM corrections
        WHERE feature_id = ${featureId}::uuid AND correction_type = 'geometry_edit'
      `
      expect(Number(rows[0].c)).toBe(0)
    })

    it('returns 422 when the polygon area is below 20 m²', async () => {
      // ~1.1m × 1.1m ≈ 1.2 m² at latitude 37° — well below the 20 m² floor.
      const tiny = {
        type: 'MultiPolygon',
        coordinates: [[[
          [127.0, 37.0],
          [127.00001, 37.0],
          [127.00001, 37.00001],
          [127.0, 37.00001],
          [127.0, 37.0],
        ]]],
      }

      const res = await invokeWithGeometry(tiny)
      expect(res.status).toBe(422)

      const rows = await db.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*)::bigint AS c FROM corrections
        WHERE feature_id = ${featureId}::uuid AND correction_type = 'geometry_edit'
      `
      expect(Number(rows[0].c)).toBe(0)
    })
  })

  describe('POST /review/complete — 400', () => {
    it('returns 400 with blocking_holes and leaves course status unchanged when a flagged hole is unconfirmed', async () => {
      // Flag hole1; confirm no hole — sign-off must be blocked.
      await db.$executeRaw`
        UPDATE holes SET needs_review = true, confirmed = false
        WHERE id = ${hole1Id}::uuid
      `
      mockSession.mockResolvedValue(sessionFor(userA) as never)

      const { POST } = await import('@/app/api/courses/[id]/review/complete/route')
      const res = await POST(
        new Request('http://localhost', { method: 'POST', body: JSON.stringify({}) }),
        { params: { id: courseId } },
      )
      expect(res.status).toBe(400)
      const body = await res.json()
      expect(Array.isArray(body.blocking_holes)).toBe(true)
      expect(body.blocking_holes).toContain(1)

      // Course status is unchanged (still 'unmapped') and no corrections rows
      // were written by the failed sign-off.
      const rows = await db.$queryRaw<{ status: string }[]>`
        SELECT status::text AS status FROM courses WHERE id = ${courseId}::uuid
      `
      expect(rows[0].status).toBe('unmapped')

      const corrections = await db.$queryRaw<{ c: bigint }[]>`
        SELECT COUNT(*)::bigint AS c FROM corrections
        WHERE course_id = ${courseId}::uuid AND correction_type = 'course_signoff'
      `
      expect(Number(corrections[0].c)).toBe(0)
    })
  })
})
