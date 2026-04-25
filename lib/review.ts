import { db } from './db'

// Single-reviewer lock per course. PRD 2b §13 Decision 15.
// - Lock lives on courses.locked_by + courses.locked_at.
// - Auto-release after 2 hours of inactivity.
export const LOCK_TTL_MS = 2 * 60 * 60 * 1000

export type LockRow = {
  id: string
  locked_by: string | null
  locked_at: Date | null
  locker_email: string | null
  locker_name: string | null
}

export type AcquireLockResult =
  | { ok: true; lockedAt: Date }
  | { ok: false; conflict: true; lockedBy: { id: string; email: string; name: string; lockedAt: Date } }

export async function getLock(courseId: string, orgId: string): Promise<LockRow | null> {
  const rows = await db.$queryRaw<LockRow[]>`
    SELECT c.id,
           c.locked_by,
           c.locked_at,
           u.email AS locker_email,
           u.name  AS locker_name
    FROM courses c
    LEFT JOIN users u ON u.id = c.locked_by
    WHERE c.id = ${courseId}::uuid
      AND c.org_id = ${orgId}::uuid
      AND c.deleted_at IS NULL
    LIMIT 1
  `
  return rows[0] ?? null
}

// Acquire the lock atomically: succeed if (a) no lock, (b) lock held by same user, or
// (c) existing lock is older than LOCK_TTL_MS. Returns 409-equivalent result otherwise.
export async function acquireLock(
  courseId: string,
  orgId: string,
  userId: string,
): Promise<AcquireLockResult> {
  // LOCK_TTL_MS is a fixed 2h constant — inline the interval rather than
  // templating it (Prisma raw templating would bind as bigint and require
  // awkward text casts).
  const updated = await db.$queryRaw<{ locked_at: Date }[]>`
    UPDATE courses
    SET locked_by = ${userId}::uuid,
        locked_at = NOW()
    WHERE id = ${courseId}::uuid
      AND org_id = ${orgId}::uuid
      AND deleted_at IS NULL
      AND (
        locked_by IS NULL
        OR locked_by = ${userId}::uuid
        OR locked_at < NOW() - INTERVAL '2 hours'
      )
    RETURNING locked_at
  `

  if (updated.length > 0) {
    return { ok: true, lockedAt: updated[0].locked_at }
  }

  // Conflict — surface who holds it.
  const current = await getLock(courseId, orgId)
  if (!current || !current.locked_by || !current.locked_at) {
    // Race: lock was released after our UPDATE. Retry once.
    const retry = await db.$queryRaw<{ locked_at: Date }[]>`
      UPDATE courses
      SET locked_by = ${userId}::uuid,
          locked_at = NOW()
      WHERE id = ${courseId}::uuid
        AND org_id = ${orgId}::uuid
        AND deleted_at IS NULL
        AND locked_by IS NULL
      RETURNING locked_at
    `
    if (retry.length > 0) return { ok: true, lockedAt: retry[0].locked_at }
    return {
      ok: false,
      conflict: true,
      lockedBy: { id: '', email: '', name: '', lockedAt: new Date() },
    }
  }

  return {
    ok: false,
    conflict: true,
    lockedBy: {
      id: current.locked_by,
      email: current.locker_email ?? '',
      name: current.locker_name ?? '',
      lockedAt: current.locked_at,
    },
  }
}

// Release only if the caller currently holds it. No-op (returns 0) otherwise.
export async function releaseLock(
  courseId: string,
  orgId: string,
  userId: string,
): Promise<number> {
  return db.$executeRaw`
    UPDATE courses
    SET locked_by = NULL,
        locked_at = NULL
    WHERE id = ${courseId}::uuid
      AND org_id = ${orgId}::uuid
      AND locked_by = ${userId}::uuid
  `
}

// -------------------------------------------------------------------
// Review state
// -------------------------------------------------------------------

export type HoleReviewRow = {
  id: string
  hole_number: number
  par: number | null
  confidence: number | null
  needs_review: boolean
  confirmed: boolean
  polygon_count: number
  has_green: boolean
  has_tee: boolean
  has_fairway: boolean
  has_bunker: boolean
}

export async function listHolesForReview(courseId: string): Promise<HoleReviewRow[]> {
  return db.$queryRaw<HoleReviewRow[]>`
    SELECT
      h.id,
      h.hole_number,
      h.par,
      h.confidence::float AS confidence,
      h.needs_review,
      h.confirmed,
      COALESCE(f.polygon_count, 0)::int  AS polygon_count,
      COALESCE(f.has_green,    false)    AS has_green,
      COALESCE(f.has_tee,      false)    AS has_tee,
      COALESCE(f.has_fairway,  false)    AS has_fairway,
      COALESCE(f.has_bunker,   false)    AS has_bunker
    FROM holes h
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int                                           AS polygon_count,
        BOOL_OR(feature_type = 'green')                         AS has_green,
        BOOL_OR(feature_type = 'tee_box')                       AS has_tee,
        BOOL_OR(feature_type = 'fairway')                       AS has_fairway,
        BOOL_OR(feature_type = 'bunker')                        AS has_bunker
      FROM features
      WHERE hole_id = h.id
    ) f ON TRUE
    WHERE h.course_id = ${courseId}::uuid
    ORDER BY h.hole_number
  `
}

export type HoleFeatureRow = {
  id: string
  feature_type: string
  area_sqm: number | null
  confidence: number | null
  reviewed: boolean
  hole_id: string | null
  hole_number: number | null
}

export async function listFeaturesForHole(holeId: string): Promise<HoleFeatureRow[]> {
  return db.$queryRaw<HoleFeatureRow[]>`
    SELECT
      f.id,
      f.feature_type::text       AS feature_type,
      f.area_sqm::float          AS area_sqm,
      f.confidence::float        AS confidence,
      f.reviewed,
      f.hole_id,
      h.hole_number
    FROM features f
    LEFT JOIN holes h ON h.id = f.hole_id
    WHERE f.hole_id = ${holeId}::uuid
    ORDER BY f.feature_type, f.area_sqm DESC NULLS LAST
  `
}

export async function getHoleForCourse(
  courseId: string,
  holeId: string,
): Promise<{ id: string; hole_number: number; confidence: number | null; needs_review: boolean; confirmed: boolean } | null> {
  const rows = await db.$queryRaw<
    { id: string; hole_number: number; confidence: number | null; needs_review: boolean; confirmed: boolean }[]
  >`
    SELECT id,
           hole_number,
           confidence::float AS confidence,
           needs_review,
           confirmed
    FROM holes
    WHERE id = ${holeId}::uuid
      AND course_id = ${courseId}::uuid
    LIMIT 1
  `
  return rows[0] ?? null
}
