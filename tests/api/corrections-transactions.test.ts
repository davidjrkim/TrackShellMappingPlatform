/**
 * @jest-environment node
 *
 * US-016 — transaction integrity for correction endpoints.
 *
 * Each correction mutation route (PATCH /hole, PATCH /type, PATCH /geometry,
 * DELETE /feature) must write the corrections audit row AND the feature
 * mutation atomically: if either fails, the other must roll back. This suite
 * forces each half of the pair to fail by intercepting `db.$transaction` and
 * substituting a failing raw SQL statement, then asserts the DB state is
 * unchanged.
 *
 * Runs against the real Postgres/PostGIS dev container (docker-compose up -d).
 */
import { db } from '@/lib/db'
import { createCourse } from '@/lib/spatial'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
import { getServerSession } from 'next-auth'
const mockSession = getServerSession as jest.MockedFunction<typeof getServerSession>

const realTransaction = db.$transaction.bind(db)

// Replace one statement in the 2-element `db.$transaction([...])` array with a
// query that raises at the database level (division by zero). The underlying
// $transaction still runs in a single PG transaction, so when the failing
// statement throws, the sibling statement is rolled back too.
function forceTransactionFailureAt(position: 'first' | 'second') {
  return jest
    .spyOn(db, '$transaction')
    .mockImplementationOnce((arg: unknown) => {
      const queries = arg as unknown[]
      const failing = db.$executeRaw`SELECT 1 / 0`
      const modified =
        position === 'first'
          ? [failing, queries[1]]
          : [queries[0], failing]
      return realTransaction(modified as never) as never
    })
}

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

type FeatureRow = {
  id: string
  hole_id: string | null
  feature_type: string
  geojson: string
}
async function readFeature(featureId: string): Promise<FeatureRow | null> {
  const rows = await db.$queryRaw<FeatureRow[]>`
    SELECT id, hole_id, feature_type::text AS feature_type, ST_AsGeoJSON(geometry) AS geojson
    FROM features
    WHERE id = ${featureId}::uuid
    LIMIT 1
  `
  return rows[0] ?? null
}

async function countCorrections(featureId: string, type: string): Promise<number> {
  const rows = await db.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*)::bigint AS c
    FROM corrections
    WHERE feature_id = ${featureId}::uuid
      AND correction_type = ${type}
  `
  return Number(rows[0]?.c ?? 0)
}

// Polygon covering ~9,900 m² near Seoul — comfortably above the 20 m² floor
// that PATCH /geometry enforces.
const STARTING_GEOJSON_POLYGON = 'POLYGON((127.000 37.000, 127.001 37.000, 127.001 37.001, 127.000 37.001, 127.000 37.000))'
const NEW_GEOJSON_GEOMETRY = {
  type: 'MultiPolygon' as const,
  coordinates: [[[
    [127.002, 37.002],
    [127.003, 37.002],
    [127.003, 37.003],
    [127.002, 37.003],
    [127.002, 37.002],
  ]]],
}

describe('correction endpoints — transaction integrity', () => {
  let org: { id: string }
  let user: { id: string; orgId: string; email: string }
  let courseId: string
  let hole1Id: string
  let hole2Id: string
  let featureId: string

  beforeAll(async () => {
    org = await ensureOrg('txn-test-org')
    const u = await ensureUser('txn-reviewer@test.local', org.id)
    user = { id: u.id, orgId: org.id, email: u.email }

    const c = await createCourse({
      orgId: org.id,
      name: 'Txn Test Course',
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
    await db.$executeRaw`DELETE FROM users WHERE email = 'txn-reviewer@test.local'`
    await db.$executeRaw`DELETE FROM organizations WHERE name = 'txn-test-org'`
    await db.$disconnect()
  })

  // Each test starts from a clean feature on hole1 with the starting geometry
  // and no correction rows for it.
  beforeEach(async () => {
    mockSession.mockReset()
    mockSession.mockResolvedValue(sessionFor(user) as never)

    await db.$executeRaw`DELETE FROM corrections WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM features WHERE course_id = ${courseId}::uuid`

    const rows = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO features (id, hole_id, course_id, feature_type, geometry)
      VALUES (
        gen_random_uuid(),
        ${hole1Id}::uuid,
        ${courseId}::uuid,
        'green'::feature_type_enum,
        ST_Multi(ST_GeomFromText(${STARTING_GEOJSON_POLYGON}, 4326))
      )
      RETURNING id
    `
    featureId = rows[0].id
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  describe('PATCH /api/features/[featureId]/hole', () => {
    async function invoke() {
      const { PATCH } = await import('@/app/api/features/[featureId]/hole/route')
      return PATCH(
        new Request('http://localhost', {
          method: 'PATCH',
          body: JSON.stringify({ holeId: hole2Id }),
          headers: { 'content-type': 'application/json' },
        }),
        { params: { featureId } },
      )
    }

    it('rolls back corrections row when the feature UPDATE fails', async () => {
      forceTransactionFailureAt('second')
      await expect(invoke()).rejects.toThrow()

      const f = await readFeature(featureId)
      expect(f?.hole_id).toBe(hole1Id)
      expect(await countCorrections(featureId, 'hole_reassignment')).toBe(0)
    })

    it('leaves feature unchanged when the corrections INSERT fails', async () => {
      forceTransactionFailureAt('first')
      await expect(invoke()).rejects.toThrow()

      const f = await readFeature(featureId)
      expect(f?.hole_id).toBe(hole1Id)
      expect(await countCorrections(featureId, 'hole_reassignment')).toBe(0)
    })
  })

  describe('PATCH /api/features/[featureId]/type', () => {
    async function invoke() {
      const { PATCH } = await import('@/app/api/features/[featureId]/type/route')
      return PATCH(
        new Request('http://localhost', {
          method: 'PATCH',
          body: JSON.stringify({ featureType: 'fairway' }),
          headers: { 'content-type': 'application/json' },
        }),
        { params: { featureId } },
      )
    }

    it('rolls back corrections row when the feature UPDATE fails', async () => {
      forceTransactionFailureAt('second')
      await expect(invoke()).rejects.toThrow()

      const f = await readFeature(featureId)
      expect(f?.feature_type).toBe('green')
      expect(await countCorrections(featureId, 'type_change')).toBe(0)
    })

    it('leaves feature unchanged when the corrections INSERT fails', async () => {
      forceTransactionFailureAt('first')
      await expect(invoke()).rejects.toThrow()

      const f = await readFeature(featureId)
      expect(f?.feature_type).toBe('green')
      expect(await countCorrections(featureId, 'type_change')).toBe(0)
    })
  })

  describe('PATCH /api/features/[featureId]/geometry', () => {
    async function invoke() {
      const { PATCH } = await import('@/app/api/features/[featureId]/geometry/route')
      return PATCH(
        new Request('http://localhost', {
          method: 'PATCH',
          body: JSON.stringify({ geometry: NEW_GEOJSON_GEOMETRY }),
          headers: { 'content-type': 'application/json' },
        }),
        { params: { featureId } },
      )
    }

    it('rolls back corrections row when the feature UPDATE fails', async () => {
      const before = await readFeature(featureId)
      forceTransactionFailureAt('second')
      await expect(invoke()).rejects.toThrow()

      const after = await readFeature(featureId)
      expect(after?.geojson).toBe(before?.geojson)
      expect(await countCorrections(featureId, 'geometry_edit')).toBe(0)
    })

    it('leaves feature unchanged when the corrections INSERT fails', async () => {
      const before = await readFeature(featureId)
      forceTransactionFailureAt('first')
      await expect(invoke()).rejects.toThrow()

      const after = await readFeature(featureId)
      expect(after?.geojson).toBe(before?.geojson)
      expect(await countCorrections(featureId, 'geometry_edit')).toBe(0)
    })
  })

  describe('DELETE /api/features/[featureId]', () => {
    async function invoke() {
      const { DELETE } = await import('@/app/api/features/[featureId]/route')
      return DELETE(
        new Request('http://localhost', { method: 'DELETE' }),
        { params: { featureId } },
      )
    }

    it('rolls back corrections row when the feature DELETE fails', async () => {
      forceTransactionFailureAt('second')
      await expect(invoke()).rejects.toThrow()

      const f = await readFeature(featureId)
      expect(f).not.toBeNull()
      expect(await countCorrections(featureId, 'polygon_delete')).toBe(0)
    })

    it('leaves feature unchanged when the corrections INSERT fails', async () => {
      forceTransactionFailureAt('first')
      await expect(invoke()).rejects.toThrow()

      const f = await readFeature(featureId)
      expect(f).not.toBeNull()
      expect(await countCorrections(featureId, 'polygon_delete')).toBe(0)
    })
  })
})
