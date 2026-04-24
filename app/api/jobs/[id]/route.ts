import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getJobForOrg, TERMINAL_STATUSES } from '@/lib/jobs'
import { cancelPipelineJob } from '@/lib/pipeline'
import { db } from '@/lib/db'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const job = await getJobForOrg(params.id, session.user.orgId)
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ job })
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const job = await getJobForOrg(params.id, session.user.orgId)
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const isAdmin = session.user.role === 'admin'
  const isTriggerer = job.triggered_by === session.user.id
  if (!isAdmin && !isTriggerer) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (TERMINAL_STATUSES.has(job.status)) {
    return NextResponse.json({ error: `Job already ${job.status}` }, { status: 409 })
  }

  const res = await cancelPipelineJob(job.id)
  if (!res.ok) {
    return NextResponse.json({ error: 'Failed to cancel', detail: res.error }, { status: 502 })
  }

  // Best-effort local mark — pipeline is source of truth and will also update.
  await db.$executeRaw`
    UPDATE pipeline_jobs
    SET status = 'cancelled'::"job_status_enum", completed_at = NOW()
    WHERE id = ${job.id}::uuid
      AND status IN ('queued'::"job_status_enum", 'running'::"job_status_enum")
  `

  return NextResponse.json({ ok: true })
}
