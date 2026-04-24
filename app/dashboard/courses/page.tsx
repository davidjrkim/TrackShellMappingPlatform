import Link from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { listCourses } from '@/lib/spatial'
import StatusBadge from '@/components/ui/StatusBadge'

const STATUSES = ['unmapped', 'processing', 'segmented', 'assigned', 'reviewed', 'published', 'failed']

function firstParam(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v
}
function arrParam(v: string | string[] | undefined): string[] {
  if (!v) return []
  return Array.isArray(v) ? v : [v]
}

export default async function CoursesPage({
  searchParams,
}: {
  searchParams: Record<string, string | string[] | undefined>
}) {
  const session = await getServerSession(authOptions)
  if (!session) return null // middleware will redirect

  const search = firstParam(searchParams.search) ?? ''
  const statuses = arrParam(searchParams.status)
  const countries = arrParam(searchParams.country)
  const page = Math.max(1, parseInt(firstParam(searchParams.page) ?? '1', 10) || 1)
  const pageSize = 20

  const { rows, total } = await listCourses({
    orgId: session.user.orgId,
    search: search || undefined,
    statuses: statuses.length ? statuses : undefined,
    countries: countries.length ? countries : undefined,
    page,
    pageSize,
  })
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  function hrefWith(overrides: Record<string, string | string[] | undefined>): string {
    const params = new URLSearchParams()
    if (search) params.set('search', search)
    for (const s of statuses) params.append('status', s)
    for (const c of countries) params.append('country', c)
    params.set('page', String(page))
    for (const [k, v] of Object.entries(overrides)) {
      params.delete(k)
      if (v === undefined) continue
      if (Array.isArray(v)) v.forEach((x) => params.append(k, x))
      else params.set(k, v)
    }
    return `/dashboard/courses?${params.toString()}`
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Courses</h1>
          <p className="text-sm text-gray-500 mt-1">{total} course{total === 1 ? '' : 's'}</p>
        </div>
        <Link
          href="/dashboard/courses/new"
          className="inline-flex items-center px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800 transition-colors"
          data-testid="new-course-link"
        >
          + Add course
        </Link>
      </div>

      <form method="GET" action="/dashboard/courses" className="bg-white border border-gray-200 rounded-lg p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[220px]">
          <label className="block text-xs font-medium text-gray-700 mb-1">Search</label>
          <input
            name="search"
            defaultValue={search}
            placeholder="Course, city, or region"
            className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Status</label>
          <select
            name="status"
            defaultValue={statuses[0] ?? ''}
            className="px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-gray-900"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Country</label>
          <input
            name="country"
            defaultValue={countries[0] ?? ''}
            placeholder="KR"
            maxLength={2}
            className="w-20 px-3 py-1.5 border border-gray-300 rounded-md text-sm uppercase focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
        </div>
        <button
          type="submit"
          className="px-3 py-1.5 bg-gray-900 text-white text-sm font-medium rounded-md hover:bg-gray-800"
        >
          Apply
        </button>
        {(search || statuses.length || countries.length) ? (
          <Link
            href="/dashboard/courses"
            className="px-3 py-1.5 text-sm text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50"
          >
            Reset
          </Link>
        ) : null}
      </form>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Course</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Country</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Holes</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Status</th>
              <th className="text-left font-medium text-gray-700 px-4 py-2">Updated</th>
              <th className="text-right font-medium text-gray-700 px-4 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                  No courses match these filters.
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-b last:border-b-0 border-gray-100 hover:bg-gray-50">
                <td className="px-4 py-2">
                  <Link href={`/dashboard/courses/${c.id}/overview`} className="text-gray-900 hover:underline font-medium">
                    {c.name}
                  </Link>
                  {c.city && (
                    <div className="text-xs text-gray-500">{[c.city, c.region].filter(Boolean).join(' · ')}</div>
                  )}
                </td>
                <td className="px-4 py-2 text-gray-700">{c.country}</td>
                <td className="px-4 py-2 text-gray-700">{c.hole_count}</td>
                <td className="px-4 py-2"><StatusBadge status={c.status} /></td>
                <td className="px-4 py-2 text-gray-500 text-xs">
                  {new Date(c.updated_at).toLocaleDateString()}
                </td>
                <td className="px-4 py-2 text-right">
                  <Link
                    href={`/dashboard/courses/${c.id}/overview`}
                    className="text-xs text-gray-700 hover:text-gray-900 underline-offset-2 hover:underline"
                  >
                    View →
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
