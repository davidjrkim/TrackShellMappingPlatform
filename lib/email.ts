import { Resend } from 'resend'
import { redis } from './redis'

const FROM = process.env.RESEND_FROM ?? 'TrackShell <noreply@trackshell.local>'
const DASHBOARD_URL = process.env.NEXTAUTH_URL ?? 'http://localhost:3000'

let client: Resend | null = null
function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  if (!client) client = new Resend(process.env.RESEND_API_KEY)
  return client
}

export async function sendJobFailureEmail(args: {
  jobId: string
  courseId: string
  courseName: string
  error: string
  to: string[]
}): Promise<void> {
  if (args.to.length === 0) return

  // Dedupe — SSE streams can fire terminal-event more than once across reviewers.
  try {
    const set = await redis.set(`job:${args.jobId}:failmail`, '1', 'EX', 86400, 'NX')
    if (set !== 'OK') return
  } catch {
    // If Redis is down, prefer silence over duplicate spam.
    return
  }

  const resend = getClient()
  if (!resend) return

  const logUrl = `${DASHBOARD_URL}/dashboard/courses/${args.courseId}/jobs`
  const shortError = args.error.length > 500 ? `${args.error.slice(0, 500)}…` : args.error

  await resend.emails.send({
    from: FROM,
    to: args.to,
    subject: `[TrackShell] Pipeline failed: ${args.courseName}`,
    text:
      `Pipeline job ${args.jobId} failed for ${args.courseName}.\n\n` +
      `Error: ${shortError}\n\n` +
      `Job log: ${logUrl}\n`,
  }).catch(() => {
    // Swallow — failure to email must not crash the request path.
  })
}

export async function adminsForOrg(orgId: string): Promise<string[]> {
  const { db } = await import('./db')
  const rows = await db.user.findMany({
    where: { orgId, role: 'admin' },
    select: { email: true },
  })
  return rows.map((r) => r.email)
}
