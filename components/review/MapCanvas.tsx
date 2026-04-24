'use client'

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import maplibregl, { type Map as MapLibreMap, type LngLatBoundsLike } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'

// PRD 2b §5.2 polygon colour palette (distinct from overview §6.2).
const FILL_COLOURS: Record<string, string> = {
  green:        '#1e8449',
  fairway:      '#a9dfbf',
  tee_box:      '#f4d03f',
  bunker:       '#d4a76a',
  water_hazard: '#2e86c1',
}

const OPACITY_BY_TYPE: Record<string, number> = {
  green:        0.55,
  fairway:      0.50,
  tee_box:      0.65,
  bunker:       0.60,
  water_hazard: 0.55,
}

type Props = {
  featureCollection: GeoJSON.FeatureCollection | null
  bbox: GeoJSON.Polygon | null
  selectedHoleNumber: number | null
  selectedFeatureId: string | null
  onFeatureClick: (featureId: string | null) => void
}

export type MapCanvasHandle = {
  fitToHole: (holeNumber: number | null) => void
  fitToCourse: () => void
}

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
    layers: [{ id: 'base-tiles', type: 'raster', source: 'base-tiles' }],
  }
}

function bboxFromPolygon(polygon: GeoJSON.Polygon | null): LngLatBoundsLike | null {
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

function bboxFromFeatures(
  fc: GeoJSON.FeatureCollection | null,
  predicate: (f: GeoJSON.Feature) => boolean,
): LngLatBoundsLike | null {
  if (!fc) return null
  let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity
  let any = false
  for (const f of fc.features) {
    if (!predicate(f)) continue
    const geom = f.geometry
    if (!geom) continue
    const visit = (coords: unknown): void => {
      if (typeof coords === 'number') return
      if (Array.isArray(coords)) {
        if (coords.length > 0 && typeof coords[0] === 'number') {
          const [lng, lat] = coords as [number, number]
          if (Number.isFinite(lng) && Number.isFinite(lat)) {
            minLng = Math.min(minLng, lng)
            maxLng = Math.max(maxLng, lng)
            minLat = Math.min(minLat, lat)
            maxLat = Math.max(maxLat, lat)
            any = true
          }
          return
        }
        for (const c of coords) visit(c)
      }
    }
    visit((geom as { coordinates?: unknown }).coordinates)
  }
  if (!any) return null
  return [[minLng, minLat], [maxLng, maxLat]]
}

const MapCanvas = forwardRef<MapCanvasHandle, Props>(function MapCanvas(
  { featureCollection, bbox, selectedHoleNumber, selectedFeatureId, onFeatureClick },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const onFeatureClickRef = useRef(onFeatureClick)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    onFeatureClickRef.current = onFeatureClick
  }, [onFeatureClick])

  // Empty FC placeholder so layers exist even before data lands.
  const emptyFC = useMemo<GeoJSON.FeatureCollection>(
    () => ({ type: 'FeatureCollection', features: [] }),
    [],
  )

  // Map init
  useEffect(() => {
    if (!containerRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(token),
      center: [0, 0],
      zoom: 2,
    })
    mapRef.current = map

    map.on('load', () => {
      // Polygon sources + layers
      map.addSource('review-polygons', { type: 'geojson', data: emptyFC })

      // Fill: dim others, full colour for active hole, slightly brighter for selected.
      map.addLayer({
        id: 'review-polygons-fill',
        type: 'fill',
        source: 'review-polygons',
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
          'fill-opacity': [
            'case',
            ['==', ['get', 'is_selected_hole'], true],
            [
              'match',
              ['get', 'feature_type'],
              'green',        OPACITY_BY_TYPE.green,
              'fairway',      OPACITY_BY_TYPE.fairway,
              'tee_box',      OPACITY_BY_TYPE.tee_box,
              'bunker',       OPACITY_BY_TYPE.bunker,
              'water_hazard', OPACITY_BY_TYPE.water_hazard,
              0.5,
            ],
            0.2,
          ],
        },
      })

      map.addLayer({
        id: 'review-polygons-outline',
        type: 'line',
        source: 'review-polygons',
        paint: {
          'line-color': [
            'case',
            ['==', ['get', 'is_selected_feature'], true], '#ffffff',
            ['==', ['get', 'is_selected_hole'], true], '#2563eb',
            '#ffffff',
          ],
          'line-width': [
            'case',
            ['==', ['get', 'is_selected_feature'], true], 3,
            ['==', ['get', 'is_selected_hole'], true], 2,
            0.6,
          ],
          'line-opacity': [
            'case',
            ['==', ['get', 'is_selected_hole'], true], 1,
            0.4,
          ],
        },
      })

      // Hole-number labels at polygon centroids (green preferred, else first hole polygon).
      map.addSource('review-hole-labels', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: 'review-hole-labels',
        type: 'symbol',
        source: 'review-hole-labels',
        layout: {
          'text-field': ['concat', 'H', ['get', 'hole_number']],
          'text-size': 12,
          'text-font': ['Open Sans Semibold', 'Arial Unicode MS Bold'],
          'text-allow-overlap': false,
        },
        paint: {
          'text-color': '#ffffff',
          'text-halo-color': '#111827',
          'text-halo-width': 1.5,
        },
      })

      // Feature click handler is wired in the effect below so it always
      // sees the latest `onFeatureClick` reference. Here we only handle
      // the empty-background click (deselect).
      map.on('click', (e) => {
        const hits = map.queryRenderedFeatures(e.point, { layers: ['review-polygons-fill'] })
        if (hits.length === 0) onFeatureClickRef.current(null)
      })
      map.on('mouseenter', 'review-polygons-fill', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'review-polygons-fill', () => {
        map.getCanvas().style.cursor = ''
      })

      setReady(true)
    })

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Polygon click handler — uses a ref so re-renders don't tear down.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const handler = (e: maplibregl.MapLayerMouseEvent) => {
      const f = e.features?.[0]
      const id = (f?.properties as { id?: string } | null)?.id ?? null
      onFeatureClickRef.current(id)
    }
    map.on('click', 'review-polygons-fill', handler)
    return () => {
      map.off('click', 'review-polygons-fill', handler)
    }
  }, [ready])

  // Push polygon data + selection flags
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready) return
    const src = map.getSource('review-polygons') as maplibregl.GeoJSONSource | undefined
    if (!src) return

    const fc = featureCollection ?? emptyFC
    const annotated: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: fc.features.map((f) => {
        const props = (f.properties ?? {}) as {
          hole_number?: number | null
          id?: string
        }
        return {
          ...f,
          properties: {
            ...props,
            is_selected_hole:
              selectedHoleNumber != null && props.hole_number === selectedHoleNumber,
            is_selected_feature:
              selectedFeatureId != null && props.id === selectedFeatureId,
          },
        } as GeoJSON.Feature
      }),
    }
    src.setData(annotated)

    // Labels: one per hole, using approximate centroid of its green polygon
    // (fall back to the first polygon we see for that hole).
    const byHole = new Map<number, GeoJSON.Feature>()
    for (const f of fc.features) {
      const props = (f.properties ?? {}) as { hole_number?: number | null; feature_type?: string }
      if (props.hole_number == null) continue
      const existing = byHole.get(props.hole_number)
      if (!existing) {
        byHole.set(props.hole_number, f)
      } else {
        const ex = (existing.properties as { feature_type?: string }).feature_type
        if (ex !== 'green' && props.feature_type === 'green') {
          byHole.set(props.hole_number, f)
        }
      }
    }
    const labelFeatures: GeoJSON.Feature[] = []
    for (const [holeNumber, f] of byHole) {
      const [lng, lat] = approximateCentroid(f.geometry)
      if (!Number.isFinite(lng) || !Number.isFinite(lat)) continue
      labelFeatures.push({
        type: 'Feature',
        properties: { hole_number: holeNumber },
        geometry: { type: 'Point', coordinates: [lng, lat] },
      })
    }
    const labelsSrc = map.getSource('review-hole-labels') as maplibregl.GeoJSONSource | undefined
    labelsSrc?.setData({ type: 'FeatureCollection', features: labelFeatures })
  }, [ready, featureCollection, selectedHoleNumber, selectedFeatureId, emptyFC])

  // Fit to bbox once on initial data load.
  const didFitRef = useRef(false)
  useEffect(() => {
    const map = mapRef.current
    if (!map || !ready || didFitRef.current) return
    const bounds = bboxFromPolygon(bbox)
    if (!bounds) return
    map.fitBounds(bounds, { padding: 32, animate: false })
    didFitRef.current = true
  }, [ready, bbox])

  useImperativeHandle(ref, () => ({
    fitToHole(holeNumber) {
      const map = mapRef.current
      if (!map || !featureCollection || holeNumber == null) return
      const bounds = bboxFromFeatures(featureCollection, (f) => {
        const props = (f.properties ?? {}) as { hole_number?: number | null }
        return props.hole_number === holeNumber
      })
      if (!bounds) return
      map.fitBounds(bounds, { padding: 64, duration: 400 })
    },
    fitToCourse() {
      const map = mapRef.current
      if (!map) return
      const bounds = bboxFromPolygon(bbox) ??
        bboxFromFeatures(featureCollection, () => true)
      if (!bounds) return
      map.fitBounds(bounds, { padding: 32, duration: 400 })
    },
  }), [bbox, featureCollection])

  return <div ref={containerRef} className="w-full h-full" data-testid="review-map" />
})

// Simple centroid — averages all coordinate pairs. Good enough for label placement.
function approximateCentroid(geom: GeoJSON.Geometry): [number, number] {
  let sumLng = 0, sumLat = 0, count = 0
  const visit = (coords: unknown): void => {
    if (typeof coords === 'number') return
    if (Array.isArray(coords)) {
      if (coords.length > 0 && typeof coords[0] === 'number') {
        const [lng, lat] = coords as [number, number]
        if (Number.isFinite(lng) && Number.isFinite(lat)) {
          sumLng += lng
          sumLat += lat
          count++
        }
        return
      }
      for (const c of coords) visit(c)
    }
  }
  visit((geom as { coordinates?: unknown }).coordinates)
  if (count === 0) return [NaN, NaN]
  return [sumLng / count, sumLat / count]
}

export default MapCanvas
