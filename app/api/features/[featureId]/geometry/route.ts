import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getFeatureForMutation, isLockedByOther } from '@/lib/corrections'
import { isGeometryValid } from '@/lib/spatial'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MIN_AREA_SQM = 20

export async function PATCH(
  req: Request,
  { params }: { params: { featureId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!UUID_RE.test(params.featureId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { geometry } = body as Record<string, unknown>
  if (
    typeof geometry !== 'object' ||
    geometry === null ||
    (geometry as { type?: unknown }).type !== 'MultiPolygon' ||
    !Array.isArray((geometry as { coordinates?: unknown }).coordinates)
  ) {
    return NextResponse.json(
      { error: 'geometry must be a GeoJSON MultiPolygon' },
      { status: 400 },
    )
  }

  const geojson = JSON.stringify(geometry)

  const feature = await getFeatureForMutation(params.featureId, session.user.orgId)
  if (!feature) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (isLockedByOther(feature.locked_by, feature.locked_at, session.user.id)) {
    return NextResponse.json(
      { error: 'Course is locked by another reviewer' },
      { status: 409 },
    )
  }

  const { valid, areaSqm } = await isGeometryValid(geojson)
  if (!valid) {
    return NextResponse.json(
      { error: 'Geometry is not valid' },
      { status: 422 },
    )
  }
  if (areaSqm < MIN_AREA_SQM) {
    return NextResponse.json(
      { error: `Geometry area ${areaSqm.toFixed(2)} m² is below minimum ${MIN_AREA_SQM} m²` },
      { status: 422 },
    )
  }

  // Snapshot prior geometry into corrections.original_geometry BEFORE the
  // UPDATE, both in the same Prisma transaction so a failed UPDATE rolls back
  // the audit row (and vice versa). PRD 2b — corrections audit row must be
  // written before the feature mutation.
  await db.$transaction([
    db.$executeRaw`
      INSERT INTO corrections (
        id, feature_id, course_id, correction_type,
        original_geometry, corrected_by
      )
      SELECT
        gen_random_uuid(),
        f.id,
        f.course_id,
        'geometry_edit',
        f.geometry,
        ${session.user.id}::uuid
      FROM features f
      WHERE f.id = ${feature.id}::uuid
    `,
    db.$executeRaw`
      UPDATE features
      SET geometry = ST_Multi(ST_GeomFromGeoJSON(${geojson}))
      WHERE id = ${feature.id}::uuid
    `,
  ])

  return NextResponse.json({
    feature: {
      id: feature.id,
      course_id: feature.course_id,
      hole_id: feature.hole_id,
      hole_number: feature.hole_number,
      feature_type: feature.feature_type,
      reviewed: feature.reviewed,
    },
  })
}
