'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Map as MapLibreMap } from 'maplibre-gl'
import HoleList, { type HoleSummary } from './HoleList'
import MapCanvas, { type MapCanvasHandle } from './MapCanvas'
import Inspector, { type InspectorFeature } from './Inspector'
import DrawMode from '@/components/map/DrawMode'
import DeletePolygonDialog from './DeletePolygonDialog'

type LockInfo = {
  locked_by: string | null
  locker_name: string | null
  locker_email: string | null
  locked_at: string | null
}

type Props = {
  courseId: string
  courseName: string
  currentUserId: string
  initialHoles: HoleSummary[]
  topologyByHoleId: Record<string, {
    has_green: boolean
    has_tee: boolean
    has_fairway: boolean
    has_bunker: boolean
  }>
  initialLock: LockInfo
}

type HoleFeatureResponse = {
  hole: {
    id: string
    hole_number: number
    assignment_confidence: number | null
    needs_review: boolean
    confirmed: boolean
  }
  features: InspectorFeature[]
  topology: {
    has_green: boolean
    has_tee: boolean
    has_fairway: boolean
    has_bunker: boolean
  }
}

export default function ReviewWorkspace({
  courseId,
  courseName,
  currentUserId,
  initialHoles,
  topologyByHoleId,
  initialLock,
}: Props) {
  const [holes] = useState<HoleSummary[]>(initialHoles)
  const [selectedHoleId, setSelectedHoleId] = useState<string | null>(() => {
    const flagged = initialHoles.find((h) => h.needs_review && !h.confirmed)
    if (flagged) return flagged.id
    return initialHoles[0]?.id ?? null
  })
  const [selectedFeatureId, setSelectedFeatureId] = useState<string | null>(null)
  const [featureCollection, setFeatureCollection] = useState<GeoJSON.FeatureCollection | null>(null)
  const [bbox, setBbox] = useState<GeoJSON.Polygon | null>(null)

  const [holeFeatures, setHoleFeatures] = useState<InspectorFeature[]>([])
  const [holeFeaturesLoading, setHoleFeaturesLoading] = useState(false)

  const [mapInstance, setMapInstance] = useState<MapLibreMap | null>(null)
  const [drawModeActive, setDrawModeActive] = useState(false)
  const [deleteDialogFeature, setDeleteDialogFeature] = useState<InspectorFeature | null>(null)

  const [lockState, setLockState] = useState<
    | { status: 'idle' | 'acquiring' | 'acquired' | 'released' }
    | { status: 'conflict'; lockedBy: { name: string; email: string; lockedAt: string } }
    | { status: 'error'; message: string }
  >(() => {
    if (
      initialLock.locked_by &&
      initialLock.locked_by !== currentUserId
    ) {
      return {
        status: 'conflict',
        lockedBy: {
          name: initialLock.locker_name ?? 'another reviewer',
          email: initialLock.locker_email ?? '',
          lockedAt: initialLock.locked_at ?? '',
        },
      }
    }
    return { status: 'idle' }
  })

  const mapRef = useRef<MapCanvasHandle>(null)

  const selectedHole = useMemo(
    () => holes.find((h) => h.id === selectedHoleId) ?? null,
    [holes, selectedHoleId],
  )

  const selectedTopology = selectedHoleId ? topologyByHoleId[selectedHoleId] ?? null : null

  // Acquire lock on mount. Release on unmount.
  useEffect(() => {
    let cancelled = false
    if (lockState.status === 'conflict') return

    setLockState({ status: 'acquiring' })
    fetch(`/api/courses/${courseId}/lock`, { method: 'POST' })
      .then(async (res) => {
        if (cancelled) return
        if (res.status === 409) {
          const body = await res.json().catch(() => ({}))
          setLockState({
            status: 'conflict',
            lockedBy: {
              name: body?.lockedBy?.name ?? 'another reviewer',
              email: body?.lockedBy?.email ?? '',
              lockedAt: body?.lockedBy?.lockedAt ?? '',
            },
          })
          return
        }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setLockState({ status: 'error', message: body?.error ?? `Lock failed (${res.status})` })
          return
        }
        setLockState({ status: 'acquired' })
      })
      .catch((err) => {
        if (cancelled) return
        setLockState({ status: 'error', message: err instanceof Error ? err.message : 'Lock failed' })
      })

    return () => {
      cancelled = true
      // Best-effort release — sendBeacon if the browser supports it since
      // this fires on unmount/navigation.
      try {
        if (typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
          // fetch with keepalive works for DELETE; sendBeacon is POST-only.
          fetch(`/api/courses/${courseId}/lock`, {
            method: 'DELETE',
            keepalive: true,
          })
        } else {
          fetch(`/api/courses/${courseId}/lock`, { method: 'DELETE' })
        }
      } catch {
        /* ignore */
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId])

  // GeoJSON loader — used both on mount and after a successful correction so
  // the map reflects the new hole assignment / type immediately.
  const refreshGeoJSON = useCallback(() => {
    let cancelled = false
    fetch(`/api/courses/${courseId}/features/geojson`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load features (${r.status})`)
        return r.json()
      })
      .then((data: { features: GeoJSON.FeatureCollection; bbox: GeoJSON.Polygon | null }) => {
        if (cancelled) return
        setFeatureCollection(data.features)
        setBbox(data.bbox)
      })
      .catch(() => {
        /* swallow — map still renders empty */
      })
    return () => {
      cancelled = true
    }
  }, [courseId])

  useEffect(() => {
    return refreshGeoJSON()
  }, [refreshGeoJSON])

  // Load selected hole detail. holeFeaturesVersion is bumped after a successful
  // correction to force a refetch (so feature_type / hole_number reflect the
  // newly written state without an optimistic update).
  const [holeFeaturesVersion, setHoleFeaturesVersion] = useState(0)
  useEffect(() => {
    if (!selectedHoleId) {
      setHoleFeatures([])
      return
    }
    let cancelled = false
    setHoleFeaturesLoading(true)
    fetch(`/api/courses/${courseId}/holes/${selectedHoleId}`)
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to load hole (${r.status})`)
        return r.json() as Promise<HoleFeatureResponse>
      })
      .then((data) => {
        if (cancelled) return
        setHoleFeatures(data.features)
        setHoleFeaturesLoading(false)
      })
      .catch(() => {
        if (cancelled) return
        setHoleFeatures([])
        setHoleFeaturesLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [courseId, selectedHoleId, holeFeaturesVersion])

  const onReassignSuccess = useCallback(
    (newHoleId: string) => {
      // Polygon now belongs to a different hole — switch to it so the
      // Inspector and map both stay focused on the moved feature.
      setSelectedHoleId(newHoleId)
      setSelectedFeatureId(null)
      refreshGeoJSON()
    },
    [refreshGeoJSON],
  )

  const onTypeChangeSuccess = useCallback(() => {
    setHoleFeaturesVersion((v) => v + 1)
    refreshGeoJSON()
  }, [refreshGeoJSON])

  const onRequestDeleteFeature = useCallback((feature: InspectorFeature) => {
    setDeleteDialogFeature(feature)
  }, [])

  const onDeleteSuccess = useCallback(() => {
    setDeleteDialogFeature(null)
    setSelectedFeatureId(null)
    if (drawModeActive) setDrawModeActive(false)
    setHoleFeaturesVersion((v) => v + 1)
    refreshGeoJSON()
  }, [drawModeActive, refreshGeoJSON])

  // Exit draw mode if the selected feature clears. Otherwise DrawMode would
  // keep editing a feature that is no longer in focus.
  useEffect(() => {
    if (!selectedFeatureId && drawModeActive) setDrawModeActive(false)
  }, [selectedFeatureId, drawModeActive])

  const selectedFeatureGeometry = useMemo<GeoJSON.MultiPolygon | GeoJSON.Polygon | null>(() => {
    if (!selectedFeatureId || !featureCollection) return null
    const match = featureCollection.features.find(
      (f) => (f.properties as { id?: string } | null)?.id === selectedFeatureId,
    )
    const geom = match?.geometry
    if (!geom) return null
    if (geom.type === 'MultiPolygon' || geom.type === 'Polygon') {
      return geom as GeoJSON.MultiPolygon | GeoJSON.Polygon
    }
    return null
  }, [featureCollection, selectedFeatureId])

  const onDrawSaved = useCallback(() => {
    setDrawModeActive(false)
    setHoleFeaturesVersion((v) => v + 1)
    refreshGeoJSON()
  }, [refreshGeoJSON])

  // Deselect feature when switching holes
  useEffect(() => {
    setSelectedFeatureId(null)
  }, [selectedHoleId])

  const onSelectHole = useCallback((holeId: string) => {
    setSelectedHoleId(holeId)
  }, [])

  const onFeatureClick = useCallback((featureId: string | null) => {
    if (featureId == null) {
      setSelectedFeatureId(null)
      return
    }
    // Find hole for this feature in the FC so clicking a feature on another
    // hole switches holes + selects the feature.
    setFeatureCollection((fc) => {
      if (!fc) return fc
      const hit = fc.features.find((f) => (f.properties as { id?: string } | null)?.id === featureId)
      if (hit) {
        const holeNumber = (hit.properties as { hole_number?: number | null } | null)?.hole_number ?? null
        if (holeNumber != null) {
          const targetHole = holes.find((h) => h.hole_number === holeNumber)
          if (targetHole && targetHole.id !== selectedHoleId) {
            setSelectedHoleId(targetHole.id)
          }
        }
      }
      return fc
    })
    setSelectedFeatureId(featureId)
  }, [holes, selectedHoleId])

  // Keyboard shortcuts — ↑/↓ nav, F fit-to-hole, C fit-to-course, Escape deselect.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return
      switch (e.key) {
        case 'ArrowDown': {
          e.preventDefault()
          const idx = holes.findIndex((h) => h.id === selectedHoleId)
          if (idx >= 0 && idx < holes.length - 1) setSelectedHoleId(holes[idx + 1].id)
          break
        }
        case 'ArrowUp': {
          e.preventDefault()
          const idx = holes.findIndex((h) => h.id === selectedHoleId)
          if (idx > 0) setSelectedHoleId(holes[idx - 1].id)
          break
        }
        case 'f':
        case 'F': {
          e.preventDefault()
          const hole = holes.find((h) => h.id === selectedHoleId) ?? null
          mapRef.current?.fitToHole(hole?.hole_number ?? null)
          break
        }
        case 'c':
        case 'C': {
          e.preventDefault()
          mapRef.current?.fitToCourse()
          break
        }
        case 'Escape': {
          if (drawModeActive) break
          if (deleteDialogFeature) break
          setSelectedFeatureId(null)
          break
        }
        case 'd':
        case 'D': {
          if (selectedFeatureId && selectedFeatureGeometry) {
            e.preventDefault()
            setDrawModeActive((v) => !v)
          }
          break
        }
        case 'Delete':
        case 'Backspace': {
          if (!selectedFeatureId) break
          if (drawModeActive) break
          if (deleteDialogFeature) break
          const hit = holeFeatures.find((f) => f.id === selectedFeatureId)
          if (!hit) break
          e.preventDefault()
          setDeleteDialogFeature(hit)
          break
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [holes, holeFeatures, selectedHoleId, selectedFeatureId, selectedFeatureGeometry, drawModeActive, deleteDialogFeature])

  // Re-center on hole when the user changes selection.
  useEffect(() => {
    const hole = holes.find((h) => h.id === selectedHoleId) ?? null
    if (!hole) return
    mapRef.current?.fitToHole(hole.hole_number)
  }, [holes, selectedHoleId])

  if (lockState.status === 'conflict') {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50">
        <div className="max-w-md bg-white border border-amber-200 rounded-lg p-6 shadow-sm">
          <h2 className="text-base font-semibold text-gray-900">Course locked</h2>
          <p className="text-sm text-gray-700 mt-2">
            <strong>{courseName}</strong> is being reviewed by{' '}
            <strong>{lockState.lockedBy.name || lockState.lockedBy.email || 'another reviewer'}</strong>.
            The lock auto-releases after 2 hours of inactivity.
          </p>
          <div className="mt-4 flex gap-2">
            <a
              href={`/dashboard/courses/${courseId}/overview`}
              className="px-3 py-1.5 text-sm rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Back to course
            </a>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-3 py-1.5 text-sm rounded-md bg-gray-900 text-white hover:bg-gray-800"
            >
              Try again
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex overflow-hidden">
      <HoleList
        holes={holes}
        selectedHoleId={selectedHoleId}
        onSelect={onSelectHole}
      />

      <div className="flex-1 relative bg-gray-100">
        <MapCanvas
          ref={mapRef}
          featureCollection={featureCollection}
          bbox={bbox}
          selectedHoleNumber={selectedHole?.hole_number ?? null}
          selectedFeatureId={selectedFeatureId}
          onFeatureClick={onFeatureClick}
          onMapReady={setMapInstance}
        />

        {drawModeActive && selectedFeatureId && selectedFeatureGeometry && (
          <DrawMode
            map={mapInstance}
            feature={{ id: selectedFeatureId, geometry: selectedFeatureGeometry }}
            onSaved={onDrawSaved}
            onCancel={() => setDrawModeActive(false)}
          />
        )}

        <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => mapRef.current?.fitToHole(selectedHole?.hole_number ?? null)}
            disabled={!selectedHole}
            className="px-2.5 py-1.5 text-xs rounded-md bg-white/95 border border-gray-300 text-gray-700 hover:bg-white shadow-sm disabled:opacity-50"
            title="Fit to selected hole (F)"
            data-testid="fit-to-hole"
          >
            Fit to hole (F)
          </button>
          <button
            type="button"
            onClick={() => mapRef.current?.fitToCourse()}
            className="px-2.5 py-1.5 text-xs rounded-md bg-white/95 border border-gray-300 text-gray-700 hover:bg-white shadow-sm"
            title="Fit to course (C)"
            data-testid="fit-to-course"
          >
            Fit to course (C)
          </button>
        </div>

        {lockState.status === 'error' && (
          <div className="absolute top-3 left-3 z-10 bg-red-50 border border-red-200 rounded-md px-3 py-1.5 text-xs text-red-800 shadow-sm">
            Lock error: {lockState.message}
          </div>
        )}
      </div>

      <Inspector
        hole={selectedHole}
        features={holeFeatures}
        topology={selectedTopology}
        holes={holes}
        selectedFeatureId={selectedFeatureId}
        onSelectFeature={(id) => setSelectedFeatureId(id)}
        onReassignSuccess={onReassignSuccess}
        onTypeChangeSuccess={onTypeChangeSuccess}
        onRequestDeleteFeature={onRequestDeleteFeature}
        loading={holeFeaturesLoading}
      />

      {deleteDialogFeature && (
        <DeletePolygonDialog
          feature={deleteDialogFeature}
          onCancel={() => setDeleteDialogFeature(null)}
          onSuccess={onDeleteSuccess}
        />
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
