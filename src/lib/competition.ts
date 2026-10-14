import type { Business, Sector } from '@/data/types'
import type { PlaceProps } from '@/data/real'
import type { Point } from 'geojson'

/**
 * Competition analysis for one site: who the main competitors are within a radius, how
 * crowded the catchment is, and why each competitor ranks where it does. Transparent and
 * additive, like the deal score: every point is explained in `reasons`.
 *
 * Two inputs: demo/registered businesses (with capacity, rating, operator) and real places from
 * Overture Maps (name, category, brand). A competitor's score mixes proximity, like-for-like
 * offer, scale relative to the site, and quality.
 */
export interface SiteForCompetition { name: string; sector: Sector; subSector?: string; capacity?: number; rating?: string; operatorName?: string; centre: [number, number] }
export interface Competitor {
  id: string
  kind: 'demo' | 'real'
  name: string
  sector: Sector
  subSector?: string
  category?: string
  brand?: string
  operatorName?: string
  distanceM: number
  capacity?: number
  capacityLabel?: string
  rating?: string
  location: [number, number]
  score: number
  reasons: string[]
}
export interface CompetitionResult {
  radiusM: number
  sector: Sector
  competitors: Competitor[]
  main: Competitor[]
  demoCount: number
  realCount: number
  densityPerKm2: number
  /** Share of same-sector capacity within the radius held by the site (demo businesses only). */
  capacityShare?: number
  pressure: 'Low' | 'Moderate' | 'High'
  nearestM?: number
  summary: string[]
}

/** Radius a buyer or operator would consider the local market for the sector. */
export const DEFAULT_RADIUS_M: Record<Sector, number> = {
  Pub: 800, Restaurant: 800, Hotel: 1500, 'Care Home': 3000, Childcare: 1500, Dental: 1500, Medical: 1500, Pharmacy: 800, 'Convenience Retail': 600, Leisure: 3000, 'Garden Centre': 8000, Other: 1000,
}
/** Same-sector competitors per km² above which the catchment reads as crowded. */
const HIGH_DENSITY: Record<Sector, number> = {
  Pub: 6, Restaurant: 10, Hotel: 2, 'Care Home': 0.6, Childcare: 1.2, Dental: 1.2, Medical: 1.5, Pharmacy: 2, 'Convenience Retail': 6, Leisure: 0.5, 'Garden Centre': 0.05, Other: 3,
}

const GOOD = /outstanding|good|^5$|^4$/i
const POOR = /inadequate|requires improvement|^[0-2]$/i
const CHAIN_WORDS = /\b(group|holdings|plc|inns|taverns|pubs|hotels|care|leisure|limited|ltd)\b/i

export function analyseCompetition(site: SiteForCompetition, demo: (Business & { distanceM: number })[], real: (PlaceProps & { location: Point; distanceM: number })[], radiusM: number): CompetitionResult {
  const comps: Competitor[] = []
  const prox = (d: number) => Math.round(40 * Math.max(0, 1 - d / radiusM))
  for (const b of demo) {
    if (b.sector !== site.sector || b.distanceM > radiusM) continue
    const reg = b.registers.find((r) => r.capacity || r.rating)
    const reasons: string[] = []
    let score = 0
    const p = prox(b.distanceM)
    score += p
    reasons.push(`+${p} ${b.distanceM} m away`)
    if (site.subSector && b.subSector === site.subSector) { score += 15; reasons.push(`+15 same offer (${b.subSector})`) }
    if (reg?.capacity && site.capacity) {
      const ratio = reg.capacity / site.capacity
      if (ratio >= 1.25) { score += 15; reasons.push(`+15 larger (${reg.capacity} ${reg.capacityLabel ?? ''} vs ${site.capacity})`) }
      else if (ratio >= 0.75) { score += 10; reasons.push(`+10 similar scale (${reg.capacity} ${reg.capacityLabel ?? ''})`) }
    }
    if (reg?.rating && GOOD.test(reg.rating)) { score += 10; reasons.push(`+10 rated ${reg.rating}`) }
    if (reg?.rating && POOR.test(reg.rating)) { score -= 8; reasons.push(`-8 rated ${reg.rating}`) }
    if (b.operatorName && CHAIN_WORDS.test(b.operatorName) && b.operatorName !== site.operatorName) { score += 6; reasons.push('+6 group-backed operator') }
    if (b.distressFlags.length) { score -= 6; reasons.push(`-6 distress (${b.distressFlags[0]})`) }
    comps.push({ id: b.businessId, kind: 'demo', name: b.name, sector: b.sector, subSector: b.subSector, operatorName: b.operatorName, distanceM: b.distanceM, capacity: reg?.capacity, capacityLabel: reg?.capacityLabel, rating: reg?.rating, location: b.location.coordinates as [number, number], score, reasons })
  }
  // A real listing within 15 m of the site is the same premises (the demo operator is seated on a real footprint), not a competitor.
  let samePremises = 0
  for (const r of real) {
    if (r.sector !== site.sector || r.distanceM > radiusM) continue
    if (r.distanceM <= 15) { samePremises++; continue }
    const reasons: string[] = []
    let score = 0
    const p = prox(r.distanceM)
    score += p
    reasons.push(`+${p} ${r.distanceM} m away`)
    if (r.brand) { score += 8; reasons.push(`+8 branded (${r.brand})`) }
    if (r.confidence >= 0.8) { score += 4; reasons.push('+4 well-attested listing') }
    comps.push({ id: r.id, kind: 'real', name: r.name ?? r.category, sector: r.sector as Sector, category: r.category, brand: r.brand, distanceM: r.distanceM, location: r.location.coordinates as [number, number], score, reasons })
  }
  comps.sort((a, b) => b.score - a.score || a.distanceM - b.distanceM)
  const areaKm2 = Math.PI * (radiusM / 1000) ** 2
  const density = comps.length / areaKm2
  const high = HIGH_DENSITY[site.sector]
  const pressure: CompetitionResult['pressure'] = density >= high ? 'High' : density >= high / 2 ? 'Moderate' : 'Low'
  const demoCap = comps.filter((c) => c.kind === 'demo' && c.capacity).reduce((s, c) => s + (c.capacity ?? 0), 0)
  const capacityShare = site.capacity && demoCap + site.capacity > 0 ? site.capacity / (demoCap + site.capacity) : undefined
  const main = comps.slice(0, 5)
  const summary: string[] = []
  summary.push(`${comps.length} same-sector operator${comps.length === 1 ? '' : 's'} within ${radiusM >= 1000 ? `${radiusM / 1000} km` : `${radiusM} m`} (${density.toFixed(1)} per km²): ${pressure.toLowerCase()} competitive pressure for a ${site.sector.toLowerCase()}.`)
  if (comps[0]) summary.push(`Nearest is ${comps.find((c) => c.distanceM === Math.min(...comps.map((x) => x.distanceM)))?.name} at ${Math.min(...comps.map((x) => x.distanceM))} m; strongest is ${comps[0].name} (${comps[0].reasons.slice(1, 3).map((x) => x.replace(/^[+-]\d+ /, '')).join(', ') || 'closest'}).`)
  if (capacityShare !== undefined) summary.push(`The site holds ${Math.round(capacityShare * 100)}% of the same-sector capacity recorded in the radius.`)
  const branded = comps.filter((c) => c.brand || (c.operatorName && CHAIN_WORDS.test(c.operatorName))).length
  if (comps.length) summary.push(`${branded} of ${comps.length} are branded or group-backed; ${comps.length - branded} independent.`)
  if (samePremises) summary.push(`${samePremises} listing${samePremises === 1 ? '' : 's'} at the same premises excluded.`)
  return { radiusM, sector: site.sector, competitors: comps, main, demoCount: comps.filter((c) => c.kind === 'demo').length, realCount: comps.filter((c) => c.kind === 'real').length, densityPerKm2: density, capacityShare, pressure, nearestM: comps.length ? Math.min(...comps.map((c) => c.distanceM)) : undefined, summary }
}
