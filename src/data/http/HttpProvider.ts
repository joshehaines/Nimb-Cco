import type { DataProvider } from '../provider'
import type { BoundsQuery, CrmRecord, DocumentOrder, SourcingFilters } from '../types'

/**
 * REST implementation of DataProvider. Endpoint shapes are documented in
 * docs/API.md and are what the FastAPI + PostGIS backend will serve.
 * Every method mirrors a MockProvider method one-for-one.
 */
export class HttpProvider implements DataProvider {
  readonly name = 'http'
  constructor(private base = '/api') {}

  private async get<T>(path: string, params?: Record<string, string | number | undefined>): Promise<T> {
    const url = new URL(this.base + path, window.location.origin)
    if (params) for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, String(v))
    const res = await fetch(url.toString(), { credentials: 'include' })
    if (res.status === 404) return undefined as T
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`)
    return res.json()
  }
  private async post<T>(path: string, body: unknown): Promise<T> {
    const res = await fetch(this.base + path, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${path}`)
    return res.json()
  }
  private bbox(b?: BoundsQuery) {
    return b ? { bbox: `${b.west},${b.south},${b.east},${b.north}` } : undefined
  }

  search = (query: string, limit = 12) => this.get<never>('/search', { q: query, limit })
  getMapLayers = (bounds: BoundsQuery) => this.get<never>('/map/layers', this.bbox(bounds))
  getTitle = (titleNumber: string) => this.get<never>(`/titles/${titleNumber}`)
  getTitlesForCompany = (companyNumber: string) => this.get<never>(`/companies/${companyNumber}/titles`)
  getBusiness = (id: string) => this.get<never>(`/businesses/${id}`)
  getBusinessesForTitle = (titleNumber: string) => this.get<never>(`/titles/${titleNumber}/businesses`)
  getBusinessesForCompany = (companyNumber: string) => this.get<never>(`/companies/${companyNumber}/businesses`)
  getCompany = (companyNumber: string) => this.get<never>(`/companies/${companyNumber}`)
  getCompanyGroup = (companyNumber: string) => this.get<never>(`/companies/${companyNumber}/group`)
  getHereditament = (uarn: string) => this.get<never>(`/voa/${uarn}`)
  getHereditamentsForTitle = (titleNumber: string) => this.get<never>(`/titles/${titleNumber}/voa`)
  getEpc = (id: string) => this.get<never>(`/epc/${id}`)
  getEpcsForTitle = (titleNumber: string) => this.get<never>(`/titles/${titleNumber}/epc`)
  getPlanningForTitle = (titleNumber: string, radiusM?: number) => this.get<never>(`/titles/${titleNumber}/planning`, { radius: radiusM })
  getPlanning = (reference: string) => this.get<never>(`/planning/${encodeURIComponent(reference)}`)
  getConstraintsForTitle = (titleNumber: string) => this.get<never>(`/titles/${titleNumber}/constraints`)
  getTrafficNear = (lon: number, lat: number, radiusM: number) => this.get<never>('/traffic', { lon, lat, radius: radiusM })
  getFootfallNear = (lon: number, lat: number, radiusM: number) => this.get<never>('/footfall', { lon, lat, radius: radiusM })
  getLeasesForTitle = (titleNumber: string) => this.get<never>(`/titles/${titleNumber}/leases`)
  sourceBusinesses = (filters: SourcingFilters, bounds?: BoundsQuery) => this.post<never>('/sourcing/businesses', { filters, bounds })
  sourceTitles = (filters: SourcingFilters, bounds?: BoundsQuery) => this.post<never>('/sourcing/titles', { filters, bounds })
  getAlerts = () => this.get<never>('/alerts')
  markAlertRead = (alertId: string) => this.post<never>(`/alerts/${alertId}/read`, {})
  orderDocument = (titleNumber: string, kind: DocumentOrder['kind']) => this.post<never>('/documents/orders', { titleNumber, kind })
  getDocumentOrders = () => this.get<never>('/documents/orders')
  matchCrmRecords = (records: CrmRecord[]) => this.post<never>('/crm/match', { records })
  findDuplicates = (records: CrmRecord[]) => this.post<never>('/crm/duplicates', { records })
  sampleCrmCsv = () => fetch(this.base + '/crm/sample.csv').then((r) => r.text())
  getDataSources = () => this.get<never>('/admin/sources')
}
