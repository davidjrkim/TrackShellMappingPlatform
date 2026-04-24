'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MapLibreMap, LngLatBoundsLike } from 'maplibre-gl'
import CourseMap from './CourseMap'
import PolygonLayer from './PolygonLayer'
import RoutingLines from './RoutingLines'

type Props = {
  courseId: string
  fallbackCenter: [number, number]
}

type FeaturesResponse = {
  polygons: GeoJSON.FeatureCollection
  routing: GeoJSON.FeatureCollection
  bbox: GeoJSON.Polygon | null
}

function bboxFromPolygon(polygon: GeoJSON.Polygon): LngLatBoundsLike | null {
  if (!polygon || polygon.type !== 'Polygon') return null
  const coords = polygon.coordinates?.[0]
  if (!coords || coords.length < 2) return null
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng)
    maxLng = Math.max(maxLng, lng)
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
  }
  return [[minLng, minLat], [maxLng, maxLat]]
}

export default function CoursePreviewMap({ courseId, fallbackCenter }: Props) {
  const [map, setMap] = useState<MapLibreMap | null>(null)
  const [data, setData] = useState<FeaturesResponse | null>(null)
  const [showRouting, setShowRouting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true
    fetch(`/api/courses/${courseId}/features`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed (${r.status})`)
        return r.json()
      })
      .then(setData)
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
  }, [courseId])

  const bounds = useMemo(() => (data?.bbox ? bboxFromPolygon(data.bbox) : null), [data])

  // Fit to bbox once data lands.
  useEffect(() => {
    if (!map || !bounds) return
    map.fitBounds(bounds, { padding: 24, animate: false })
  }, [map, bounds])

  return (
    <div className="relative w-full h-[420px] rounded-md overflow-hidden border border-gray-200 bg-gray-100">
      <CourseMap
        center={fallbackCenter}
        zoom={14}
        onReady={setMap}
      />
      <PolygonLayer map={map} data={data?.polygons ?? null} />
      <RoutingLines map={map} data={data?.routing ?? null} visible={showRouting} />

      {data && (data.routing.features.length > 0) && (
        <label className="absolute top-3 right-3 z-10 bg-white/95 rounded-md border border-gray-200 px-2 py-1 text-xs font-medium text-gray-700 flex items-center gap-1.5 shadow-sm">
          <input
            type="checkbox"
            checked={showRouting}
            onChange={(e) => setShowRouting(e.target.checked)}
            data-testid="toggle-routing"
          />
          Routing lines
        </label>
      )}

      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-sm text-red-700">
          {error}
        </div>
      )}
    </div>
  )
}
