'use client'

import { useEffect } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'

// PRD 2a §6.2 colour palette
const FILL_COLOURS: Record<string, string> = {
  green:        '#0f7a3e',
  fairway:      '#8fd18b',
  tee_box:      '#f0d364',
  bunker:       '#d9c79a',
  water_hazard: '#3a7bd5',
}

export default function PolygonLayer({
  map,
  data,
}: {
  map: MapLibreMap | null
  data: GeoJSON.FeatureCollection | null
}) {
  useEffect(() => {
    if (!map || !data) return

    const ensure = () => {
      if (map.getSource('course-polygons')) {
        const src = map.getSource('course-polygons') as maplibregl.GeoJSONSource
        src.setData(data)
        return
      }

      map.addSource('course-polygons', {
        type: 'geojson',
        data,
      })

      map.addLayer({
        id: 'course-polygons-fill',
        type: 'fill',
        source: 'course-polygons',
        paint: {
          'fill-color': [
            'match',
            ['get', 'feature_type'],
            'green',        FILL_COLOURS.green,
            'fairway',      FILL_COLOURS.fairway,
            'tee_box',      FILL_COLOURS.tee_box,
            'bunker',       FILL_COLOURS.bunker,
            'water_hazard', FILL_COLOURS.water_hazard,
            /* other */     '#888',
          ],
          'fill-opacity': 0.55,
        },
      })

      map.addLayer({
        id: 'course-polygons-outline',
        type: 'line',
        source: 'course-polygons',
        paint: {
          'line-color': '#ffffff',
          'line-width': 0.8,
          'line-opacity': 0.9,
        },
      })
    }

    if (map.loaded()) ensure()
    else map.once('load', ensure)

    return () => {
      if (!map.getStyle()) return
      if (map.getLayer('course-polygons-outline')) map.removeLayer('course-polygons-outline')
      if (map.getLayer('course-polygons-fill')) map.removeLayer('course-polygons-fill')
      if (map.getSource('course-polygons')) map.removeSource('course-polygons')
    }
  }, [map, data])

  return null
}
