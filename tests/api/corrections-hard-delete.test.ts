/**
 * @jest-environment node
 *
 * US-018 — hard delete preserves corrections row.
 *
 * DELETE /api/features/[featureId] hard-deletes the feature row but the
 * corresponding corrections row (correction_type = 'polygon_delete') must
 * survive with geometry, feature_type, hole, and confidence snapshots
 * populated so the audit trail is intact after the feature row is gone.
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

// ~9,900 m² at latitude 37° — comfortably above the 20 m² floor.
const STARTING_POLYGON_WKT =
  'POLYGON((127.000 37.000, 127.001 37.000, 127.001 37.001, 127.000 37.001, 127.000 37.000))'

describe('DELETE /api/features/[featureId] — corrections row survives (US-018)', () => {
  let org: { id: string }
  let user: { id: string; orgId: string; email: string }
  let courseId: string
  let hole1Id: string
  let featureId: string

  beforeAll(async () => {
    org = await ensureOrg('hard-delete-test-org')
    const u = await ensureUser('hard-delete-reviewer@test.local', org.id)
    user = { id: u.id, orgId: org.id, email: u.email }

    const c = await createCourse({
      orgId: org.id,
      name: 'Hard Delete Test Course',
      country: 'KR',
      holeCount: 18,
      bbox: { west: 127.0, south: 37.0, east: 127.1, north: 37.1 },
      dataSource: 'manual',
    })
    courseId = c.id

    const holes = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO holes (id, course_id, hole_number, confidence, needs_review, confirmed)
      VALUES (gen_random_uuid(), ${courseId}::uuid, 7, 0.82, false, false)
      RETURNING id
    `
    hole1Id = holes[0].id
  })

  afterAll(async () => {
    await db.$executeRaw`DELETE FROM corrections WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM features WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM holes WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM courses WHERE id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM users WHERE email = 'hard-delete-reviewer@test.local'`
    await db.$executeRaw`DELETE FROM organizations WHERE name = 'hard-delete-test-org'`
    await db.$disconnect()
  })

  beforeEach(async () => {
    mockSession.mockReset()
    mockSession.mockResolvedValue(sessionFor(user) as never)

    await db.$executeRaw`DELETE FROM corrections WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM features WHERE course_id = ${courseId}::uuid`

    // Seed a feature with a non-null confidence so the snapshot assertion
    // has something meaningful to read.
    const rows = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO features (id, hole_id, course_id, feature_type, confidence, geometry)
      VALUES (
        gen_random_uuid(),
        ${hole1Id}::uuid,
        ${courseId}::uuid,
        'bunker'::feature_type_enum,
        0.654,
        ST_Multi(ST_GeomFromText(${STARTING_POLYGON_WKT}, 4326))
      )
      RETURNING id
    `
    featureId = rows[0].id
  })

  async function invokeDelete() {
    const { DELETE } = await import('@/app/api/features/[featureId]/route')
    return DELETE(
      new Request('http://localhost', { method: 'DELETE' }),
      { params: { featureId } },
    )
  }

  it('removes the feature row and returns 204', async () => {
    const res = await invokeDelete()
    expect(res.status).toBe(204)

    const remaining = await db.$queryRaw<{ id: string }[]>`
      SELECT id FROM features WHERE id = ${featureId}::uuid
    `
    expect(remaining).toHaveLength(0)
  })

  it('preserves the corrections row with geometry, feature_type, hole, and confidence snapshots', async () => {
    const res = await invokeDelete()
    expect(res.status).toBe(204)

    // feature_id is nulled out by ON DELETE SET NULL on corrections.feature_id,
    // so look up by course_id + correction_type. We have exactly one corrections
    // row in this course after beforeEach resets.
    const rows = await db.$queryRaw<
      {
        id: string
        feature_id: string | null
        correction_type: string
        original_hole_number: number | null
        original_feature_type: string | null
        has_geometry_snapshot: boolean
        snapshot_area_sqm: number | null
        notes: string | null
        corrected_by: string
      }[]
    >`
      SELECT
        id,
        feature_id,
        correction_type,
        original_hole_number,
        original_feature_type::text AS original_feature_type,
        (original_geometry IS NOT NULL) AS has_geometry_snapshot,
        ST_Area(original_geometry::geography)::float AS snapshot_area_sqm,
        notes,
        corrected_by::text AS corrected_by
      FROM corrections
      WHERE course_id = ${courseId}::uuid
        AND correction_type = 'polygon_delete'
    `

    expect(rows).toHaveLength(1)
    const snap = rows[0]

    // feature row is gone, but the ON DELETE SET NULL keeps the audit row.
    expect(snap.feature_id).toBeNull()
    expect(snap.correction_type).toBe('polygon_delete')

    // Geometry snapshot — present, and area matches the seeded polygon
    // (~9,900 m² near latitude 37°).
    expect(snap.has_geometry_snapshot).toBe(true)
    expect(snap.snapshot_area_sqm).not.toBeNull()
    expect(snap.snapshot_area_sqm!).toBeGreaterThan(9000)
    expect(snap.snapshot_area_sqm!).toBeLessThan(11000)

    // Feature type snapshot — matches the seeded 'bunker'.
    expect(snap.original_feature_type).toBe('bunker')

    // Hole snapshot — corrections schema stores original_hole_number (the
    // hole_id is not a column on corrections, but the hole number is the
    // human-meaningful identity preserved in the audit trail).
    expect(snap.original_hole_number).toBe(7)

    // Confidence-score snapshot — the route stashes it into notes as JSON
    // because corrections has no dedicated column for it.
    expect(snap.notes).not.toBeNull()
    const parsed = JSON.parse(snap.notes!)
    expect(parsed).toHaveProperty('confidence')
    expect(Number(parsed.confidence)).toBeCloseTo(0.654, 3)

    // Author of the correction is the session user who issued DELETE.
    expect(snap.corrected_by).toBe(user.id)
  })
})
