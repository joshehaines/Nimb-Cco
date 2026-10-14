import type { Polygon } from 'geojson'
import { Rng } from '../../lib/rng'
import { centroid, offset, point } from '../../lib/geo'
import type { Business, Comparable, Sector, Tenure } from '../types'
import * as N from './names'

/**
 * Synthetic sold-business comparables around the demo area plus a wider
 * Midlands ring, so radius filters have something to find at every distance.
 * Prices are anchored to plausible 2024-2026 UK trading-business values.
 */
const SECTOR_MODEL: Record<Sector, { unit?: string; perUnit: [number, number]; rvMult: [number, number]; ebitdaMult: [number, number]; price: [number, number]; capacity?: [number, number]; names: string[] }> = {
  'Care Home': { unit: 'beds', perUnit: [55_000, 160_000], rvMult: [18, 40], ebitdaMult: [7, 11], price: [1_500_000, 9_000_000], capacity: [20, 80], names: N.CARE_NAMES },
  Childcare: { unit: 'places', perUnit: [12_000, 38_000], rvMult: [20, 45], ebitdaMult: [4.5, 7.5], price: [350_000, 2_800_000], capacity: [30, 110], names: N.NURSERY_NAMES },
  Hotel: { unit: 'rooms', perUnit: [45_000, 180_000], rvMult: [8, 18], ebitdaMult: [8, 13], price: [900_000, 12_000_000], capacity: [10, 90], names: N.HOTEL_NAMES },
  Pub: { unit: 'letting rooms', perUnit: [60_000, 140_000], rvMult: [6, 15], ebitdaMult: [5, 9], price: [250_000, 2_200_000], capacity: [0, 10], names: N.PUB_NAMES },
  Restaurant: { perUnit: [0, 0], rvMult: [4, 12], ebitdaMult: [3.5, 6], price: [120_000, 1_100_000], names: N.RESTAURANT_NAMES },
  Dental: { unit: 'surgeries', perUnit: [220_000, 480_000], rvMult: [25, 60], ebitdaMult: [5.5, 8.5], price: [450_000, 2_400_000], capacity: [2, 7], names: N.DENTAL_NAMES },
  Medical: { unit: 'consulting rooms', perUnit: [150_000, 350_000], rvMult: [15, 35], ebitdaMult: [6, 9], price: [600_000, 3_500_000], capacity: [3, 12], names: N.MEDICAL_NAMES },
  Pharmacy: { unit: 'items/month (000s)', perUnit: [90_000, 190_000], rvMult: [30, 70], ebitdaMult: [6, 9.5], price: [500_000, 2_600_000], capacity: [4, 14], names: N.PHARMACY_NAMES },
  'Convenience Retail': { perUnit: [0, 0], rvMult: [8, 20], ebitdaMult: [3, 5.5], price: [150_000, 1_400_000], names: N.CONVENIENCE_NAMES },
  Leisure: { perUnit: [0, 0], rvMult: [5, 12], ebitdaMult: [4, 7], price: [300_000, 3_000_000], names: N.LEISURE_NAMES },
  'Garden Centre': { perUnit: [0, 0], rvMult: [6, 14], ebitdaMult: [5, 8], price: [800_000, 6_000_000], names: N.GARDEN_NAMES },
  Other: { perUnit: [0, 0], rvMult: [5, 12], ebitdaMult: [3, 6], price: [100_000, 1_000_000], names: ['Unit'] },
}

const TOWNS: { name: string; lon: number; lat: number; pcs: string[]; w: number }[] = [
  { name: 'Leamington Spa', lon: -1.535, lat: 52.289, pcs: ['CV32 4', 'CV32 5', 'CV31 1', 'CV31 3'], w: 30 },
  { name: 'Warwick', lon: -1.585, lat: 52.282, pcs: ['CV34 4', 'CV34 5', 'CV34 6'], w: 20 },
  { name: 'Kenilworth', lon: -1.58, lat: 52.345, pcs: ['CV8 1', 'CV8 2'], w: 8 },
  { name: 'Stratford-upon-Avon', lon: -1.707, lat: 52.192, pcs: ['CV37 6', 'CV37 7'], w: 10 },
  { name: 'Coventry', lon: -1.51, lat: 52.408, pcs: ['CV1 1', 'CV3 5', 'CV5 6', 'CV6 1'], w: 18 },
  { name: 'Rugby', lon: -1.263, lat: 52.37, pcs: ['CV21 2', 'CV22 5'], w: 8 },
  { name: 'Solihull', lon: -1.778, lat: 52.413, pcs: ['B91 3', 'B93 8'], w: 8 },
  { name: 'Banbury', lon: -1.34, lat: 52.061, pcs: ['OX16 5'], w: 6 },
  { name: 'Birmingham', lon: -1.898, lat: 52.486, pcs: ['B1 1', 'B15 2', 'B17 9', 'B28 8'], w: 14 },
  { name: 'Daventry', lon: -1.163, lat: 52.258, pcs: ['NN11 4'], w: 4 },
]

export function generateComparables(rng: Rng, businesses: Business[]): Comparable[] {
  const out: Comparable[] = []
  let id = 1
  const sectors = Object.keys(SECTOR_MODEL).filter((s) => s !== 'Other') as Sector[]
  const weights: Record<string, number> = { Pub: 22, Restaurant: 12, Hotel: 10, 'Care Home': 18, Childcare: 12, Dental: 8, Medical: 3, Pharmacy: 7, 'Convenience Retail': 8, Leisure: 2, 'Garden Centre': 1 }

  const make = (sector: Sector, lon: number, lat: number, town: string, pc: string, name: string, capacityOverride?: number, tenureOverride?: Tenure): Comparable => {
    const m = SECTOR_MODEL[sector]
    const tenure: Tenure = tenureOverride ?? (rng.bool(sector === 'Dental' || sector === 'Pharmacy' ? 0.3 : 0.6) ? 'Freehold' : 'Leasehold')
    const capacity = capacityOverride ?? (m.capacity ? rng.int(m.capacity[0], m.capacity[1]) : undefined)
    const date = rng.date(2019, 2026)
    const yearFactor = 1 + (Number(date.slice(0, 4)) - 2019) * 0.035
    let price: number
    if (capacity && m.perUnit[1] > 0 && capacity > 0) price = capacity * rng.float(m.perUnit[0], m.perUnit[1]) * yearFactor
    else price = rng.float(m.price[0], m.price[1]) * yearFactor
    if (tenure === 'Leasehold') price *= rng.float(0.25, 0.55)
    price = Math.round(price / 5000) * 5000
    const rv = Math.round(price / rng.float(m.rvMult[0], m.rvMult[1]) / 250) * 250
    const ebitdaMult = rng.float(m.ebitdaMult[0], m.ebitdaMult[1])
    const ebitda = Math.round(price / ebitdaMult / 1000) * 1000
    const turnover = Math.round(ebitda * rng.float(3.5, 8) / 1000) * 1000
    const contributed = rng.bool(0.35)
    return {
      source: contributed ? 'Christie & Co deal records' : rng.pick(['HMLR CCOD price paid', 'HMLR register', 'Press / agent reported']),
      licence: contributed ? 'Internal' : 'HMLR-CCOD',
      fetchedAt: new Date(Date.now() - rng.int(1, 60) * 86400000).toISOString(),
      compId: `C${String(id++).padStart(4, '0')}`,
      name,
      sector,
      subSector: sector === 'Care Home' ? rng.pick(['Nursing', 'Residential', 'Dementia nursing']) : sector === 'Pub' ? rng.pick(['Food-led', 'Wet-led', 'Pub with rooms', 'Destination']) : sector === 'Hotel' ? rng.pick(['Boutique', 'Full service', 'Guest house', 'Budget']) : undefined,
      address: `${rng.int(1, 140)} ${rng.pick(['High Street', 'Church Street', 'Station Road', 'London Road', 'Warwick Road', 'Mill Lane', 'Market Place', 'Park Road', 'Birmingham Road', 'The Green'])}, ${town}`,
      postcode: `${pc}${rng.pick(['AB', 'DG', 'EH', 'JL', 'NP', 'QR', 'TW', 'XY'])}`,
      location: point(lon, lat),
      date,
      price,
      tenure,
      capacity: capacity && capacity > 0 ? capacity : undefined,
      capacityLabel: capacity && capacity > 0 ? m.unit : undefined,
      rateableValue: rv,
      turnover,
      ebitda,
      pricePerUnit: capacity && capacity > 0 ? Math.round(price / capacity) : undefined,
      rvMultiple: rv ? Math.round((price / rv) * 10) / 10 : undefined,
      ebitdaMultiple: Math.round(ebitdaMult * 10) / 10,
      buyerType: rng.weighted([{ v: 'Group', w: 35 }, { v: 'Independent', w: 30 }, { v: 'Owner-operator', w: 25 }, { v: 'Investor', w: 10 }]),
      contributed,
      confidence: contributed ? 'Verified' : rng.bool(0.6) ? 'Reported' : 'Derived',
    }
  }

  // Deals on existing demo businesses (previous sales of the same sites)
  for (const b of businesses) {
    if (!rng.bool(0.45)) continue
    const cap = b.registers.find((r) => r.capacity)?.capacity
    const c = make(b.sector, b.location.coordinates[0], b.location.coordinates[1], b.address.split(', ').pop() ?? 'Leamington Spa', b.postcode.slice(0, -2), b.name, cap, b.tenure)
    c.address = b.address
    c.postcode = b.postcode
    out.push(c)
  }
  // Regional ring
  for (let i = 0; i < 260; i++) {
    const town = rng.weighted(TOWNS.map((t) => ({ v: t, w: t.w })))
    const sector = rng.weighted(sectors.map((s) => ({ v: s, w: weights[s] ?? 1 })))
    const [lon, lat] = offset(town.lon, town.lat, rng.float(-1800, 1800), rng.float(-1500, 1500))
    const name = rng.pick(SECTOR_MODEL[sector].names)
    out.push(make(sector, lon, lat, town.name, rng.pick(town.pcs), rng.bool(0.3) ? `${name} (${town.name})` : name))
  }
  return out.sort((a, b) => b.date.localeCompare(a.date))
}

export function titleCentroid(p: Polygon): [number, number] {
  return centroid(p) as [number, number]
}
