import type { Point } from 'geojson'
import type { PlaceProps, PricePaidRow } from './real'
import type {
  Alert,
  BoundsQuery,
  Business,
  Catchment,
  Comparable,
  ComparableFilters,
  ComparableStats,
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
  Sector,
  WatchItem,
  AuditEvent,, DashboardStats, StaffRow } from './types'

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
  /** The registered title whose extent contains the point, if any. */
  getTitleAt(lon: number, lat: number): Promise<Title | undefined>
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

  // Comparables and catchment
  getComparables(filters: ComparableFilters): Promise<{ comps: Comparable[]; stats: ComparableStats }>
  getComparable(compId: string): Promise<Comparable | undefined>
  /** Real place (Overture Maps) by id, when open data has been collected for the area. */
  getPoi(id: string): Promise<(PlaceProps & { location: Point }) | undefined>
  getPoisNear(lon: number, lat: number, radiusM: number, sector?: Sector): Promise<(PlaceProps & { location: Point; distanceM: number })[]>
  /** Demo/registered businesses within a radius, nearest first. */
  getBusinessesNear(lon: number, lat: number, radiusM: number, sector?: Sector): Promise<(Business & { distanceM: number })[]>
  /** HM Land Registry price paid transaction by id. */
  getPricePaid(id: string): Promise<PricePaidRow | undefined>
  getPricePaidNear(lon: number, lat: number, radiusM: number, opts?: { nonResidentialOnly?: boolean; limit?: number }): Promise<(PricePaidRow & { distanceM: number })[]>
  /** Optional: persist an audit event server-side (the UI keeps a local copy regardless). */
  recordAudit?(e: AuditEvent): Promise<void>
  getAudit?(): Promise<AuditEvent[]>
  /** Optional: per-user watchlist storage; the UI falls back to local persistence. */
  getWatchlist?(): Promise<WatchItem[] | undefined>
  saveWatchlist?(items: WatchItem[]): Promise<void>
  getCatchment(lon: number, lat: number, radiusM: number): Promise<Catchment>

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

  // Directory and summaries
  getStaff(): Promise<StaffRow[]>
  getPlanningForAuthority(authority: string, limit?: number): Promise<PlanningApplication[]>
  getDashboard(): Promise<DashboardStats>
}
