import type { Point, Polygon } from 'geojson'
import type { DataProvider } from '../provider'
import type {
  Alert,
  BoundsQuery,
  Business,
  Catchment,
  Comparable,
  ComparableFilters,
  ComparableStats,
  Sector,
  Company,
  Constraint,
  CrmRecord,
  DataSourceStatus,
  DocumentOrder,
  DuplicateGroup,
  EPC,
  FootfallCell,
  Hereditament,
  LeaseSummary,
  MapLayers,
  MatchCandidate,
  PlanningApplication,
  SearchResult,
  SourcingFilters,
  Title,
  TrafficCount,
  CrmIssue,
} from '../types'
import { generateDataset, crmToCsv, type Dataset } from './generate'
import { DATA_SOURCES } from './sources'
import { loadRealLayers, type RealLayers, type PlaceProps, type PricePaidRow, type RealTraffic } from '../real'
import { rowsForBounds, rowsForRadius, findLoaded, tileTotals, type GbPlace } from '../real/tiles'
import { centroid, haversineM, inBounds, pointInPolygon } from '../../lib/geo'
import { monthsUntil } from '../../lib/format'
import { median, quantile } from '../../lib/stats'
import { extractPostcode, normaliseAddress, normaliseBusinessName, normaliseCompanyName, normalisePostcode, similarity, validCompanyNumber } from '../../lib/matching'

const EPC_ORDER = ['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class MockProvider implements DataProvider {
  readonly name = 'mock'
  private ds: Dataset
  private orders: DocumentOrder[] = []
  private orderCounter = 1

  /** Resolves once the collected open data (if present) has been loaded and the dataset re-seated on it. */
  readonly ready: Promise<void>
  real?: RealLayers
  constructor(seed?: number) {
    this.ds = generateDataset(seed)
    this.ready = loadRealLayers().then(
      (real) =>
        new Promise<void>((resolve) => {
          if (!real) return resolve()
          const sync = () => {
            this.ds = generateDataset(seed, real)
            this.real = real
            resolve()
          }
          if (typeof Worker === 'undefined') return sync()
          try {
            const w = new Worker(new URL('./generate.worker.ts', import.meta.url), { type: 'module' })
            w.onmessage = (ev: MessageEvent<Omit<Dataset, 'real'>>) => {
              this.ds = { ...ev.data, real }
              this.real = real
              w.terminate()
              resolve()
            }
            w.onerror = () => {
              w.terminate()
              sync()
            }
            w.postMessage({ seed, real })
          } catch {
            sync()
          }
        }),
    )
  }

  get dataset() {
    return this.ds
  }

  async search(query: string, limit = 12): Promise<SearchResult[]> {
    await this.ready
    const q = query.trim().toLowerCase()
    if (!q) return []
    const out: SearchResult[] = []
    const pc = extractPostcode(q)
    for (const t of this.ds.titles.values()) {
      if (t.titleNumber.toLowerCase() === q) out.push({ kind: 'title', id: t.titleNumber, label: t.titleNumber, sublabel: t.address, location: { type: 'Point', coordinates: centroid(t.geometry as Polygon) } })
    }
    for (const b of this.ds.businesses.values()) {
      if (b.name.toLowerCase().includes(q) || (pc && b.postcode === pc)) out.push({ kind: 'business', id: b.businessId, label: b.name, sublabel: `${b.sector} · ${b.address}`, location: b.location })
    }
    for (const c of this.ds.companies.values()) {
      if (c.name.toLowerCase().includes(q) || c.companyNumber === q.toUpperCase()) out.push({ kind: 'company', id: c.companyNumber, label: c.name, sublabel: `${c.companyNumber} · ${c.status}` })
    }
    for (const t of this.ds.titles.values()) {
      if (t.address.toLowerCase().includes(q) || (pc && t.postcode === pc)) out.push({ kind: 'address', id: t.titleNumber, label: t.address, sublabel: `${t.postcode} · ${t.titleNumber}`, location: { type: 'Point', coordinates: centroid(t.geometry as Polygon) } })
      if (out.length > limit * 3) break
    }
    for (const p of this.ds.planning.values()) {
      if (p.reference.toLowerCase() === q) out.push({ kind: 'planning', id: p.reference, label: p.reference, sublabel: p.description, location: p.location })
    }
    return out.slice(0, limit)
  }

  async getMapLayers(bounds: BoundsQuery): Promise<MapLayers> {
    await this.ready
    const bizByTitle = new Map<string, Business>()
    for (const b of this.ds.businesses.values()) if (b.titleNumber) bizByTitle.set(b.titleNumber, b)
    const titles = Array.from(this.ds.titles.values())
      .filter((t) => inBounds(centroid(t.geometry as Polygon), bounds))
      .map((t) => {
        const b = bizByTitle.get(t.titleNumber)
        return {
          type: 'Feature' as const,
          geometry: t.geometry,
          properties: { titleNumber: t.titleNumber, tenure: t.tenure, category: t.proprietors[0]?.category ?? 'Other', sector: b?.sector, distress: !!b && b.distressFlags.length > 0 },
        }
      })
    const businesses = Array.from(this.ds.businesses.values())
      .filter((b) => inBounds(b.location.coordinates, bounds))
      .map((b) => ({ type: 'Feature' as const, geometry: b.location, properties: { businessId: b.businessId, sector: b.sector, name: b.name, distress: b.distressFlags.length > 0, rating: b.registers.find((r) => r.rating)?.rating } }))
    const planning = Array.from(this.ds.planning.values())
      .filter((p) => inBounds(p.location.coordinates, bounds))
      .map((p) => ({ type: 'Feature' as const, geometry: p.location, properties: { reference: p.reference, status: p.status, type: p.type } }))
    const traffic = this.ds.traffic.filter((t) => inBounds(t.location.coordinates, bounds)).map((t) => ({ type: 'Feature' as const, geometry: t.location, properties: { countPointId: t.countPointId, aadf: t.aadf, year: t.year, method: t.method } }))
    const footfall = this.ds.footfall.map((f) => ({ type: 'Feature' as const, geometry: f.geometry, properties: { h3: f.h3, band: f.band, monthlyVisits: f.monthlyVisits } }))
    const constraints = this.ds.constraints.map((c) => ({ type: 'Feature' as const, geometry: c.geometry, properties: { id: c.id, kind: c.kind, name: c.name } }))
    // Real layers: the Warwick files plus the national 0.5 degree tiles for the cells in view.
    const [tilePlaces, tileSales, tileTraffic] = await Promise.all([rowsForBounds('places', bounds), rowsForBounds('price_paid', bounds), rowsForBounds('traffic', bounds)])
    const poiIds = new Set<string>()
    const poi = [
      ...(this.real?.places.features ?? []).filter((f) => inBounds(f.geometry.coordinates, bounds)).map((f) => ({ type: 'Feature' as const, geometry: f.geometry, properties: { id: f.properties.id, name: f.properties.name, category: f.properties.category, sector: f.properties.sector, confidence: f.properties.confidence, postcode: f.properties.postcode } })),
      ...tilePlaces.filter((r) => inBounds([r.lon, r.lat], bounds)).map((r) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [r.lon, r.lat] }, properties: { id: r.id, name: r.name, category: r.category, sector: r.sector, confidence: r.confidence, postcode: r.postcode } })),
    ].filter((f) => !poiIds.has(f.properties.id) && poiIds.add(f.properties.id))
    const saleIds = new Set<string>()
    const pricePaid = [...(this.real?.pricePaid ?? []), ...tileSales]
      .filter((r) => r.lon !== null && r.lat !== null && inBounds([r.lon, r.lat], bounds) && !saleIds.has(r.id) && saleIds.add(r.id))
      .map((r) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [r.lon!, r.lat!] }, properties: { id: r.id, price: r.price, date: r.date, type: r.type, address: r.address, postcode: r.postcode, geocode: r.geocode ?? '' } }))
    const trafficIds = new Set(this.ds.traffic.map((t) => t.countPointId))
    const trafficExtra = tileTraffic.filter((t) => !trafficIds.has(t.countPointId) && inBounds([t.lon, t.lat], bounds)).map((t) => ({ type: 'Feature' as const, geometry: { type: 'Point' as const, coordinates: [t.lon, t.lat] }, properties: { countPointId: t.countPointId, aadf: t.aadf, year: t.year, method: t.method } }))
    return {
      poi: { type: 'FeatureCollection', features: poi },
      pricePaid: { type: 'FeatureCollection', features: pricePaid },
      streets: { type: 'FeatureCollection', features: this.ds.streets.map((s) => ({ type: 'Feature' as const, geometry: { type: 'LineString' as const, coordinates: s.coordinates }, properties: { name: s.name, major: s.major } })) },
      titles: { type: 'FeatureCollection', features: titles },
      businesses: { type: 'FeatureCollection', features: businesses },
      comparables: { type: 'FeatureCollection', features: this.ds.comparables.filter((c) => inBounds(c.location.coordinates, bounds)).map((c) => ({ type: 'Feature' as const, geometry: c.location, properties: { compId: c.compId, sector: c.sector, price: c.price, date: c.date, name: c.name } })) },
      planning: { type: 'FeatureCollection', features: planning },
      traffic: { type: 'FeatureCollection', features: [...traffic, ...trafficExtra] },
      footfall: { type: 'FeatureCollection', features: footfall },
      constraints: { type: 'FeatureCollection', features: constraints },
    }
  }

  async getTitle(titleNumber: string) {
    await this.ready
    return this.ds.titles.get(titleNumber)
  }
  async getTitlesForCompany(companyNumber: string) {
    await this.ready
    const group = new Set((await this.getCompanyGroup(companyNumber)).map((c) => c.companyNumber))
    return Array.from(this.ds.titles.values()).filter((t) => t.proprietors.some((p) => p.companyNumber && group.has(p.companyNumber)))
  }
  async getBusiness(businessId: string) {
    await this.ready
    return this.ds.businesses.get(businessId)
  }
  async getBusinessesForTitle(titleNumber: string) {
    await this.ready
    return Array.from(this.ds.businesses.values()).filter((b) => b.titleNumber === titleNumber)
  }
  async getBusinessesForCompany(companyNumber: string) {
    await this.ready
    const group = new Set((await this.getCompanyGroup(companyNumber)).map((c) => c.companyNumber))
    return Array.from(this.ds.businesses.values()).filter((b) => (b.operatorCompanyNumber && group.has(b.operatorCompanyNumber)) || (b.freeholderCompanyNumber && group.has(b.freeholderCompanyNumber)))
  }
  async getCompany(companyNumber: string) {
    await this.ready
    return this.ds.companies.get(companyNumber)
  }
  async getCompanyGroup(companyNumber: string) {
    await this.ready
    const c = this.ds.companies.get(companyNumber)
    if (!c) return []
    const root = c.parentCompanyNumber ? this.ds.companies.get(c.parentCompanyNumber) ?? c : c
    const members = [root, ...Array.from(this.ds.companies.values()).filter((x) => x.parentCompanyNumber === root.companyNumber)]
    return members
  }
  async getHereditament(uarn: string) {
    await this.ready
    return this.ds.hereditaments.get(uarn)
  }
  async getHereditamentsForTitle(titleNumber: string) {
    await this.ready
    const t = this.ds.titles.get(titleNumber)
    if (!t) return []
    return Array.from(this.ds.hereditaments.values()).filter((h) => h.uprn === t.uprn)
  }
  async getEpc(certificateId: string) {
    await this.ready
    return this.ds.epcs.get(certificateId)
  }
  async getEpcsForTitle(titleNumber: string) {
    await this.ready
    const t = this.ds.titles.get(titleNumber)
    if (!t) return []
    return Array.from(this.ds.epcs.values()).filter((e) => e.uprn === t.uprn)
  }
  async getPlanningForTitle(titleNumber: string, radiusM = 0) {
    await this.ready
    const t = this.ds.titles.get(titleNumber)
    if (!t) return []
    const c = centroid(t.geometry as Polygon)
    return Array.from(this.ds.planning.values())
      .filter((p) => p.titleNumbers.includes(titleNumber) || (radiusM > 0 && haversineM(c, p.location.coordinates) <= radiusM))
      .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
  }
  async getPlanning(reference: string) {
    await this.ready
    return this.ds.planning.get(reference)
  }
  async getConstraintsForTitle(titleNumber: string) {
    await this.ready
    const t = this.ds.titles.get(titleNumber)
    if (!t) return []
    const c = centroid(t.geometry as Polygon)
    return this.ds.constraints.filter((k) => {
      if (k.geometry.type === 'Point') return haversineM(c, k.geometry.coordinates) < 40
      if (k.geometry.type === 'Polygon') return pointInPolygon(c, k.geometry)
      return false
    })
  }
  async getTrafficNear(lon: number, lat: number, radiusM: number) {
    await this.ready
    const seen = new Set(this.ds.traffic.map((t) => t.countPointId))
    const extra = (await rowsForRadius('traffic', lon, lat, radiusM)).filter((t) => !seen.has(t.countPointId)).map((t) => this.trafficFromTile(t))
    const local = this.ds.traffic.filter((t) => haversineM([lon, lat], t.location.coordinates) <= radiusM)
    return [...local, ...extra.filter((t) => haversineM([lon, lat], t.location.coordinates) <= radiusM)].sort((a, b) => haversineM([lon, lat], a.location.coordinates) - haversineM([lon, lat], b.location.coordinates))
  }
  async getFootfallNear(lon: number, lat: number, radiusM: number) {
    await this.ready
    return this.ds.footfall.filter((f) => haversineM([lon, lat], centroid(f.geometry)) <= radiusM)
  }
  async getLeasesForTitle(titleNumber: string) {
    await this.ready
    return this.ds.titles.get(titleNumber)?.leases ?? []
  }

  private placeFromTile(r: GbPlace): PlaceProps & { location: Point } {
    return { id: r.id, name: r.name, category: r.category, sector: r.sector, confidence: r.confidence, address: r.address, postcode: r.postcode, locality: r.locality, website: r.website, phone: r.phone, brand: r.brand, source: 'Overture Maps places (CDLA-Permissive-2.0)', location: { type: 'Point', coordinates: [r.lon, r.lat] } }
  }
  private trafficFromTile(t: RealTraffic): TrafficCount {
    return { source: 'DfT Road Traffic Statistics', licence: 'OGL', fetchedAt: this.real?.fetchedAt ?? new Date().toISOString(), countPointId: t.countPointId, roadName: t.startJunction && t.endJunction ? `${t.roadName} (${t.startJunction} to ${t.endJunction})` : t.roadName, roadType: t.roadType, location: { type: 'Point', coordinates: [t.lon, t.lat] }, year: t.year, method: t.method, aadf: t.aadf, cars: t.cars, lgv: t.lgv, hgv: t.hgv, pedalCycles: t.pedalCycles, history: t.history }
  }
  async getPoi(id: string): Promise<(PlaceProps & { location: Point }) | undefined> {
    await this.ready
    const f = this.real?.places.features.find((x) => x.properties.id === id)
    if (f) return { ...f.properties, location: f.geometry }
    const r = await findLoaded('places', id, 'id')
    return r ? this.placeFromTile(r) : undefined
  }
  async getPoisNear(lon: number, lat: number, radiusM: number, sector?: Sector): Promise<(PlaceProps & { location: Point; distanceM: number })[]> {
    await this.ready
    const seen = new Set<string>()
    const out: (PlaceProps & { location: Point; distanceM: number })[] = []
    const push = (p: PlaceProps & { location: Point }) => {
      if (seen.has(p.id) || (sector && p.sector !== sector)) return
      const d = Math.round(haversineM([lon, lat], p.location.coordinates))
      if (d <= radiusM) {
        seen.add(p.id)
        out.push({ ...p, distanceM: d })
      }
    }
    for (const r of await rowsForRadius('places', lon, lat, radiusM)) push(this.placeFromTile(r))
    for (const f of this.real?.places.features ?? []) push({ ...f.properties, location: f.geometry })
    return out.sort((a, b) => a.distanceM - b.distanceM)
  }
  async getPricePaid(id: string): Promise<PricePaidRow | undefined> {
    await this.ready
    return this.real?.pricePaid.find((r) => r.id === id) ?? (await findLoaded('price_paid', id, 'id'))
  }
  async getPricePaidNear(lon: number, lat: number, radiusM: number, opts: { nonResidentialOnly?: boolean; limit?: number } = {}): Promise<(PricePaidRow & { distanceM: number })[]> {
    await this.ready
    const seen = new Set<string>()
    const rows: PricePaidRow[] = [...(this.real?.pricePaid ?? []), ...(await rowsForRadius('price_paid', lon, lat, radiusM))]
    return rows
      .filter((r) => r.lon !== null && r.lat !== null && (!opts.nonResidentialOnly || r.type === 'O') && !seen.has(r.id) && seen.add(r.id))
      .map((r) => ({ ...r, distanceM: Math.round(haversineM([lon, lat], [r.lon!, r.lat!])) }))
      .filter((r) => r.distanceM <= radiusM)
      .sort((a, b) => a.distanceM - b.distanceM || b.date.localeCompare(a.date))
      .slice(0, opts.limit ?? 50)
  }

  private matchesFilters(b: Business, f: SourcingFilters, t?: Title, h?: Hereditament, e?: EPC): boolean {
    if (f.sectors.length && !f.sectors.includes(b.sector)) return false
    if (f.tenure && b.tenure !== f.tenure) return false
    if (f.ownerCategories.length && !(t && t.proprietors.some((p) => f.ownerCategories.includes(p.category)))) return false
    if (f.minRateableValue !== undefined && !(h && h.rateableValue >= f.minRateableValue)) return false
    if (f.maxRateableValue !== undefined && !(h && h.rateableValue <= f.maxRateableValue)) return false
    if (f.minAreaSqm !== undefined && !(h?.totalAreaSqm !== undefined && h.totalAreaSqm >= f.minAreaSqm)) return false
    if (f.maxAreaSqm !== undefined && !(h?.totalAreaSqm !== undefined && h.totalAreaSqm <= f.maxAreaSqm)) return false
    if (f.epcWorseThan && !(e && EPC_ORDER.indexOf(e.rating) > EPC_ORDER.indexOf(f.epcWorseThan))) return false
    if (f.leaseExpiringWithinMonths !== undefined) {
      const lease = t?.leases[0]
      const m = monthsUntil(lease?.expiryDate)
      if (m === undefined || m > f.leaseExpiringWithinMonths || m < 0) return false
    }
    if (f.distressOnly && !b.distressFlags.length) return false
    if (f.distressFlags.length && !f.distressFlags.some((d) => b.distressFlags.includes(d))) return false
    if (f.registerRatings.length && !b.registers.some((r) => r.rating && f.registerRatings.includes(r.rating))) return false
    if (f.ownedSince && !(t?.dateProprietorAdded && t.dateProprietorAdded <= f.ownedSince)) return false
    if (f.text) {
      const q = f.text.toLowerCase()
      if (!(b.name.toLowerCase().includes(q) || b.address.toLowerCase().includes(q) || b.operatorName?.toLowerCase().includes(q) || b.freeholderName?.toLowerCase().includes(q))) return false
    }
    return true
  }

  async sourceBusinesses(filters: SourcingFilters, bounds?: BoundsQuery) {
    await this.ready
    const out: Business[] = []
    for (const b of this.ds.businesses.values()) {
      if (bounds && !inBounds(b.location.coordinates, bounds)) continue
      const t = b.titleNumber ? this.ds.titles.get(b.titleNumber) : undefined
      const h = b.hereditamentUarn ? this.ds.hereditaments.get(b.hereditamentUarn) : undefined
      const e = b.epcCertificateId ? this.ds.epcs.get(b.epcCertificateId) : undefined
      if (!this.matchesFilters(b, filters, t, h, e)) continue
      if (filters.excludeConstraints.length) {
        const ks = (await this.getConstraintsForTitle(b.titleNumber!)).map((k) => k.kind)
        if (ks.some((k) => filters.excludeConstraints.includes(k))) continue
      }
      if (filters.planningWithinMonths !== undefined) {
        const apps = await this.getPlanningForTitle(b.titleNumber!)
        const cutoff = new Date(Date.now() - filters.planningWithinMonths * 30 * 86400000).toISOString().slice(0, 10)
        if (!apps.some((a) => a.receivedDate >= cutoff)) continue
      }
      out.push(b)
    }
    return out
  }

  async sourceTitles(filters: SourcingFilters, bounds?: BoundsQuery) {
    await this.ready
    const out: Title[] = []
    for (const t of this.ds.titles.values()) {
      if (bounds && !inBounds(centroid(t.geometry as Polygon), bounds)) continue
      if (filters.ownerCategories.length && !t.proprietors.some((p) => filters.ownerCategories.includes(p.category))) continue
      if (filters.minAreaSqm !== undefined && t.areaSqm < filters.minAreaSqm) continue
      if (filters.maxAreaSqm !== undefined && t.areaSqm > filters.maxAreaSqm) continue
      if (filters.ownedSince && !(t.dateProprietorAdded && t.dateProprietorAdded <= filters.ownedSince)) continue
      if (filters.text && !t.address.toLowerCase().includes(filters.text.toLowerCase()) && !t.proprietors.some((p) => p.name.toLowerCase().includes(filters.text!.toLowerCase()))) continue
      out.push(t)
    }
    return out
  }

  // ---------------------------------------------------------------- comparables
  async getComparables(f: ComparableFilters) {
    await this.ready
    const comps = this.ds.comparables.filter((c) => {
      if (f.sectors.length && !f.sectors.includes(c.sector)) return false
      if (f.tenure && c.tenure !== f.tenure) return false
      if (f.fromDate && c.date < f.fromDate) return false
      if (f.toDate && c.date > f.toDate) return false
      if (f.minCapacity !== undefined && !(c.capacity !== undefined && c.capacity >= f.minCapacity)) return false
      if (f.maxCapacity !== undefined && !(c.capacity !== undefined && c.capacity <= f.maxCapacity)) return false
      if (f.minPrice !== undefined && c.price < f.minPrice) return false
      if (f.maxPrice !== undefined && c.price > f.maxPrice) return false
      if (f.contributedOnly && !c.contributed) return false
      if (f.centre && f.radiusM && haversineM(f.centre, c.location.coordinates) > f.radiusM) return false
      if (f.text) {
        const q = f.text.toLowerCase()
        if (!(c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q) || c.postcode.toLowerCase().includes(q))) return false
      }
      return true
    })
    const withDist = f.centre ? comps.slice().sort((a, b) => haversineM(f.centre!, a.location.coordinates) - haversineM(f.centre!, b.location.coordinates)) : comps
    const byYearMap = new Map<number, number[]>()
    for (const c of comps) {
      const y = Number(c.date.slice(0, 4))
      byYearMap.set(y, [...(byYearMap.get(y) ?? []), c.price])
    }
    const ppu = comps.map((c) => c.pricePerUnit).filter((x): x is number => x !== undefined)
    const stats: ComparableStats = {
      count: comps.length,
      medianPrice: median(comps.map((c) => c.price)),
      medianPricePerUnit: median(ppu),
      medianRvMultiple: median(comps.map((c) => c.rvMultiple).filter((x): x is number => x !== undefined)),
      medianEbitdaMultiple: median(comps.map((c) => c.ebitdaMultiple).filter((x): x is number => x !== undefined)),
      pricePerUnitRange: ppu.length ? [quantile(ppu, 0.25)!, quantile(ppu, 0.75)!] : undefined,
      byYear: Array.from(byYearMap.entries()).sort((a, b) => a[0] - b[0]).map(([year, prices]) => ({ year, count: prices.length, medianPrice: median(prices)! })),
    }
    return { comps: withDist, stats }
  }
  async getComparable(compId: string) {
    await this.ready
    return this.ds.comparables.find((c) => c.compId === compId)
  }

  // ------------------------------------------------------------------ catchment
  async getCatchment(lon: number, lat: number, radiusM: number): Promise<Catchment> {
    await this.ready
    const centre: [number, number] = [lon, lat]
    const areaKm2 = Math.PI * (radiusM / 1000) ** 2
    // Synthetic ONS-like demographics: density falls off from the town centres.
    const centres: [number, number, number][] = [[-1.5365, 52.289, 5200], [-1.585, 52.282, 4300], [-1.51, 52.408, 4600], [-1.707, 52.192, 2600], [-1.898, 52.486, 5600]]
    let density = 180
    for (const [cx, cy, d] of centres) {
      const dist = haversineM(centre, [cx, cy])
      density += d * Math.exp(-dist / 2600)
    }
    const population = Math.round(areaKm2 * density)
    const seed = Math.abs(Math.round(lon * 1000) * 31 + Math.round(lat * 1000) * 17) % 97
    const affluenceIndex = Math.round(95 + (seed % 25) + (density > 3000 ? -6 : 8))
    const biz = Array.from(this.ds.businesses.values()).map((b) => ({ b, d: haversineM(centre, b.location.coordinates) })).filter((x) => x.d <= radiusM).sort((a, b) => a.d - b.d)
    const bySector = new Map<Sector, { count: number; capacity: number; capacityLabel?: string }>()
    for (const { b } of biz) {
      const reg = b.registers.find((r) => r.capacity)
      const cur = bySector.get(b.sector) ?? { count: 0, capacity: 0, capacityLabel: reg?.capacityLabel }
      cur.count += 1
      cur.capacity += reg?.capacity ?? 0
      if (!cur.capacityLabel && reg?.capacityLabel) cur.capacityLabel = reg.capacityLabel
      bySector.set(b.sector, cur)
    }
    const age85plus = Math.round(population * 0.026)
    const age65plus = Math.round(population * 0.19)
    const age0to4 = Math.round(population * 0.056)
    const adults = Math.round(population * 0.8)
    const careBeds = bySector.get('Care Home')?.capacity ?? 0
    const nurseryPlaces = bySector.get('Childcare')?.capacity ?? 0
    const pubs = bySector.get('Pub')?.count ?? 0
    const pharmacies = bySector.get('Pharmacy')?.count ?? 0
    const dentists = bySector.get('Dental')?.count ?? 0
    const ff = this.ds.footfall.filter((f) => haversineM(centre, centroid(f.geometry)) <= Math.min(radiusM, 600))
    const tr = (await this.getTrafficNear(lon, lat, Math.max(radiusM, 800))).sort((a, b) => b.aadf - a.aadf)
    const realNear = await this.getPoisNear(lon, lat, radiusM)
    return {
      centre,
      radiusM,
      population,
      households: Math.round(population / 2.3),
      age0to4,
      age65plus,
      age85plus,
      adults,
      medianHouseholdIncome: Math.round((31_000 + (affluenceIndex - 100) * 420) / 100) * 100,
      affluenceIndex,
      deprivationDecile: Math.max(1, Math.min(10, Math.round(affluenceIndex / 12))),
      competitors: Array.from(bySector.entries()).map(([sector, v]) => ({ sector, ...v })).sort((a, b) => b.count - a.count),
      nearest: biz.slice(0, 12).map(({ b, d }) => ({ businessId: b.businessId, name: b.name, sector: b.sector, distanceM: Math.round(d), capacity: b.registers.find((r) => r.capacity)?.capacity, rating: b.registers.find((r) => r.rating)?.rating, operatorName: b.operatorName })),
      ratios: [
        { label: 'Care beds per 100 people aged 85+', value: age85plus ? Math.round((careBeds / age85plus) * 1000) / 10 : 0, benchmark: 11.5, unit: 'beds', better: 'lower', note: 'Below the England average suggests unmet need and supports new or extended registration; above suggests a saturated market.' },
        { label: 'Nursery places per 100 children aged 0-4', value: age0to4 ? Math.round((nurseryPlaces / age0to4) * 1000) / 10 : 0, benchmark: 34, unit: 'places', better: 'lower', note: 'Low coverage indicates demand headroom for day nurseries.' },
        { label: 'Pubs per 10,000 adults', value: adults ? Math.round((pubs / adults) * 100000) / 10 : 0, benchmark: 8.1, unit: 'pubs', better: 'lower', note: 'High density means tougher trading; low density with strong footfall supports food-led formats.' },
        { label: 'Pharmacies per 10,000 people', value: population ? Math.round((pharmacies / population) * 100000) / 10 : 0, benchmark: 2.1, unit: 'pharmacies', better: 'lower', note: 'NHS contract coverage; above average weakens the case for a new 100-hour contract.' },
        { label: 'Dental practices per 10,000 people', value: population ? Math.round((dentists / population) * 100000) / 10 : 0, benchmark: 1.9, unit: 'practices', better: 'lower', note: 'Low coverage supports NHS and private list growth.' },
      ],
      footfallMonthly: ff.length ? Math.round(ff.reduce((s, f) => s + f.monthlyVisits, 0) / ff.length) : undefined,
      trafficAadf: tr[0]?.aadf,
      realSupply: realNear.length
        ? {
            source: 'Overture Maps places (OpenStreetMap, Meta and Microsoft contributions), CDLA-Permissive-2.0',
            counts: Array.from(realNear.reduce((m, p) => m.set(p.sector as Sector, (m.get(p.sector as Sector) ?? 0) + 1), new Map<Sector, number>()).entries()).map(([sector, count]) => ({ sector, count })).sort((a, b) => b.count - a.count),
            nearest: realNear.slice(0, 12).map((p) => ({ id: p.id, name: p.name ?? p.category, category: p.category, sector: p.sector as Sector, distanceM: p.distanceM, address: p.address, postcode: p.postcode })),
          }
        : undefined,
      source: 'ONS Census 2021 mid-year estimates (synthetic in demo), registers, DfT, footfall vendor',
    }
  }

  async getAlerts() {
    await this.ready
    return this.ds.alerts
  }
  async markAlertRead(alertId: string) {
    await this.ready
    const a = this.ds.alerts.find((x) => x.alertId === alertId)
    if (a) a.read = true
  }

  async orderDocument(titleNumber: string, kind: DocumentOrder['kind']) {
    await this.ready
    const order: DocumentOrder = { orderId: `DOC-${String(this.orderCounter++).padStart(5, '0')}`, titleNumber, kind, fee: 7, orderedAt: new Date().toISOString(), status: 'Queued' }
    this.orders.unshift(order)
    // Simulate Business Gateway fulfilment and LLM parsing.
    void (async () => {
      await delay(900)
      order.status = 'Downloading'
      await delay(1400)
      order.status = 'Stored'
      order.fileName = `${titleNumber}_${kind.replace(' ', '')}_${order.orderedAt.slice(0, 10)}.pdf`
      const t = this.ds.titles.get(titleNumber)
      if (t) {
        if (kind === 'Register') {
          t.registerPurchased = true
          t.proprietors = t.proprietors.map((p) => ({ ...p, redacted: false }))
        }
        if (kind === 'Title Plan') t.titlePlanPurchased = true
      }
      await delay(1600)
      order.status = 'Parsed'
      if (t && kind === 'Lease' && t.leases[0]) {
        const lease = t.leases[0]
        const rent = Math.round((this.ds.hereditaments.get(Array.from(this.ds.businesses.values()).find((b) => b.titleNumber === titleNumber)?.hereditamentUarn ?? '')?.rateableValue ?? 30000) * 1.15 / 500) * 500
        const start = new Date(lease.dateOfLease)
        const reviews = [5, 10, 15, 20].filter((y) => y < lease.termYears).map((y) => new Date(start.getFullYear() + y, start.getMonth(), start.getDate()).toISOString().slice(0, 10))
        lease.parsed = { rentPa: rent, rentReviewDates: reviews, breakDates: lease.termYears >= 15 ? [reviews[1] ?? reviews[0]] : [], repairingObligation: 'FRI', permittedUse: 'Use within Class E / Sui Generis public house', tiedSupply: lease.lessee?.includes('Inns') || lease.lessee?.includes('Taverns') ? true : false, confidence: 0.91, extractedAt: new Date().toISOString() }
        order.parsedSummary = `Rent £${rent.toLocaleString()} pa, ${lease.termYears} yr term from ${lease.dateOfLease}, FRI, reviews ${reviews.join(', ')}${lease.parsed.breakDates?.length ? `, break ${lease.parsed.breakDates[0]}` : ''}.`
      } else if (t && kind === 'Register') {
        order.parsedSummary = `${t.proprietors.map((p) => p.name).join(', ')} registered ${t.dateProprietorAdded}. ${t.charges?.length ? `Charge in favour of ${t.charges[0].lender} dated ${t.charges[0].date}.` : 'No charges.'} ${t.leases.length} lease(s) in schedule.`
      } else {
        order.parsedSummary = 'Document stored. No structured extraction for this type.'
      }
    })()
    return order
  }
  async getDocumentOrders() {
    await this.ready
    return this.orders
  }

  // ------------------------------------------------------------------ CRM clean-up
  async matchCrmRecords(records: CrmRecord[]): Promise<MatchCandidate[]> {
    await this.ready
    const businesses = Array.from(this.ds.businesses.values())
    const byPostcode = new Map<string, Business[]>()
    for (const b of businesses) {
      const arr = byPostcode.get(b.postcode) ?? []
      arr.push(b)
      byPostcode.set(b.postcode, arr)
    }
    const byCompanyNumber = new Map(Array.from(this.ds.companies.values()).map((c) => [c.companyNumber, c]))
    const byCompanyName = new Map(Array.from(this.ds.companies.values()).map((c) => [normaliseCompanyName(c.name), c]))
    const out: MatchCandidate[] = []
    for (const r of records) {
      const issues: CrmIssue[] = []
      const reasons: string[] = []
      const pc = normalisePostcode(r.postcode) ?? extractPostcode(r.address)
      if (r.postcode && !normalisePostcode(r.postcode)) issues.push('Postcode invalid')
      const rName = normaliseBusinessName(r.businessName)
      const rAddr = normaliseAddress(r.address)
      let candidates = pc ? byPostcode.get(pc) ?? [] : []
      if (!candidates.length) candidates = businesses // fall back to full scan on name
      let best: { b: Business; score: number; reasons: string[] } | undefined
      for (const b of candidates) {
        const nameScore = similarity(rName, normaliseBusinessName(b.name))
        const addrScore = similarity(rAddr, normaliseAddress(b.address))
        const pcScore = pc && pc === b.postcode ? 1 : 0
        const score = nameScore * 0.5 + addrScore * 0.3 + pcScore * 0.2
        if (!best || score > best.score) best = { b, score, reasons: [`name ${Math.round(nameScore * 100)}%`, `address ${Math.round(addrScore * 100)}%`, pcScore ? 'postcode exact' : 'postcode differs'] }
      }
      // Company resolution
      const cn = validCompanyNumber(r.companyNumber)
      let company: Company | undefined = cn ? byCompanyNumber.get(cn) : undefined
      if (!company && r.companyName) company = byCompanyName.get(normaliseCompanyName(r.companyName))
      if (!company && r.companyName) {
        let bestC: { c: Company; s: number } | undefined
        const n = normaliseCompanyName(r.companyName)
        for (const c of this.ds.companies.values()) {
          const s = similarity(n, normaliseCompanyName(c.name))
          if (!bestC || s > bestC.s) bestC = { c, s }
        }
        if (bestC && bestC.s >= 0.9) company = bestC.c
      }
      if (r.companyName && !company) issues.push('Company not found')
      if (company && (company.status === 'dissolved' || company.status === 'liquidation')) issues.push('Company dissolved')
      if (best && best.score >= 0.62) {
        reasons.push(...best.reasons)
        const b = best.b
        if (r.capacity && b.registers.some((x) => x.capacity) && Math.abs((b.registers.find((x) => x.capacity)!.capacity ?? 0) - r.capacity) > 2) issues.push('Capacity mismatch')
        if (r.tenure && b.tenure && r.tenure.toLowerCase() !== b.tenure.toLowerCase()) issues.push('Tenure mismatch')
        if (r.owner && b.freeholderName && normaliseCompanyName(r.owner) !== normaliseCompanyName(b.freeholderName) && b.tenure === 'Leasehold') issues.push('Owner changed')
        if (b.registers.some((x) => x.status !== 'Registered')) issues.push('Business deregistered')
        if (r.lastContact && r.lastContact < new Date(Date.now() - 3 * 365 * 86400000).toISOString().slice(0, 10)) issues.push('Stale contact')
        out.push({ recordId: r.recordId, businessId: b.businessId, titleNumber: b.titleNumber, uprn: b.uprn, companyNumber: company?.companyNumber ?? b.operatorCompanyNumber, registerId: b.registers[0]?.registerId, registerKind: b.registers[0]?.register, confidence: Math.round(best.score * 100) / 100, reasons, issues })
      } else {
        issues.push('Address unresolved')
        if (!r.lastContact || r.lastContact < '2021-01-01') issues.push('Stale contact')
        out.push({ recordId: r.recordId, companyNumber: company?.companyNumber, confidence: best ? Math.round(best.score * 100) / 100 : 0, reasons: best ? [`best guess ${best.b.name} (${Math.round(best.score * 100)}%)`] : ['no candidate'], issues })
      }
    }
    return out
  }

  async findDuplicates(records: CrmRecord[]): Promise<DuplicateGroup[]> {
    await this.ready
    const groups: DuplicateGroup[] = []
    const used = new Set<string>()
    const prepared = records.map((r) => ({ r, name: normaliseBusinessName(r.businessName), addr: normaliseAddress(r.address), pc: normalisePostcode(r.postcode) ?? extractPostcode(r.address), cn: validCompanyNumber(r.companyNumber) }))
    for (let i = 0; i < prepared.length; i++) {
      if (used.has(prepared[i].r.recordId)) continue
      const members = [prepared[i]]
      for (let j = i + 1; j < prepared.length; j++) {
        if (used.has(prepared[j].r.recordId)) continue
        const a = prepared[i]
        const b = prepared[j]
        const nameS = similarity(a.name, b.name)
        const addrS = similarity(a.addr, b.addr)
        const samePc = !!a.pc && a.pc === b.pc
        const sameCn = !!a.cn && a.cn === b.cn
        const score = nameS * 0.5 + addrS * 0.3 + (samePc ? 0.2 : 0) + (sameCn ? 0.15 : 0)
        if ((nameS > 0.85 && (samePc || addrS > 0.75)) || score > 0.85) {
          members.push(b)
          used.add(b.r.recordId)
        }
      }
      if (members.length > 1) {
        used.add(prepared[i].r.recordId)
        const survivor = members.slice().sort((x, y) => (y.r.lastContact ?? '').localeCompare(x.r.lastContact ?? '') || (y.cn ? 1 : 0) - (x.cn ? 1 : 0))[0]
        groups.push({ groupId: `DUP-${groups.length + 1}`, recordIds: members.map((m) => m.r.recordId), score: 0.9, reason: `Same business name and ${members.every((m) => m.pc === members[0].pc) ? 'postcode' : 'address'}`, survivorId: survivor.r.recordId })
      }
    }
    return groups
  }

  async sampleCrmCsv() {
    await this.ready
    return crmToCsv(this.ds.crm)
  }

  async getDataSources(): Promise<DataSourceStatus[]> {
    await this.ready
    if (!this.real) return DATA_SOURCES
    const real = this.real
    const gb = await tileTotals()
    const collected: DataSourceStatus[] = [
      { id: 'gb-tiles', name: 'Great Britain open-data tiles', provider: 'Overture Maps, HM Land Registry, DfT', licence: 'OGL', cadence: 'Rebuilt by scripts/data/build_national_tiles.py', lastRun: real.fetchedAt, status: gb.places ? 'ok' : 'not-configured', records: gb.places + gb.price_paid + gb.traffic, note: `National coverage loaded on demand per 0.5° cell: ${gb.places.toLocaleString()} places in Christie sectors, ${gb.price_paid.toLocaleString()} non-residential price paid transactions since 2023, ${gb.traffic.toLocaleString()} DfT count points.` },
      { id: 'overture-roads', name: 'Road network (Overture Maps transportation)', provider: 'Overture Maps Foundation', licence: 'OGL', cadence: 'Monthly release', lastRun: real.fetchedAt, status: 'ok', records: real.roads.features.length, note: 'Collected: real centrelines for Warwick district (ODbL, OpenStreetMap contributors). Demo title parcels are laid along these streets.', docsUrl: 'https://docs.overturemaps.org/guides/transportation/' },
      { id: 'overture-places', name: 'Places (Overture Maps)', provider: 'Overture Maps Foundation', licence: 'OGL', cadence: 'Monthly release', lastRun: real.fetchedAt, status: 'ok', records: real.places.features.length, note: 'Collected: real businesses in Christie sectors for Warwick district (CDLA-Permissive-2.0). Used for the real-business layer and catchment supply.', docsUrl: 'https://docs.overturemaps.org/guides/places/' },
      { id: 'overture-buildings', name: 'Building footprints (Overture Maps)', provider: 'Overture Maps Foundation', licence: 'OGL', cadence: 'Monthly release', lastRun: real.fetchedAt, status: 'ok', records: 19666, note: 'Collected: town-centre footprints (ODbL). Shown as an optional map layer.', docsUrl: 'https://docs.overturemaps.org/guides/buildings/' },
      { id: 'dft-aadf-real', name: 'DfT traffic counts (collected)', provider: 'Department for Transport', licence: 'OGL', cadence: 'Annual', lastRun: real.fetchedAt, status: 'ok', records: real.traffic.length, note: 'Collected: every count point in the demo area with its 2000 to 2025 AADF history; 46,754 points nationally held in scripts/data output.', docsUrl: 'https://roadtraffic.dft.gov.uk/downloads' },
      { id: 'hmlr-ppd-real', name: 'HM Land Registry price paid (collected)', provider: 'HM Land Registry', licence: 'OGL', cadence: 'Monthly', lastRun: real.fetchedAt, status: 'ok', records: real.pricePaid.length, note: 'Collected: all Warwick district transactions 2019 to 2025, geocoded approximately by postcode; 411,186 non-residential transactions nationally held in scripts/data output.', docsUrl: 'https://www.gov.uk/government/collections/price-paid-data' },
    ]
    return [...collected, ...DATA_SOURCES]
  }

  // Convenience for pages that need whole collections (mock only).
  allBusinesses() {
    return Array.from(this.ds.businesses.values())
  }
  allCompanies() {
    return Array.from(this.ds.companies.values())
  }
  allTitles() {
    return Array.from(this.ds.titles.values())
  }
  allPlanning() {
    return Array.from(this.ds.planning.values())
  }
  constraintsAll(): Constraint[] {
    return this.ds.constraints
  }
  trafficAll(): TrafficCount[] {
    return this.ds.traffic
  }
  footfallAll(): FootfallCell[] {
    return this.ds.footfall
  }
  comparablesAll(): Comparable[] {
    return this.ds.comparables
  }
  leasesAll(): LeaseSummary[] {
    return Array.from(this.ds.titles.values()).flatMap((t) => t.leases)
  }
  centre() {
    return this.ds.centre
  }
}

export type { Alert, PlanningApplication, Hereditament }
