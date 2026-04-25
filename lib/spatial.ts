import { db } from './db'

// All raw PostGIS SQL lives here — never in route handlers.
// Route handlers call these helpers.

export type BoundingBox = {
  west: number
  south: number
  east: number
  north: number
}

export async function getCourseBoundingBoxGeoJSON(courseId: string): Promise<string | null> {
  const rows = await db.$queryRaw<{ geojson: string }[]>`
    SELECT ST_AsGeoJSON(bounding_box) AS geojson
    FROM courses
    WHERE id = ${courseId}::uuid
    LIMIT 1
  `
  return rows[0]?.geojson ?? null
}

export async function getCourseFeaturesGeoJSON(courseId: string) {
  return db.$queryRaw<
    {
      id: string
      feature_type: string
      hole_number: number | null
      confidence: number | null
      reviewed: boolean
      geojson: string
    }[]
  >`
    SELECT
      f.id,
      f.feature_type,
      h.hole_number,
      f.confidence,
      f.reviewed,
      ST_AsGeoJSON(f.geometry) AS geojson
    FROM features f
    LEFT JOIN holes h ON h.id = f.hole_id
    WHERE f.course_id = ${courseId}::uuid
    ORDER BY h.hole_number, f.feature_type
  `
}

export async function getCourseHoleRoutingGeoJSON(courseId: string) {
  return db.$queryRaw<
    {
      hole_number: number
      tee_lng: number
      tee_lat: number
      green_lng: number
      green_lat: number
    }[]
  >`
    SELECT hole_number,
           ST_X(tee_centroid)   AS tee_lng,
           ST_Y(tee_centroid)   AS tee_lat,
           ST_X(green_centroid) AS green_lng,
           ST_Y(green_centroid) AS green_lat
    FROM holes
    WHERE course_id = ${courseId}::uuid
      AND tee_centroid   IS NOT NULL
      AND green_centroid IS NOT NULL
    ORDER BY hole_number
  `
}

export async function findFeatureAtPoint(courseId: string, lng: number, lat: number) {
  const rows = await db.$queryRaw<{ id: string; feature_type: string; hole_number: number }[]>`
    SELECT f.id, f.feature_type, h.hole_number
    FROM features f
    JOIN holes h ON h.id = f.hole_id
    WHERE f.course_id = ${courseId}::uuid
      AND ST_Contains(f.geometry, ST_SetSRID(ST_Point(${lng}, ${lat}), 4326))
    LIMIT 1
  `
  return rows[0] ?? null
}

export async function isGeometryValid(geojson: string): Promise<{ valid: boolean; areaSqm: number }> {
  const rows = await db.$queryRaw<{ valid: boolean; area_sqm: number }[]>`
    SELECT
      ST_IsValid(ST_GeomFromGeoJSON(${geojson}))                          AS valid,
      ST_Area(ST_GeomFromGeoJSON(${geojson})::geography)                  AS area_sqm
  `
  return { valid: rows[0].valid, areaSqm: rows[0].area_sqm }
}

// -------------------------------------------------------------------
// Week 2 — Course CRUD helpers
// -------------------------------------------------------------------

export type CourseListRow = {
  id: string
  name: string
  name_local: string | null
  country: string
  region: string | null
  city: string | null
  hole_count: number
  status: string
  data_source: string
  latitude: number
  longitude: number
  ml_model_version: string | null
  updated_at: Date
  created_at: Date
  hole_total: number
  hole_flagged: number
}

export type CourseListFilters = {
  orgId: string
  search?: string
  countries?: string[]
  statuses?: string[]
  page: number
  pageSize: number
}

export async function listCourses(filters: CourseListFilters): Promise<{
  rows: CourseListRow[]
  total: number
}> {
  const { orgId, search, countries, statuses, page, pageSize } = filters
  const offset = (page - 1) * pageSize

  const searchPattern = search && search.trim().length > 0 ? `%${search.trim().toLowerCase()}%` : null
  const countryList = countries && countries.length > 0 ? countries : null
  const statusList = statuses && statuses.length > 0 ? statuses : null

  const rows = await db.$queryRaw<CourseListRow[]>`
    SELECT
      c.id,
      c.name,
      c.name_local,
      c.country,
      c.region,
      c.city,
      c.hole_count,
      c.status::text                                            AS status,
      c.data_source::text                                       AS data_source,
      c.latitude::float                                         AS latitude,
      c.longitude::float                                        AS longitude,
      c.ml_model_version,
      c.updated_at,
      c.created_at,
      COALESCE(h.hole_total, 0)::int                            AS hole_total,
      COALESCE(h.hole_flagged, 0)::int                          AS hole_flagged
    FROM courses c
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int                                         AS hole_total,
        COUNT(*) FILTER (WHERE needs_review AND NOT confirmed)::int AS hole_flagged
      FROM holes
      WHERE course_id = c.id
    ) h ON TRUE
    WHERE c.org_id = ${orgId}::uuid
      AND c.deleted_at IS NULL
      AND (${searchPattern}::text IS NULL OR (
        LOWER(c.name)               LIKE ${searchPattern}::text OR
        LOWER(COALESCE(c.name_local, '')) LIKE ${searchPattern}::text OR
        LOWER(COALESCE(c.city, ''))       LIKE ${searchPattern}::text OR
        LOWER(COALESCE(c.region, ''))     LIKE ${searchPattern}::text
      ))
      AND (${countryList}::text[] IS NULL OR c.country = ANY(${countryList}::text[]))
      AND (${statusList}::text[]  IS NULL OR c.status::text = ANY(${statusList}::text[]))
    ORDER BY c.updated_at DESC
    LIMIT ${pageSize}
    OFFSET ${offset}
  `

  const countRows = await db.$queryRaw<{ total: bigint }[]>`
    SELECT COUNT(*)::bigint AS total
    FROM courses c
    WHERE c.org_id = ${orgId}::uuid
      AND c.deleted_at IS NULL
      AND (${searchPattern}::text IS NULL OR (
        LOWER(c.name)               LIKE ${searchPattern}::text OR
        LOWER(COALESCE(c.name_local, '')) LIKE ${searchPattern}::text OR
        LOWER(COALESCE(c.city, ''))       LIKE ${searchPattern}::text OR
        LOWER(COALESCE(c.region, ''))     LIKE ${searchPattern}::text
      ))
      AND (${countryList}::text[] IS NULL OR c.country = ANY(${countryList}::text[]))
      AND (${statusList}::text[]  IS NULL OR c.status::text = ANY(${statusList}::text[]))
  `

  return { rows, total: Number(countRows[0]?.total ?? 0) }
}

export type CreateCourseInput = {
  orgId: string
  name: string
  nameLocal?: string | null
  country: string
  region?: string | null
  city?: string | null
  holeCount: number
  bbox: BoundingBox
  notes?: string | null
  dataSource: 'manual' | 'ml_pipeline' | 'imported'
}

export async function createCourse(input: CreateCourseInput): Promise<{ id: string }> {
  const {
    orgId, name, nameLocal, country, region, city, holeCount, bbox, dataSource,
  } = input
  const centerLng = (bbox.west + bbox.east) / 2
  const centerLat = (bbox.south + bbox.north) / 2

  const rows = await db.$queryRaw<{ id: string }[]>`
    INSERT INTO courses (
      id, org_id, name, name_local, country, region, city,
      latitude, longitude, bounding_box, hole_count, status, data_source
    ) VALUES (
      gen_random_uuid(),
      ${orgId}::uuid,
      ${name},
      ${nameLocal ?? null},
      ${country},
      ${region ?? null},
      ${city ?? null},
      ${centerLat},
      ${centerLng},
      ST_MakeEnvelope(${bbox.west}, ${bbox.south}, ${bbox.east}, ${bbox.north}, 4326),
      ${holeCount},
      'unmapped'::"course_status",
      ${dataSource}::"data_source_type"
    )
    RETURNING id
  `
  return { id: rows[0].id }
}

export type CourseDetail = CourseListRow & {
  bbox_geojson: string | null
  notes: string | null
  locked_by: string | null
  locked_at: Date | null
}

export async function getCourseDetail(courseId: string, orgId: string): Promise<CourseDetail | null> {
  const rows = await db.$queryRaw<CourseDetail[]>`
    SELECT
      c.id,
      c.name,
      c.name_local,
      c.country,
      c.region,
      c.city,
      c.hole_count,
      c.status::text                                            AS status,
      c.data_source::text                                       AS data_source,
      c.latitude::float                                         AS latitude,
      c.longitude::float                                        AS longitude,
      c.ml_model_version,
      c.locked_by,
      c.locked_at,
      c.updated_at,
      c.created_at,
      NULL::text                                                AS notes,
      ST_AsGeoJSON(c.bounding_box)                              AS bbox_geojson,
      COALESCE(h.hole_total, 0)::int                            AS hole_total,
      COALESCE(h.hole_flagged, 0)::int                          AS hole_flagged
    FROM courses c
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int                                         AS hole_total,
        COUNT(*) FILTER (WHERE needs_review AND NOT confirmed)::int AS hole_flagged
      FROM holes
      WHERE course_id = c.id
    ) h ON TRUE
    WHERE c.id = ${courseId}::uuid
      AND c.org_id = ${orgId}::uuid
      AND c.deleted_at IS NULL
    LIMIT 1
  `
  return rows[0] ?? null
}

export type CourseStats = {
  polygon_count: number
  flagged_count: number
  avg_confidence: number | null
  ml_model_version: string | null
  llm_model: string | null
}

export async function getCourseStats(courseId: string): Promise<CourseStats> {
  const rows = await db.$queryRaw<CourseStats[]>`
    SELECT
      (SELECT COUNT(*)::int FROM features WHERE course_id = ${courseId}::uuid) AS polygon_count,
      (SELECT COUNT(*)::int FROM holes
         WHERE course_id = ${courseId}::uuid
           AND needs_review AND NOT confirmed)                                 AS flagged_count,
      (SELECT AVG(confidence)::float FROM holes
         WHERE course_id = ${courseId}::uuid)                                  AS avg_confidence,
      (SELECT model_version FROM pipeline_jobs
         WHERE course_id = ${courseId}::uuid AND status = 'completed'
         ORDER BY completed_at DESC NULLS LAST LIMIT 1)                        AS ml_model_version,
      (SELECT llm_model     FROM pipeline_jobs
         WHERE course_id = ${courseId}::uuid AND status = 'completed'
         ORDER BY completed_at DESC NULLS LAST LIMIT 1)                        AS llm_model
  `
  return rows[0] ?? {
    polygon_count: 0,
    flagged_count: 0,
    avg_confidence: null,
    ml_model_version: null,
    llm_model: null,
  }
}

export type UpdateCourseInput = {
  name?: string
  nameLocal?: string | null
  region?: string | null
  city?: string | null
}

export async function updateCourseMetadata(
  courseId: string,
  orgId: string,
  input: UpdateCourseInput,
): Promise<number> {
  // Use $executeRaw so we can scope to org_id in the same statement,
  // and only update provided fields via COALESCE.
  const result = await db.$executeRaw`
    UPDATE courses
    SET
      name        = COALESCE(${input.name ?? null}, name),
      name_local  = CASE WHEN ${input.nameLocal === undefined}::boolean THEN name_local ELSE ${input.nameLocal ?? null} END,
      region      = CASE WHEN ${input.region === undefined}::boolean     THEN region     ELSE ${input.region ?? null} END,
      city        = CASE WHEN ${input.city === undefined}::boolean       THEN city       ELSE ${input.city ?? null} END
    WHERE id = ${courseId}::uuid
      AND org_id = ${orgId}::uuid
      AND deleted_at IS NULL
  `
  return result
}

export async function setCourseStatus(
  courseId: string,
  orgId: string,
  fromStatuses: string[],
  toStatus: string,
): Promise<number> {
  return db.$executeRaw`
    UPDATE courses
    SET status = ${toStatus}::"course_status"
    WHERE id = ${courseId}::uuid
      AND org_id = ${orgId}::uuid
      AND deleted_at IS NULL
      AND status::text = ANY(${fromStatuses}::text[])
  `
}

export async function softDeleteCourse(courseId: string, orgId: string): Promise<number> {
  return db.$executeRaw`
    UPDATE courses
    SET deleted_at = NOW()
    WHERE id = ${courseId}::uuid
      AND org_id = ${orgId}::uuid
      AND deleted_at IS NULL
  `
}
