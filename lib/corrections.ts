import { db } from './db'
import { LOCK_TTL_MS } from './review'

// Helpers for the correction (Week 6) mutation endpoints. Every mutation
// route must load the feature + owning course under the session's org and
// check the lock before writing anything. The actual correction insert +
// feature mutation must run in the same Prisma transaction — these helpers
// supply the preflight data only.

export type FeatureForMutation = {
  id: string
  course_id: string
  hole_id: string | null
  feature_type: string
  confidence_score: number | null
  reviewed: boolean
  org_id: string
  locked_by: string | null
  locked_at: Date | null
  hole_number: number | null
}

export async function getFeatureForMutation(
  featureId: string,
  orgId: string,
): Promise<FeatureForMutation | null> {
  const rows = await db.$queryRaw<FeatureForMutation[]>`
    SELECT
      f.id,
      f.course_id,
      f.hole_id,
      f.feature_type::text            AS feature_type,
      f.confidence_score::float       AS confidence_score,
      f.reviewed,
      c.org_id,
      c.locked_by,
      c.locked_at,
      h.hole_number
    FROM features f
    JOIN courses c ON c.id = f.course_id
    LEFT JOIN holes h ON h.id = f.hole_id
    WHERE f.id = ${featureId}::uuid
      AND c.org_id = ${orgId}::uuid
      AND c.deleted_at IS NULL
    LIMIT 1
  `
  return rows[0] ?? null
}

// Returns true when the course is locked by a *different* user and the lock
// has not yet auto-expired. Mirrors the 2-hour TTL in lib/review.ts so a
// stale lock doesn't wedge correction endpoints.
export function isLockedByOther(
  lockedBy: string | null,
  lockedAt: Date | null,
  userId: string,
): boolean {
  if (!lockedBy || !lockedAt) return false
  if (lockedBy === userId) return false
  if (Date.now() - lockedAt.getTime() > LOCK_TTL_MS) return false
  return true
}

export type HoleRef = {
  id: string
  hole_number: number
  course_id: string
}

export async function getHoleRef(
  holeId: string,
  courseId: string,
): Promise<HoleRef | null> {
  const rows = await db.$queryRaw<HoleRef[]>`
    SELECT id, hole_number, course_id
    FROM holes
    WHERE id = ${holeId}::uuid
      AND course_id = ${courseId}::uuid
    LIMIT 1
  `
  return rows[0] ?? null
}
