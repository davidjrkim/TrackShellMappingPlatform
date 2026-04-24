'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import MapboxDraw, { type DrawUpdateEvent } from '@mapbox/mapbox-gl-draw'
import '@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css'
import maplibregl, { type Map as MapLibreMap } from 'maplibre-gl'

type Props = {
  map: MapLibreMap | null
  feature: {
    id: string
    geometry: GeoJSON.MultiPolygon | GeoJSON.Polygon
  }
  onSaved: () => void
  onCancel: () => void
}

// Mapbox GL Draw was written for Mapbox GL JS. MapLibre is API-compatible but
// names its canvas element "maplibregl-canvas" while Draw looks for the
// "mapboxgl-canvas" class on pointer events (src/events.js). Tagging the
// canvas element with the Mapbox class while Draw is mounted is the minimal
// shim needed to unblock direct_select vertex drags.
const MAPBOX_CANVAS_CLASS = 'mapboxgl-canvas'

function toMultiPolygon(geom: GeoJSON.Geometry): GeoJSON.MultiPolygon | null {
  if (geom.type === 'MultiPolygon') return geom
  if (geom.type === 'Polygon') {
    return { type: 'MultiPolygon', coordinates: [geom.coordinates] }
  }
  return null
}

export default function DrawMode({ map, feature, onSaved, onCancel }: Props) {
  const drawRef = useRef<MapboxDraw | null>(null)
  const workingGeometryRef = useRef<GeoJSON.MultiPolygon>(
    toMultiPolygon(feature.geometry) ?? { type: 'MultiPolygon', coordinates: [] },
  )
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Mount MapboxDraw and load the selected feature into direct_select mode
  // so its vertices are immediately draggable.
  useEffect(() => {
    if (!map) return

    const canvas = map.getCanvas()
    const addedCanvasClass = !canvas.classList.contains(MAPBOX_CANVAS_CLASS)
    if (addedCanvasClass) canvas.classList.add(MAPBOX_CANVAS_CLASS)

    const draw = new MapboxDraw({
      displayControlsDefault: false,
      controls: {},
      keybindings: false,
    })
    drawRef.current = draw

    // MapLibre addControl signature matches Mapbox GL; the Draw control calls
    // map.getContainer / map.boxZoom / map.addSource internally, all of which
    // MapLibre v4 supports.
    map.addControl(draw as unknown as maplibregl.IControl)

    const seed: GeoJSON.Feature = {
      type: 'Feature',
      properties: {},
      geometry: workingGeometryRef.current,
    }
    const ids = draw.add(seed)
    const drawId = ids[0]
    if (drawId != null) {
      try {
        draw.changeMode('direct_select', { featureId: drawId })
      } catch {
        /* some builds disallow direct_select on MultiPolygon — stay in simple_select */
      }
    }

    const handleUpdate = (e: DrawUpdateEvent) => {
      const f = e.features[0]
      if (!f?.geometry) return
      const mp = toMultiPolygon(f.geometry as GeoJSON.Geometry)
      if (mp) workingGeometryRef.current = mp
    }
    // maplibre's event types don't know about 'draw.update' — cast via unknown
    // so we can subscribe to the custom Draw event without widening the
    // map reference to any.
    const mapEvt = map as unknown as {
      on: (type: string, listener: (e: DrawUpdateEvent) => void) => void
      off: (type: string, listener: (e: DrawUpdateEvent) => void) => void
    }
    mapEvt.on('draw.update', handleUpdate)

    return () => {
      mapEvt.off('draw.update', handleUpdate)
      try {
        map.removeControl(draw as unknown as maplibregl.IControl)
      } catch {
        /* ignore — map may already be torn down */
      }
      if (addedCanvasClass) canvas.classList.remove(MAPBOX_CANVAS_CLASS)
      drawRef.current = null
    }
  }, [map, feature.id])

  const apply = useCallback(async () => {
    if (submitting) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await fetch(`/api/features/${feature.id}/geometry`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ geometry: workingGeometryRef.current }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message =
          (body && typeof body === 'object' && 'error' in body && typeof body.error === 'string'
            ? body.error
            : null) ?? `Save failed (${res.status})`
        setError(message)
        return
      }
      onSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSubmitting(false)
    }
  }, [feature.id, onSaved, submitting])

  // Enter = apply, Escape = cancel. Ignore when focus is in an input.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      if (e.key === 'Enter') {
        e.preventDefault()
        void apply()
      } else if (e.key === 'Escape') {
        e.preventDefault()
        if (!submitting) onCancel()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [apply, onCancel, submitting])

  return (
    <div
      className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-1.5"
      data-testid="draw-mode-toolbar"
    >
      <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-white/95 border border-gray-300 shadow-sm">
        <span className="text-xs text-gray-600">
          Drag vertices to edit the polygon. Press <kbd className="font-mono">Enter</kbd> to save,{' '}
          <kbd className="font-mono">Esc</kbd> to cancel.
        </span>
        <button
          type="button"
          onClick={apply}
          disabled={submitting}
          className="px-2.5 py-1 text-xs rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500"
          data-testid="draw-mode-apply"
        >
          {submitting ? 'Saving…' : 'Apply'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="px-2.5 py-1 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          data-testid="draw-mode-cancel"
        >
          Cancel
        </button>
      </div>
      {error && (
        <div
          role="alert"
          className="flex items-center gap-2 px-3 py-1.5 text-xs rounded-md bg-red-50 border border-red-200 text-red-800 shadow-sm"
          data-testid="draw-mode-error"
        >
          <span>{error}</span>
          <button
            type="button"
            onClick={apply}
            disabled={submitting}
            className="flex-none px-2 py-0.5 rounded-md border border-red-300 bg-white text-red-700 hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed"
            data-testid="draw-mode-retry"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  )
}

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}
