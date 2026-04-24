import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import {
  getCourseBoundingBoxGeoJSON,
  getCourseDetail,
  getCourseFeaturesGeoJSON,
  getCourseHoleRoutingGeoJSON,
} from '@/lib/spatial'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!UUID_RE.test(params.id)) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Org scope — returning feature data for a course must verify ownership first.
  const course = await getCourseDetail(params.id, session.user.orgId)
  if (!course) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [features, routing, bboxGeoJSON] = await Promise.all([
    getCourseFeaturesGeoJSON(params.id),
    getCourseHoleRoutingGeoJSON(params.id),
    getCourseBoundingBoxGeoJSON(params.id),
  ])

  const polygonCollection = {
    type: 'FeatureCollection' as const,
    features: features.map((f) => ({
      type: 'Feature' as const,
      id: f.id,
      properties: {
        id: f.id,
        feature_type: f.feature_type,
        hole_number: f.hole_number,
        confidence_score: f.confidence_score,
        reviewed: f.reviewed,
      },
      geometry: JSON.parse(f.geojson),
    })),
  }

  const routingCollection = {
    type: 'FeatureCollection' as const,
    features: routing.map((r) => ({
      type: 'Feature' as const,
      properties: { hole_number: r.hole_number },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          [Number(r.tee_lng), Number(r.tee_lat)],
          [Number(r.green_lng), Number(r.green_lat)],
        ],
      },
    })),
  }

  const bbox = bboxGeoJSON ? JSON.parse(bboxGeoJSON) : null

  return NextResponse.json({
    polygons: polygonCollection,
    routing: routingCollection,
    bbox,
  })
}
