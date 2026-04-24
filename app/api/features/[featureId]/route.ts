import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getFeatureForMutation, isLockedByOther } from '@/lib/corrections'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function DELETE(
  _req: Request,
  { params }: { params: { featureId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!UUID_RE.test(params.featureId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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

  // Snapshot geometry, feature_type, hole_number, and feature confidence_score
  // into the corrections row BEFORE the hard DELETE, inside the same
  // transaction so the audit row only lands if the DELETE also succeeds.
  // corrections.feature_id has ON DELETE SET NULL, so the snapshot survives
  // the subsequent DELETE of the feature row.
  await db.$transaction([
    db.$executeRaw`
      INSERT INTO corrections (
        id, feature_id, course_id, correction_type,
        original_hole_number, original_feature_type, original_geometry,
        corrected_by, notes
      )
      SELECT
        gen_random_uuid(),
        f.id,
        f.course_id,
        'polygon_delete',
        h.hole_number,
        f.feature_type,
        f.geometry,
        ${session.user.id}::uuid,
        json_build_object('confidence_score', f.confidence_score)::text
      FROM features f
      LEFT JOIN holes h ON h.id = f.hole_id
      WHERE f.id = ${feature.id}::uuid
    `,
    db.$executeRaw`
      DELETE FROM features
      WHERE id = ${feature.id}::uuid
    `,
  ])

  return new NextResponse(null, { status: 204 })
}
