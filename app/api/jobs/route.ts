import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listJobs } from '@/lib/jobs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const VALID_STATUSES = new Set(['queued', 'running', 'completed', 'failed', 'cancelled'])
const VALID_JOB_TYPES = new Set(['segmentation', 'hole_assignment', 'full_pipeline'])

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const page     = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1)
  const pageSize = Math.min(100, Math.max(1, parseInt(searchParams.get('pageSize') ?? '25', 10) || 25))
  const statuses = searchParams.getAll('status').filter((s) => VALID_STATUSES.has(s))
  const jobTypes = searchParams.getAll('jobType').filter((s) => VALID_JOB_TYPES.has(s))
  const courseId = searchParams.get('courseId')
  if (courseId && !UUID_RE.test(courseId)) {
    return NextResponse.json({ error: 'courseId must be a UUID' }, { status: 400 })
  }
  const fromRaw = searchParams.get('from')
  const toRaw   = searchParams.get('to')
  const from = fromRaw ? new Date(fromRaw) : undefined
  const to   = toRaw ? new Date(toRaw) : undefined
  if (from && Number.isNaN(from.getTime())) {
    return NextResponse.json({ error: 'from must be ISO date' }, { status: 400 })
  }
  if (to && Number.isNaN(to.getTime())) {
    return NextResponse.json({ error: 'to must be ISO date' }, { status: 400 })
  }

  const { rows, total, counts } = await listJobs({
    orgId: session.user.orgId,
    statuses: statuses.length ? statuses : undefined,
    jobTypes: jobTypes.length ? jobTypes : undefined,
    courseId: courseId ?? undefined,
    from,
    to,
    page,
    pageSize,
  })

  return NextResponse.json({
    jobs: rows,
    counts,
    pagination: {
      page,
      pageSize,
      total,
      pageCount: Math.max(1, Math.ceil(total / pageSize)),
    },
  })
}
