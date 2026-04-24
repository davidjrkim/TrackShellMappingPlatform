import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getJobForOrg } from '@/lib/jobs'
import { redis } from '@/lib/redis'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const job = await getJobForOrg(params.id, session.user.orgId)
  if (!job) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  let progress: Record<string, unknown> | null = null
  try {
    const raw = await redis.get(`job:${job.id}:progress`)
    if (raw) progress = JSON.parse(raw)
  } catch {
    // progress cache is best-effort
  }

  return NextResponse.json({
    job: {
      id: job.id,
      courseId: job.course_id,
      jobType: job.job_type,
      status: job.status,
      modelVersion: job.model_version,
      llmModel: job.llm_model,
      polygonsGenerated: job.polygons_generated,
      inputTilesCount: job.input_tiles_count,
      errorMessage: job.error_message,
      startedAt: job.started_at,
      completedAt: job.completed_at,
      createdAt: job.created_at,
    },
    progress,
  })
}
