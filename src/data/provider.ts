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
  Hereditament,
  LeaseSummary,
  MapLayers,
  MatchCandidate,
  PlanningApplication,
  SearchResult,
  SourcingFilters,
  Title,
  TrafficCount,
  FootfallCell,
} from './types'

/**
 * The single interface the UI talks to.
 *
 * `MockProvider` implements it over synthetic in-memory data.
 * `HttpProvider` implements it over the REST API described in docs/API.md,
 * which the FastAPI + PostGIS backend will expose. Swapping providers is a
 * one-line change in src/data/index.ts.
 */
export interface DataProvider {
  readonly name: string

  // Search
  search(query: string, limit?: number): Promise<SearchResult[]>

  // Map layers
  getMapLayers(bounds: BoundsQuery): Promise<MapLayers>

  // Entities
  getTitle(titleNumber: string): Promise<Title | undefined>
  getTitlesForCompany(companyNumber: string): Promise<Title[]>
  getBusiness(businessId: string): Promise<Business | undefined>
  getBusinessesForTitle(titleNumber: string): Promise<Business[]>
  getBusinessesForCompany(companyNumber: string): Promise<Business[]>
  getCompany(companyNumber: string): Promise<Company | undefined>
  getCompanyGroup(companyNumber: string): Promise<Company[]>
  getHereditament(uarn: string): Promise<Hereditament | undefined>
  getHereditamentsForTitle(titleNumber: string): Promise<Hereditament[]>
  getEpc(certificateId: string): Promise<EPC | undefined>
  getEpcsForTitle(titleNumber: string): Promise<EPC[]>
  getPlanningForTitle(titleNumber: string, radiusM?: number): Promise<PlanningApplication[]>
  getPlanning(reference: string): Promise<PlanningApplication | undefined>
  getConstraintsForTitle(titleNumber: string): Promise<Constraint[]>
  getTrafficNear(lon: number, lat: number, radiusM: number): Promise<TrafficCount[]>
  getFootfallNear(lon: number, lat: number, radiusM: number): Promise<FootfallCell[]>
  getLeasesForTitle(titleNumber: string): Promise<LeaseSummary[]>

  // Sourcing
  sourceBusinesses(filters: SourcingFilters, bounds?: BoundsQuery): Promise<Business[]>
  sourceTitles(filters: SourcingFilters, bounds?: BoundsQuery): Promise<Title[]>

  // Alerts and documents
  getAlerts(): Promise<Alert[]>
  markAlertRead(alertId: string): Promise<void>
  orderDocument(titleNumber: string, kind: DocumentOrder['kind']): Promise<DocumentOrder>
  getDocumentOrders(): Promise<DocumentOrder[]>

  // CRM clean-up
  matchCrmRecords(records: CrmRecord[]): Promise<MatchCandidate[]>
  findDuplicates(records: CrmRecord[]): Promise<DuplicateGroup[]>
  sampleCrmCsv(): Promise<string>

  // Admin
  getDataSources(): Promise<DataSourceStatus[]>
}
