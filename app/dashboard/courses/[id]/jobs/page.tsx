import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCourseDetail } from '@/lib/spatial'
import { listJobs } from '@/lib/jobs'
import JobStatusBadge from '@/components/jobs/JobStatusBadge'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function CourseJobsPage({ params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) notFound()
  const session = await getServerSession(authOptions)
  if (!session) return null

  const course = await getCourseDetail(params.id, session.user.orgId)
  if (!course) notFound()

  const { rows } = await listJobs({
    orgId: session.user.orgId,
    courseId: params.id,
    page: 1,
    pageSize: 100,
  })

  const durationOf = (started: Date | null, completed: Date | null) => {
    if (!started || !completed) return '—'
    const ms = new Date(completed).getTime() - new Date(started).getTime()
    if (ms < 0) return '—'
    const s = Math.round(ms / 1000)
    if (s < 60) return `${s}s`
    return `${Math.floor(s / 60)}m ${s % 60}s`
  }

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <Link href={`/dashboard/courses/${course.id}/overview`} className="text-xs text-gray-500 hover:text-gray-700">
          ← Back to {course.name}
        </Link>
      </div>
      <h1 className="text-2xl font-semibold text-gray-900 mb-1">Job history</h1>
      <p className="text-sm text-gray-500 mb-6">{course.name} · {rows.length} job{rows.length === 1 ? '' : 's'}</p>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Type</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Status</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Triggered by</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Created</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Duration</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Polygons</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Error</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No jobs have been run for this course.
                </td>
              </tr>
            )}
            {rows.map((j) => (
              <tr key={j.id} className="border-b last:border-b-0 border-gray-100 hover:bg-gray-50 align-top">
                <td className="px-4 py-2 text-gray-700">{j.job_type}</td>
                <td className="px-4 py-2"><JobStatusBadge status={j.status} /></td>
                <td className="px-4 py-2 text-gray-700 text-xs">{j.triggered_by_email ?? '—'}</td>
                <td className="px-4 py-2 text-gray-500 text-xs">{new Date(j.created_at).toLocaleString()}</td>
                <td className="px-4 py-2 text-gray-700 text-xs">{durationOf(j.started_at, j.completed_at)}</td>
                <td className="px-4 py-2 text-gray-700">{j.polygons_generated ?? '—'}</td>
                <td className="px-4 py-2 text-red-700 text-xs max-w-xs truncate">{j.error_message ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
