/**
 * @jest-environment node
 *
 * API tests for /api/courses* — org isolation, admin-only delete, soft-delete
 * hiding. Runs against the real Postgres/PostGIS dev container (docker-compose
 * up -d must be running).
 */
import { db } from '@/lib/db'
import { createCourse } from '@/lib/spatial'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
import { getServerSession } from 'next-auth'
const mockSession = getServerSession as jest.MockedFunction<typeof getServerSession>

async function ensureOrg(name: string) {
  return db.organization.upsert({
    where: { name },
    update: {},
    create: { name },
  })
}

async function ensureUser(email: string, orgId: string, role: 'admin' | 'reviewer') {
  return db.user.upsert({
    where: { email },
    update: { orgId, role },
    create: { email, orgId, role, passwordHash: 'x', name: email },
  })
}

function sessionFor(user: { id: string; orgId: string; role: string; email: string }) {
  return {
    user: { id: user.id, orgId: user.orgId, role: user.role, email: user.email, name: user.email },
    expires: '2099-01-01',
  }
}

describe('courses API — org isolation + delete + soft delete', () => {
  let orgA: { id: string }
  let orgB: { id: string }
  let adminA: { id: string; orgId: string; role: string; email: string }
  let reviewerA: { id: string; orgId: string; role: string; email: string }
  let courseAId: string
  let courseBId: string

  beforeAll(async () => {
    orgA = await ensureOrg('test-org-a')
    orgB = await ensureOrg('test-org-b')
    adminA = (await ensureUser('admin-a@test.local', orgA.id, 'admin')) as any
    reviewerA = (await ensureUser('reviewer-a@test.local', orgA.id, 'reviewer')) as any

    // One course per org so we can assert isolation.
    const a = await createCourse({
      orgId: orgA.id, name: 'Course A', country: 'KR', holeCount: 18,
      bbox: { west: 127.0, south: 37.3, east: 127.1, north: 37.4 }, dataSource: 'manual',
    })
    courseAId = a.id
    const b = await createCourse({
      orgId: orgB.id, name: 'Course B', country: 'DK', holeCount: 18,
      bbox: { west: 12.5, south: 55.6, east: 12.6, north: 55.7 }, dataSource: 'manual',
    })
    courseBId = b.id
  })

  afterAll(async () => {
    await db.$executeRaw`DELETE FROM courses WHERE name IN ('Course A', 'Course B')`
    await db.$executeRaw`DELETE FROM users WHERE email IN ('admin-a@test.local', 'reviewer-a@test.local')`
    await db.$executeRaw`DELETE FROM organizations WHERE name IN ('test-org-a', 'test-org-b')`
    await db.$disconnect()
  })

  beforeEach(() => { mockSession.mockReset() })

  it('GET /api/courses — 401 without session', async () => {
    mockSession.mockResolvedValue(null as any)
    const { GET } = await import('@/app/api/courses/route')
    const res = await GET(new Request('http://localhost/api/courses'))
    expect(res.status).toBe(401)
  })

  it('GET /api/courses — org isolation (orgA cannot see orgB course)', async () => {
    mockSession.mockResolvedValue(sessionFor(adminA) as any)
    const { GET } = await import('@/app/api/courses/route')
    const res = await GET(new Request('http://localhost/api/courses'))
    const body = await res.json()
    const ids: string[] = body.courses.map((c: any) => c.id)
    expect(ids).toContain(courseAId)
    expect(ids).not.toContain(courseBId)
  })

  it('GET /api/courses/[id] — 404 when course belongs to another org', async () => {
    mockSession.mockResolvedValue(sessionFor(adminA) as any)
    const { GET } = await import('@/app/api/courses/[id]/route')
    const res = await GET(new Request('http://localhost'), { params: { id: courseBId } })
    expect(res.status).toBe(404)
  })

  it('DELETE /api/courses/[id] — reviewer forbidden', async () => {
    mockSession.mockResolvedValue(sessionFor(reviewerA) as any)
    const { DELETE } = await import('@/app/api/courses/[id]/route')
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: courseAId } })
    expect(res.status).toBe(403)
  })

  it('DELETE /api/courses/[id] — admin soft-deletes; follow-up list hides it', async () => {
    // Snapshot current list count
    mockSession.mockResolvedValue(sessionFor(adminA) as any)
    const { GET: GET_LIST } = await import('@/app/api/courses/route')
    const before = await (await GET_LIST(new Request('http://localhost/api/courses'))).json()
    const beforeIds: string[] = before.courses.map((c: any) => c.id)
    expect(beforeIds).toContain(courseAId)

    const { DELETE } = await import('@/app/api/courses/[id]/route')
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: courseAId } })
    expect(res.status).toBe(200)

    const after = await (await GET_LIST(new Request('http://localhost/api/courses'))).json()
    const afterIds: string[] = after.courses.map((c: any) => c.id)
    expect(afterIds).not.toContain(courseAId)

    // Row still exists with deleted_at set
    const rows = await db.$queryRaw<{ deleted_at: Date | null }[]>`
      SELECT deleted_at FROM courses WHERE id = ${courseAId}::uuid
    `
    expect(rows[0]?.deleted_at).toBeTruthy()
  })
})
