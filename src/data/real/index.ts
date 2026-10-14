import type { FeatureCollection, LineString, MultiLineString, Point, Polygon } from 'geojson'

/**
 * Real open data for the demo area (Warwick district), collected by scripts/data/* and
 * served as static files from public/data/warwick. Everything here is genuine:
 * roads and places from Overture Maps (OpenStreetMap-derived), DfT traffic counts
 * and HM Land Registry price paid. Ownership, operators and registers remain synthetic
 * until the licensed feeds are connected.
 */
export interface RoadProps { id: string; name?: string; class: string; major: boolean; source: string }
/** `placed` says where the pin sits: 'building' = centre of the title/building footprint (scripts/data/snap_places.py), 'listed' = the point the listing gave. `orig` keeps the listed point when the pin moved. */
export interface PlaceProps { id: string; name?: string; category: string; sector: string; confidence: number; address?: string; postcode?: string; locality?: string; website?: string; phone?: string; brand?: string; source: string; placed?: 'building' | 'listed'; orig?: [number, number] }
export interface RealTraffic { countPointId: string; roadName: string; roadType: 'Major' | 'Minor'; roadCategory: string; startJunction?: string | null; endJunction?: string | null; localAuthority: string; lon: number; lat: number; year: number; method: 'Counted' | 'Estimated'; aadf: number; cars: number; lgv: number; hgv: number; buses: number; pedalCycles: number; history: { year: number; aadf: number }[] }
export interface PricePaidRow { id: string; price: number; date: string; postcode: string; type: 'D' | 'S' | 'T' | 'F' | 'O'; newBuild: boolean; tenure: 'Freehold' | 'Leasehold'; address: string; locality: string; town: string; category: 'A' | 'B'; lon: number | null; lat: number | null; geocode: 'postcode' | 'sector' | null }

export interface DemoArea { id: string; name: string; centre: [number, number]; windows: [number, number, number, number][]; authority: string; files: Partial<Record<'roads' | 'places' | 'buildings' | 'traffic' | 'pricePaid' | 'postcodes' | 'parcels', string>> }

/** Areas with the synthetic overlay seated on real streets. Filled from data/areas.json on load; this default covers the first paint. */
export const DEMO_AREAS: DemoArea[] = [
  { id: 'warwick', name: 'Leamington Spa & Warwick', centre: [-1.5455, 52.287], windows: [[-1.552, 52.277, -1.518, 52.3], [-1.6, 52.274, -1.566, 52.291]], authority: 'Warwick District Council', files: {} },
  { id: 'bristol', name: 'Bristol', centre: [-2.5945, 51.455], windows: [[-2.612, 51.443, -2.568, 51.468]], authority: 'Bristol City Council', files: {} },
]

export interface ParcelProps { id: string; street: string; along: number; side: 1 | -1; postcode?: string | null; locality?: string | null; pois: number; areaSqm: number; height?: number | null; levels?: number | null }

export interface RealLayers {
  areas: DemoArea[]
  /** Real building footprints prepared as parcel shapes for the demo titles (scripts/data/build_parcels.py). */
  parcels?: FeatureCollection<Polygon, ParcelProps>
  roads: FeatureCollection<LineString | MultiLineString, RoadProps>
  places: FeatureCollection<Point, PlaceProps>
  traffic: RealTraffic[]
  pricePaid: PricePaidRow[]
  postcodes: { postcodes: Record<string, [number, number]>; sectors: Record<string, [number, number]> }
  fetchedAt: string
}

// import.meta.env is absent when this module is loaded by node (vite config, mock API middleware).
const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env
export const DATA_BASE = `${env?.BASE_URL ?? '/'}data/`
export const REAL_DATA_BASE = `${DATA_BASE}warwick/`

let cached: Promise<RealLayers | undefined> | undefined
let source: (() => Promise<RealLayers | undefined>) | undefined

/** Replace the fetch-based loader (used by the node mock API middleware to read the files from disk). */
export function setRealLayersSource(fn: () => Promise<RealLayers | undefined>) {
  source = fn
  cached = undefined
}

/** Load the collected open data; resolves undefined (and logs once) when the files are absent. */
export function loadRealLayers(): Promise<RealLayers | undefined> {
  if (cached) return cached
  if (source) {
    cached = source()
    return cached
  }
  cached = (async () => {
    try {
      const get = async <T,>(path: string): Promise<T> => {
        const r = await fetch(DATA_BASE + path)
        if (!r.ok) throw new Error(`${path}: ${r.status}`)
        return (await r.json()) as T
      }
      const areas = (await get<{ areas: DemoArea[] }>('areas.json')).areas
      DEMO_AREAS.splice(0, DEMO_AREAS.length, ...areas)
      const roads: RealLayers['roads'] = { type: 'FeatureCollection', features: [] }
      const places: RealLayers['places'] = { type: 'FeatureCollection', features: [] }
      let traffic: RealTraffic[] = []
      let pricePaid: PricePaidRow[] = []
      const postcodes: RealLayers['postcodes'] = { postcodes: {}, sectors: {} }
      const parcels: NonNullable<RealLayers['parcels']> = { type: 'FeatureCollection', features: [] }
      for (const a of areas) {
        const [r, p, t, pp, pc, pa] = await Promise.all([
          a.files.roads ? get<RealLayers['roads']>(a.files.roads) : undefined,
          a.files.places ? get<RealLayers['places']>(a.files.places) : undefined,
          a.files.traffic ? get<RealTraffic[]>(a.files.traffic) : undefined,
          a.files.pricePaid ? get<PricePaidRow[]>(a.files.pricePaid) : undefined,
          a.files.postcodes ? get<RealLayers['postcodes']>(a.files.postcodes) : undefined,
          a.files.parcels ? get<NonNullable<RealLayers['parcels']>>(a.files.parcels).catch(() => undefined) : undefined,
        ])
        if (pa) parcels.features.push(...pa.features)
        if (r) roads.features.push(...r.features)
        if (p) places.features.push(...p.features)
        if (t) traffic = traffic.concat(t)
        if (pp) pricePaid = pricePaid.concat(pp)
        if (pc) {
          Object.assign(postcodes.postcodes, pc.postcodes)
          Object.assign(postcodes.sectors, pc.sectors)
        }
      }
      if (!roads.features.length) throw new Error('no road data')
      return { areas, roads, places, traffic, pricePaid, postcodes, parcels: parcels.features.length ? parcels : undefined, fetchedAt: new Date().toISOString() }
    } catch (e) {
      console.info('Real open data not available, using synthetic streets:', (e as Error).message)
      return undefined
    }
  })()
  return cached
}

export const PRICE_PAID_TYPE: Record<PricePaidRow['type'], string> = { D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat', O: 'Other (non-residential or mixed)' }
