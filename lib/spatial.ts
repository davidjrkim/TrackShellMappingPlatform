import { db } from './db'

// All raw PostGIS SQL lives here — never in route handlers.
// Route handlers call these helpers.

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
      confidence_score: number | null
      reviewed: boolean
      geojson: string
    }[]
  >`
    SELECT
      f.id,
      f.feature_type,
      h.hole_number,
      f.confidence_score,
      f.reviewed,
      ST_AsGeoJSON(f.geometry) AS geojson
    FROM features f
    LEFT JOIN holes h ON h.id = f.hole_id
    WHERE f.course_id = ${courseId}::uuid
    ORDER BY h.hole_number, f.feature_type
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
