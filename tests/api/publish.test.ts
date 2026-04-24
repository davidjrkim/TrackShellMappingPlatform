/**
 * @jest-environment node
 *
 * API tests for /api/courses/[id]/publish + unpublish — admin-only, status gates.
 */
import { db } from '@/lib/db'
import { createCourse } from '@/lib/spatial'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
import { getServerSession } from 'next-auth'
const mockSession = getServerSession as jest.MockedFunction<typeof getServerSession>

async function ensureOrg(name: string) {
  return db.organization.upsert({ where: { name }, update: {}, create: { name } })
}
async function ensureUser(email: string, orgId: string, role: 'admin' | 'reviewer') {
  return db.user.upsert({
    where: { email },
    update: { orgId, role },
    create: { email, orgId, role, passwordHash: 'x', name: email },
  })
}
function sessionFor(user: { id: string; orgId: string; role: string; email: string }) {
  return { user: { ...user, name: user.email }, expires: '2099-01-01' }
}

describe('publish / unpublish API', () => {
  let org: { id: string }
  let admin: any
  let reviewer: any
  let courseId: string

  beforeAll(async () => {
    org = await ensureOrg('publish-test-org')
    admin = await ensureUser('publish-admin@test.local', org.id, 'admin')
    reviewer = await ensureUser('publish-reviewer@test.local', org.id, 'reviewer')
    const c = await createCourse({
      orgId: org.id, name: 'Publish Course', country: 'KR', holeCount: 18,
      bbox: { west: 127.0, south: 37.3, east: 127.1, north: 37.4 }, dataSource: 'manual',
    })
    courseId = c.id
  })

  afterAll(async () => {
    await db.$executeRaw`DELETE FROM courses WHERE id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM users WHERE email IN ('publish-admin@test.local','publish-reviewer@test.local')`
    await db.$executeRaw`DELETE FROM organizations WHERE name = 'publish-test-org'`
    await db.$disconnect()
  })

  beforeEach(() => { mockSession.mockReset() })

  it('POST /publish — 403 for reviewer', async () => {
    await db.$executeRaw`UPDATE courses SET status = 'reviewed'::"course_status" WHERE id = ${courseId}::uuid`
    mockSession.mockResolvedValue(sessionFor(reviewer) as any)
    const { POST } = await import('@/app/api/courses/[id]/publish/route')
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: courseId } })
    expect(res.status).toBe(403)
  })

  it('POST /publish — 409 when not in reviewed status', async () => {
    await db.$executeRaw`UPDATE courses SET status = 'unmapped'::"course_status" WHERE id = ${courseId}::uuid`
    mockSession.mockResolvedValue(sessionFor(admin) as any)
    const { POST } = await import('@/app/api/courses/[id]/publish/route')
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: courseId } })
    expect(res.status).toBe(409)
  })

  it('POST /publish — admin transitions reviewed → published', async () => {
    await db.$executeRaw`UPDATE courses SET status = 'reviewed'::"course_status" WHERE id = ${courseId}::uuid`
    mockSession.mockResolvedValue(sessionFor(admin) as any)
    const { POST } = await import('@/app/api/courses/[id]/publish/route')
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: courseId } })
    expect(res.status).toBe(200)
    const rows = await db.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM courses WHERE id = ${courseId}::uuid
    `
    expect(rows[0].status).toBe('published')
  })

  it('POST /unpublish — admin transitions published → reviewed', async () => {
    mockSession.mockResolvedValue(sessionFor(admin) as any)
    const { POST } = await import('@/app/api/courses/[id]/unpublish/route')
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: courseId } })
    expect(res.status).toBe(200)
    const rows = await db.$queryRaw<{ status: string }[]>`
      SELECT status::text AS status FROM courses WHERE id = ${courseId}::uuid
    `
    expect(rows[0].status).toBe('reviewed')
  })
})
