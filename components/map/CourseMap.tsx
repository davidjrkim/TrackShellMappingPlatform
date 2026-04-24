'use client'

import { useEffect, useRef } from 'react'
import maplibregl, { type Map as MapLibreMap, type LngLatBoundsLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

type Props = {
  center?: [number, number]
  zoom?: number
  bounds?: LngLatBoundsLike
  className?: string
  onReady?: (map: MapLibreMap) => void
  interactive?: boolean
}

// Builds a satellite style from Mapbox tiles (PRD 2a §11). Using the raster
// tile API with a NEXT_PUBLIC_MAPBOX_TOKEN means we never ship a secret to
// the client.
function buildStyle(token: string | undefined): maplibregl.StyleSpecification {
  const tileUrl = token
    ? `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.webp?access_token=${token}`
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'

  return {
    version: 8,
    sources: {
      'base-tiles': {
        type: 'raster',
        tiles: [tileUrl],
        tileSize: 256,
        attribution: token ? '© Mapbox © DigitalGlobe' : '© OpenStreetMap',
      },
    },
    layers: [
      {
        id: 'base-tiles',
        type: 'raster',
        source: 'base-tiles',
      },
    ],
  }
}

export default function CourseMap({
  center = [0, 0],
  zoom = 14,
  bounds,
  className = 'w-full h-full',
  onReady,
  interactive = true,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(token),
      center,
      zoom,
      interactive,
    })
    mapRef.current = map

    map.on('load', () => {
      if (bounds) map.fitBounds(bounds, { padding: 24, animate: false })
      onReady?.(map)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} className={className} data-testid="course-map" />
}
