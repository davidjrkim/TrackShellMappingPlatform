import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { FeatureType } from '@prisma/client'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getFeatureForMutation, isLockedByOther } from '@/lib/corrections'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const FEATURE_TYPES = Object.values(FeatureType) as string[]

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

  const { featureType } = body as Record<string, unknown>
  if (typeof featureType !== 'string') {
    return NextResponse.json(
      { error: 'featureType is required' },
      { status: 400 },
    )
  }
  if (!FEATURE_TYPES.includes(featureType)) {
    return NextResponse.json(
      { error: `Invalid featureType. Must be one of: ${FEATURE_TYPES.join(', ')}` },
      { status: 422 },
    )
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

  if (feature.feature_type === featureType) {
    return NextResponse.json(
      { error: 'featureType is unchanged' },
      { status: 422 },
    )
  }

  // Correction row first, feature mutation second, in the same transaction —
  // PRD 2b "Every correction writes to corrections table BEFORE modifying
  // features/holes tables". $transaction with an array enforces atomic rollback.
  await db.$transaction([
    db.$executeRaw`
      INSERT INTO corrections (
        id, feature_id, course_id, correction_type,
        original_feature_type, corrected_feature_type, corrected_by
      ) VALUES (
        gen_random_uuid(),
        ${feature.id}::uuid,
        ${feature.course_id}::uuid,
        'type_change',
        ${feature.feature_type}::feature_type_enum,
        ${featureType}::feature_type_enum,
        ${session.user.id}::uuid
      )
    `,
    db.$executeRaw`
      UPDATE features
      SET feature_type = ${featureType}::feature_type_enum
      WHERE id = ${feature.id}::uuid
    `,
  ])

  return NextResponse.json({
    feature: {
      id: feature.id,
      course_id: feature.course_id,
      hole_id: feature.hole_id,
      hole_number: feature.hole_number,
      feature_type: featureType,
      reviewed: feature.reviewed,
    },
  })
}
