'use client'

import { useEffect, useRef, useState } from 'react'
import maplibregl, { type Map as MapLibreMap, type MapMouseEvent } from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { BoundingBox } from '@/lib/spatial'

type Props = {
  value?: BoundingBox | null
  onChange: (bbox: BoundingBox | null) => void
  initialCenter?: [number, number]
  initialZoom?: number
}

const SOURCE_ID = 'bbox-source'
const FILL_ID = 'bbox-fill'
const OUTLINE_ID = 'bbox-outline'

function bboxToPolygon(b: BoundingBox): GeoJSON.Feature<GeoJSON.Polygon> {
  return {
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'Polygon',
      coordinates: [[
        [b.west, b.south],
        [b.east, b.south],
        [b.east, b.north],
        [b.west, b.north],
        [b.west, b.south],
      ]],
    },
  }
}

function buildStyle(token: string | undefined): maplibregl.StyleSpecification {
  const tileUrl = token
    ? `https://api.mapbox.com/v4/mapbox.satellite/{z}/{x}/{y}@2x.webp?access_token=${token}`
    : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
  return {
    version: 8,
    sources: {
      'base-tiles': { type: 'raster', tiles: [tileUrl], tileSize: 256 },
    },
    layers: [{ id: 'base-tiles', type: 'raster', source: 'base-tiles' }],
  }
}

export default function BoundingBoxPicker({
  value,
  onChange,
  initialCenter = [126.9780, 37.5665],
  initialZoom = 10,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MapLibreMap | null>(null)
  const draftStartRef = useRef<{ lng: number; lat: number } | null>(null)
  const draftRef = useRef<BoundingBox | null>(null)
  const valueRef = useRef<BoundingBox | null>(value ?? null)
  const [drawing, setDrawing] = useState(false)

  useEffect(() => { valueRef.current = value ?? null }, [value])

  useEffect(() => {
    if (!containerRef.current) return
    const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: buildStyle(token),
      center: initialCenter,
      zoom: initialZoom,
    })
    mapRef.current = map

    map.on('load', () => {
      map.addSource(SOURCE_ID, {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
      })
      map.addLayer({
        id: FILL_ID,
        type: 'fill',
        source: SOURCE_ID,
        paint: { 'fill-color': '#f59e0b', 'fill-opacity': 0.2 },
      })
      map.addLayer({
        id: OUTLINE_ID,
        type: 'line',
        source: SOURCE_ID,
        paint: { 'line-color': '#f59e0b', 'line-width': 2 },
      })
      if (valueRef.current) renderBbox(valueRef.current)
    })

    function renderBbox(b: BoundingBox | null) {
      const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
      if (!src) return
      if (!b) {
        src.setData({ type: 'FeatureCollection', features: [] })
      } else {
        src.setData({ type: 'FeatureCollection', features: [bboxToPolygon(b)] })
      }
    }

    // Drawing: in "drawing" mode, panning is disabled; mousedown starts a
    // rectangle, mousemove rubber-bands, mouseup commits.
    function onMouseDown(e: MapMouseEvent) {
      if (!drawingNowRef.current) return
      map.dragPan.disable()
      draftStartRef.current = { lng: e.lngLat.lng, lat: e.lngLat.lat }
    }
    function onMouseMove(e: MapMouseEvent) {
      if (!drawingNowRef.current || !draftStartRef.current) return
      const s = draftStartRef.current
      const bbox: BoundingBox = {
        west: Math.min(s.lng, e.lngLat.lng),
        east: Math.max(s.lng, e.lngLat.lng),
        south: Math.min(s.lat, e.lngLat.lat),
        north: Math.max(s.lat, e.lngLat.lat),
      }
      draftRef.current = bbox
      renderBbox(bbox)
    }
    function onMouseUp() {
      if (!draftStartRef.current) return
      draftStartRef.current = null
      map.dragPan.enable()
      drawingNowRef.current = false
      setDrawing(false)
      map.getCanvas().style.cursor = ''
      if (draftRef.current) onChange(draftRef.current)
    }

    map.on('mousedown', onMouseDown)
    map.on('mousemove', onMouseMove)
    map.on('mouseup', onMouseUp)

    return () => {
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Use a ref for the `drawing` flag so the handlers (bound once) see
  // the latest value without re-running the whole effect.
  const drawingNowRef = useRef(false)
  useEffect(() => { drawingNowRef.current = drawing }, [drawing])

  // External value changes should update the overlay.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    if (!src) return
    if (!value) src.setData({ type: 'FeatureCollection', features: [] })
    else src.setData({ type: 'FeatureCollection', features: [bboxToPolygon(value)] })
  }, [value])

  function startDrawing() {
    const map = mapRef.current
    if (!map) return
    drawingNowRef.current = true
    setDrawing(true)
    map.getCanvas().style.cursor = 'crosshair'
    onChange(null)
    const src = map.getSource(SOURCE_ID) as maplibregl.GeoJSONSource | undefined
    src?.setData({ type: 'FeatureCollection', features: [] })
  }

  function clearBox() {
    onChange(null)
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={startDrawing}
          className="px-3 py-1.5 text-sm rounded-md bg-gray-900 text-white font-medium hover:bg-gray-800 transition-colors"
          data-testid="bbox-draw"
        >
          {drawing ? 'Click-drag on map…' : value ? 'Redraw box' : 'Draw box'}
        </button>
        {value && (
          <button
            type="button"
            onClick={clearBox}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
          >
            Clear
          </button>
        )}
        {value && (
          <span className="text-xs text-gray-500 font-mono">
            W {value.west.toFixed(4)} / S {value.south.toFixed(4)} / E {value.east.toFixed(4)} / N {value.north.toFixed(4)}
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        className="w-full h-[380px] rounded-md border border-gray-200 overflow-hidden"
        data-testid="bbox-map"
      />
      <p className="text-xs text-gray-500">
        Click <strong>Draw box</strong>, then click and drag on the map to outline the course.
      </p>
    </div>
  )
}
