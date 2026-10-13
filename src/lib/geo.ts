import type { Point, Polygon, Position } from 'geojson'
import type { BoundsQuery } from '../data/types'

const R = 6371000

export function haversineM(a: Position, b: Position): number {
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b[1] - a[1])
  const dLon = toRad(b[0] - a[0])
  const la1 = toRad(a[1])
  const la2 = toRad(b[1])
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

/** Offset a lon/lat by metres east/north. */
export function offset(lon: number, lat: number, dxM: number, dyM: number): Position {
  const dLat = dyM / 111_320
  const dLon = dxM / (111_320 * Math.cos((lat * Math.PI) / 180))
  return [lon + dLon, lat + dLat]
}

export function rect(lon: number, lat: number, wM: number, hM: number, rotDeg = 0): Polygon {
  const hw = wM / 2
  const hh = hM / 2
  const r = (rotDeg * Math.PI) / 180
  const corners: [number, number][] = [
    [-hw, -hh],
    [hw, -hh],
    [hw, hh],
    [-hw, hh],
  ]
  const ring = corners.map(([x, y]) => {
    const rx = x * Math.cos(r) - y * Math.sin(r)
    const ry = x * Math.sin(r) + y * Math.cos(r)
    return offset(lon, lat, rx, ry)
  })
  ring.push(ring[0])
  return { type: 'Polygon', coordinates: [ring] }
}

export function hexagon(lon: number, lat: number, radiusM: number): Polygon {
  const ring: Position[] = []
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i + Math.PI / 6
    ring.push(offset(lon, lat, radiusM * Math.cos(a), radiusM * Math.sin(a)))
  }
  ring.push(ring[0])
  return { type: 'Polygon', coordinates: [ring] }
}

export function centroid(p: Polygon): Position {
  const ring = p.coordinates[0]
  let x = 0
  let y = 0
  const n = ring.length - 1
  for (let i = 0; i < n; i++) {
    x += ring[i][0]
    y += ring[i][1]
  }
  return [x / n, y / n]
}

export function polygonAreaSqm(p: Polygon): number {
  const ring = p.coordinates[0]
  const lat0 = ring[0][1]
  const mPerDegLat = 111_320
  const mPerDegLon = 111_320 * Math.cos((lat0 * Math.PI) / 180)
  let area = 0
  for (let i = 0; i < ring.length - 1; i++) {
    const [x1, y1] = ring[i]
    const [x2, y2] = ring[i + 1]
    area += x1 * mPerDegLon * (y2 * mPerDegLat) - x2 * mPerDegLon * (y1 * mPerDegLat)
  }
  return Math.abs(area / 2)
}

export function inBounds(pos: Position, b: BoundsQuery): boolean {
  return pos[0] >= b.west && pos[0] <= b.east && pos[1] >= b.south && pos[1] <= b.north
}

export function pointInPolygon(pt: Position, poly: Polygon): boolean {
  const [x, y] = pt
  let inside = false
  const ring = poly.coordinates[0]
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersect = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (intersect) inside = !inside
  }
  return inside
}

export const point = (lon: number, lat: number): Point => ({ type: 'Point', coordinates: [lon, lat] })
