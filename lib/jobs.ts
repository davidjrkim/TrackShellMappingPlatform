import { db } from './db'

// Job state & helpers. Spatial queries live in lib/spatial.ts.
// Pipeline RPCs live in lib/pipeline.ts.

export type JobRow = {
  id: string
  course_id: string
  job_type: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  triggered_by: string | null
  model_version: string | null
  llm_model: string | null
  polygons_generated: number | null
  input_tiles_count: number | null
  error_message: string | null
  started_at: Date | null
  completed_at: Date | null
  created_at: Date
}

export const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled'])

export async function createJob(input: {
  courseId: string
  jobType: string
  triggeredBy: string
}): Promise<{ id: string }> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO pipeline_jobs (id, course_id, job_type, status, triggered_by)
    VALUES (gen_random_uuid(), ${input.courseId}::uuid, ${input.jobType}, 'queued'::"job_status_enum", ${input.triggeredBy}::uuid)
    RETURNING id
  `
  return { id: rows[0].id }
}

export async function markJobFailed(jobId: string, error: string): Promise<void> {
  await db.$executeRaw`
    UPDATE pipeline_jobs
    SET status = 'failed'::"job_status_enum",
        error_message = ${error},
        completed_at = NOW()
    WHERE id = ${jobId}::uuid
  `
}

export async function getJobForOrg(jobId: string, orgId: string): Promise<JobRow | null> {
  const rows = await db.$queryRaw<JobRow[]>`
    SELECT j.id, j.course_id, j.job_type, j.status::text AS status, j.triggered_by,
           j.model_version, j.llm_model, j.polygons_generated, j.input_tiles_count,
           j.error_message, j.started_at, j.completed_at, j.created_at
    FROM pipeline_jobs j
    JOIN courses c ON c.id = j.course_id
    WHERE j.id = ${jobId}::uuid
      AND c.org_id = ${orgId}::uuid
      AND c.deleted_at IS NULL
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function hasActiveJob(courseId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n
    FROM pipeline_jobs
    WHERE course_id = ${courseId}::uuid
      AND status IN ('queued'::"job_status_enum", 'running'::"job_status_enum")
  `
  return Number(rows[0]?.n ?? 0) > 0
}

export async function getActiveJobId(courseId: string): Promise<string | null> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    SELECT id FROM pipeline_jobs
    WHERE course_id = ${courseId}::uuid
      AND status IN ('queued'::"job_status_enum", 'running'::"job_status_enum")
    ORDER BY created_at DESC
    LIMIT 1
  `
  return rows[0]?.id ?? null
}

export type JobListRow = JobRow & {
  course_name: string
  triggered_by_email: string | null
}

export type JobListFilters = {
  orgId: string
  statuses?: string[]
  jobTypes?: string[]
  courseId?: string
  from?: Date
  to?: Date
  page: number
  pageSize: number
}

export async function listJobs(filters: JobListFilters): Promise<{
  rows: JobListRow[]
  total: number
  counts: { running: number; queued: number; failed: number }
}> {
  const { orgId, statuses, jobTypes, courseId, from, to, page, pageSize } = filters
  const offset = (page - 1) * pageSize
  const statusList = statuses && statuses.length > 0 ? statuses : null
  const typeList   = jobTypes && jobTypes.length > 0 ? jobTypes : null

  const rows = await db.$queryRaw<JobListRow[]>`
    SELECT j.id, j.course_id, j.job_type, j.status::text AS status, j.triggered_by,
           j.model_version, j.llm_model, j.polygons_generated, j.input_tiles_count,
           j.error_message, j.started_at, j.completed_at, j.created_at,
           c.name AS course_name,
           u.email AS triggered_by_email
    FROM pipeline_jobs j
    JOIN courses c ON c.id = j.course_id
    LEFT JOIN users u ON u.id = j.triggered_by
    WHERE c.org_id = ${orgId}::uuid
      AND c.deleted_at IS NULL
      AND (${courseId ?? null}::uuid IS NULL OR j.course_id = ${courseId ?? null}::uuid)
      AND (${statusList}::text[] IS NULL OR j.status::text = ANY(${statusList}::text[]))
      AND (${typeList}::text[]   IS NULL OR j.job_type     = ANY(${typeList}::text[]))
      AND (${from ?? null}::timestamptz IS NULL OR j.created_at >= ${from ?? null}::timestamptz)
      AND (${to ?? null}::timestamptz   IS NULL OR j.created_at <  ${to ?? null}::timestamptz)
    ORDER BY j.created_at DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `

  const totalRows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*)::bigint AS total
    FROM pipeline_jobs j
    JOIN courses c ON c.id = j.course_id
    WHERE c.org_id = ${orgId}::uuid
      AND c.deleted_at IS NULL
      AND (${courseId ?? null}::uuid IS NULL OR j.course_id = ${courseId ?? null}::uuid)
      AND (${statusList}::text[] IS NULL OR j.status::text = ANY(${statusList}::text[]))
      AND (${typeList}::text[]   IS NULL OR j.job_type     = ANY(${typeList}::text[]))
      AND (${from ?? null}::timestamptz IS NULL OR j.created_at >= ${from ?? null}::timestamptz)
      AND (${to ?? null}::timestamptz   IS NULL OR j.created_at <  ${to ?? null}::timestamptz)
  `

  const countRows = await db.$queryRaw<{ status: string; n: bigint }[]>`
    SELECT j.status::text AS status, COUNT(*)::bigint AS n
    FROM pipeline_jobs j
    JOIN courses c ON c.id = j.course_id
    WHERE c.org_id = ${orgId}::uuid
      AND c.deleted_at IS NULL
      AND j.status IN ('queued'::"job_status_enum",'running'::"job_status_enum",'failed'::"job_status_enum")
    GROUP BY j.status
  `
  const counts = { running: 0, queued: 0, failed: 0 }
  for (const r of countRows) {
    if (r.status === 'running') counts.running = Number(r.n)
    else if (r.status === 'queued') counts.queued = Number(r.n)
    else if (r.status === 'failed') counts.failed = Number(r.n)
  }

  return { rows, total: Number(totalRows[0]?.total ?? 0), counts }
}

export async function getCourseStatus(courseId: string, orgId: string): Promise<string | null> {
  const rows = await db.$queryRaw<{ status: string }[]>`
    SELECT status::text AS status
    FROM courses
    WHERE id = ${courseId}::uuid
      AND org_id = ${orgId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `
  return rows[0]?.status ?? null
}
