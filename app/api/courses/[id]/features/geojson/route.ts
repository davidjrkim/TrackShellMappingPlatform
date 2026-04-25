import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { getCourseDetail, getCourseBoundingBoxGeoJSON, getCourseFeaturesGeoJSON } from '@/lib/spatial'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Full FeatureCollection for the review MapCanvas. Unlike /features (which
// bundles routing + bbox for the overview preview), this returns every
// polygon plus enough metadata to drive hole-level highlighting.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const course = await getCourseDetail(params.id, session.user.orgId)
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [features, bboxGeoJSON] = await Promise.all([
    getCourseFeaturesGeoJSON(params.id),
    getCourseBoundingBoxGeoJSON(params.id),
  ])

  const featureCollection = {
    type: 'FeatureCollection' as const,
    features: features.map((f) => ({
      type: 'Feature' as const,
      id: f.id,
      properties: {
        id: f.id,
        feature_type: f.feature_type,
        hole_number: f.hole_number,
        confidence: f.confidence,
        reviewed: f.reviewed,
      },
      geometry: JSON.parse(f.geojson),
    })),
  }

  return NextResponse.json({
    features: featureCollection,
    bbox: bboxGeoJSON ? JSON.parse(bboxGeoJSON) : null,
  })
}
