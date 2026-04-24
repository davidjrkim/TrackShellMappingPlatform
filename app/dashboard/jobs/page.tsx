import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listJobs } from '@/lib/jobs'
import JobStatusBadge from '@/components/jobs/JobStatusBadge'

const STATUSES = ['queued', 'running', 'completed', 'failed', 'cancelled']
const JOB_TYPES = ['segmentation', 'hole_assignment', 'full_pipeline']

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}
function arrParam(v: string | string[] | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

export default async function JobsPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const session = await getServerSession(authOptions)
  if (!session) return null

  const statuses = arrParam(searchParams.status).filter((s) => STATUSES.includes(s))
  const jobTypes = arrParam(searchParams.jobType).filter((s) => JOB_TYPES.includes(s))
  const from = firstParam(searchParams.from)
  const to   = firstParam(searchParams.to)
  const page = Math.max(1, parseInt(firstParam(searchParams.page) ?? '1', 10) || 1)
  const pageSize = 25

  const { rows, total, counts } = await listJobs({
    orgId: session.user.orgId,
    statuses: statuses.length ? statuses : undefined,
    jobTypes: jobTypes.length ? jobTypes : undefined,
    from: from ? new Date(from) : undefined,
    to:   to ? new Date(to) : undefined,
    page,
    pageSize,
  })
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const params = new URLSearchParams()
    for (const s of statuses) params.append('status', s)
    for (const t of jobTypes) params.append('jobType', t)
    if (from) params.set('from', from)
    if (to) params.set('to', to)
    params.set('page', String(page))
    for (const [k, v] of Object.entries(overrides)) {
      params.delete(k)
      if (v !== undefined) params.set(k, v)
    }
    return `/dashboard/jobs?${params.toString()}`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Jobs</h1>
          <p className="text-sm text-gray-500 mt-1">{total} job{total === 1 ? '' : 's'}</p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-blue-50 text-blue-800 border border-blue-200">
            <span className="font-semibold">{counts.running}</span> running
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-gray-50 text-gray-800 border border-gray-200">
            <span className="font-semibold">{counts.queued}</span> queued
          </span>
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-red-50 text-red-800 border border-red-200">
            <span className="font-semibold">{counts.failed}</span> failed
          </span>
        </div>
      </div>

      <form method="GET" action="/dashboard/jobs" className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select
            name="status"
            defaultValue={statuses[0] ?? ''}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Job type</label>
          <select
            name="jobType"
            defaultValue={jobTypes[0] ?? ''}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">All types</option>
            {JOB_TYPES.map((s) => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">From</label>
          <input type="date" name="from" defaultValue={from ?? ''} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">To</label>
          <input type="date" name="to" defaultValue={to ?? ''} className="px-3 py-1.5 border border-gray-300 rounded-md text-sm" />
        </div>
        <button type="submit" className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800">
          Apply
        </button>
        {(statuses.length || jobTypes.length || from || to) ? (
          <Link href="/dashboard/jobs" className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50">
            Reset
          </Link>
        ) : null}
      </form>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Course</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Type</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Status</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Triggered by</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Started</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Finished</th>
              <th className="text-right font-medium text-gray-700 px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                  No jobs match these filters.
                </td>
              </tr>
            )}
            {rows.map((j) => (
              <tr key={j.id} className="border-b last:border-b-0 border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/dashboard/courses/${j.course_id}/overview`} className="text-gray-900 hover:underline font-medium">
                    {j.course_name}
                  </Link>
                </td>
                <td className="px-4 py-2 text-gray-700">{j.job_type}</td>
                <td className="px-4 py-2"><JobStatusBadge status={j.status} /></td>
                <td className="px-4 py-2 text-gray-700 text-xs">{j.triggered_by_email ?? '—'}</td>
                <td className="px-4 py-2 text-gray-500 text-xs">{j.started_at ? new Date(j.started_at).toLocaleString() : '—'}</td>
                <td className="px-4 py-2 text-gray-500 text-xs">{j.completed_at ? new Date(j.completed_at).toLocaleString() : '—'}</td>
                <td className="px-4 py-2 text-right">
                  <Link href={`/dashboard/courses/${j.course_id}/jobs`} className="text-xs text-gray-700 hover:text-gray-900 underline-offset-2 hover:underline">
                    History →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between mt-4 text-sm text-gray-500">
        <span>
          Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
        </span>
        <div className="flex items-center gap-2">
          <Link
            href={hrefWith({ page: String(Math.max(1, page - 1)) })}
            aria-disabled={page === 1}
            className={`px-2.5 py-1 rounded-md border border-gray-300 ${page === 1 ? 'pointer-events-none opacity-40' : 'hover:bg-gray-50'}`}
          >
            ← Prev
          </Link>
          <span>Page {page} of {pageCount}</span>
          <Link
            href={hrefWith({ page: String(Math.min(pageCount, page + 1)) })}
            aria-disabled={page >= pageCount}
            className={`px-2.5 py-1 rounded-md border border-gray-300 ${page >= pageCount ? 'pointer-events-none opacity-40' : 'hover:bg-gray-50'}`}
          >
            Next →
          </Link>
        </div>
      </div>
    </div>
  )
}
