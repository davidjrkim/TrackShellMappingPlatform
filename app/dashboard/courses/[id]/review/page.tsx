import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCourseDetail } from '@/lib/spatial'
import { getLock, listHolesForReview } from '@/lib/review'
import ReviewWorkspace from '@/components/review/ReviewWorkspace'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function ReviewPage({ params }: { params: { id: string } }) {
  if (!UUID_RE.test(params.id)) notFound()
  const session = await getServerSession(authOptions)
  if (!session) return null

  const course = await getCourseDetail(params.id, session.user.orgId)
  if (!course) notFound()

  const [holes, lock] = await Promise.all([
    listHolesForReview(params.id),
    getLock(params.id, session.user.orgId),
  ])

  const holeSummaries = holes.map((h) => ({
    id: h.id,
    hole_number: h.hole_number,
    assignment_confidence: h.assignment_confidence,
    needs_review: h.needs_review,
    confirmed: h.confirmed,
    polygon_count: h.polygon_count,
  }))

  // Precompute topology per hole for Inspector's hole-view panel without
  // an extra request on selection.
  const topologyByHoleId: Record<string, {
    has_green: boolean
    has_tee: boolean
    has_fairway: boolean
    has_bunker: boolean
  }> = {}
  for (const h of holes) {
    topologyByHoleId[h.id] = {
      has_green: h.has_green,
      has_tee: h.has_tee,
      has_fairway: h.has_fairway,
      has_bunker: h.has_bunker,
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <header className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white flex-none">
        <div className="flex items-center gap-3">
          <Link
            href={`/dashboard/courses/${course.id}/overview`}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            ← {course.name}
          </Link>
          <span className="text-xs text-gray-400">Review</span>
        </div>
        <div className="text-xs text-gray-500">
          Status: <span className="font-medium text-gray-800">{course.status}</span>
        </div>
      </header>

      <ReviewWorkspace
        courseId={course.id}
        courseName={course.name}
        currentUserId={session.user.id}
        initialHoles={holeSummaries}
        topologyByHoleId={topologyByHoleId}
        initialLock={{
          locked_by: lock?.locked_by ?? null,
          locker_name: lock?.locker_name ?? null,
          locker_email: lock?.locker_email ?? null,
          locked_at: lock?.locked_at ? lock.locked_at.toISOString() : null,
        }}
      />
    </div>
  )
}
