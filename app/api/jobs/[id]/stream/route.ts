import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getJobForOrg, TERMINAL_STATUSES } from '@/lib/jobs'
import { openPipelineStream } from '@/lib/pipeline'
import { redis } from '@/lib/redis'
import { adminsForOrg, sendJobFailureEmail } from '@/lib/email'
import { db } from '@/lib/db'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function sseMessage(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return new Response('Unauthorized', { status: 401 })
  if (!UUID_RE.test(params.id)) return new Response('Not found', { status: 404 })

  const job = await getJobForOrg(params.id, session.user.orgId)
  if (!job) return new Response('Not found', { status: 404 })

  // Already terminal — fire one event and close immediately (RULES.md).
  if (TERMINAL_STATUSES.has(job.status)) {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        const enc = new TextEncoder()
        controller.enqueue(enc.encode(sseMessage('status', { status: job.status, errorMessage: job.error_message })))
        controller.close()
      },
    })
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        'Connection': 'keep-alive',
      },
    })
  }

  const upstream = await openPipelineStream(job.id)
  if (!upstream.ok || !upstream.body) {
    return new Response('Upstream unavailable', { status: 502 })
  }

  const encoder = new TextEncoder()
  const decoder = new TextDecoder()
  const abort = new AbortController()
  req.signal.addEventListener('abort', () => abort.abort())

  const courseId = job.course_id
  const orgId = session.user.orgId
  const jobId = job.id

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = upstream.body!.getReader()
      let buffer = ''
      let closed = false
      const close = () => {
        if (closed) return
        closed = true
        try { controller.close() } catch {}
        try { reader.cancel() } catch {}
      }

      async function handleTerminal(status: string, errorMessage: string | null) {
        try {
          await redis.del(`job:${jobId}:progress`)
        } catch {}
        if (status === 'failed') {
          try {
            const course = await db.course.findUnique({
              where: { id: courseId },
              select: { name: true },
            })
            if (course) {
              const admins = await adminsForOrg(orgId)
              await sendJobFailureEmail({
                jobId,
                courseId,
                courseName: course.name,
                error: errorMessage ?? 'Pipeline job failed',
                to: admins,
              })
            }
          } catch {
            // email best-effort
          }
        }
      }

      try {
        while (!abort.signal.aborted) {
          const { value, done } = await reader.read()
          if (done) break
          const chunk = decoder.decode(value, { stream: true })
          buffer += chunk
          controller.enqueue(encoder.encode(chunk))

          // Peek into events for terminal status + progress cache.
          const events = buffer.split('\n\n')
          buffer = events.pop() ?? ''
          for (const raw of events) {
            const dataLine = raw.split('\n').find((l) => l.startsWith('data:'))
            if (!dataLine) continue
            let payload: any
            try { payload = JSON.parse(dataLine.slice(5).trim()) } catch { continue }
            if (payload && typeof payload === 'object') {
              if (typeof payload.status === 'string') {
                if (TERMINAL_STATUSES.has(payload.status)) {
                  await handleTerminal(payload.status, payload.errorMessage ?? payload.error ?? null)
                  close()
                  return
                }
              }
              if (payload.stage || payload.progress !== undefined) {
                try {
                  await redis.set(
                    `job:${jobId}:progress`,
                    JSON.stringify(payload),
                    'EX',
                    600,
                  )
                } catch {}
              }
            }
          }
        }
        close()
      } catch {
        close()
      }
    },
    cancel() {
      abort.abort()
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
