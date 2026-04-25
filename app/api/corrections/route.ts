import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { db } from '@/lib/db'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type CourseRef = { id: string }

type CorrectionRow = {
  id: string
  feature_id: string | null
  course_id: string
  correction_type: string
  original_hole_number: number | null
  corrected_hole_number: number | null
  original_feature_type: string | null
  corrected_feature_type: string | null
  has_geometry_snapshot: boolean
  snapshot_area_sqm: number | null
  notes: string | null
  created_at: Date
  corrected_by_id: string
  corrected_by_email: string
  corrected_by_name: string
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const courseId = searchParams.get('courseId')
  if (!courseId) {
    return NextResponse.json(
      { error: 'courseId query param is required' },
      { status: 400 },
    )
  }
  if (!UUID_RE.test(courseId)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Enforce org isolation via courses.org_id before any correction read.
  const course = await db.$queryRaw<CourseRef[]>`
    SELECT id
    FROM courses
    WHERE id = ${courseId}::uuid
      AND org_id = ${session.user.orgId}::uuid
      AND deleted_at IS NULL
    LIMIT 1
  `
  if (course.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // Geometry snapshot metadata — expose presence + area (m²) rather than the
  // full MultiPolygon payload so the audit feed stays cheap. Callers that need
  // the full geometry can re-fetch a specific correction later.
  const rows = await db.$queryRaw<CorrectionRow[]>`
    SELECT
      c.id,
      c.feature_id,
      c.course_id,
      c.correction_type,
      c.original_hole_number,
      c.corrected_hole_number,
      c.original_feature_type::text       AS original_feature_type,
      c.corrected_feature_type::text      AS corrected_feature_type,
      (c.original_geometry IS NOT NULL)   AS has_geometry_snapshot,
      CASE
        WHEN c.original_geometry IS NULL THEN NULL
        ELSE ST_Area(c.original_geometry::geography)::float
      END                                 AS snapshot_area_sqm,
      c.notes,
      c.created_at,
      u.id                                AS corrected_by_id,
      u.email                             AS corrected_by_email,
      u.name                              AS corrected_by_name
    FROM corrections c
    JOIN users u ON u.id = c.corrected_by
    WHERE c.course_id = ${courseId}::uuid
    ORDER BY c.created_at DESC
  `

  return NextResponse.json({
    corrections: rows.map((r) => ({
      id: r.id,
      feature_id: r.feature_id,
      course_id: r.course_id,
      correction_type: r.correction_type,
      original_hole_number: r.original_hole_number,
      corrected_hole_number: r.corrected_hole_number,
      original_feature_type: r.original_feature_type,
      corrected_feature_type: r.corrected_feature_type,
      has_geometry_snapshot: r.has_geometry_snapshot,
      snapshot_area_sqm: r.snapshot_area_sqm,
      notes: r.notes,
      created_at: r.created_at.toISOString(),
      corrected_by: {
        id: r.corrected_by_id,
        email: r.corrected_by_email,
        name: r.corrected_by_name,
      },
    })),
  })
}
