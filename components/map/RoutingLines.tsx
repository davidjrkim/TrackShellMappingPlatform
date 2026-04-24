'use client'

import { useEffect } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'

// Hole routing: tee centroid → green centroid (PRD 2a §6.2, Decision 11)
export default function RoutingLines({
  map,
  data,
  visible,
}: {
  map: MapLibreMap | null
  data: GeoJSON.FeatureCollection | null
  visible: boolean
}) {
  useEffect(() => {
    if (!map || !data) return

    const ensure = () => {
      if (!map.getSource('course-routing')) {
        map.addSource('course-routing', { type: 'geojson', data })
        map.addLayer({
          id: 'course-routing-line',
          type: 'line',
          source: 'course-routing',
          paint: {
            'line-color': '#ffffff',
            'line-width': 1.5,
            'line-opacity': 0.9,
          },
        })
      } else {
        const src = map.getSource('course-routing') as maplibregl.GeoJSONSource
        src.setData(data)
      }

      if (map.getLayer('course-routing-line')) {
        map.setLayoutProperty('course-routing-line', 'visibility', visible ? 'visible' : 'none')
      }
    }

    if (map.loaded()) ensure()
    else map.once('load', ensure)

    return () => {
      if (!map.getStyle()) return
      if (map.getLayer('course-routing-line')) map.removeLayer('course-routing-line')
      if (map.getSource('course-routing')) map.removeSource('course-routing')
    }
  }, [map, data, visible])

  return null
}
