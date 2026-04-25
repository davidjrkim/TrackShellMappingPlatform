// Pipeline service client. PIPELINE_API_KEY (when set) must never leak to the browser.
//
// The pipeline is a FastAPI service (TrackShell Segmentation API). Its job id is
// distinct from our pipeline_jobs.id — we pass our local ids around internally
// and only use the pipeline's id when calling its endpoints.

const PIPELINE_URL = process.env.PIPELINE_API_URL
const PIPELINE_KEY = process.env.PIPELINE_API_KEY

function assertServerConfig() {
  if (!PIPELINE_URL) {
    throw new Error('PIPELINE_API_URL not configured')
  }
}

function pipelineHeaders(extra: Record<string, string> = {}): Record<string, string> {
  const headers: Record<string, string> = { ...extra }
  if (PIPELINE_KEY) headers['X-Pipeline-Key'] = PIPELINE_KEY
  return headers
}

export type TriggerPipelineInput = {
  courseId: string
  jobType: string
  force: boolean
}

export type TriggerPipelineResult =
  | { ok: true; pipelineJobId: string }
  | { ok: false; status?: number; error: string }

// The pipeline currently only supports the 'full' job type. Our local audit
// preserves the finer-grained jobType the operator selected.
function toPipelineJobType(_local: string): 'full' {
  return 'full'
}

export async function triggerPipelineJob(input: TriggerPipelineInput): Promise<TriggerPipelineResult> {
  try {
    assertServerConfig()
    const res = await fetch(`${PIPELINE_URL}/jobs/run`, {
      method: 'POST',
      headers: pipelineHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        course_id: input.courseId,
        job_type: toPipelineJobType(input.jobType),
        force: input.force,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: text.slice(0, 500) || `pipeline returned ${res.status}` }
    }
    const body = (await res.json().catch(() => null)) as { job_id?: unknown } | null
    if (!body || typeof body.job_id !== 'string' || body.job_id.length === 0) {
      return { ok: false, error: 'pipeline response missing job_id' }
    }
    return { ok: true, pipelineJobId: body.job_id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'pipeline unreachable' }
  }
}

// The pipeline exposes no cancel endpoint. Callers still mark the local row
// cancelled; the pipeline itself will continue to completion and post whatever
// it produces. Kept as a function so the call sites don't have to branch.
export async function cancelPipelineJob(_pipelineJobId: string | null): Promise<{ ok: true }> {
  return { ok: true }
}

export async function openPipelineStream(pipelineJobId: string): Promise<Response> {
  assertServerConfig()
  return fetch(`${PIPELINE_URL}/jobs/${encodeURIComponent(pipelineJobId)}/stream`, {
    headers: pipelineHeaders({ Accept: 'text/event-stream' }),
  })
}
