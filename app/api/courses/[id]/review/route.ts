import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCourseDetail } from '@/lib/spatial'
import { getLock, listHolesForReview } from '@/lib/review'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const course = await getCourseDetail(params.id, session.user.orgId)
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [holes, lock] = await Promise.all([
    listHolesForReview(params.id),
    getLock(params.id, session.user.orgId),
  ])

  const totalHoles = holes.length
  const confirmedCount = holes.filter((h) => h.confirmed).length
  const flaggedRemaining = holes.filter((h) => h.needs_review && !h.confirmed).length

  return NextResponse.json({
    course: {
      id: course.id,
      name: course.name,
      status: course.status,
      hole_count: course.hole_count,
    },
    lock: {
      locked_by: lock?.locked_by ?? null,
      locked_at: lock?.locked_at ?? null,
      locker_email: lock?.locker_email ?? null,
      locker_name: lock?.locker_name ?? null,
    },
    progress: {
      total: totalHoles,
      confirmed: confirmedCount,
      flagged_remaining: flaggedRemaining,
    },
    holes: holes.map((h) => ({
      id: h.id,
      hole_number: h.hole_number,
      par: h.par,
      assignment_confidence: h.assignment_confidence,
      needs_review: h.needs_review,
      confirmed: h.confirmed,
      polygon_count: h.polygon_count,
      topology: {
        has_green: h.has_green,
        has_tee: h.has_tee,
        has_fairway: h.has_fairway,
        has_bunker: h.has_bunker,
      },
    })),
  })
}
