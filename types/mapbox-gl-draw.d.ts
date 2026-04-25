// Minimal ambient types for @mapbox/mapbox-gl-draw. The upstream package ships
// no .d.ts, and we use a narrow slice of its API (load a feature, direct_select
// mode, read back the edited geometry on draw.update).
declare module '@mapbox/mapbox-gl-draw' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyMap = any

  export interface DrawFeature {
    id: string | number
    type: 'Feature'
    properties: Record<string, unknown>
    geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon | GeoJSON.LineString | GeoJSON.Point
  }

  export interface DrawUpdateEvent {
    features: DrawFeature[]
    action: 'move' | 'change_coordinates' | 'change_properties'
  }

  export interface DrawOptions {
    displayControlsDefault?: boolean
    controls?: Record<string, boolean>
    defaultMode?: string
    keybindings?: boolean
    touchEnabled?: boolean
    boxSelect?: boolean
    clickBuffer?: number
    touchBuffer?: number
    userProperties?: boolean
    modes?: Record<string, unknown>
    styles?: Array<Record<string, unknown>>
  }

  export default class MapboxDraw {
    constructor(options?: DrawOptions)
    onAdd(map: AnyMap): HTMLElement
    onRemove(map: AnyMap): void
    add(geojson: GeoJSON.Feature | GeoJSON.FeatureCollection | GeoJSON.Geometry): Array<string | number>
    get(id: string | number): DrawFeature | undefined
    getAll(): GeoJSON.FeatureCollection
    delete(ids: string | number | Array<string | number>): MapboxDraw
    deleteAll(): MapboxDraw
    changeMode(mode: string, options?: Record<string, unknown>): MapboxDraw
    getMode(): string
    getSelectedIds(): Array<string | number>
    trash(): MapboxDraw
  }
}
