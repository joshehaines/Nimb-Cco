import type { Point, Polygon } from 'geojson'
import { Rng } from '../../lib/rng'
import { rect, offset, centroid, polygonAreaSqm, hexagon, haversineM, point, pointInPolygon } from '../../lib/geo'
import type {
  Alert,
  Business,
  Comparable,
  Company,
  Constraint,
  CrmRecord,
  EPC,
  FootfallCell,
  Hereditament,
  LeaseSummary,
  PlanningApplication,
  Proprietor,
  RegisterRecord,
  Sector,
  Title,
  TrafficCount,
  DistressFlag,
} from '../types'
import * as N from './names'
import { generateComparables } from './comparables'
import { Grid } from '../../lib/grid'
import type { RealLayers } from '../real'

export interface Dataset {
  comparables: Comparable[]
  streets: { name: string; major: boolean; coordinates: [number, number][] }[]
  titles: Map<string, Title>
  companies: Map<string, Company>
  businesses: Map<string, Business>
  hereditaments: Map<string, Hereditament>
  epcs: Map<string, EPC>
  planning: Map<string, PlanningApplication>
  constraints: Constraint[]
  traffic: TrafficCount[]
  footfall: FootfallCell[]
  alerts: Alert[]
  crm: CrmRecord[]
  centre: [number, number]
  /** Real open data the dataset was seated on, when available. */
  real?: RealLayers
}


const iso = (d: Date) => d.toISOString().slice(0, 10)
const addYears = (isoDate: string, years: number) => {
  const d = new Date(isoDate)
  d.setFullYear(d.getFullYear() + years)
  return iso(d)
}
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000))
const fetched = (source: string, licence: Title['licence'], ageDays = 3) => ({ source, licence, fetchedAt: new Date(Date.now() - ageDays * 86400000).toISOString() })

const SIC: Record<Sector, string[]> = {
  Pub: ['56302'],
  Restaurant: ['56101'],
  Hotel: ['55100'],
  'Care Home': ['87100', '87300'],
  Childcare: ['88910'],
  Dental: ['86230'],
  Medical: ['86210', '86220'],
  Pharmacy: ['47730'],
  'Convenience Retail': ['47110', '47300'],
  Leisure: ['93130', '59140'],
  'Garden Centre': ['47760'],
  Other: ['68209'],
}

const VOA_DESC: Record<Sector, { desc: string; scat: string; rvRange: [number, number]; area: [number, number] }> = {
  Pub: { desc: 'Public House and Premises', scat: '226', rvRange: [12_000, 95_000], area: [180, 650] },
  Restaurant: { desc: 'Restaurant and Premises', scat: '235', rvRange: [15_000, 80_000], area: [120, 420] },
  Hotel: { desc: 'Hotel and Premises', scat: '137', rvRange: [40_000, 420_000], area: [600, 4500] },
  'Care Home': { desc: 'Care Home and Premises', scat: '062', rvRange: [25_000, 190_000], area: [800, 3200] },
  Childcare: { desc: 'Day Nursery and Premises', scat: '082', rvRange: [9_000, 48_000], area: [150, 520] },
  Dental: { desc: 'Surgery and Premises', scat: '275', rvRange: [10_000, 45_000], area: [90, 300] },
  Medical: { desc: 'Surgery and Premises', scat: '275', rvRange: [25_000, 160_000], area: [300, 1400] },
  Pharmacy: { desc: 'Shop and Premises', scat: '249', rvRange: [12_000, 60_000], area: [80, 260] },
  'Convenience Retail': { desc: 'Shop and Premises', scat: '249', rvRange: [10_000, 85_000], area: [90, 450] },
  Leisure: { desc: 'Leisure Centre and Premises', scat: '155', rvRange: [30_000, 260_000], area: [500, 3000] },
  'Garden Centre': { desc: 'Garden Centre and Premises', scat: '122', rvRange: [40_000, 220_000], area: [1500, 9000] },
  Other: { desc: 'Shop and Premises', scat: '249', rvRange: [6_000, 40_000], area: [50, 250] },
}

const SECTOR_PLAN: { sector: Sector; count: number; names: string[]; groups: string[] }[] = [
  { sector: 'Pub', count: 30, names: N.PUB_NAMES, groups: N.PUBCOS },
  { sector: 'Restaurant', count: 20, names: N.RESTAURANT_NAMES, groups: [] },
  { sector: 'Hotel', count: 11, names: N.HOTEL_NAMES, groups: N.HOTEL_GROUPS },
  { sector: 'Care Home', count: 18, names: N.CARE_NAMES, groups: N.CARE_GROUPS },
  { sector: 'Childcare', count: 14, names: N.NURSERY_NAMES, groups: N.NURSERY_GROUPS },
  { sector: 'Dental', count: 10, names: N.DENTAL_NAMES, groups: N.DENTAL_GROUPS },
  { sector: 'Medical', count: 6, names: N.MEDICAL_NAMES, groups: [] },
  { sector: 'Pharmacy', count: 11, names: N.PHARMACY_NAMES, groups: N.PHARMACY_GROUPS },
  { sector: 'Convenience Retail', count: 14, names: N.CONVENIENCE_NAMES, groups: N.RETAIL_GROUPS },
  { sector: 'Leisure', count: 5, names: N.LEISURE_NAMES, groups: [] },
  { sector: 'Garden Centre', count: 3, names: N.GARDEN_NAMES, groups: [] },
]

export function generateDataset(seed = 20261013, real?: RealLayers): Dataset {
  const rng = new Rng(seed)
  const centre: [number, number] = [-1.5455, 52.287]

  // ---------------------------------------------------------------- companies
  const companies = new Map<string, Company>()
  const personName = () => `${rng.pick(N.FIRST_NAMES)} ${rng.pick(N.LAST_NAMES)}`
  const makeCompany = (name: string, sector: Sector | 'Property' | 'Overseas', opts: { parent?: string; status?: Company['status'] } = {}): Company => {
    const companyNumber = sector === 'Overseas' ? `FC${String(rng.int(10000, 39999)).padStart(6, '0')}` : String(rng.int(2_000_000, 15_999_999)).padStart(8, '0')
    const status: Company['status'] = opts.status ?? rng.weighted([
      { v: 'active', w: 86 },
      { v: 'administration', w: 3 },
      { v: 'liquidation', w: 2 },
      { v: 'receivership', w: 1 },
      { v: 'dissolved', w: 5 },
      { v: 'dormant', w: 3 },
    ])
    const incorporated = rng.date(1985, 2022)
    const accountsOverdue = status === 'active' ? rng.bool(0.1) : status !== 'dissolved' && rng.bool(0.5)
    const nCharges = rng.weighted([{ v: 0, w: 35 }, { v: 1, w: 40 }, { v: 2, w: 18 }, { v: 3, w: 7 }])
    const charges = Array.from({ length: nCharges }, () => ({ lender: rng.pick(N.LENDERS), created: rng.date(2010, 2026), satisfied: rng.bool(0.3) }))
    const officers = Array.from({ length: rng.int(1, 4) }, () => ({ name: personName(), role: rng.pick(['Director', 'Director', 'Secretary']), appointed: rng.date(2005, 2025) }))
    const pscs = opts.parent
      ? [{ name: companies.get(opts.parent)?.name ?? 'Parent', kind: 'corporate' as const, companyNumber: opts.parent }]
      : [{ name: officers[0].name, kind: 'individual' as const }]
    const gazetteNotices = ['administration', 'liquidation', 'receivership'].includes(status)
      ? [{ type: status === 'administration' ? 'Appointment of administrators' : status === 'liquidation' ? 'Resolution for winding-up' : 'Appointment of receivers', date: daysAgo(rng.int(10, 400)) }]
      : []
    const c: Company = {
      ...fetched('Companies House', 'OGL', 0),
      companyNumber,
      name,
      status,
      incorporated,
      sicCodes: sector === 'Property' ? ['68209', '68100'] : sector === 'Overseas' ? ['68209'] : SIC[sector],
      registeredAddress: `${rng.int(1, 120)} ${rng.pick(N.STREETS).name}, ${rng.bool(0.6) ? 'Leamington Spa' : 'Warwick'}, ${rng.pick(['CV32 4AB', 'CV31 3AF', 'CV34 4EW', 'CV32 5EG'])}`,
      accountsOverdue,
      lastAccountsMadeUpTo: rng.date(2023, 2025),
      charges,
      officers,
      pscs,
      parentCompanyNumber: opts.parent,
      gazetteNotices,
    }
    companies.set(companyNumber, c)
    return c
  }

  const groupCompanies = new Map<string, Company>() // name -> company
  for (const plan of SECTOR_PLAN) for (const g of plan.groups) groupCompanies.set(g, makeCompany(g, plan.sector, { status: g.includes('plc') ? 'active' : undefined }))
  // A couple of group structures with subsidiaries
  const ardenInns = groupCompanies.get('Arden Inns Group Ltd')!
  const ardenSubs = ['Arden Inns (Leamington) Ltd', 'Arden Inns (Warwick) Ltd'].map((n) => makeCompany(n, 'Pub', { parent: ardenInns.companyNumber, status: 'active' }))
  const ardenCare = groupCompanies.get('Arden Care Group Ltd')!
  const ardenCareSubs = ['Arden Care (Midlands) Ltd', 'Arden Care Properties Ltd'].map((n) => makeCompany(n, 'Care Home', { parent: ardenCare.companyNumber, status: 'active' }))
  const propcos = N.PROPCOS.map((n) => makeCompany(n, 'Property'))
  const overseas = N.OVERSEAS.map((n) => makeCompany(n, 'Overseas', { status: 'active' }))
  // Independent operators (single-site companies) created on demand

  // ------------------------------------------------------------------ titles
  const titles = new Map<string, Title>()
  const usedTitleNumbers = new Set<string>()
  const titleNumber = () => {
    let tn = `WK${rng.int(100000, 999999)}`
    while (usedTitleNumbers.has(tn)) tn = `WK${rng.int(100000, 999999)}`
    usedTitleNumbers.add(tn)
    return tn
  }
  let inspireCounter = 25_000_000 + rng.int(0, 500_000)

  type StreetLike = { roadId: string; name: string; lon: number; lat: number; bearing: number; lengthM: number; commercial: number; major: boolean; half: number; postcodes: string[]; town: string }
  type Parcel = { title: Title; street: StreetLike; commercial: boolean; houseNo: number; cx: number; cy: number }
  const parcels: Parcel[] = []

  // Local metre frame for all geometry tests.
  const origin: [number, number] = real ? [-1.56, 52.285] : [N.STREETS[0].lon, N.STREETS[0].lat]
  const mPerLon = 111_320 * Math.cos((origin[1] * Math.PI) / 180)
  const toM = (lon: number, lat: number): [number, number] => [(lon - origin[0]) * mPerLon, (lat - origin[1]) * 111_320]

  // Real places (Overture) drive where the commercial frontages are and supply real postcodes.
  type Poi = { x: number; y: number; postcode?: string; locality?: string; sector: string }
  const poiGrid = new Grid<Poi>(60)
  const poisBySector = new Map<string, Poi[]>()
  if (real) {
    for (const f of real.places.features) {
      const [x, y] = toM(f.geometry.coordinates[0], f.geometry.coordinates[1])
      const poi: Poi = { x, y, postcode: f.properties.postcode, locality: f.properties.locality, sector: f.properties.sector }
      poiGrid.add(x, y, poi)
      const list = poisBySector.get(poi.sector) ?? []
      list.push(poi)
      poisBySector.set(poi.sector, list)
    }
    for (const [k, v] of poisBySector) poisBySector.set(k, rng.shuffle(v))
  }
  const townFor = (pc: string | undefined, lon: number, locality?: string) => locality ?? (pc?.startsWith('CV34') ? 'Warwick' : pc?.startsWith('CV8') ? 'Kenilworth' : pc?.startsWith('BS') ? 'Bristol' : pc ? 'Leamington Spa' : lon < -2 ? 'Bristol' : lon < -1.56 ? 'Warwick' : 'Leamington Spa')
  const authorityFor = (lon: number, lat: number) => real?.areas.find((a) => a.windows.some(([w, s0, e, n]) => lon >= w && lon <= e && lat >= s0 && lat <= n))?.authority ?? 'Warwick District Council'
  const nearestPostcode = (x: number, y: number): string | undefined => {
    let best: Poi | undefined
    let bd = 400
    for (const p of poiGrid.near(x, y, 400)) {
      if (!p.postcode) continue
      const d = Math.hypot(p.x - x, p.y - y)
      if (d < bd) {
        bd = d
        best = p
      }
    }
    return best?.postcode
  }

  // Streets: real Overture road centrelines in the two town-centre windows (merged into
  // straight chords), or the schematic street list when the open data is not present.
  const streets: StreetLike[] = []
  const blockers: StreetLike[] = [] // every road that plots must not cross, district-wide
  const HALF: Record<string, number> = { motorway: 14, trunk: 11, primary: 9, secondary: 8, tertiary: 7, residential: 6, unclassified: 6, living_street: 5, pedestrian: 5 }
  const WINDOWS: [number, number, number, number][] = real ? real.areas.flatMap((a) => a.windows) : [[-1.552, 52.277, -1.518, 52.3], [-1.6, 52.274, -1.566, 52.291]]
  const inWindow = (lon: number, lat: number) => WINDOWS.some(([a, b, c, d]) => lon >= a && lon <= c && lat >= b && lat <= d)
  if (real) {
    for (const f of real.roads.features) {
      const half = HALF[f.properties.class]
      if (half === undefined) continue
      const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
      for (const line of lines) {
        // merge near-collinear vertices into chords so plots can run along gentle curves
        let i = 0
        while (i < line.length - 1) {
          let j = i + 1
          const [x0, y0] = toM(line[i][0], line[i][1])
          let [xj, yj] = toM(line[j][0], line[j][1])
          let bearing = Math.atan2(xj - x0, yj - y0)
          while (j + 1 < line.length) {
            const [xn, yn] = toM(line[j + 1][0], line[j + 1][1])
            const bn = Math.atan2(xn - x0, yn - y0)
            const diff = Math.abs(((bn - bearing + Math.PI) % (2 * Math.PI)) - Math.PI)
            if (diff > (10 * Math.PI) / 180 || Math.hypot(xn - x0, yn - y0) > 160) break
            j++
            ;[xj, yj] = [xn, yn]
            bearing = Math.atan2(xj - x0, yj - y0)
          }
          const lengthM = Math.hypot(xj - x0, yj - y0)
          const midLon = (line[i][0] + line[j][0]) / 2
          const midLat = (line[i][1] + line[j][1]) / 2
          const st: StreetLike = { roadId: f.properties.id, name: f.properties.name ?? 'Unnamed road', lon: line[i][0], lat: line[i][1], bearing: ((bearing * 180) / Math.PI + 360) % 360, lengthM, commercial: 0, major: f.properties.major, half, postcodes: [], town: '' }
          if (lengthM >= 2) blockers.push(st)
          if (lengthM >= 6 && inWindow(midLon, midLat)) {
            const [mx, my] = toM(midLon, midLat)
            const pois = poiGrid.near(mx, my, 60 + lengthM / 2).filter((q) => Math.hypot(q.x - mx, q.y - my) < 45 + lengthM / 2)
            st.commercial = Math.min(0.95, pois.length === 0 ? (f.properties.class === 'pedestrian' ? 0.6 : 0.04) : 0.15 + 0.12 * pois.length)
            const pcs = pois.map((q) => q.postcode).filter((q): q is string => !!q)
            const fallback = nearestPostcode(mx, my) ?? (midLon < -1.56 ? 'CV34 4AB' : 'CV32 4AB')
            st.postcodes = pcs.length ? pcs : [fallback]
            st.town = townFor(st.postcodes[0], midLon, pois.find((q) => q.locality)?.locality)
            streets.push(st)
          }
          i = j
        }
      }
    }
  } else {
    for (const st of N.STREETS) {
      const sl: StreetLike = { roadId: st.name, name: st.name, lon: st.lon, lat: st.lat, bearing: st.bearing, lengthM: st.lengthM, commercial: st.commercial, major: !!st.major, half: st.major ? 11 : 8, postcodes: st.postcodes, town: st.postcodes[0].startsWith('CV34') ? 'Warwick' : 'Leamington Spa' }
      streets.push(sl)
      blockers.push(sl)
    }
  }

  // Parcel fabric. Real INSPIRE polygons tile the land along each street frontage and
  // do not overlap, so plots are laid end to end on both sides of every street, rotated
  // to the street bearing, and dropped where they would cross another road or an
  // existing plot (junctions, back-to-back plots).
  const roadGrid = new Grid<{ st: StreetLike; x: number; y: number; dx: number; dy: number }>(40)
  for (const st of blockers) {
    const [x, y] = toM(st.lon, st.lat)
    const b = (st.bearing * Math.PI) / 180
    const seg = { st, x, y, dx: Math.sin(b), dy: Math.cos(b) }
    // register the segment in every cell it passes through
    for (let t = 0; t <= st.lengthM; t += 30) roadGrid.add(x + seg.dx * t, y + seg.dy * t, seg)
    roadGrid.add(x + seg.dx * st.lengthM, y + seg.dy * st.lengthM, seg)
  }
  const nearOtherRoad = (lon: number, lat: number, self: StreetLike) => {
    const [px, py] = toM(lon, lat)
    const seen = new Set<StreetLike>()
    for (const g of roadGrid.near(px, py, 40)) {
      if (g.st.roadId === self.roadId || seen.has(g.st)) continue
      seen.add(g.st)
      const t = Math.max(0, Math.min(g.st.lengthM, (px - g.x) * g.dx + (py - g.y) * g.dy))
      const dx = px - (g.x + g.dx * t)
      const dy = py - (g.y + g.dy * t)
      if (Math.hypot(dx, dy) < g.st.half + 2) return true
    }
    return false
  }
  const parcelGrid = new Grid<Parcel>(50)
  const insideExisting = (lon: number, lat: number) => {
    const [px, py] = toM(lon, lat)
    for (const q of parcelGrid.near(px, py, 80)) if (pointInPolygon([lon, lat], q.title.geometry as Polygon)) return true
    return false
  }
  const houseCounters = new Map<string, [number, number]>()

  for (const street of streets) {
    const b = (street.bearing * Math.PI) / 180
    const dirX = Math.sin(b)
    const dirY = Math.cos(b)
    const perpX = Math.cos(b)
    const perpY = -Math.sin(b)
    const half = street.half
    const counters = houseCounters.get(street.name) ?? [1, 2]
    houseCounters.set(street.name, counters)
    for (const side of [-1, 1]) {
      let along = 0
      let houseNo = counters[side === -1 ? 0 : 1]
      while (along < street.lengthM) {
        const commercialStreet = street.commercial >= 0.6
        const big = rng.bool(0.07)
        const width = big ? rng.int(26, 44) : commercialStreet ? rng.int(6, 14) : rng.int(8, 18)
        const depth = big ? rng.int(40, 70) : commercialStreet ? rng.int(24, 46) : rng.int(30, 60)
        if (along + width > street.lengthM) break
        const [plon, plat] = offset(street.lon, street.lat, dirX * (along + width / 2) + perpX * side * (half + depth / 2), dirY * (along + width / 2) + perpY * side * (half + depth / 2))
        const geometry = rect(plon, plat, width, depth, 90 - street.bearing)
        const ring = geometry.coordinates[0]
        const swallows = () => {
          const [px, py] = toM(plon, plat)
          return parcelGrid.near(px, py, 80).some((q) => pointInPolygon([q.cx, q.cy], geometry))
        }
        const blocked = ring.some(([x, y]) => nearOtherRoad(x, y, street)) || insideExisting(plon, plat) || ring.slice(0, 4).some(([x, y]) => insideExisting(x, y)) || swallows()
        if (blocked) {
          along += width
          continue
        }
        const commercial = rng.bool(street.commercial)
        const tn = titleNumber()
        const catRoll = rng.next()
        let proprietors: Proprietor[]
        let category: Proprietor['category']
        if (!commercial && catRoll < 0.8) category = 'Private Individual'
        else if (catRoll < 0.5) category = 'Limited Company or Public Limited Company'
        else if (catRoll < 0.78) category = 'Private Individual'
        else if (catRoll < 0.84) category = 'Local Authority'
        else if (catRoll < 0.9) category = 'Charity'
        else if (catRoll < 0.94) category = 'Overseas Company'
        else category = 'Limited Company or Public Limited Company'

        if (category === 'Private Individual') {
          const n = rng.int(1, 2)
          proprietors = Array.from({ length: n }, () => ({ name: personName(), category, redacted: true }))
        } else if (category === 'Local Authority') {
          proprietors = [{ name: rng.pick(N.LOCAL_AUTHORITIES), category }]
        } else if (category === 'Charity') {
          proprietors = [{ name: rng.pick(N.CHARITIES), category }]
        } else if (category === 'Overseas Company') {
          const c = rng.pick(overseas)
          proprietors = [{ name: c.name, category, companyNumber: c.companyNumber, address: c.registeredAddress }]
        } else {
          const c = rng.pick(propcos)
          proprietors = [{ name: c.name, category, companyNumber: c.companyNumber, address: c.registeredAddress }]
        }
        const pricePaidDate = rng.bool(0.7) ? rng.date(1996, 2025) : undefined
        const areaSqm = Math.round(polygonAreaSqm(geometry))
        const title: Title = {
          ...fetched(category === 'Private Individual' ? 'HMLR INSPIRE' : 'HMLR CCOD', category === 'Private Individual' ? 'OGL' : 'HMLR-CCOD', 9),
          titleNumber: tn,
          inspireId: inspireCounter++,
          tenure: 'Freehold',
          address: `${houseNo} ${street.name}, ${street.town}`,
          postcode: rng.pick(street.postcodes),
          uprn: String(100070000000 + rng.int(1, 9_999_999)),
          geometry,
          areaSqm,
          proprietors,
          pricePaid: pricePaidDate ? Math.round(areaSqm * rng.float(commercial ? 1800 : 2600, commercial ? 6500 : 7800) / 100) * 100 : undefined,
          pricePaidDate,
          dateProprietorAdded: pricePaidDate ?? rng.date(1990, 2020),
          leases: [],
          registerPurchased: false,
          titlePlanPurchased: false,
          charges: rng.bool(0.35) ? [{ lender: rng.pick(N.LENDERS), date: rng.date(2012, 2026) }] : [],
        }
        titles.set(tn, title)
        const parcel: Parcel = { title, street, commercial, houseNo, cx: plon, cy: plat }
        parcels.push(parcel)
        {
          const [px, py] = toM(plon, plat)
          parcelGrid.add(px, py, parcel)
        }
        houseNo += 2
        along += width
      }
      counters[side === -1 ? 0 : 1] = houseNo
    }
  }

  // ------------------------------------------------------------- businesses
  const businesses = new Map<string, Business>()
  const hereditaments = new Map<string, Hereditament>()
  const epcs = new Map<string, EPC>()
  const commercialParcels = rng.shuffle(parcels.filter((p) => p.commercial))
  const usedParcels = new Set<Parcel>()
  let parcelIdx = 0
  // Prefer a plot next to a real place of the same sector (so demo pubs sit where pubs are),
  // otherwise the next unused commercial plot.
  const nextParcel = (sector: Sector): Parcel => {
    const pois = poisBySector.get(sector)
    while (pois && pois.length) {
      const poi = pois.pop()!
      const cands = parcelGrid.near(poi.x, poi.y, 90).filter((q) => !usedParcels.has(q)).map((q) => ({ q, d: Math.hypot(toM(q.cx, q.cy)[0] - poi.x, toM(q.cx, q.cy)[1] - poi.y) })).filter((c) => c.d < 90).sort((a, b) => a.d - b.d)
      if (cands[0]) {
        usedParcels.add(cands[0].q)
        cands[0].q.commercial = true
        return cands[0].q
      }
    }
    for (let i = 0; i < commercialParcels.length; i++) {
      const q = commercialParcels[parcelIdx++ % commercialParcels.length]
      if (!usedParcels.has(q)) {
        usedParcels.add(q)
        return q
      }
    }
    return commercialParcels[parcelIdx++ % commercialParcels.length]
  }

  const makeRegister = (sector: Sector, name: string, b: { capacity?: number; distress: boolean }): RegisterRecord[] => {
    const regs: RegisterRecord[] = []
    const regDate = rng.date(2008, 2024)
    const rating = (opts: string[], bad: string) => (b.distress && rng.bool(0.6) ? bad : rng.pick(opts))
    if (['Care Home', 'Dental', 'Medical'].includes(sector)) {
      regs.push({
        ...fetched('CQC', 'OGL', 2),
        register: 'CQC',
        registerId: `1-${rng.int(100000000, 999999999)}`,
        name,
        status: 'Registered',
        registeredAt: regDate,
        rating: rating(['Good', 'Good', 'Good', 'Outstanding', 'Requires improvement'], 'Inadequate'),
        ratingDate: rng.date(2022, 2026),
        capacity: sector === 'Care Home' ? b.capacity : undefined,
        capacityLabel: sector === 'Care Home' ? 'beds' : undefined,
        extra: sector === 'Care Home' ? { serviceTypes: rng.pick(['Nursing home', 'Residential home', 'Nursing and residential']), registeredManager: personName(), dementia: rng.bool(0.6) } : { nhsContract: rng.bool(0.7) },
      })
    }
    if (sector === 'Childcare') {
      regs.push({
        ...fetched('Ofsted', 'OGL', 20),
        register: 'Ofsted',
        registerId: `EY${rng.int(100000, 599999)}`,
        name,
        status: 'Registered',
        registeredAt: regDate,
        rating: rating(['Good', 'Good', 'Outstanding', 'Requires improvement'], 'Inadequate'),
        ratingDate: rng.date(2021, 2026),
        capacity: b.capacity,
        capacityLabel: 'places',
        extra: { registers: 'Early Years Register, Childcare Register' },
      })
    }
    if (sector === 'Pharmacy') {
      const items = rng.int(4000, 14000)
      regs.push({
        ...fetched('NHSBSA', 'OGL', 25),
        register: 'NHSBSA',
        registerId: `F${rng.id('', 4).replace(/[^A-Z0-9]/g, 'A')}`,
        name,
        status: 'Registered',
        registeredAt: regDate,
        extra: { itemsPerMonth: items, itemsChange12m: b.distress ? -rng.int(8, 22) : rng.int(-4, 9), contract: rng.pick(['40 hour', '100 hour', 'LPS']) },
      })
      regs.push({ ...fetched('GPhC', 'Vendor', 40), register: 'GPhC', registerId: String(rng.int(1030000, 1119999)), name, status: 'Registered', registeredAt: regDate, extra: { superintendent: personName() } })
    }
    if (['Pub', 'Restaurant', 'Hotel', 'Care Home', 'Childcare', 'Convenience Retail', 'Garden Centre', 'Leisure'].includes(sector)) {
      const fhrs = b.distress && rng.bool(0.4) ? rng.int(0, 1) : rng.weighted([{ v: 5, w: 55 }, { v: 4, w: 25 }, { v: 3, w: 12 }, { v: 2, w: 5 }, { v: 1, w: 3 }])
      regs.push({
        ...fetched('FSA FHRS', 'OGL', 0),
        register: 'FSA',
        registerId: String(rng.int(100000, 1599999)),
        name,
        status: 'Registered',
        rating: String(fhrs),
        ratingDate: rng.date(2023, 2026),
        extra: { businessType: sector === 'Pub' ? 'Pub/bar/nightclub' : sector === 'Restaurant' ? 'Restaurant/Cafe/Canteen' : sector === 'Hotel' ? 'Hotel/bed & breakfast/guest house' : sector === 'Care Home' ? 'Hospitals/Childcare/Caring Premises' : sector === 'Childcare' ? 'Hospitals/Childcare/Caring Premises' : 'Retailers - other' },
      })
    }
    if (['Pub', 'Restaurant', 'Hotel'].includes(sector)) {
      regs.push({
        ...fetched('Warwick DC Licensing', 'OGL', 60),
        register: 'Premises Licence',
        registerId: `PL${rng.int(1000, 9999)}`,
        name,
        status: 'Registered',
        registeredAt: regDate,
        extra: { dps: personName(), hours: rng.pick(['11:00-23:00', '10:00-00:00', '12:00-01:00 Fri-Sat']), activities: 'Sale of alcohol, late night refreshment' },
      })
    }
    return regs
  }

  const independentCompany = (name: string, sector: Sector, distress: boolean) =>
    makeCompany(`${name.replace(/^The /, '').replace(/'/g, '')} Ltd`, sector, distress ? { status: rng.pick(['administration', 'liquidation', 'active', 'active']) } : {})

  // Demo names must not coincide with a real business in the area: synthetic ownership,
  // regulator and distress attributes would otherwise read as claims about a real trader.
  const normName = (n: string) => n.toLowerCase().replace(/^the /, '').replace(/[^a-z0-9]/g, '')
  const realNames = new Set((real?.places.features ?? []).map((f) => normName(f.properties.name ?? '')))
  const SECTOR_WORD: Record<Sector, string> = { Pub: 'Arms', Restaurant: 'Kitchen', Hotel: 'House Hotel', 'Care Home': 'Lodge Care Home', Childcare: 'Day Nursery', Dental: 'Dental Practice', Medical: 'Medical Centre', Pharmacy: 'Pharmacy', 'Convenience Retail': 'Stores', Leisure: 'Leisure Club', 'Garden Centre': 'Nurseries', Other: 'Enterprises' }
  const usedNames = new Set<string>()
  const demoNames = (sector: Sector, pool: string[], count: number) => {
    const out: string[] = []
    for (const n of rng.shuffle(pool)) {
      if (out.length >= count) break
      if (realNames.has(normName(n)) || usedNames.has(normName(n))) continue
      out.push(n)
    }
    let guard = 0
    while (out.length < count && guard++ < 500) {
      const n = sector === 'Pub' ? `The ${rng.pick(N.LAST_NAMES)} ${SECTOR_WORD[sector]}` : `${rng.pick(N.LAST_NAMES)} ${SECTOR_WORD[sector]}`
      if (realNames.has(normName(n)) || usedNames.has(normName(n))) continue
      out.push(n)
    }
    for (const n of out) usedNames.add(normName(n))
    return out
  }

  let bizCounter = 1
  for (const plan of SECTOR_PLAN) {
    const names = demoNames(plan.sector, plan.names, plan.count * Math.max(1, real?.areas.length ?? 1))
    for (const name of names) {
      const sector = plan.sector
      const parcel = nextParcel(sector)
      const title = parcel.title
      const distress = rng.bool(0.14)
      const capacity =
        sector === 'Care Home' ? rng.int(18, 84) : sector === 'Childcare' ? rng.int(24, 96) : sector === 'Hotel' ? rng.int(8, 120) : sector === 'Pub' ? (rng.bool(0.4) ? rng.int(3, 12) : undefined) : undefined

      // Operator company: group (60% where groups exist) or independent
      let operator: Company
      if (plan.groups.length && rng.bool(0.6)) {
        const g = rng.pick(plan.groups)
        operator = groupCompanies.get(g)!
        if (g === 'Arden Inns Group Ltd') operator = rng.pick(ardenSubs)
        if (g === 'Arden Care Group Ltd') operator = rng.pick(ardenCareSubs)
      } else {
        operator = independentCompany(name, sector, distress)
      }
      if (distress && operator.status === 'active') operator.accountsOverdue = true

      // Tenure: 45% the operator owns the freehold; otherwise leasehold from title proprietor
      const ownsFreehold = rng.bool(0.45)
      let tenure: Business['tenure'] = 'Leasehold'
      if (ownsFreehold) {
        title.proprietors = [{ name: operator.name, category: operator.companyNumber.startsWith('FC') ? 'Overseas Company' : 'Limited Company or Public Limited Company', companyNumber: operator.companyNumber, address: operator.registeredAddress }]
        title.source = 'HMLR CCOD'
        title.licence = 'HMLR-CCOD'
        tenure = 'Freehold'
      } else {
        // 20% of leases are to a pubco/care group from a propco; keep the proprietor as is
        const dateOfLease = rng.date(1998, 2023)
        const termYears = rng.pick([10, 15, 15, 20, 20, 25, 25, 35, 99, 125])
        const expiry = addYears(dateOfLease, termYears)
        const lease: LeaseSummary = {
          ...fetched('HMLR Registered Leases', 'HMLR-CCOD', 9),
          leaseId: `L${rng.int(100000, 999999)}`,
          freeholdTitleNumber: title.titleNumber,
          leaseholdTitleNumber: titleNumber(),
          dateOfLease,
          termYears,
          termDescription: `${termYears} years from ${dateOfLease}`,
          expiryDate: expiry,
          premium: rng.bool(0.3) ? rng.int(20, 400) * 1000 : undefined,
          lessee: operator.name,
          alienationClause: rng.bool(0.7),
        }
        title.leases.push(lease)
      }

      const location = point(...(centroid(title.geometry as Polygon) as [number, number]))
      const voa = VOA_DESC[sector]
      const area = rng.int(voa.area[0], voa.area[1])
      const uarn = String(rng.int(10000000000, 19999999999))
      const rv = Math.round(rng.int(voa.rvRange[0], voa.rvRange[1]) / 250) * 250
      hereditaments.set(uarn, {
        ...fetched('VOA', 'VOA-Restricted', 3),
        uarn,
        uprn: title.uprn,
        address: `${name.toUpperCase()}, ${title.address.toUpperCase()}`,
        postcode: title.postcode,
        description: voa.desc,
        scatCode: voa.scat,
        rateableValue: rv,
        listYear: 2026,
        totalAreaSqm: area,
        floors: sector === 'Pub' || sector === 'Hotel' ? [
          { floor: 'Ground', use: sector === 'Pub' ? 'Bar / trading area' : 'Reception, bar, restaurant', areaSqm: Math.round(area * 0.55) },
          { floor: 'First', use: sector === 'Pub' ? 'Function room / letting rooms' : 'Bedrooms', areaSqm: Math.round(area * 0.35) },
          { floor: 'Basement', use: 'Cellar / stores', areaSqm: Math.round(area * 0.1) },
        ] : [{ floor: 'Ground', use: 'Trading', areaSqm: Math.round(area * 0.7) }, { floor: 'First', use: 'Ancillary', areaSqm: Math.round(area * 0.3) }],
        effectiveDate: '2026-04-01',
      })
      const epcId = `${rng.int(1000, 9999)}-${rng.int(1000, 9999)}-${rng.int(1000, 9999)}-${rng.int(1000, 9999)}-${rng.int(1000, 9999)}`
      const score = rng.int(18, 130)
      const rating = score <= 25 ? 'A' : score <= 50 ? 'B' : score <= 75 ? 'C' : score <= 100 ? 'D' : score <= 125 ? 'E' : 'F'
      const lodged = rng.date(2017, 2026)
      epcs.set(epcId, {
        ...fetched('MHCLG EPC', 'OGL', 1),
        certificateId: epcId,
        uprn: title.uprn,
        address: title.address,
        postcode: title.postcode,
        kind: 'non-domestic',
        rating,
        score,
        floorAreaSqm: Math.round(area * rng.float(0.9, 1.1)),
        lodgedAt: lodged,
        expiresAt: addYears(lodged, 10),
        mainHeating: rng.pick(['Natural gas boiler', 'Air source heat pump', 'Electric heating', 'Oil boiler']),
      })

      const flags: DistressFlag[] = []
      if (operator.status === 'administration') flags.push('Administration')
      if (operator.status === 'liquidation') flags.push('Liquidation')
      if (operator.status === 'receivership') flags.push('Receivership')
      if (operator.accountsOverdue) flags.push('Late accounts')
      if (operator.gazetteNotices.length) flags.push('Gazette notice')
      const registers = makeRegister(sector, name, { capacity, distress })
      if (registers.some((r) => r.rating === 'Inadequate')) flags.push('Regulator inadequate')
      const fsa = registers.find((r) => r.register === 'FSA')
      if (fsa && Number(fsa.rating) <= 1) flags.push('FHRS 0-1')
      const nhs = registers.find((r) => r.register === 'NHSBSA')
      if (nhs && Number(nhs.extra?.itemsChange12m) < -8) flags.push('Dispensing volume falling')
      if (operator.charges.some((c) => !c.satisfied && new Date(c.created) > new Date(Date.now() - 120 * 86400000))) flags.push('New charge registered')

      const freeholder = title.proprietors[0]
      const businessId = `B${String(bizCounter++).padStart(4, '0')}`
      businesses.set(businessId, {
        ...fetched('Composite', 'Internal', 0),
        businessId,
        name,
        sector,
        subSector: sector === 'Care Home' ? (registers[0]?.extra?.serviceTypes as string) : sector === 'Hotel' ? rng.pick(['Full service', 'Boutique', 'Guest house', 'Budget']) : sector === 'Pub' ? rng.pick(['Wet-led', 'Food-led', 'Destination', 'Community', 'Pub with rooms']) : undefined,
        address: title.address,
        postcode: title.postcode,
        uprn: title.uprn,
        location,
        titleNumber: title.titleNumber,
        tenure,
        operatorCompanyNumber: operator.companyNumber,
        operatorName: operator.name,
        freeholderName: freeholder.category === 'Private Individual' ? 'Private individual (buy register to reveal)' : freeholder.name,
        freeholderCompanyNumber: freeholder.companyNumber,
        hereditamentUarn: uarn,
        epcCertificateId: epcId,
        registers,
        fhrsRating: fsa ? Number(fsa.rating) : undefined,
        distressFlags: Array.from(new Set(flags)),
      })
    }
  }

  // Additional non-sector hereditaments for other commercial parcels (shops, offices)
  for (const p of commercialParcels.slice(parcelIdx)) {
    if (rng.bool(0.5)) continue
    const uarn = String(rng.int(10000000000, 19999999999))
    const desc = rng.pick(['Shop and Premises', 'Offices and Premises', 'Hairdressing Salon and Premises', 'Cafe and Premises', 'Bank and Premises', 'Workshop and Premises'])
    const area = rng.int(40, 400)
    hereditaments.set(uarn, {
      ...fetched('VOA', 'VOA-Restricted', 3),
      uarn,
      uprn: p.title.uprn,
      address: p.title.address.toUpperCase(),
      postcode: p.title.postcode,
      description: desc,
      scatCode: desc.startsWith('Offices') ? '203' : '249',
      rateableValue: Math.round(rng.int(5000, 60000) / 250) * 250,
      listYear: 2026,
      totalAreaSqm: area,
      effectiveDate: '2026-04-01',
    })
  }

  // ------------------------------------------------------------------ planning
  const planning = new Map<string, PlanningApplication>()
  const bizList = Array.from(businesses.values())
  const statuses: PlanningApplication['status'][] = ['Approved', 'Approved', 'Approved', 'Pending', 'Refused', 'Withdrawn', 'Appeal Allowed', 'Appeal Dismissed']
  for (let i = 0; i < 190; i++) {
    const onBusiness = rng.bool(0.55)
    const biz = onBusiness ? rng.pick(bizList) : undefined
    const parcel = biz ? parcels.find((p) => p.title.titleNumber === biz.titleNumber)! : rng.pick(parcels)
    const sector: Sector = biz ? biz.sector : 'Other'
    const received = rng.date(2015, 2026)
    const status = new Date(received) > new Date(Date.now() - 100 * 86400000) ? 'Pending' : rng.pick(statuses)
    const year = received.slice(0, 4)
    const authority = authorityFor(parcel.cx, parcel.cy)
    const ref = `W/${year.slice(2)}/${rng.int(100, 2499).toString().padStart(4, '0')}`
    const c = centroid(parcel.title.geometry as Polygon)
    planning.set(ref, {
      ...fetched('PlanIt / Warwick DC', 'OGL', 0),
      reference: ref,
      authority,
      address: parcel.title.address,
      postcode: parcel.title.postcode,
      location: point(c[0] + rng.float(-0.00005, 0.00005), c[1] + rng.float(-0.00003, 0.00003)),
      description: rng.pick(N.PLANNING_DESCRIPTIONS[sector]),
      applicant: biz ? biz.operatorName : personName(),
      agent: rng.bool(0.7) ? rng.pick(['Stansgate Planning', 'Marrons Planning', 'Framptons', 'Pegasus Group', 'RPS', 'Tyler Parkes', 'Cerda Planning']) : undefined,
      type: rng.weighted([{ v: 'Full', w: 50 }, { v: 'Change of Use', w: 18 }, { v: 'Listed Building', w: 10 }, { v: 'Prior Approval', w: 8 }, { v: 'Advertisement', w: 8 }, { v: 'Outline', w: 4 }, { v: 'Other', w: 2 }]),
      status,
      receivedDate: received,
      decisionDate: status === 'Pending' ? undefined : iso(new Date(new Date(received).getTime() + rng.int(56, 200) * 86400000)),
      portalUrl: `https://planningdocuments.warwickdc.gov.uk/online-applications/applicationDetails.do?keyVal=${rng.id('', 10)}`,
      titleNumbers: [parcel.title.titleNumber],
      summary: status === 'Approved' && rng.bool(0.5) ? 'Permission granted subject to conditions covering hours of operation, noise mitigation and materials. No Section 106 obligations.' : status === 'Refused' ? 'Refused on grounds of loss of community facility and inadequate parking provision. Appeal window open.' : undefined,
    })
  }

  // --------------------------------------------------------------- constraints
  const constraints: Constraint[] = []
  constraints.push({ ...fetched('Warwick DC', 'OGL', 14), id: 'CA-1', kind: 'Conservation Area', name: 'Royal Leamington Spa Conservation Area', geometry: rect(-1.5365, 52.289, 900, 1300, 0) })
  constraints.push({ ...fetched('Warwick DC', 'OGL', 14), id: 'CA-2', kind: 'Conservation Area', name: 'Warwick Town Centre Conservation Area', geometry: rect(-1.5855, 52.282, 700, 600, 0) })
  constraints.push({ ...fetched('Environment Agency', 'OGL', 40), id: 'FZ3-1', kind: 'Flood Zone 3', name: 'River Leam', geometry: rect(-1.543, 52.2853, 2600, 110, 80) })
  constraints.push({ ...fetched('Environment Agency', 'OGL', 40), id: 'FZ2-1', kind: 'Flood Zone 2', name: 'River Leam', geometry: rect(-1.543, 52.2853, 2800, 260, 80) })
  constraints.push({ ...fetched('Environment Agency', 'OGL', 40), id: 'FZ3-2', kind: 'Flood Zone 3', name: 'River Avon', geometry: rect(-1.578, 52.279, 2200, 140, 60) })
  constraints.push({ ...fetched('Environment Agency', 'OGL', 40), id: 'FZ2-2', kind: 'Flood Zone 2', name: 'River Avon', geometry: rect(-1.578, 52.279, 2400, 320, 60) })
  constraints.push({ ...fetched('Warwick DC', 'OGL', 14), id: 'A4-1', kind: 'Article 4', name: 'Leamington HMO Article 4 Direction', geometry: rect(-1.531, 52.2835, 700, 500, 0) })
  constraints.push({ ...fetched('MHCLG', 'OGL', 120), id: 'GB-1', kind: 'Green Belt', name: 'West Midlands Green Belt', geometry: rect(-1.6, 52.297, 1800, 600, 0) })
  for (let i = 0; i < 48; i++) {
    const p = rng.pick(parcels.filter((x) => x.street.commercial > 0.7))
    const c = centroid(p.title.geometry as Polygon)
    constraints.push({ ...fetched('Historic England NHLE', 'OGL', 14), id: `LB-${1000000 + i}`, kind: 'Listed Building', name: `${p.title.address}`, grade: rng.weighted([{ v: 'II', w: 85 }, { v: 'II*', w: 12 }, { v: 'I', w: 3 }]), geometry: point(c[0], c[1]) })
  }
  for (let i = 0; i < 25; i++) {
    const p = rng.pick(parcels)
    const c = centroid(p.title.geometry as Polygon)
    constraints.push({ ...fetched('Warwick DC', 'OGL', 14), id: `TPO-${i}`, kind: 'TPO', name: `TPO ${rng.int(100, 900)}/${rng.int(1990, 2024)}`, geometry: point(c[0] + rng.float(-0.0002, 0.0002), c[1] + rng.float(-0.0002, 0.0002)) })
  }

  // --------------------------------------------------------------------- traffic
  const traffic: TrafficCount[] = []
  if (real) {
    for (const t of real.traffic) {
      traffic.push({
        source: 'DfT Road Traffic Statistics',
        licence: 'OGL',
        fetchedAt: real.fetchedAt,
        countPointId: t.countPointId,
        roadName: t.startJunction && t.endJunction ? `${t.roadName} (${t.startJunction} to ${t.endJunction})` : t.roadName,
        roadType: t.roadType,
        location: point(t.lon, t.lat),
        year: t.year,
        method: t.method,
        aadf: t.aadf,
        cars: t.cars,
        lgv: t.lgv,
        hgv: t.hgv,
        pedalCycles: t.pedalCycles,
        history: t.history,
      })
    }
  } else {
    let cp = 46000
    for (const s of N.STREETS.filter((x) => x.major)) {
      const n = rng.int(1, 2)
      for (let i = 0; i < n; i++) {
        const b = (s.bearing * Math.PI) / 180
        const along = rng.float(0.2, 0.8) * s.lengthM
        const [lon, lat] = offset(s.lon, s.lat, Math.sin(b) * along, Math.cos(b) * along)
        const base = s.name === 'The Parade' ? rng.int(6000, 9000) : rng.int(7000, 24000)
        const year = rng.weighted([{ v: 2024, w: 50 }, { v: 2023, w: 25 }, { v: 2022, w: 15 }, { v: 2019, w: 10 }])
        const history = [2018, 2019, 2021, 2022, 2023, 2024].filter((y) => y <= year).map((y) => ({ year: y, aadf: Math.round(base * rng.float(0.88, 1.08)) }))
        const aadf = history[history.length - 1].aadf
        traffic.push({
          ...fetched('DfT Road Traffic Statistics', 'OGL', 60),
          countPointId: String(cp++),
          roadName: s.name,
          roadType: 'Major',
          location: point(lon, lat),
          year,
          method: year === 2024 ? 'Counted' : rng.pick(['Counted', 'Estimated']),
          aadf,
          cars: Math.round(aadf * 0.82),
          lgv: Math.round(aadf * 0.13),
          hgv: Math.round(aadf * 0.03),
          pedalCycles: Math.round(aadf * 0.02),
          history,
        })
      }
    }
  }

  // -------------------------------------------------------------------- footfall
  const footfall: FootfallCell[] = []
  const hotspots: [number, number, number][] = [[-1.5365, 52.289, 1], [-1.5355, 52.286, 0.8], [-1.5865, 52.282, 0.75], [-1.5385, 52.2905, 0.7], [-1.535, 52.2835, 0.5]]
  const r = 90
  const dx = r * Math.sqrt(3)
  const dy = r * 1.5
  for (let row = -22; row <= 22; row++) {
    for (let col = -36; col <= 36; col++) {
      const [lon, lat] = offset(centre[0], centre[1], col * dx + (row % 2 ? dx / 2 : 0), row * dy)
      let intensity = 0
      for (const [hx, hy, w] of hotspots) {
        const d = haversineM([lon, lat], [hx, hy])
        intensity += w * Math.exp(-(d * d) / (2 * 260 * 260))
      }
      intensity += rng.float(0, 0.04)
      if (intensity < 0.05) continue
      const monthlyVisits = Math.round(intensity * 42000 * rng.float(0.85, 1.15))
      const band = Math.min(9, Math.max(1, Math.ceil(intensity * 9)))
      footfall.push({ ...fetched('Footfall vendor (demo)', 'Vendor', 12), h3: `8c195da${row + 30}${col + 40}`, geometry: hexagon(lon, lat, r), monthlyVisits, band, trend12m: rng.float(-0.12, 0.15), dwellMinutes: rng.int(8, 75) })
    }
  }

  // ----------------------------------------------------------------------- alerts
  const alerts: Alert[] = []
  let ai = 1
  const push = (a: Omit<Alert, 'alertId' | 'read'>) => alerts.push({ alertId: `A${ai++}`, read: false, ...a })
  for (const b of rng.shuffle(bizList).slice(0, 14)) {
    const kind = rng.pick(['Ownership change', 'Planning submitted', 'Rating change', 'Company status', 'Late accounts', 'Lease event', 'EPC lodged', 'VOA change', 'New business'] as const)
    const when = new Date(Date.now() - rng.int(0, 40) * 86400000 - rng.int(0, 86400000)).toISOString()
    const map: Record<typeof kind, [string, string, Alert['severity'], Alert['entityType']]> = {
      'Ownership change': [`Freehold of ${b.name} changed hands`, `${b.titleNumber}: new proprietor ${rng.pick(N.PROPCOS)} added to the register. Price paid ${rng.int(400, 2600)}k.`, 'warning', 'title'],
      'Planning submitted': [`Planning application near ${b.name}`, rng.pick(N.PLANNING_DESCRIPTIONS[b.sector]), 'info', 'planning'],
      'Rating change': [`${b.registers[0]?.register ?? 'Regulator'} rating changed for ${b.name}`, `Now rated "${rng.pick(['Requires improvement', 'Inadequate', 'Good'])}" following inspection.`, 'warning', 'business'],
      'Company status': [`${b.operatorName} entered administration`, 'Gazette notice: appointment of administrators. Operator of ' + b.name + '.', 'critical', 'company'],
      'Late accounts': [`${b.operatorName} accounts overdue`, 'Confirmation statement and accounts now overdue at Companies House.', 'warning', 'company'],
      'Lease event': [`Lease break approaching at ${b.name}`, `Tenant break option exercisable in ${rng.int(4, 11)} months under lease dated ${b.registers[0]?.registeredAt ?? '2015'}.`, 'info', 'business'],
      'EPC lodged': [`New EPC lodged for ${b.name}`, `Rated ${rng.pick(['C', 'D', 'E'])}. MEES: lettable.`, 'info', 'business'],
      'VOA change': [`Rateable value altered for ${b.name}`, `2026 list: RV now £${rng.int(12, 90)},000 (${rng.pick(['+', '-'])}${rng.int(3, 28)}%).`, 'info', 'business'],
      'New business': [`New ${b.sector.toLowerCase()} registered near ${b.postcode}`, `Fresh ${b.registers[0]?.register ?? 'FSA'} registration within 500 m of a watched site.`, 'info', 'business'],
    }
    const [title, detail, severity, entityType] = map[kind]
    push({ kind, title, detail, occurredAt: when, severity, entityType, entityId: entityType === 'title' ? b.titleNumber! : entityType === 'company' ? b.operatorCompanyNumber! : entityType === 'planning' ? Array.from(planning.keys())[rng.int(0, planning.size - 1)] : b.businessId, sector: b.sector })
  }
  alerts.sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))

  // ------------------------------------------------------------------------- CRM
  const crm: CrmRecord[] = []
  const offices = ['Birmingham', 'London', 'Manchester', 'Bristol', 'Leeds', 'Edinburgh']
  const messy = (s: string) => {
    const ops = [
      (x: string) => x.toUpperCase(),
      (x: string) => x.replace(/Road/g, 'Rd').replace(/Street/g, 'St'),
      (x: string) => x.replace(', Leamington Spa', ', Royal Leamington Spa'),
      (x: string) => x.replace(/, (Leamington Spa|Warwick)/, ''),
      (x: string) => x,
      (x: string) => x.replace(/^(\d+) /, '$1a '),
    ]
    return rng.pick(ops)(s)
  }
  let rid = 1001
  for (const b of bizList) {
    if (!rng.bool(0.62)) continue
    const op = companies.get(b.operatorCompanyNumber!)!
    const base: CrmRecord = {
      recordId: `CRM-${rid++}`,
      office: rng.pick(offices),
      businessName: b.name,
      address: b.address,
      postcode: b.postcode,
      contactName: op.officers[0]?.name,
      companyName: op.name,
      companyNumber: rng.bool(0.5) ? op.companyNumber : undefined,
      sector: rng.bool(0.8) ? b.sector : undefined,
      tenure: rng.bool(0.7) ? b.tenure : undefined,
      capacity: b.registers.find((r) => r.capacity)?.capacity,
      lastContact: rng.date(2022, 2026),
      owner: b.tenure === 'Freehold' ? op.name : rng.bool(0.5) ? op.name /* wrong: tenant recorded as owner */ : b.freeholderName,
      raw: {},
    }
    crm.push(base)
    // Duplicates with perturbations
    if (rng.bool(0.3)) {
      crm.push({
        ...base,
        recordId: `CRM-${rid++}`,
        office: rng.pick(offices),
        businessName: rng.bool(0.5) ? b.name.replace(/^The /, '') : b.name + (rng.bool(0.5) ? ' (Leamington)' : ''),
        address: messy(b.address),
        postcode: rng.bool(0.7) ? b.postcode : rng.bool(0.5) ? b.postcode.replace(' ', '') : undefined,
        companyNumber: undefined,
        capacity: base.capacity ? base.capacity + rng.pick([-6, -4, 0, 0, 5, 8]) : undefined,
        lastContact: rng.date(2014, 2021),
      })
    }
    if (rng.bool(0.08)) {
      crm.push({ ...base, recordId: `CRM-${rid++}`, businessName: b.name.toUpperCase(), address: messy(b.address), postcode: 'CV32 4ZZ', companyName: op.name.replace(' Ltd', ' Limited') })
    }
  }
  // Records for businesses that no longer exist / dissolved companies
  for (let i = 0; i < 6; i++) {
    const p = rng.pick(parcels.filter((x) => x.commercial))
    crm.push({ recordId: `CRM-${rid++}`, office: rng.pick(offices), businessName: rng.pick(['The Old Bell', 'Spa Fish Bar', 'Avonside Care Home', 'Jubilee Day Nursery', 'Crown Pharmacy', 'The Railway Tavern']), address: p.title.address, postcode: p.title.postcode, companyName: rng.pick(['Old Bell Inns Ltd', 'Avonside Care Ltd', 'Jubilee Childcare Ltd']), companyNumber: String(rng.int(3_000_000, 9_000_000)).padStart(8, '0'), sector: rng.pick(['Pub', 'Care Home', 'Childcare', 'Pharmacy']), lastContact: rng.date(2014, 2019), raw: {} })
  }

  const streetsOut: Dataset['streets'] = real
    ? real.roads.features.flatMap((f) => {
        const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates
        return lines.filter((l) => l.some(([lon, lat]) => inWindow(lon, lat))).map((l) => ({ name: f.properties.name ?? '', major: f.properties.major, coordinates: l as [number, number][] }))
      })
    : N.STREETS.map((s) => {
        const b = (s.bearing * Math.PI) / 180
        const end = offset(s.lon, s.lat, Math.sin(b) * s.lengthM, Math.cos(b) * s.lengthM)
        return { name: s.name, major: !!s.major, coordinates: [[s.lon, s.lat], end] as [number, number][] }
      })
  const comparables = generateComparables(rng, bizList)
  return { comparables, streets: streetsOut, titles, companies, businesses, hereditaments, epcs, planning, constraints, traffic, footfall, alerts, crm, centre, real }
}

export function crmToCsv(rows: CrmRecord[]): string {
  const cols = ['recordId', 'office', 'businessName', 'address', 'postcode', 'contactName', 'companyName', 'companyNumber', 'sector', 'tenure', 'capacity', 'lastContact', 'owner'] as const
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? '' : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc((r as unknown as Record<string, unknown>)[c])).join(','))].join('\n')
}

export type { Point }
