// Pipeline service client. PIPELINE_API_KEY must never leak to the browser.

const PIPELINE_URL = process.env.PIPELINE_API_URL
const PIPELINE_KEY = process.env.PIPELINE_API_KEY

function assertServerConfig() {
  if (!PIPELINE_URL || !PIPELINE_KEY) {
    throw new Error('PIPELINE_API_URL / PIPELINE_API_KEY not configured')
  }
}

export type TriggerPipelineInput = {
  jobId: string
  courseId: string
  jobType: string
  force: boolean
  tileSource?: string
}

export async function triggerPipelineJob(input: TriggerPipelineInput): Promise<{ ok: boolean; status?: number; error?: string }> {
  assertServerConfig()
  try {
    const res = await fetch(`${PIPELINE_URL}/api/jobs/run`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Pipeline-Key': PIPELINE_KEY!,
      },
      body: JSON.stringify({
        job_id: input.jobId,
        course_id: input.courseId,
        job_type: input.jobType,
        force: input.force,
        tile_source: input.tileSource,
      }),
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { ok: false, status: res.status, error: text.slice(0, 500) || `pipeline returned ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'pipeline unreachable' }
  }
}

export async function cancelPipelineJob(jobId: string): Promise<{ ok: boolean; status?: number; error?: string }> {
  assertServerConfig()
  try {
    const res = await fetch(`${PIPELINE_URL}/api/jobs/${jobId}`, {
      method: 'DELETE',
      headers: { 'X-Pipeline-Key': PIPELINE_KEY! },
    })
    if (!res.ok) {
      return { ok: false, status: res.status, error: `pipeline returned ${res.status}` }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'pipeline unreachable' }
  }
}

export async function openPipelineStream(jobId: string): Promise<Response> {
  assertServerConfig()
  return fetch(`${PIPELINE_URL}/api/jobs/${jobId}/stream`, {
    headers: {
      'X-Pipeline-Key': PIPELINE_KEY!,
      'Accept': 'text/event-stream',
    },
  })
}
