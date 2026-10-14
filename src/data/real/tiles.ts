import { REAL_DATA_BASE } from './index'
import type { PricePaidRow, RealTraffic } from './index'

/**
 * Great Britain tile set built by scripts/data/build_national_tiles.py: 0.5 degree cells per theme
 * under public/data/gb/<theme>/<x>_<y>.json with an index.json of non-empty cells. Loaded lazily
 * and cached for the session, so panning only ever fetches new cells.
 */
export type TileTheme = 'places' | 'price_paid' | 'traffic'
export interface GbPlace { id: string; lon: number; lat: number; name?: string; category: string; sector: string; confidence: number; address?: string; postcode?: string; locality?: string; website?: string; phone?: string; brand?: string }
type RowOf<T extends TileTheme> = T extends 'places' ? GbPlace : T extends 'price_paid' ? PricePaidRow : RealTraffic

const CELL = 0.5
const GB_BASE = REAL_DATA_BASE.replace(/warwick\/$/, 'gb/')
const indexes = new Map<TileTheme, Promise<Record<string, number>>>()
const tiles = new Map<string, Promise<unknown[]>>()

export const tileKey = (lon: number, lat: number) => `${Math.floor(lon / CELL)}_${Math.floor(lat / CELL)}`

export function tileIndex(theme: TileTheme): Promise<Record<string, number>> {
  let p = indexes.get(theme)
  if (!p) {
    p = fetch(`${GB_BASE}${theme}/index.json`)
      .then((r) => (r.ok ? r.json() : { cells: {} }))
      .then((j: { cells?: Record<string, number> }) => j.cells ?? {})
      .catch(() => ({}))
    indexes.set(theme, p)
  }
  return p
}

/** Tiles are stored gzipped (.json.gz) to keep the repository and transfers small; decompress in the browser
 * unless the server already decoded them (magic bytes 1f 8b say which). */
async function fetchJsonMaybeGz(url: string): Promise<unknown> {
  const r = await fetch(url)
  if (!r.ok) return []
  const buf = await r.arrayBuffer()
  const bytes = new Uint8Array(buf)
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') return []
    const ds = new DecompressionStream('gzip')
    const text = await new Response(new Blob([buf]).stream().pipeThrough(ds)).text()
    return JSON.parse(text)
  }
  return JSON.parse(new TextDecoder().decode(bytes))
}

export function loadTile<T extends TileTheme>(theme: T, key: string): Promise<RowOf<T>[]> {
  const k = `${theme}/${key}`
  let p = tiles.get(k)
  if (!p) {
    p = fetchJsonMaybeGz(`${GB_BASE}${theme}/${key}.json.gz`).then((j) => (Array.isArray(j) ? j : [])).catch(() => [])
    tiles.set(k, p)
  }
  return p as Promise<RowOf<T>[]>
}

export function cellsForBounds(b: { west: number; south: number; east: number; north: number }): string[] {
  const out: string[] = []
  for (let x = Math.floor(b.west / CELL); x <= Math.floor(b.east / CELL); x++) for (let y = Math.floor(b.south / CELL); y <= Math.floor(b.north / CELL); y++) out.push(`${x}_${y}`)
  return out
}

/** Rows for every non-empty cell touching the bounds; empty when the view covers more than maxCells (zoomed out). */
export async function rowsForBounds<T extends TileTheme>(theme: T, b: { west: number; south: number; east: number; north: number }, maxCells = 6): Promise<RowOf<T>[]> {
  const idx = await tileIndex(theme)
  const cells = cellsForBounds(b).filter((c) => idx[c])
  if (!cells.length || cells.length > maxCells) return []
  const parts = await Promise.all(cells.map((c) => loadTile(theme, c)))
  return parts.flat()
}

export function rowsForRadius<T extends TileTheme>(theme: T, lon: number, lat: number, radiusM: number): Promise<RowOf<T>[]> {
  const dLat = radiusM / 111_320
  const dLon = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180))
  return rowsForBounds(theme, { west: lon - dLon, south: lat - dLat, east: lon + dLon, north: lat + dLat }, 12)
}

/** Look a row up by id in the cells already loaded this session (the map or a list loaded it). */
export async function findLoaded<T extends TileTheme>(theme: T, id: string, idField: string): Promise<RowOf<T> | undefined> {
  for (const [k, p] of tiles) {
    if (!k.startsWith(`${theme}/`)) continue
    const rows = (await p) as Record<string, unknown>[]
    const hit = rows.find((r) => r[idField] === id)
    if (hit) return hit as unknown as RowOf<T>
  }
  return undefined
}

export async function tileTotals(): Promise<Record<TileTheme, number>> {
  const [p, s, t] = await Promise.all([tileIndex('places'), tileIndex('price_paid'), tileIndex('traffic')])
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0)
  return { places: sum(p), price_paid: sum(s), traffic: sum(t) }
}
