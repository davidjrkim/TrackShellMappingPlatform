import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  createJob,
  getCourseStatus,
  hasActiveJob,
  markJobFailed,
} from '@/lib/jobs'
import { triggerPipelineJob } from '@/lib/pipeline'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_JOB_TYPES = new Set([
  'segmentation',
  'hole_assignment',
  'full_pipeline',
])
const FORCE_REQUIRED_STATUSES = new Set(['reviewed', 'published'])

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { courseId, jobType, force, tileSource } = body as Record<string, unknown>

  if (typeof courseId !== 'string' || !UUID_RE.test(courseId)) {
    return NextResponse.json({ error: 'courseId must be a UUID' }, { status: 400 })
  }
  if (typeof jobType !== 'string' || !VALID_JOB_TYPES.has(jobType)) {
    return NextResponse.json(
      { error: `jobType must be one of: ${[...VALID_JOB_TYPES].join(', ')}` },
      { status: 400 },
    )
  }
  const forceFlag = force === true
  const tile = typeof tileSource === 'string' && tileSource.trim().length > 0 ? tileSource.trim() : undefined

  const status = await getCourseStatus(courseId, session.user.orgId)
  if (!status) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (FORCE_REQUIRED_STATUSES.has(status)) {
    if (!forceFlag) {
      return NextResponse.json(
        { error: `Course status is "${status}" — force=true required to re-run` },
        { status: 409 },
      )
    }
    if (session.user.role !== 'admin') {
      return NextResponse.json(
        { error: 'Force re-run on reviewed/published courses is admin-only' },
        { status: 403 },
      )
    }
  }

  if (status === 'processing' || (await hasActiveJob(courseId))) {
    return NextResponse.json(
      { error: 'A job is already queued or running for this course' },
      { status: 409 },
    )
  }

  const { id: jobId } = await createJob({
    courseId,
    jobType,
    triggeredBy: session.user.id,
  })

  const pipelineRes = await triggerPipelineJob({
    jobId,
    courseId,
    jobType,
    force: forceFlag,
    tileSource: tile,
  })

  if (!pipelineRes.ok) {
    await markJobFailed(jobId, pipelineRes.error ?? 'pipeline unreachable')
    return NextResponse.json(
      { error: 'Failed to start pipeline', detail: pipelineRes.error, jobId },
      { status: 502 },
    )
  }

  return NextResponse.json({ jobId, status: 'queued' }, { status: 202 })
}
