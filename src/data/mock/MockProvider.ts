import type { Polygon } from 'geojson'
import type { DataProvider } from '../provider'
import type {
  Alert,
  BoundsQuery,
  Business,
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
import { centroid, haversineM, inBounds, pointInPolygon } from '../../lib/geo'
import { monthsUntil } from '../../lib/format'
import { extractPostcode, normaliseAddress, normaliseBusinessName, normaliseCompanyName, normalisePostcode, similarity, validCompanyNumber } from '../../lib/matching'

const EPC_ORDER = ['A+', 'A', 'B', 'C', 'D', 'E', 'F', 'G']
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms))

export class MockProvider implements DataProvider {
  readonly name = 'mock'
  private ds: Dataset
  private orders: DocumentOrder[] = []
  private orderCounter = 1

  constructor(seed?: number) {
    this.ds = generateDataset(seed)
  }

  get dataset() {
    return this.ds
  }

  async search(query: string, limit = 12): Promise<SearchResult[]> {
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
    return {
      titles: { type: 'FeatureCollection', features: titles },
      businesses: { type: 'FeatureCollection', features: businesses },
      planning: { type: 'FeatureCollection', features: planning },
      traffic: { type: 'FeatureCollection', features: traffic },
      footfall: { type: 'FeatureCollection', features: footfall },
      constraints: { type: 'FeatureCollection', features: constraints },
    }
  }

  async getTitle(titleNumber: string) {
    return this.ds.titles.get(titleNumber)
  }
  async getTitlesForCompany(companyNumber: string) {
    const group = new Set((await this.getCompanyGroup(companyNumber)).map((c) => c.companyNumber))
    return Array.from(this.ds.titles.values()).filter((t) => t.proprietors.some((p) => p.companyNumber && group.has(p.companyNumber)))
  }
  async getBusiness(businessId: string) {
    return this.ds.businesses.get(businessId)
  }
  async getBusinessesForTitle(titleNumber: string) {
    return Array.from(this.ds.businesses.values()).filter((b) => b.titleNumber === titleNumber)
  }
  async getBusinessesForCompany(companyNumber: string) {
    const group = new Set((await this.getCompanyGroup(companyNumber)).map((c) => c.companyNumber))
    return Array.from(this.ds.businesses.values()).filter((b) => (b.operatorCompanyNumber && group.has(b.operatorCompanyNumber)) || (b.freeholderCompanyNumber && group.has(b.freeholderCompanyNumber)))
  }
  async getCompany(companyNumber: string) {
    return this.ds.companies.get(companyNumber)
  }
  async getCompanyGroup(companyNumber: string) {
    const c = this.ds.companies.get(companyNumber)
    if (!c) return []
    const root = c.parentCompanyNumber ? this.ds.companies.get(c.parentCompanyNumber) ?? c : c
    const members = [root, ...Array.from(this.ds.companies.values()).filter((x) => x.parentCompanyNumber === root.companyNumber)]
    return members
  }
  async getHereditament(uarn: string) {
    return this.ds.hereditaments.get(uarn)
  }
  async getHereditamentsForTitle(titleNumber: string) {
    const t = this.ds.titles.get(titleNumber)
    if (!t) return []
    return Array.from(this.ds.hereditaments.values()).filter((h) => h.uprn === t.uprn)
  }
  async getEpc(certificateId: string) {
    return this.ds.epcs.get(certificateId)
  }
  async getEpcsForTitle(titleNumber: string) {
    const t = this.ds.titles.get(titleNumber)
    if (!t) return []
    return Array.from(this.ds.epcs.values()).filter((e) => e.uprn === t.uprn)
  }
  async getPlanningForTitle(titleNumber: string, radiusM = 0) {
    const t = this.ds.titles.get(titleNumber)
    if (!t) return []
    const c = centroid(t.geometry as Polygon)
    return Array.from(this.ds.planning.values())
      .filter((p) => p.titleNumbers.includes(titleNumber) || (radiusM > 0 && haversineM(c, p.location.coordinates) <= radiusM))
      .sort((a, b) => b.receivedDate.localeCompare(a.receivedDate))
  }
  async getPlanning(reference: string) {
    return this.ds.planning.get(reference)
  }
  async getConstraintsForTitle(titleNumber: string) {
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
    return this.ds.traffic.filter((t) => haversineM([lon, lat], t.location.coordinates) <= radiusM).sort((a, b) => haversineM([lon, lat], a.location.coordinates) - haversineM([lon, lat], b.location.coordinates))
  }
  async getFootfallNear(lon: number, lat: number, radiusM: number) {
    return this.ds.footfall.filter((f) => haversineM([lon, lat], centroid(f.geometry)) <= radiusM)
  }
  async getLeasesForTitle(titleNumber: string) {
    return this.ds.titles.get(titleNumber)?.leases ?? []
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

  async getAlerts() {
    return this.ds.alerts
  }
  async markAlertRead(alertId: string) {
    const a = this.ds.alerts.find((x) => x.alertId === alertId)
    if (a) a.read = true
  }

  async orderDocument(titleNumber: string, kind: DocumentOrder['kind']) {
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
    return this.orders
  }

  // ------------------------------------------------------------------ CRM clean-up
  async matchCrmRecords(records: CrmRecord[]): Promise<MatchCandidate[]> {
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
    return crmToCsv(this.ds.crm)
  }

  async getDataSources(): Promise<DataSourceStatus[]> {
    return DATA_SOURCES
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
  leasesAll(): LeaseSummary[] {
    return Array.from(this.ds.titles.values()).flatMap((t) => t.leases)
  }
  centre() {
    return this.ds.centre
  }
}

export type { Alert, PlanningApplication, Hereditament }
