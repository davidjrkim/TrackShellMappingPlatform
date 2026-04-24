import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  getFeatureForMutation,
  getHoleRef,
  isLockedByOther,
} from '@/lib/corrections'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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

  const { holeId } = body as Record<string, unknown>
  if (typeof holeId !== 'string' || !UUID_RE.test(holeId)) {
    return NextResponse.json(
      { error: 'holeId must be a valid UUID' },
      { status: 400 },
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

  const newHole = await getHoleRef(holeId, feature.course_id)
  if (!newHole) {
    return NextResponse.json(
      { error: 'holeId does not belong to this course' },
      { status: 422 },
    )
  }

  // Correction row first, feature mutation second, in the same transaction —
  // PRD 2b "Every correction writes to corrections table BEFORE modifying
  // features/holes tables". $transaction with an array enforces atomic rollback
  // across both statements.
  await db.$transaction([
    db.$executeRaw`
      INSERT INTO corrections (
        id, feature_id, course_id, correction_type,
        original_hole_number, corrected_hole_number, corrected_by
      ) VALUES (
        gen_random_uuid(),
        ${feature.id}::uuid,
        ${feature.course_id}::uuid,
        'hole_reassignment',
        ${feature.hole_number},
        ${newHole.hole_number},
        ${session.user.id}::uuid
      )
    `,
    db.$executeRaw`
      UPDATE features
      SET hole_id = ${newHole.id}::uuid
      WHERE id = ${feature.id}::uuid
    `,
  ])

  return NextResponse.json({
    feature: {
      id: feature.id,
      course_id: feature.course_id,
      hole_id: newHole.id,
      hole_number: newHole.hole_number,
      feature_type: feature.feature_type,
      reviewed: feature.reviewed,
    },
  })
}
