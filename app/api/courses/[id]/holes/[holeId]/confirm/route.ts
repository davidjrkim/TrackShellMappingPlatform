import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getHoleForMutation, isLockedByOther } from '@/lib/corrections'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  _req: Request,
  { params }: { params: { id: string; holeId: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!UUID_RE.test(params.id) || !UUID_RE.test(params.holeId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const hole = await getHoleForMutation(
    params.holeId,
    params.id,
    session.user.orgId,
  )
  if (!hole) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (isLockedByOther(hole.locked_by, hole.locked_at, session.user.id)) {
    return NextResponse.json(
      { error: 'Course is locked by another reviewer' },
      { status: 409 },
    )
  }

  // Correction row first, hole + feature updates second, in the same
  // transaction. corrections.feature_id is nullable — this is a hole-scoped
  // event, not a feature mutation, so leave it NULL and record hole identity
  // via original_hole_number.
  await db.$transaction([
    db.$executeRaw`
      INSERT INTO corrections (
        id, feature_id, course_id, correction_type,
        original_hole_number, corrected_by
      ) VALUES (
        gen_random_uuid(),
        NULL,
        ${hole.course_id}::uuid,
        'hole_confirmed',
        ${hole.hole_number},
        ${session.user.id}::uuid
      )
    `,
    db.$executeRaw`
      UPDATE holes
      SET needs_review = false,
          confirmed = true,
          confirmation_type = 'manual'::hole_confirmation_type_enum
      WHERE id = ${hole.id}::uuid
    `,
    db.$executeRaw`
      UPDATE features
      SET reviewed = true
      WHERE hole_id = ${hole.id}::uuid
    `,
  ])

  return NextResponse.json({
    hole: {
      id: hole.id,
      course_id: hole.course_id,
      hole_number: hole.hole_number,
      needs_review: false,
      confirmed: true,
      confirmation_type: 'manual',
    },
  })
}
