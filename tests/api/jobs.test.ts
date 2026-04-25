/**
 * @jest-environment node
 *
 * API tests for /api/jobs — force re-run gating, SSE terminal-state close,
 * cancel/status flows. Runs against the real Postgres/PostGIS dev container.
 */
import { db } from '@/lib/db'
import { createCourse } from '@/lib/spatial'

jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
import { getServerSession } from 'next-auth'
const mockSession = getServerSession as jest.MockedFunction<typeof getServerSession>

jest.mock('@/lib/pipeline', () => ({
  triggerPipelineJob: jest.fn(async () => ({ ok: true, pipelineJobId: 'test-pipeline-id' })),
  cancelPipelineJob: jest.fn(async () => ({ ok: true })),
  openPipelineStream: jest.fn(async () => new Response(null, { status: 502 })),
}))

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

describe('jobs API — force gating + SSE close + cancel', () => {
  let org: { id: string }
  let admin: any
  let reviewer: any
  let courseId: string

  beforeAll(async () => {
    org = await ensureOrg('jobs-test-org')
    admin = await ensureUser('jobs-admin@test.local', org.id, 'admin')
    reviewer = await ensureUser('jobs-reviewer@test.local', org.id, 'reviewer')

    const c = await createCourse({
      orgId: org.id, name: 'Jobs Course', country: 'KR', holeCount: 18,
      bbox: { west: 127.0, south: 37.3, east: 127.1, north: 37.4 }, dataSource: 'manual',
    })
    courseId = c.id
  })

  afterAll(async () => {
    await db.$executeRaw`DELETE FROM pipeline_jobs WHERE course_id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM courses WHERE id = ${courseId}::uuid`
    await db.$executeRaw`DELETE FROM users WHERE email IN ('jobs-admin@test.local', 'jobs-reviewer@test.local')`
    await db.$executeRaw`DELETE FROM organizations WHERE name = 'jobs-test-org'`
    await db.$disconnect()
  })

  beforeEach(() => { mockSession.mockReset() })

  it('POST /api/jobs/run — reviewer blocked from force re-run on reviewed course', async () => {
    await db.$executeRaw`UPDATE courses SET status = 'reviewed'::"course_status" WHERE id = ${courseId}::uuid`
    mockSession.mockResolvedValue(sessionFor(reviewer) as any)
    const { POST } = await import('@/app/api/jobs/run/route')
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ courseId, jobType: 'full_pipeline', force: true }),
    }))
    expect(res.status).toBe(403)
  })

  it('POST /api/jobs/run — 409 without force on reviewed course', async () => {
    mockSession.mockResolvedValue(sessionFor(admin) as any)
    const { POST } = await import('@/app/api/jobs/run/route')
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ courseId, jobType: 'full_pipeline', force: false }),
    }))
    expect(res.status).toBe(409)
  })

  it('POST /api/jobs/run — admin may force on reviewed course', async () => {
    mockSession.mockResolvedValue(sessionFor(admin) as any)
    const { POST } = await import('@/app/api/jobs/run/route')
    const res = await POST(new Request('http://localhost', {
      method: 'POST',
      body: JSON.stringify({ courseId, jobType: 'full_pipeline', force: true }),
    }))
    expect(res.status).toBe(202)
    const body = await res.json()
    expect(body.jobId).toBeTruthy()
    // cleanup the just-created row so hasActiveJob doesn't pollute subsequent tests
    await db.$executeRaw`DELETE FROM pipeline_jobs WHERE id = ${body.jobId}::uuid`
    await db.$executeRaw`UPDATE courses SET status = 'unmapped'::"course_status" WHERE id = ${courseId}::uuid`
  })

  it('GET /api/jobs/[id]/stream — closes immediately when job is already terminal', async () => {
    const rows = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO pipeline_jobs (id, course_id, job_type, status, triggered_by, completed_at, error_message)
      VALUES (gen_random_uuid(), ${courseId}::uuid, 'full_pipeline', 'failed'::"job_status_enum",
              ${admin.id}::uuid, NOW(), 'boom')
      RETURNING id
    `
    const jobId = rows[0].id
    mockSession.mockResolvedValue(sessionFor(admin) as any)
    const { GET } = await import('@/app/api/jobs/[id]/stream/route')
    const res = await GET(new Request('http://localhost'), { params: { id: jobId } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toMatch(/event-stream/)
    const text = await res.text()
    expect(text).toContain('event: status')
    expect(text).toContain('failed')
    await db.$executeRaw`DELETE FROM pipeline_jobs WHERE id = ${jobId}::uuid`
  })

  it('DELETE /api/jobs/[id] — reviewer who did not trigger gets 403', async () => {
    const rows = await db.$queryRaw<{ id: string }[]>`
      INSERT INTO pipeline_jobs (id, course_id, job_type, status, triggered_by)
      VALUES (gen_random_uuid(), ${courseId}::uuid, 'full_pipeline', 'running'::"job_status_enum", ${admin.id}::uuid)
      RETURNING id
    `
    const jobId = rows[0].id
    mockSession.mockResolvedValue(sessionFor(reviewer) as any)
    const { DELETE } = await import('@/app/api/jobs/[id]/route')
    const res = await DELETE(new Request('http://localhost', { method: 'DELETE' }), { params: { id: jobId } })
    expect(res.status).toBe(403)
    await db.$executeRaw`DELETE FROM pipeline_jobs WHERE id = ${jobId}::uuid`
  })
})
