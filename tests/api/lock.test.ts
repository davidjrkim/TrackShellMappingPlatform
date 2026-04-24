/**
 * @jest-environment node
 *
 * API tests for /api/courses/[id]/lock — acquire, conflict, same-user reacquire,
 * and 2-hour TTL auto-release.
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

describe('lock API', () => {
  let org: { id: string }
  let userA: { id: string; orgId: string; role: string; email: string }
  let userB: { id: string; orgId: string; role: string; email: string }
  let courseId: string

  beforeAll(async () => {
    org = await ensureOrg('lock-test-org')
    const a = await ensureUser('lock-a@test.local', org.id, 'reviewer')
    const b = await ensureUser('lock-b@test.local', org.id, 'reviewer')
    userA = { id: a.id, orgId: org.id, role: a.role, email: a.email }
    userB = { id: b.id, orgId: org.id, role: b.role, email: b.email }
    const c = await createCourse({
      orgId: org.id, name: 'Lock Course', country: 'KR', holeCount: 18,
      bbox: { west: 127.0, south: 37.3, east: 127.1, north: 37.4 }, dataSource: 'manual',
    })
    courseId = c.id
  })

  afterAll(async () => {
    await db.$executeRaw`DELETE FROM courses WHERE id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM users WHERE email IN ('lock-a@test.local','lock-b@test.local')`
    await db.$executeRaw`DELETE FROM organizations WHERE name = 'lock-test-org'`
    await db.$disconnect()
  })

  beforeEach(async () => {
    mockSession.mockReset()
    await db.$executeRaw`UPDATE courses SET locked_by = NULL, locked_at = NULL WHERE id = ${courseId}::uuid`
  })

  it('POST /lock — acquires when unheld', async () => {
    mockSession.mockResolvedValue(sessionFor(userA) as any)
    const { POST } = await import('@/app/api/courses/[id]/lock/route')
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: courseId } })
    expect(res.status).toBe(200)

    const rows = await db.$queryRaw<{ locked_by: string | null }[]>`
      SELECT locked_by FROM courses WHERE id = ${courseId}::uuid
    `
    expect(rows[0].locked_by).toBe(userA.id)
  })

  it('POST /lock — 409 when held by another user', async () => {
    await db.$executeRaw`
      UPDATE courses
      SET locked_by = ${userA.id}::uuid, locked_at = NOW()
      WHERE id = ${courseId}::uuid
    `
    mockSession.mockResolvedValue(sessionFor(userB) as any)
    const { POST } = await import('@/app/api/courses/[id]/lock/route')
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: courseId } })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.lockedBy?.id).toBe(userA.id)
  })

  it('POST /lock — same user re-acquires', async () => {
    await db.$executeRaw`
      UPDATE courses
      SET locked_by = ${userA.id}::uuid, locked_at = NOW()
      WHERE id = ${courseId}::uuid
    `
    mockSession.mockResolvedValue(sessionFor(userA) as any)
    const { POST } = await import('@/app/api/courses/[id]/lock/route')
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: courseId } })
    expect(res.status).toBe(200)
  })

  it('POST /lock — auto-releases after 2h', async () => {
    await db.$executeRaw`
      UPDATE courses
      SET locked_by = ${userA.id}::uuid,
          locked_at = NOW() - INTERVAL '3 hours'
      WHERE id = ${courseId}::uuid
    `
    mockSession.mockResolvedValue(sessionFor(userB) as any)
    const { POST } = await import('@/app/api/courses/[id]/lock/route')
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: courseId } })
    expect(res.status).toBe(200)

    const rows = await db.$queryRaw<{ locked_by: string | null }[]>`
      SELECT locked_by FROM courses WHERE id = ${courseId}::uuid
    `
    expect(rows[0].locked_by).toBe(userB.id)
  })

  it('DELETE /lock — only holder can release', async () => {
    await db.$executeRaw`
      UPDATE courses
      SET locked_by = ${userA.id}::uuid, locked_at = NOW()
      WHERE id = ${courseId}::uuid
    `
    mockSession.mockResolvedValue(sessionFor(userB) as any)
    const { DELETE } = await import('@/app/api/courses/[id]/lock/route')
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: courseId } })
    expect(res.status).toBe(200)

    const rows = await db.$queryRaw<{ locked_by: string | null }[]>`
      SELECT locked_by FROM courses WHERE id = ${courseId}::uuid
    `
    // Still held by A — B's release is a no-op.
    expect(rows[0].locked_by).toBe(userA.id)
  })

  it('DELETE /lock — holder releases', async () => {
    await db.$executeRaw`
      UPDATE courses
      SET locked_by = ${userA.id}::uuid, locked_at = NOW()
      WHERE id = ${courseId}::uuid
    `
    mockSession.mockResolvedValue(sessionFor(userA) as any)
    const { DELETE } = await import('@/app/api/courses/[id]/lock/route')
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: courseId } })
    expect(res.status).toBe(200)

    const rows = await db.$queryRaw<{ locked_by: string | null }[]>`
      SELECT locked_by FROM courses WHERE id = ${courseId}::uuid
    `
    expect(rows[0].locked_by).toBeNull()
  })

  it('POST /lock — 401 when unauthenticated', async () => {
    mockSession.mockResolvedValue(null as any)
    const { POST } = await import('@/app/api/courses/[id]/lock/route')
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: courseId } })
    expect(res.status).toBe(401)
  })

  it('POST /lock — 404 for cross-org course', async () => {
    const otherOrg = await ensureOrg('lock-other-org')
    mockSession.mockResolvedValue(
      sessionFor({ id: userA.id, orgId: otherOrg.id, role: userA.role, email: userA.email }) as any,
    )
    const { POST } = await import('@/app/api/courses/[id]/lock/route')
    const res = await POST(new Request('http://localhost', { method: 'POST' }), { params: { id: courseId } })
    expect(res.status).toBe(404)
    await db.$executeRaw`DELETE FROM organizations WHERE name = 'lock-other-org'`
  })
})
