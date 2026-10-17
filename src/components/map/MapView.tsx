import { useEffect, useRef, useState } from 'react'
import { authHeaders } from '@/auth'
import maplibregl, { type Map as MLMap, type MapMouseEvent, type StyleSpecification } from 'maplibre-gl'
import { useNavigate } from 'react-router-dom'
import { provider, type MapLayers } from '@/data'
import { useUi, type BasemapId, type TitleColour } from '@/store/ui'
import { BasemapControl } from './BasemapControl'
import { MapLegend } from './MapLegend'
import { MapToolbar, streetViewUrl } from './MapToolbar'
import { DrawPanel } from './DrawPanel'
import { LocationAnalysis } from './LocationAnalysis'
import { SECTOR_COLOURS, OWNER_CATEGORY_COLOURS } from '@/lib/sectors'
import { circlePolygon } from '@/lib/geo'

const osKey = () => useUi.getState().osKey || (import.meta.env.VITE_OS_API_KEY as string | undefined)

const SAT_SOURCE = { type: 'raster' as const, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics', maxzoom: 19 }
const REF_SOURCE = { type: 'raster' as const, tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}', 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, maxzoom: 19 }
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'

/** Resolve the user's basemap choice; "Streets" follows the light or dark theme. */
export function effectiveBasemap(b: BasemapId, dark: boolean): BasemapId {
  if ((b === 'os-light' || b === 'os-road') && !osKey()) return dark ? 'dark' : 'light'
  if (b === 'light' && dark) return 'dark'
  return b
}
export const isImagery = (b: BasemapId) => b === 'satellite' || b === 'hybrid'

function baseStyle(basemap: BasemapId, dark = false): string | StyleSpecification {
  const b = effectiveBasemap(basemap, dark)
  if (b === 'satellite' || b === 'hybrid') {
    return {
      version: 8,
      glyphs: GLYPHS,
      sources: b === 'hybrid' ? { sat: SAT_SOURCE, ref: { ...REF_SOURCE, tiles: [REF_SOURCE.tiles[0]] }, roads: { ...REF_SOURCE, tiles: [REF_SOURCE.tiles[1]] } } : { sat: SAT_SOURCE },
      layers: b === 'hybrid' ? [{ id: 'sat', type: 'raster', source: 'sat' }, { id: 'roads', type: 'raster', source: 'roads', paint: { 'raster-opacity': 0.9 } }, { id: 'ref', type: 'raster', source: 'ref' }] : [{ id: 'sat', type: 'raster', source: 'sat' }],
    }
  }
  if (b === 'os-light' || b === 'os-road') {
    return {
      version: 8,
      glyphs: GLYPHS,
      sources: { os: { type: 'raster', tiles: [`https://api.os.uk/maps/raster/v1/zxy/${b === 'os-road' ? 'Road_3857' : 'Light_3857'}/{z}/{x}/{y}.png?key=${osKey()}`], tileSize: 256, attribution: 'Contains OS data © Crown copyright and database right 2026', maxzoom: 20 } },
      layers: [{ id: 'os', type: 'raster', source: 'os' }],
    }
  }
  if (b === 'minimal') return 'https://tiles.openfreemap.org/styles/positron'
  return b === 'dark' ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/liberty'
}

const EMPTY = { type: 'FeatureCollection', features: [] } as const
/** Match a POI dot when any of its clustered ids is in the list. */
const poiIdFilter = (ids: string[]): maplibregl.FilterSpecification => (ids.length ? (['any', ...ids.map((id) => ['in', id, ['coalesce', ['get', 'ids'], ['literal', []]]])] as unknown as maplibregl.FilterSpecification) : ['==', ['get', 'id'], '__none__'])

/** Used when the basemap style cannot be fetched (offline, corporate proxy): data layers still render on a neutral canvas. */
const blankStyle = (dark: boolean): StyleSpecification => ({
  version: 8,
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': dark ? '#161b26' : '#e9edf2' } }],
})
const isDark = () => document.documentElement.classList.contains('dark')

const sectorMatch = ['match', ['get', 'sector'], ...Object.entries(SECTOR_COLOURS).flatMap(([k, v]) => [k, v]), '#64748b'] as unknown as maplibregl.ExpressionSpecification
const ownerMatch = ['match', ['get', 'category'], ...Object.entries(OWNER_CATEGORY_COLOURS).flatMap(([k, v]) => [k, v]), '#64748b'] as unknown as maplibregl.ExpressionSpecification
const CONSTRAINT_COLOURS: Record<string, string> = {
  'Flood Zone 3': '#1d4ed8',
  'Flood Zone 2': '#60a5fa',
  'Conservation Area': '#b45309',
  'Listed Building': '#be123c',
  'Green Belt': '#15803d',
  'Article 4': '#7c3aed',
  SSSI: '#0f766e',
  AONB: '#4d7c0f',
  TPO: '#65a30d',
  'Brownfield Register': '#78350f',
  'Scheduled Monument': '#9f1239',
  'National Park': '#166534',
  'Ancient Woodland': '#3f6212',
}
const constraintMatch = ['match', ['get', 'kind'], ...Object.entries(CONSTRAINT_COLOURS).flatMap(([k, v]) => [k, v]), '#64748b'] as unknown as maplibregl.ExpressionSpecification
const FOOTFALL_RAMP = ['interpolate', ['linear'], ['get', 'band'], 1, '#fef3c7', 3, '#fcd34d', 5, '#f59e0b', 7, '#dc2626', 9, '#7f1d1d'] as unknown as maplibregl.ExpressionSpecification

function addDataLayers(map: MLMap, withLabels: boolean) {
  const src = (id: string) => {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY as never, promoteId: undefined })
  }
  ;['streets', 'buildings', 'footfall', 'constraints', 'titles', 'pricePaid', 'planning', 'traffic', 'comparables', 'poi', 'businesses', 'analysis', 'draw', 'draft', 'pin'].forEach(src)

  if (map.getLayer('footfall-fill')) return
  const dk = isDark()
  map.addLayer({ id: 'streets-casing', type: 'line', source: 'streets', paint: { 'line-color': dk ? '#2a3242' : '#cfd6e0', 'line-width': ['case', ['==', ['get', 'major'], true], 14, 9], 'line-opacity': 0.9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
  map.addLayer({ id: 'streets-fill', type: 'line', source: 'streets', paint: { 'line-color': dk ? '#3a4356' : '#ffffff', 'line-width': ['case', ['==', ['get', 'major'], true], 10, 6] }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
  if (withLabels) map.addLayer({ id: 'streets-labels', type: 'symbol', source: 'streets', layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': dk ? '#aab4c5' : '#67748c', 'text-halo-color': dk ? '#161b26' : '#fff', 'text-halo-width': 1 } })
  map.addLayer({ id: 'buildings-fill', type: 'fill', source: 'buildings', paint: { 'fill-color': dk ? '#3a4556' : '#d6dce6', 'fill-opacity': 0.55 } })
  map.addLayer({ id: 'buildings-line', type: 'line', source: 'buildings', paint: { 'line-color': dk ? '#55617a' : '#aab4c5', 'line-width': 0.5 } })
  map.addLayer({ id: 'footfall-fill', type: 'fill', source: 'footfall', paint: { 'fill-color': FOOTFALL_RAMP, 'fill-opacity': 0.42 } })
  map.addLayer({ id: 'constraints-fill', type: 'fill', source: 'constraints', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'fill-color': constraintMatch, 'fill-opacity': 0.14 } })
  map.addLayer({ id: 'constraints-line', type: 'line', source: 'constraints', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': constraintMatch, 'line-width': 1.5, 'line-dasharray': [3, 2] } })
  map.addLayer({ id: 'analysis-fill', type: 'fill', source: 'analysis', paint: { 'fill-color': '#0f766e', 'fill-opacity': 0.06 } })
  map.addLayer({ id: 'analysis-line', type: 'line', source: 'analysis', paint: { 'line-color': '#0f766e', 'line-width': 2, 'line-dasharray': [4, 3], 'line-opacity': 0.9 } })
  map.addLayer({ id: 'titles-fill', type: 'fill', source: 'titles', minzoom: 14.5, paint: { 'fill-color': '#2f64b4', 'fill-opacity': 0.07 } })
  map.addLayer({ id: 'titles-line', type: 'line', source: 'titles', minzoom: 14.5, paint: { 'line-color': '#5b7db8', 'line-width': ['interpolate', ['linear'], ['zoom'], 14.5, 0.3, 16, 0.8, 18, 1.4], 'line-opacity': 0.9 }, layout: { 'line-join': 'round' } })
  map.addLayer({ id: 'titles-distress', type: 'line', source: 'titles', minzoom: 15.5, filter: ['==', ['get', 'distress'], true], paint: { 'line-color': '#be123c', 'line-width': 1.3, 'line-dasharray': [2, 1.5], 'line-opacity': 0.9 } })
  map.addLayer({ id: 'titles-selected', type: 'line', source: 'titles', filter: ['==', ['get', 'titleNumber'], ''], paint: { 'line-color': '#0f2340', 'line-width': 2.5 } })
  map.addLayer({ id: 'constraints-points', type: 'circle', source: 'constraints', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': constraintMatch, 'circle-stroke-color': '#fff', 'circle-stroke-width': 1.5 } })
  map.addLayer({
    id: 'planning-points',
    type: 'circle',
    source: 'planning',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 3, 17, 7],
      'circle-color': ['match', ['get', 'status'], 'Pending', '#2563eb', 'Approved', '#15803d', 'Refused', '#be123c', 'Appeal Allowed', '#15803d', 'Appeal Dismissed', '#be123c', 'Withdrawn', '#9ca3af', '#64748b'],
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1.5,
    },
  })
  map.addLayer({
    id: 'traffic-points',
    type: 'circle',
    source: 'traffic',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'aadf'], 3000, 7, 25000, 16],
      'circle-color': ['case', ['>=', ['get', 'year'], 2023], '#1e3a8a', ['>=', ['get', 'year'], 2021], '#3b82f6', '#93c5fd'],
      'circle-opacity': 0.85,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 2,
    },
  })
  if (withLabels) map.addLayer({
    id: 'traffic-labels',
    type: 'symbol',
    source: 'traffic',
    minzoom: 14,
    layout: { 'text-field': ['concat', ['to-string', ['round', ['/', ['get', 'aadf'], 1000]]], 'k'], 'text-size': 10, 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true },
    paint: { 'text-color': '#fff' },
  })
  map.addLayer({ id: 'pricePaid-points', type: 'circle', source: 'pricePaid', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'price'], 100000, 3, 2000000, 9, 20000000, 14], 'circle-color': ['case', ['==', ['get', 'type'], 'O'], '#7c3aed', '#94a3b8'], 'circle-opacity': 0.6, 'circle-stroke-color': dk ? '#161b26' : '#fff', 'circle-stroke-width': 1 } })
  map.addLayer({ id: 'poi-highlight', type: 'circle', source: 'poi', minzoom: 12, filter: ['in', ['get', 'id'], ['literal', []]], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 8, 17, 13], 'circle-color': '#fde047', 'circle-opacity': 0.75, 'circle-stroke-color': '#a16207', 'circle-stroke-width': 2 } })
  // One dot per building; a building with several businesses gets a slightly larger dot and a count.
  // zoom may only drive a top-level interpolate, so the count term lives inside each stop's output
  const extra = ['min', 5, ['-', ['coalesce', ['get', 'count'], 1], 1]]
  const poiRadius = ['interpolate', ['linear'], ['zoom'], 13, 1.5, 15, ['+', 2.5, ['*', 0.6, extra]], 17, ['+', 4.5, ['*', 1.4, extra]], 19, ['+', 6, ['*', 1.8, extra]]] as unknown as maplibregl.ExpressionSpecification
  map.addLayer({ id: 'poi-points', type: 'circle', source: 'poi', minzoom: 13, paint: { 'circle-radius': poiRadius, 'circle-color': sectorMatch, 'circle-opacity': 0.9, 'circle-stroke-color': dk ? '#e5e7eb' : '#1f2937', 'circle-stroke-width': 0.8 } })
  if (withLabels) map.addLayer({ id: 'poi-count', type: 'symbol', source: 'poi', minzoom: 15.5, filter: ['>', ['coalesce', ['get', 'count'], 1], 1], layout: { 'text-field': ['to-string', ['get', 'count']], 'text-size': ['interpolate', ['linear'], ['zoom'], 15.5, 8, 18, 11], 'text-font': ['Noto Sans Bold'], 'text-allow-overlap': true, 'text-ignore-placement': true }, paint: { 'text-color': '#ffffff' } })
  if (withLabels) map.addLayer({ id: 'poi-labels', type: 'symbol', source: 'poi', minzoom: 16.5, layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-font': ['Noto Sans Regular'], 'text-offset': [0, 1], 'text-anchor': 'top', 'text-optional': true }, paint: { 'text-color': dk ? '#c3cad6' : '#4b5563', 'text-halo-color': dk ? '#161b26' : '#fff', 'text-halo-width': 1 } })
  map.addLayer({ id: 'comparables-points', type: 'circle', source: 'comparables', paint: { 'circle-radius': ['interpolate', ['linear'], ['get', 'price'], 100000, 5, 5000000, 13], 'circle-color': sectorMatch, 'circle-opacity': 0.55, 'circle-stroke-color': '#111827', 'circle-stroke-width': 1.5, 'circle-stroke-opacity': 0.8 } })
  map.addLayer({ id: 'businesses-highlight', type: 'circle', source: 'businesses', filter: ['in', ['get', 'businessId'], ['literal', []]], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 10, 17, 16], 'circle-color': '#fde047', 'circle-opacity': 0.75, 'circle-stroke-color': '#a16207', 'circle-stroke-width': 2 } })
  map.addLayer({ id: 'businesses-ring', type: 'circle', source: 'businesses', filter: ['==', ['get', 'distress'], true], paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 7, 17, 12], 'circle-color': '#be123c', 'circle-opacity': 0.35 } })
  map.addLayer({
    id: 'businesses-points',
    type: 'circle',
    source: 'businesses',
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 13, 4, 17, 8],
      'circle-color': sectorMatch,
      'circle-stroke-color': '#fff',
      'circle-stroke-width': 1.5,
    },
  })
  // User drawings (site polygons, measured lines), the in-progress draft and the dropped pin sit on top of everything.
  map.addLayer({ id: 'draw-fill', type: 'fill', source: 'draw', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.25 } })
  map.addLayer({ id: 'draw-line', type: 'line', source: 'draw', paint: { 'line-color': '#6d28d9', 'line-width': 2.5 } })
  map.addLayer({ id: 'draw-vertex', type: 'circle', source: 'draw', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 4, 'circle-color': '#fff', 'circle-stroke-color': '#6d28d9', 'circle-stroke-width': 2 } })
  map.addLayer({ id: 'draft-line', type: 'line', source: 'draft', filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': '#6d28d9', 'line-width': 2, 'line-dasharray': [2, 2] } })
  map.addLayer({ id: 'draft-fill', type: 'fill', source: 'draft', filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': '#7c3aed', 'fill-opacity': 0.15 } })
  map.addLayer({ id: 'draft-vertex', type: 'circle', source: 'draft', filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': 5, 'circle-color': '#6d28d9', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2 } })
  map.addLayer({ id: 'pin-halo', type: 'circle', source: 'pin', paint: { 'circle-radius': 14, 'circle-color': '#dc2626', 'circle-opacity': 0.25 } })
  map.addLayer({ id: 'pin-point', type: 'circle', source: 'pin', paint: { 'circle-radius': 7, 'circle-color': '#dc2626', 'circle-stroke-color': '#fff', 'circle-stroke-width': 2.5 } })
  if (withLabels) map.addLayer({
    id: 'businesses-labels',
    type: 'symbol',
    source: 'businesses',
    minzoom: 15.5,
    layout: { 'text-field': ['get', 'name'], 'text-size': 11, 'text-font': ['Noto Sans Regular'], 'text-offset': [0, 1.1], 'text-anchor': 'top', 'text-optional': true },
    paint: { 'text-color': dk ? '#f3f5f8' : '#161a23', 'text-halo-color': dk ? '#161b26' : '#fff', 'text-halo-width': 1.2 },
  })
}

export function MapView() {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<MLMap | null>(null)
  const popupRef = useRef<maplibregl.Popup | null>(null)
  const dataRef = useRef<MapLayers | null>(null)
  const nav = useNavigate()
  const layers = useUi((s) => s.layers)
  const buildingsLoadedRef = useRef(false)
  const reloadRef = useRef<(() => void) | null>(null)
  // Layers are fetched only when switched on, so switching one on fetches it for the current view.
  const serverLayerKey = (['titles', 'businesses', 'planning', 'traffic', 'footfall', 'constraints'] as const).filter((k) => (layers as Record<string, boolean>)[k]).join(',')
  useEffect(() => { reloadRef.current?.() }, [serverLayerKey])
  // Building footprints are 8 MB, so they are fetched only when the layer is first switched on.
  useEffect(() => {
    const map = mapRef.current
    if (!layers.buildings || buildingsLoadedRef.current || !map) return
    buildingsLoadedRef.current = true
    const setBuildings = (features: unknown[]) => {
      const src = map.getSource('buildings') as maplibregl.GeoJSONSource | undefined
      if (src && features.length) src.setData({ type: 'FeatureCollection', features } as never)
    }
    // Footprints for the current viewport from the database (Overture buildings where loaded).
    const b = map.getBounds()
    fetch(`/api/map/open-data?bbox=${b.getWest()},${b.getSouth()},${b.getEast()},${b.getNorth()}&buildings=1`, { credentials: 'include', headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setBuildings((d as { buildings?: { features: unknown[] } } | null)?.buildings?.features ?? []))
      .catch(() => undefined)
  }, [layers.buildings])
  const constraintKinds = useUi((s) => s.constraintKinds)
  const sectorFilter = useUi((s) => s.sectorFilter)
  const tenureFilter = useUi((s) => s.tenureFilter)
  const pricePaidFilter = useUi((s) => s.pricePaidFilter)
  const tool = useUi((s) => s.tool)
  const draft = useUi((s) => s.draft)
  const drawings = useUi((s) => s.drawings)
  const pin = useUi((s) => s.pin)
  const [basemapOpen, setBasemapOpen] = useState(false)
  const highlightIds = useUi((s) => s.highlightIds)
  const analysis = useUi((s) => s.analysis)
  const selected = useUi((s) => s.selected)
  const flyTo = useUi((s) => s.flyTo)
  const select = useUi((s) => s.select)
  const setMapView = useUi((s) => s.setMapView)
  const initialView = useRef(useUi.getState().mapView)
  const [basemapFailed, setBasemapFailed] = useState(false)
  const basemapFailedRef = useRef(false)

  // Create the map once.
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: baseStyle(useUi.getState().basemap, isDark()),
      center: [initialView.current.lon, initialView.current.lat],
      zoom: initialView.current.zoom,
      attributionControl: { compact: true },
      maxZoom: 20,
    })
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right')
    mapRef.current = map

    const load = async () => {
      const b = map.getBounds()
      const on = useUi.getState().layers as Record<string, boolean>
      const wanted = (['titles', 'businesses', 'planning', 'traffic', 'footfall', 'constraints'] as const).filter((k) => on[k])
      const data = await provider.getMapLayers({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() }, wanted)
      dataRef.current = data
      for (const k of Object.keys(data) as (keyof MapLayers)[]) {
        const s = map.getSource(k) as maplibregl.GeoJSONSource | undefined
        s?.setData(data[k] as never)
      }
    }
    let t: number | undefined
    const scheduleLoad = () => {
      window.clearTimeout(t)
      t = window.setTimeout(load, 150)
    }
    reloadRef.current = scheduleLoad
    let styleOk = false
    const fallback = () => {
      if (styleOk) return
      styleOk = true
      basemapFailedRef.current = true
      setBasemapFailed(true)
      map.setStyle(blankStyle(isDark()))
    }
    map.on('error', (e) => {
      const msg = String((e as { error?: Error }).error?.message ?? '')
      if (!styleOk && /style|fetch|tunnel|network/i.test(msg)) fallback()
    })
    const fallbackTimer = window.setTimeout(fallback, 3000)
    map.on('style.load', () => {
      styleOk = true
      window.clearTimeout(fallbackTimer)
      // Symbol layers need glyphs; on the offline fallback a failed glyph fetch would drop whole tiles, so skip labels there.
      addDataLayers(map, !basemapFailedRef.current)
      applyVisibility(map, useUi.getState().layers, useUi.getState().constraintKinds, useUi.getState().sectorFilter, basemapFailedRef.current, useUi.getState().tenureFilter, useUi.getState().pricePaidFilter)
      applyTitleStyle(map, useUi.getState().titleColour, isDark(), isImagery(effectiveBasemap(useUi.getState().basemap, isDark())) && !basemapFailedRef.current)
      {
        const a = useUi.getState().analysis
        map.setFilter('businesses-highlight', ['in', ['get', 'businessId'], ['literal', Array.from(new Set([...useUi.getState().highlightIds, ...(a?.businessIds ?? [])]))]])
        if (a) {
          ;(map.getSource('analysis') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { label: a.label }, geometry: circlePolygon(a.centre[0], a.centre[1], a.radiusM) }] } as never)
          map.setFilter('poi-highlight', poiIdFilter(a.poiIds))
        }
      }
      {
        const ui = useUi.getState()
        const feats: GeoJSON.Feature[] = []
        for (const d of ui.drawings) {
          feats.push(d.kind === 'polygon' ? { type: 'Feature', properties: { id: d.id }, geometry: { type: 'Polygon', coordinates: [[...d.coords, d.coords[0]]] } } : { type: 'Feature', properties: { id: d.id }, geometry: { type: 'LineString', coordinates: d.coords } })
          for (const c of d.coords) feats.push({ type: 'Feature', properties: { id: d.id }, geometry: { type: 'Point', coordinates: c } })
        }
        ;(map.getSource('draw') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats })
        if (ui.pin) (map.getSource('pin') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: ui.pin } }] })
      }
      if (dataRef.current) for (const k of Object.keys(dataRef.current) as (keyof MapLayers)[]) (map.getSource(k) as maplibregl.GeoJSONSource | undefined)?.setData(dataRef.current[k] as never)
      else scheduleLoad()
    })
    // Titles in view by tenure, for the Location Analysis counts.
    const countTitles = () => {
      if (!map.getLayer('titles-fill')) return
      const seen = new Set<string>()
      let fh = 0
      let lh = 0
      for (const f of map.queryRenderedFeatures(undefined, { layers: ['titles-fill'] })) {
        const pr = f.properties as { titleNumber: string; tenure: string }
        if (seen.has(pr.titleNumber)) continue
        seen.add(pr.titleNumber)
        if (pr.tenure === 'Leasehold') lh++
        else fh++
      }
      const cur = useUi.getState().viewCounts
      if (cur.titles !== seen.size || cur.freehold !== fh || cur.leasehold !== lh) useUi.getState().setViewCounts({ titles: seen.size, freehold: fh, leasehold: lh })
    }
    map.on('idle', countTitles)
    map.on('moveend', () => {
      const c = map.getCenter()
      const b = map.getBounds()
      setMapView({ lon: c.lng, lat: c.lat, zoom: map.getZoom() }, { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() })
      scheduleLoad()
      countTitles()
    })

    const clickable = ['businesses-points', 'poi-points', 'comparables-points', 'pricePaid-points', 'planning-points', 'traffic-points', 'titles-fill']
    const onClick = (e: MapMouseEvent) => {
      const ui = useUi.getState()
      if (ui.tool !== 'none') {
        const p: [number, number] = [e.lngLat.lng, e.lngLat.lat]
        if (ui.tool === 'polygon' || ui.tool === 'line') ui.addDraftPoint(p)
        else if (ui.tool === 'pin') {
          ui.setPin(p)
          ui.setTool('none')
          const id = `${p[0].toFixed(6)},${p[1].toFixed(6)}`
          select({ type: 'point', id })
          nav(`/map/point/${id}`)
        } else if (ui.tool === 'streetview') {
          ui.setTool('none')
          window.open(streetViewUrl(p[0], p[1]), '_blank', 'noopener')
        }
        return
      }
      const feats = map.queryRenderedFeatures(e.point, { layers: clickable.filter((l) => map.getLayer(l)) })
      if (!feats.length) {
        select(null)
        nav('/map')
        return
      }
      const f = feats[0]
      const p = f.properties as Record<string, string>
      if (f.layer.id === 'businesses-points') {
        select({ type: 'business', id: p.businessId })
        nav(`/map/business/${p.businessId}`)
      } else if (f.layer.id === 'poi-points') {
        select({ type: 'poi', id: p.id })
        nav(`/map/poi/${encodeURIComponent(p.id)}`)
      } else if (f.layer.id === 'pricePaid-points') {
        select({ type: 'sale', id: p.id })
        nav(`/map/sale/${encodeURIComponent(p.id)}`)
      } else if (f.layer.id === 'comparables-points') {
        select({ type: 'comparable', id: p.compId })
        nav(`/map/comparable/${p.compId}`)
      } else if (f.layer.id === 'planning-points') {
        select({ type: 'planning', id: p.reference })
        nav(`/map/planning/${encodeURIComponent(p.reference)}`)
      } else if (f.layer.id === 'traffic-points') {
        select({ type: 'traffic', id: p.countPointId })
        nav(`/map/traffic/${p.countPointId}`)
      } else {
        select({ type: 'title', id: p.titleNumber })
        nav(`/map/title/${p.titleNumber}`)
      }
    }
    map.on('click', onClick)
    map.on('dblclick', (e) => {
      const ui = useUi.getState()
      if (ui.tool === 'polygon' || ui.tool === 'line') {
        e.preventDefault()
        ui.finishDraft()
      }
    })

    const popup = new maplibregl.Popup({ closeButton: false, closeOnClick: false, offset: 10 })
    popupRef.current = popup
    map.on('mousemove', (e) => {
      const feats = map.queryRenderedFeatures(e.point, { layers: clickable.filter((l) => map.getLayer(l)) })
      map.getCanvas().style.cursor = feats.length ? 'pointer' : ''
      if (!feats.length) {
        popup.remove()
        return
      }
      const f = feats[0]
      const p = f.properties as Record<string, string | number | boolean>
      let html = ''
      if (f.layer.id === 'businesses-points') html = `<strong>${p.name}</strong><br/><span style="color:#67748c">${p.sector}${p.rating ? ' · rated ' + p.rating : ''}${p.distress ? ' · <span style="color:#be123c">distress signals</span>' : ''}</span>`
      else if (f.layer.id === 'poi-points') html = Number(p.count) > 1 ? `<strong>${p.count} businesses in this building</strong><br/><span style="color:#67748c">${p.names}</span>` : `<strong>${p.name ?? p.category}</strong><br/><span style="color:#67748c">${String(p.category).replace(/_/g, ' ')} · ${p.sector} · Overture Maps</span>`
      else if (f.layer.id === 'pricePaid-points') html = `<strong>£${Number(p.price).toLocaleString()}</strong> · ${String(p.date).slice(0, 7)}<br/><span style="color:#67748c">${p.address} · HM Land Registry${p.geocode === 'sector' ? ' · approx. location' : ''}</span>`
      else if (f.layer.id === 'comparables-points') html = `<strong>${p.name}</strong><br/><span style="color:#67748c">Sold £${Number(p.price).toLocaleString()} · ${String(p.date).slice(0, 7)} · ${p.sector}</span>`
      else if (f.layer.id === 'planning-points') html = `<strong>${p.reference}</strong><br/><span style="color:#67748c">${p.type} · ${p.status}</span>`
      else if (f.layer.id === 'traffic-points') html = `<strong>${Number(p.aadf).toLocaleString()} vehicles/day</strong><br/><span style="color:#67748c">DfT count point ${p.countPointId} · ${p.year} ${p.method}</span>`
      else html = `<strong>${p.titleNumber}</strong><br/><span style="color:#67748c">${p.tenure} · ${p.category}</span>`
      popup.setLngLat(e.lngLat).setHTML(html).addTo(map)
    })

    return () => {
      window.clearTimeout(fallbackTimer)
      map.remove()
      mapRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Visibility and filters
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    applyVisibility(map, layers, constraintKinds, sectorFilter, basemapFailedRef.current, tenureFilter, pricePaidFilter)
  }, [layers, constraintKinds, sectorFilter, tenureFilter, pricePaidFilter])

  // CRM / sourcing highlight
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('businesses-highlight')) return
    map.setFilter('businesses-highlight', ['in', ['get', 'businessId'], ['literal', Array.from(new Set([...highlightIds, ...(analysis?.businessIds ?? [])]))]])
  }, [highlightIds, analysis])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('analysis')) return
    ;(map.getSource('analysis') as maplibregl.GeoJSONSource).setData(analysis ? ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { label: analysis.label }, geometry: circlePolygon(analysis.centre[0], analysis.centre[1], analysis.radiusM) }] } as never) : (EMPTY as never))
    if (map.getLayer('poi-highlight')) map.setFilter('poi-highlight', poiIdFilter(analysis?.poiIds ?? []))
  }, [analysis])

  // Basemap switch (picker or theme change) and title colouring
  const theme = useUi((s) => s.theme)
  const basemap = useUi((s) => s.basemap)
  const titleColour = useUi((s) => s.titleColour)
  const baseRef = useRef(basemap)
  const themeRef = useRef(theme)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (baseRef.current === basemap && themeRef.current === theme) return
    baseRef.current = basemap
    themeRef.current = theme
    // Give the theme hook a tick to update the html class before reading it.
    window.setTimeout(() => map.setStyle((basemapFailed && !isImagery(basemap) ? blankStyle(isDark()) : baseStyle(basemap, isDark())) as never), 50)
  }, [basemap, theme, basemapFailed])
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    applyTitleStyle(map, titleColour, isDark(), isImagery(effectiveBasemap(basemap, isDark())) && !basemapFailed)
  }, [titleColour, basemap, theme, basemapFailed])

  // Selection highlight
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('titles-selected')) return
    const apply = async () => {
      let tn = ''
      if (selected?.type === 'title') tn = selected.id
      if (selected?.type === 'business') tn = (await provider.getBusiness(selected.id))?.titleNumber ?? ''
      map.setFilter('titles-selected', ['==', ['get', 'titleNumber'], tn])
    }
    void apply()
  }, [selected])

  // Tools: cursor, double-click zoom, keyboard (Esc cancels, Enter finishes, Backspace undoes a point)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    map.getCanvas().style.cursor = tool === 'none' ? '' : 'crosshair'
    if (tool === 'polygon' || tool === 'line') map.doubleClickZoom.disable()
    else map.doubleClickZoom.enable()
    if (tool === 'none') return
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      const ui = useUi.getState()
      if (e.key === 'Escape') ui.cancelDraft()
      else if (e.key === 'Enter' && (ui.tool === 'polygon' || ui.tool === 'line')) ui.finishDraft()
      else if (e.key === 'Backspace' && (ui.tool === 'polygon' || ui.tool === 'line')) { e.preventDefault(); ui.undoDraftPoint() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [tool])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('draft')) return
    const feats: GeoJSON.Feature[] = draft.map((c) => ({ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: c } }))
    if (draft.length >= 2) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: tool === 'polygon' ? [...draft, draft[0]] : draft } })
    if (tool === 'polygon' && draft.length >= 3) feats.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [[...draft, draft[0]]] } })
    ;(map.getSource('draft') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats })
  }, [draft, tool])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('draw')) return
    const feats: GeoJSON.Feature[] = []
    for (const d of drawings) {
      if (d.kind === 'polygon') feats.push({ type: 'Feature', properties: { id: d.id }, geometry: { type: 'Polygon', coordinates: [[...d.coords, d.coords[0]]] } })
      else feats.push({ type: 'Feature', properties: { id: d.id }, geometry: { type: 'LineString', coordinates: d.coords } })
      for (const c of d.coords) feats.push({ type: 'Feature', properties: { id: d.id }, geometry: { type: 'Point', coordinates: c } })
    }
    ;(map.getSource('draw') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: feats })
  }, [drawings])
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getSource('pin')) return
    ;(map.getSource('pin') as maplibregl.GeoJSONSource).setData({ type: 'FeatureCollection', features: pin ? [{ type: 'Feature', properties: {}, geometry: { type: 'Point', coordinates: pin } }] : [] })
  }, [pin])

  // Fly-to requests
  useEffect(() => {
    if (!flyTo || !mapRef.current) return
    // Short hops animate; long ones (another town) cut to the destination so the data is on screen at once.
    mapRef.current.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: flyTo.zoom ?? Math.max(mapRef.current.getZoom(), 16.5), speed: 1.4, maxDuration: 1800 })
  }, [flyTo])

  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      <BasemapControl hasOsKey={!!osKey()} open={basemapOpen} onOpenChange={setBasemapOpen} />
      <MapLegend />
      <MapToolbar mapRef={mapRef} containerRef={containerRef} onBasemap={() => setBasemapOpen((o) => !o)} />
      <DrawPanel />
      <LocationAnalysis />
      {basemapFailed && (
        <div className="pointer-events-none absolute bottom-[4.2rem] left-1/2 z-10 w-[min(520px,calc(100%-24px))] -translate-x-1/2 rounded-md border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-1 text-center text-[11px] text-amber-900 dark:text-amber-200 shadow">
          Street tiles blocked on this network; showing data layers over a schematic street outline.
        </div>
      )}
    </>
  )
}

/** Title colouring: neutral by default; by proprietor type or tenure on request; white outlines over imagery. */
function applyTitleStyle(map: MLMap, mode: TitleColour, dark: boolean, imagery: boolean) {
  if (!map.getLayer('titles-fill')) return
  const tenureMatch = ['match', ['get', 'tenure'], 'Freehold', '#2f64b4', 'Leasehold', '#c2410c', '#64748b'] as unknown as maplibregl.ExpressionSpecification
  const hover = (base: number) => ['case', ['boolean', ['feature-state', 'hover'], false], Math.min(0.45, base + 0.25), base] as unknown as maplibregl.ExpressionSpecification
  if (mode === 'owner') {
    map.setPaintProperty('titles-fill', 'fill-color', ownerMatch)
    map.setPaintProperty('titles-fill', 'fill-opacity', hover(imagery ? 0.22 : 0.16))
    map.setPaintProperty('titles-line', 'line-color', ownerMatch)
    map.setPaintProperty('titles-line', 'line-opacity', 0.95)
  } else if (mode === 'tenure') {
    map.setPaintProperty('titles-fill', 'fill-color', tenureMatch)
    map.setPaintProperty('titles-fill', 'fill-opacity', hover(imagery ? 0.22 : 0.14))
    map.setPaintProperty('titles-line', 'line-color', tenureMatch)
    map.setPaintProperty('titles-line', 'line-opacity', 0.95)
  } else {
    map.setPaintProperty('titles-fill', 'fill-color', imagery ? '#ffffff' : dark ? '#9db7e6' : '#2f64b4')
    map.setPaintProperty('titles-fill', 'fill-opacity', hover(imagery ? 0.1 : dark ? 0.1 : 0.07))
    map.setPaintProperty('titles-line', 'line-color', imagery ? '#ffffff' : dark ? '#8aa6d8' : '#5b7db8')
    map.setPaintProperty('titles-line', 'line-opacity', imagery ? 0.8 : 0.9)
  }
  map.setPaintProperty('titles-selected', 'line-color', imagery || dark ? '#fde047' : '#0f2340')
}

function applyVisibility(map: MLMap, layers: Record<string, boolean>, constraintKinds: string[], sectorFilter: string[], schematic = false, tenureFilter = { freehold: true, leasehold: true }, pricePaidFilter: 'all' | 'residential' | 'nonResidential' = 'all') {
  const vis = (ids: string[], on: boolean) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'))
  vis(['streets-casing', 'streets-fill', 'streets-labels'], schematic)
  vis(['titles-fill', 'titles-line', 'titles-distress', 'titles-selected'], layers.titles)
  vis(['businesses-points', 'businesses-labels', 'businesses-ring', 'businesses-highlight'], layers.businesses)
  vis(['planning-points'], layers.planning)
  vis(['poi-points', 'poi-labels', 'poi-count', 'poi-highlight'], layers.poi)
  vis(['buildings-fill', 'buildings-line'], layers.buildings)
  vis(['pricePaid-points'], layers.pricePaid)
  vis(['comparables-points'], layers.comparables)
  vis(['traffic-points', 'traffic-labels'], layers.traffic)
  vis(['footfall-fill'], layers.footfall)
  vis(['constraints-fill', 'constraints-line', 'constraints-points'], layers.constraints)
  const tenures = [tenureFilter.freehold ? 'Freehold' : null, tenureFilter.leasehold ? 'Leasehold' : null].filter(Boolean) as string[]
  const tenureF: maplibregl.FilterSpecification | null = tenures.length === 2 ? null : (['in', ['get', 'tenure'], ['literal', tenures]] as unknown as maplibregl.FilterSpecification)
  for (const id of ['titles-fill', 'titles-line']) if (map.getLayer(id)) map.setFilter(id, tenureF)
  if (map.getLayer('titles-distress')) map.setFilter('titles-distress', (tenureF ? ['all', ['==', ['get', 'distress'], true], tenureF] : ['==', ['get', 'distress'], true]) as unknown as maplibregl.FilterSpecification)
  if (map.getLayer('pricePaid-points')) map.setFilter('pricePaid-points', pricePaidFilter === 'all' ? null : pricePaidFilter === 'nonResidential' ? ['==', ['get', 'type'], 'O'] : ['!=', ['get', 'type'], 'O'])
  const kindFilter: maplibregl.FilterSpecification = ['in', ['get', 'kind'], ['literal', constraintKinds]]
  if (map.getLayer('constraints-fill')) {
    map.setFilter('constraints-fill', ['all', ['!=', ['geometry-type'], 'Point'], kindFilter])
    map.setFilter('constraints-line', ['all', ['!=', ['geometry-type'], 'Point'], kindFilter])
    map.setFilter('constraints-points', ['all', ['==', ['geometry-type'], 'Point'], kindFilter])
  }
  if (map.getLayer('businesses-points')) {
    const f: maplibregl.FilterSpecification | null = sectorFilter.length ? ['in', ['get', 'sector'], ['literal', sectorFilter]] : null
    map.setFilter('businesses-points', f)
    if (map.getLayer('businesses-labels')) map.setFilter('businesses-labels', f)
    // Clusters carry every sector they hold; keep the dot if any of them is wanted.
    const pf: maplibregl.FilterSpecification | null = sectorFilter.length ? (['any', ...sectorFilter.map((s) => ['in', s, ['coalesce', ['get', 'sectors'], ['literal', []]]])] as unknown as maplibregl.FilterSpecification) : null
    if (map.getLayer('poi-points')) map.setFilter('poi-points', pf)
    if (map.getLayer('poi-labels')) map.setFilter('poi-labels', pf)
    const multi = ['>', ['coalesce', ['get', 'count'], 1], 1] as unknown as maplibregl.FilterSpecification
    if (map.getLayer('poi-count')) map.setFilter('poi-count', (pf ? ['all', multi, pf] : multi) as maplibregl.FilterSpecification)
    map.setFilter('businesses-ring', f ? ['all', ['==', ['get', 'distress'], true], f] : ['==', ['get', 'distress'], true])
  }
}

export { CONSTRAINT_COLOURS }
