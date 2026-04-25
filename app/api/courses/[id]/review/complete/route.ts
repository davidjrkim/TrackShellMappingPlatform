import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'
import { getLock } from '@/lib/review'
import { isLockedByOther } from '@/lib/corrections'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function POST(
  req: Request,
  { params }: { params: { id: string } },
) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!UUID_RE.test(params.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Body is optional — tolerate no body, empty body, or missing notes.
  let notes: string | null = null
  try {
    const body = (await req.json()) as { notes?: unknown } | null
    if (body && typeof body.notes === 'string') {
      const trimmed = body.notes.trim()
      notes = trimmed.length > 0 ? trimmed : null
    }
  } catch {
    // no JSON body — fine
  }

  // getLock enforces org isolation (org_id + deleted_at) and returns the lock state.
  const lock = await getLock(params.id, session.user.orgId)
  if (!lock) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  if (isLockedByOther(lock.locked_by, lock.locked_at, session.user.id)) {
    return NextResponse.json(
      { error: 'Course is locked by another reviewer' },
      { status: 409 },
    )
  }

  // Sign-off gate: any flagged hole that hasn't been confirmed blocks sign-off.
  const blocking = await db.$queryRaw<{ hole_number: number }[]>`
    SELECT hole_number
    FROM holes
    WHERE course_id = ${params.id}::uuid
      AND needs_review = true
      AND confirmed = false
    ORDER BY hole_number
  `
  if (blocking.length > 0) {
    return NextResponse.json(
      {
        error: 'Cannot sign off — flagged holes remain',
        blocking_holes: blocking.map((h) => h.hole_number),
      },
      { status: 400 },
    )
  }

  // Atomic sign-off: corrections summary row first, then auto-confirm remaining
  // (high-confidence, non-flagged) holes, mark their features reviewed, flip
  // courses.status = 'reviewed', and release the lock — all in one transaction.
  await db.$transaction([
    db.$executeRaw`
      INSERT INTO corrections (
        id, feature_id, course_id, correction_type, notes, corrected_by
      ) VALUES (
        gen_random_uuid(),
        NULL,
        ${params.id}::uuid,
        'course_signoff',
        ${notes},
        ${session.user.id}::uuid
      )
    `,
    db.$executeRaw`
      UPDATE features
      SET reviewed = true
      WHERE course_id = ${params.id}::uuid
        AND hole_id IN (
          SELECT id FROM holes
          WHERE course_id = ${params.id}::uuid
            AND confirmed = false
        )
    `,
    db.$executeRaw`
      UPDATE holes
      SET confirmed = true,
          confirmation_type = 'auto'::hole_confirmation_type_enum
      WHERE course_id = ${params.id}::uuid
        AND confirmed = false
    `,
    db.$executeRaw`
      UPDATE courses
      SET status = 'reviewed'::course_status,
          locked_by = NULL,
          locked_at = NULL
      WHERE id = ${params.id}::uuid
        AND org_id = ${session.user.orgId}::uuid
        AND deleted_at IS NULL
    `,
  ])

  return NextResponse.json({
    course: {
      id: params.id,
      status: 'reviewed',
    },
    notes,
  })
}
