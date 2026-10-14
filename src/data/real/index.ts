import type { FeatureCollection, LineString, MultiLineString, Point } from 'geojson'

/**
 * Real open data for the demo area (Warwick district), collected by scripts/data/* and
 * served as static files from public/data/warwick. Everything here is genuine:
 * roads and places from Overture Maps (OpenStreetMap-derived), DfT traffic counts
 * and HM Land Registry price paid. Ownership, operators and registers remain synthetic
 * until the licensed feeds are connected.
 */
export interface RoadProps { id: string; name?: string; class: string; major: boolean; source: string }
export interface PlaceProps { id: string; name?: string; category: string; sector: string; confidence: number; address?: string; postcode?: string; locality?: string; website?: string; phone?: string; brand?: string; source: string }
export interface RealTraffic { countPointId: string; roadName: string; roadType: 'Major' | 'Minor'; roadCategory: string; startJunction?: string | null; endJunction?: string | null; localAuthority: string; lon: number; lat: number; year: number; method: 'Counted' | 'Estimated'; aadf: number; cars: number; lgv: number; hgv: number; buses: number; pedalCycles: number; history: { year: number; aadf: number }[] }
export interface PricePaidRow { id: string; price: number; date: string; postcode: string; type: 'D' | 'S' | 'T' | 'F' | 'O'; newBuild: boolean; tenure: 'Freehold' | 'Leasehold'; address: string; locality: string; town: string; category: 'A' | 'B'; lon: number | null; lat: number | null; geocode: 'postcode' | 'sector' | null }

export interface RealLayers {
  roads: FeatureCollection<LineString | MultiLineString, RoadProps>
  places: FeatureCollection<Point, PlaceProps>
  traffic: RealTraffic[]
  pricePaid: PricePaidRow[]
  postcodes: { postcodes: Record<string, [number, number]>; sectors: Record<string, [number, number]> }
  fetchedAt: string
}

// import.meta.env is absent when this module is loaded by node (vite config, mock API middleware).
const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env
export const REAL_DATA_BASE = `${env?.BASE_URL ?? '/'}data/warwick/`

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
      const get = async <T,>(name: string): Promise<T> => {
        const r = await fetch(REAL_DATA_BASE + name)
        if (!r.ok) throw new Error(`${name}: ${r.status}`)
        return (await r.json()) as T
      }
      const [roads, places, traffic, pricePaid, postcodes] = await Promise.all([
        get<RealLayers['roads']>('roads.geojson'),
        get<RealLayers['places']>('places.geojson'),
        get<RealTraffic[]>('traffic.json'),
        get<PricePaidRow[]>('price_paid.json'),
        get<RealLayers['postcodes']>('postcodes.json'),
      ])
      return { roads, places, traffic, pricePaid, postcodes, fetchedAt: new Date().toISOString() }
    } catch (e) {
      console.info('Real open data not available, using synthetic streets:', (e as Error).message)
      return undefined
    }
  })()
  return cached
}

export const PRICE_PAID_TYPE: Record<PricePaidRow['type'], string> = { D: 'Detached', S: 'Semi-detached', T: 'Terraced', F: 'Flat', O: 'Other (non-residential or mixed)' }
