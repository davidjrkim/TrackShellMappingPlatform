import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCourseDetail, getCourseStats } from '@/lib/spatial'
import StatusBadge from '@/components/ui/StatusBadge'
import CourseActionButtons from '@/components/ui/CourseActionButtons'
import CoursePreviewMap from '@/components/map/CoursePreviewMap'
import JobPanel from '@/components/jobs/JobPanel'
import { getActiveJobId } from '@/lib/jobs'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function CourseOverviewPage({
  params,
  searchParams,
}: {
  params: { id: string }
  searchParams: Record<string, string | string[] | undefined>
}) {
  if (!UUID_RE.test(params.id)) notFound()
  const session = await getServerSession(authOptions)
  if (!session) return null

  const course = await getCourseDetail(params.id, session.user.orgId)
  if (!course) notFound()
  const stats = await getCourseStats(params.id)
  const activeJobId = await getActiveJobId(params.id)
  const justCreated = searchParams.created === '1'

  const addedDate = new Date(course.created_at).toLocaleDateString()
  const updatedDate = new Date(course.updated_at).toLocaleDateString()
  const fmtConfidence = (v: number | null) => (v == null ? '—' : v.toFixed(2))

  return (
    <div className="max-w-5xl">
      <div className="mb-4">
        <Link href="/dashboard/courses" className="text-xs text-gray-500 hover:text-gray-700">
          ← Back to courses
        </Link>
      </div>

      {justCreated && (
        <div className="bg-green-50 border border-green-200 text-green-800 text-sm rounded-md px-3 py-2 mb-4">
          Course added. Run the pipeline to begin mapping.
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-gray-900">{course.name}</h1>
            <StatusBadge status={course.status} />
          </div>
          {course.name_local && <p className="text-sm text-gray-500 mt-0.5">{course.name_local}</p>}
          <p className="text-sm text-gray-600 mt-1">
            {[course.country, course.region, course.city].filter(Boolean).join(' · ')} · {course.hole_count} holes
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Added: {addedDate} · Last updated: {updatedDate}
          </p>
        </div>
        <CourseActionButtons
          courseId={course.id}
          courseName={course.name}
          status={course.status}
          role={session.user.role}
        />
      </div>

      <div className="mb-4">
        <JobPanel
          courseId={course.id}
          courseStatus={course.status}
          role={session.user.role}
          activeJobId={activeJobId}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <CoursePreviewMap
            courseId={course.id}
            fallbackCenter={[Number(course.longitude), Number(course.latitude)]}
          />
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Pipeline summary</h2>
          <dl className="text-sm space-y-2">
            <div className="flex justify-between">
              <dt className="text-gray-500">Polygons generated</dt>
              <dd className="text-gray-900 font-medium" data-testid="stat-polygons">{stats.polygon_count}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Holes assigned</dt>
              <dd className="text-gray-900 font-medium">{course.hole_total}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Holes needing review</dt>
              <dd className="text-gray-900 font-medium">{course.hole_flagged}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Confidence (avg)</dt>
              <dd className="text-gray-900 font-medium">{fmtConfidence(stats.avg_confidence)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">Model version</dt>
              <dd className="text-gray-900 font-medium">{stats.ml_model_version ?? '—'}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-gray-500">LLM</dt>
              <dd className="text-gray-900 font-medium">{stats.llm_model ?? '—'}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  )
}
