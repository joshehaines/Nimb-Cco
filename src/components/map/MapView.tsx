import { useEffect, useRef, useState } from 'react'
import maplibregl, { type Map as MLMap, type MapMouseEvent, type StyleSpecification } from 'maplibre-gl'
import { useNavigate } from 'react-router-dom'
import { provider, type MapLayers } from '@/data'
import { useUi } from '@/store/ui'
import { SECTOR_COLOURS, OWNER_CATEGORY_COLOURS } from '@/lib/sectors'

const OS_KEY = import.meta.env.VITE_OS_API_KEY as string | undefined

function baseStyle(satellite: boolean, dark = false): string | StyleSpecification {
  if (satellite) {
    return {
      version: 8,
      sources: {
        sat: { type: 'raster', tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'], tileSize: 256, attribution: 'Imagery © Esri, Maxar, Earthstar Geographics' },
      },
      layers: [{ id: 'sat', type: 'raster', source: 'sat' }],
    }
  }
  if (OS_KEY) {
    return {
      version: 8,
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
      sources: { os: { type: 'raster', tiles: [`https://api.os.uk/maps/raster/v1/zxy/${dark ? 'Road_3857' : 'Light_3857'}/{z}/{x}/{y}.png?key=${OS_KEY}`], tileSize: 256, attribution: 'Contains OS data © Crown copyright and database right 2026', maxzoom: 20 } },
      layers: [{ id: 'os', type: 'raster', source: 'os' }],
    }
  }
  return dark ? 'https://tiles.openfreemap.org/styles/dark' : 'https://tiles.openfreemap.org/styles/liberty'
}

const EMPTY = { type: 'FeatureCollection', features: [] } as const

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
}
const constraintMatch = ['match', ['get', 'kind'], ...Object.entries(CONSTRAINT_COLOURS).flatMap(([k, v]) => [k, v]), '#64748b'] as unknown as maplibregl.ExpressionSpecification
const FOOTFALL_RAMP = ['interpolate', ['linear'], ['get', 'band'], 1, '#fef3c7', 3, '#fcd34d', 5, '#f59e0b', 7, '#dc2626', 9, '#7f1d1d'] as unknown as maplibregl.ExpressionSpecification

function addDataLayers(map: MLMap, withLabels: boolean) {
  const src = (id: string) => {
    if (!map.getSource(id)) map.addSource(id, { type: 'geojson', data: EMPTY as never, promoteId: undefined })
  }
  ;['streets', 'footfall', 'constraints', 'titles', 'planning', 'traffic', 'comparables', 'businesses'].forEach(src)

  if (map.getLayer('footfall-fill')) return
  const dk = isDark()
  map.addLayer({ id: 'streets-casing', type: 'line', source: 'streets', paint: { 'line-color': dk ? '#2a3242' : '#cfd6e0', 'line-width': ['case', ['==', ['get', 'major'], true], 14, 9], 'line-opacity': 0.9 }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
  map.addLayer({ id: 'streets-fill', type: 'line', source: 'streets', paint: { 'line-color': dk ? '#3a4356' : '#ffffff', 'line-width': ['case', ['==', ['get', 'major'], true], 10, 6] }, layout: { 'line-cap': 'round', 'line-join': 'round' } })
  if (withLabels) map.addLayer({ id: 'streets-labels', type: 'symbol', source: 'streets', layout: { 'symbol-placement': 'line', 'text-field': ['get', 'name'], 'text-size': 11, 'text-font': ['Noto Sans Regular'] }, paint: { 'text-color': dk ? '#aab4c5' : '#67748c', 'text-halo-color': dk ? '#161b26' : '#fff', 'text-halo-width': 1 } })
  map.addLayer({ id: 'footfall-fill', type: 'fill', source: 'footfall', paint: { 'fill-color': FOOTFALL_RAMP, 'fill-opacity': 0.42 } })
  map.addLayer({ id: 'constraints-fill', type: 'fill', source: 'constraints', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'fill-color': constraintMatch, 'fill-opacity': 0.14 } })
  map.addLayer({ id: 'constraints-line', type: 'line', source: 'constraints', filter: ['!=', ['geometry-type'], 'Point'], paint: { 'line-color': constraintMatch, 'line-width': 1.5, 'line-dasharray': [3, 2] } })
  map.addLayer({ id: 'titles-fill', type: 'fill', source: 'titles', paint: { 'fill-color': ownerMatch, 'fill-opacity': ['case', ['boolean', ['feature-state', 'hover'], false], 0.4, dk ? 0.14 : 0.1] } })
  map.addLayer({ id: 'titles-line', type: 'line', source: 'titles', paint: { 'line-color': ownerMatch, 'line-width': ['interpolate', ['linear'], ['zoom'], 14, 0.4, 17, 1], 'line-opacity': 0.85 } })
  map.addLayer({ id: 'titles-distress', type: 'line', source: 'titles', filter: ['==', ['get', 'distress'], true], paint: { 'line-color': '#be123c', 'line-width': 1.5, 'line-opacity': 0.9 } })
  map.addLayer({ id: 'titles-selected', type: 'line', source: 'titles', filter: ['==', ['get', 'titleNumber'], ''], paint: { 'line-color': '#0f2340', 'line-width': 3 } })
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
  const constraintKinds = useUi((s) => s.constraintKinds)
  const sectorFilter = useUi((s) => s.sectorFilter)
  const highlightIds = useUi((s) => s.highlightIds)
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
      style: baseStyle(false, isDark()),
      center: [initialView.current.lon, initialView.current.lat],
      zoom: initialView.current.zoom,
      attributionControl: { compact: true },
      maxZoom: 20,
    })
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: false }), 'bottom-right')
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left')
    mapRef.current = map

    const load = async () => {
      const b = map.getBounds()
      const data = await provider.getMapLayers({ west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() })
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
      applyVisibility(map, useUi.getState().layers, useUi.getState().constraintKinds, useUi.getState().sectorFilter, basemapFailedRef.current)
      map.setFilter('businesses-highlight', ['in', ['get', 'businessId'], ['literal', useUi.getState().highlightIds]])
      if (dataRef.current) for (const k of Object.keys(dataRef.current) as (keyof MapLayers)[]) (map.getSource(k) as maplibregl.GeoJSONSource | undefined)?.setData(dataRef.current[k] as never)
      else scheduleLoad()
    })
    map.on('moveend', () => {
      const c = map.getCenter()
      const b = map.getBounds()
      setMapView({ lon: c.lng, lat: c.lat, zoom: map.getZoom() }, { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() })
      scheduleLoad()
    })

    const clickable = ['businesses-points', 'comparables-points', 'planning-points', 'traffic-points', 'titles-fill']
    const onClick = (e: MapMouseEvent) => {
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
    applyVisibility(map, layers, constraintKinds, sectorFilter, basemapFailedRef.current)
  }, [layers, constraintKinds, sectorFilter])

  // CRM / sourcing highlight
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.getLayer('businesses-highlight')) return
    map.setFilter('businesses-highlight', ['in', ['get', 'businessId'], ['literal', highlightIds]])
  }, [highlightIds])

  // Basemap switch (satellite toggle or theme change)
  const theme = useUi((s) => s.theme)
  const satRef = useRef(layers.satellite)
  const themeRef = useRef(theme)
  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    if (satRef.current === layers.satellite && themeRef.current === theme) return
    satRef.current = layers.satellite
    themeRef.current = theme
    // Give the theme hook a tick to update the html class before reading it.
    window.setTimeout(() => map.setStyle((basemapFailed && !layers.satellite ? blankStyle(isDark()) : baseStyle(layers.satellite, isDark())) as never), 50)
  }, [layers.satellite, theme, basemapFailed])

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

  // Fly-to requests
  useEffect(() => {
    if (!flyTo || !mapRef.current) return
    mapRef.current.flyTo({ center: [flyTo.lon, flyTo.lat], zoom: flyTo.zoom ?? Math.max(mapRef.current.getZoom(), 16.5), speed: 1.4 })
  }, [flyTo])

  return (
    <>
      <div ref={containerRef} className="h-full w-full" />
      {basemapFailed && (
        <div className="pointer-events-none absolute bottom-10 left-1/2 z-10 w-[min(520px,calc(100%-24px))] -translate-x-1/2 rounded-md border border-amber-300 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-1 text-center text-[11px] text-amber-900 dark:text-amber-200 shadow">
          Street tiles blocked on this network; showing data layers over a schematic street outline.
        </div>
      )}
    </>
  )
}

function applyVisibility(map: MLMap, layers: Record<string, boolean>, constraintKinds: string[], sectorFilter: string[], schematic = false) {
  const vis = (ids: string[], on: boolean) => ids.forEach((id) => map.getLayer(id) && map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none'))
  vis(['streets-casing', 'streets-fill', 'streets-labels'], schematic)
  vis(['titles-fill', 'titles-line', 'titles-distress', 'titles-selected'], layers.titles)
  vis(['businesses-points', 'businesses-labels', 'businesses-ring', 'businesses-highlight'], layers.businesses)
  vis(['planning-points'], layers.planning)
  vis(['comparables-points'], layers.comparables)
  vis(['traffic-points', 'traffic-labels'], layers.traffic)
  vis(['footfall-fill'], layers.footfall)
  vis(['constraints-fill', 'constraints-line', 'constraints-points'], layers.constraints)
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
    map.setFilter('businesses-ring', f ? ['all', ['==', ['get', 'distress'], true], f] : ['==', ['get', 'distress'], true])
  }
}

export { CONSTRAINT_COLOURS }
