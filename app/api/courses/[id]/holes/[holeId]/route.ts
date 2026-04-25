import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCourseDetail } from '@/lib/spatial'
import { getHoleForCourse, listFeaturesForHole } from '@/lib/review'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(
  _req: Request,
  { params }: { params: { id: string; holeId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.holeId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const course = await getCourseDetail(params.id, session.user.orgId)
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const hole = await getHoleForCourse(params.id, params.holeId)
  if (!hole) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const features = await listFeaturesForHole(params.holeId)

  const topology = {
    has_green: features.some((f) => f.feature_type === 'green'),
    has_tee: features.some((f) => f.feature_type === 'tee_box'),
    has_fairway: features.some((f) => f.feature_type === 'fairway'),
    has_bunker: features.some((f) => f.feature_type === 'bunker'),
  }

  return NextResponse.json({
    hole: {
      id: hole.id,
      hole_number: hole.hole_number,
      confidence: hole.confidence,
      needs_review: hole.needs_review,
      confirmed: hole.confirmed,
    },
    features: features.map((f) => ({
      id: f.id,
      feature_type: f.feature_type,
      area_sqm: f.area_sqm,
      confidence: f.confidence,
      reviewed: f.reviewed,
      hole_id: f.hole_id,
      hole_number: f.hole_number,
    })),
    topology,
  })
}
