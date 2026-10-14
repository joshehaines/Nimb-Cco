/**
 * Domain model for Christie Property Intelligence.
 *
 * Every entity carries `source` and `fetchedAt` so licence rules
 * (for example the HMLR CCOD no-direct-marketing restriction) can be
 * enforced in the UI, and so stale data is visible rather than silent.
 *
 * These types are the contract between the UI and any data provider
 * (mock today, FastAPI + PostGIS later). Keep them backend-agnostic.
 */

import type { Feature, FeatureCollection, Point, Polygon, MultiPolygon, LineString } from 'geojson'

export type ISODate = string
export type Tenure = 'Freehold' | 'Leasehold'
export type Sector =
  | 'Pub'
  | 'Restaurant'
  | 'Hotel'
  | 'Care Home'
  | 'Childcare'
  | 'Dental'
  | 'Medical'
  | 'Pharmacy'
  | 'Convenience Retail'
  | 'Leisure'
  | 'Garden Centre'
  | 'Other'

export const SECTORS: Sector[] = [
  'Pub',
  'Restaurant',
  'Hotel',
  'Care Home',
  'Childcare',
  'Dental',
  'Medical',
  'Pharmacy',
  'Convenience Retail',
  'Leisure',
  'Garden Centre',
  'Other',
]

export interface DataSourceTag {
  /** Short name of the upstream source, e.g. "HMLR CCOD", "VOA", "CQC". */
  source: string
  /** When this record was last refreshed from the source. */
  fetchedAt: ISODate
  /** Licence class, used to gate exports and marketing use. */
  licence: 'OGL' | 'HMLR-CCOD' | 'HMLR-Doc' | 'VOA-Restricted' | 'OS' | 'Vendor' | 'Internal'
}

/** HM Land Registry title (INSPIRE polygon + CCOD/OCOD + optional register). */
export interface Title extends DataSourceTag {
  titleNumber: string
  inspireId: number
  tenure: Tenure
  /** Address as held by HMLR (property description). */
  address: string
  postcode: string
  uprn?: string
  geometry: Polygon | MultiPolygon
  areaSqm: number
  proprietors: Proprietor[]
  pricePaid?: number
  pricePaidDate?: ISODate
  dateProprietorAdded?: ISODate
  /** Registered leases noted against this freehold title. */
  leases: LeaseSummary[]
  /** Whether the official register has been purchased and stored. */
  registerPurchased: boolean
  titlePlanPurchased: boolean
  /** Charges noted on the register (lender name) where known. */
  charges?: { lender: string; date: ISODate }[]
}

export interface Proprietor {
  name: string
  category:
    | 'Limited Company or Public Limited Company'
    | 'Private Individual'
    | 'Local Authority'
    | 'Housing Association'
    | 'Charity'
    | 'Overseas Company'
    | 'Other'
  companyNumber?: string
  address?: string
  /** Private individual names are only visible once the register is purchased. */
  redacted?: boolean
}

export interface LeaseSummary extends DataSourceTag {
  leaseId: string
  freeholdTitleNumber: string
  leaseholdTitleNumber?: string
  dateOfLease: ISODate
  termYears: number
  termDescription: string
  expiryDate: ISODate
  premium?: number
  lessee?: string
  alienationClause?: boolean
  /** Populated when the lease document has been bought and parsed. */
  parsed?: ParsedLease
}

export interface ParsedLease {
  rentPa?: number
  rentReviewDates?: ISODate[]
  breakDates?: ISODate[]
  repairingObligation?: 'FRI' | 'IRI' | 'Other'
  permittedUse?: string
  tiedSupply?: boolean
  confidence: number
  extractedAt: ISODate
}

/** Companies House company. */
export interface Company extends DataSourceTag {
  companyNumber: string
  name: string
  status: 'active' | 'dissolved' | 'liquidation' | 'administration' | 'receivership' | 'dormant'
  incorporated: ISODate
  sicCodes: string[]
  registeredAddress: string
  accountsOverdue: boolean
  lastAccountsMadeUpTo?: ISODate
  charges: { lender: string; created: ISODate; satisfied: boolean }[]
  officers: { name: string; role: string; appointed: ISODate }[]
  pscs: { name: string; kind: 'individual' | 'corporate'; companyNumber?: string }[]
  /** Parent company number if this is a subsidiary (from PSC data). */
  parentCompanyNumber?: string
  gazetteNotices: { type: string; date: ISODate }[]
}

/** VOA non-domestic rating list entry. */
export interface Hereditament extends DataSourceTag {
  uarn: string
  uprn?: string
  address: string
  postcode: string
  description: string
  scatCode: string
  rateableValue: number
  listYear: 2017 | 2023 | 2026
  totalAreaSqm?: number
  floors?: { floor: string; use: string; areaSqm: number }[]
  effectiveDate: ISODate
  deleted?: boolean
}

export interface EPC extends DataSourceTag {
  certificateId: string
  uprn?: string
  address: string
  postcode: string
  kind: 'non-domestic' | 'domestic' | 'DEC'
  rating: 'A+' | 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G'
  score: number
  floorAreaSqm?: number
  lodgedAt: ISODate
  expiresAt: ISODate
  mainHeating?: string
}

export type PlanningStatus =
  | 'Pending'
  | 'Approved'
  | 'Refused'
  | 'Withdrawn'
  | 'Appeal'
  | 'Appeal Allowed'
  | 'Appeal Dismissed'

export interface PlanningApplication extends DataSourceTag {
  reference: string
  authority: string
  address: string
  postcode: string
  location: Point
  description: string
  applicant?: string
  agent?: string
  type: 'Full' | 'Outline' | 'Change of Use' | 'Listed Building' | 'Prior Approval' | 'Advertisement' | 'Other'
  status: PlanningStatus
  receivedDate: ISODate
  decisionDate?: ISODate
  portalUrl: string
  titleNumbers: string[]
  /** LLM summary of the decision notice when available. */
  summary?: string
}

export type ConstraintKind =
  | 'Flood Zone 2'
  | 'Flood Zone 3'
  | 'Conservation Area'
  | 'Listed Building'
  | 'Green Belt'
  | 'Article 4'
  | 'SSSI'
  | 'AONB'
  | 'TPO'
  | 'Brownfield Register'

export interface Constraint extends DataSourceTag {
  id: string
  kind: ConstraintKind
  name: string
  grade?: string
  geometry: Polygon | MultiPolygon | Point
}

export interface TrafficCount extends DataSourceTag {
  countPointId: string
  roadName: string
  roadType: 'Major' | 'Minor'
  location: Point
  year: number
  method: 'Counted' | 'Estimated'
  aadf: number
  cars: number
  lgv: number
  hgv: number
  pedalCycles: number
  history: { year: number; aadf: number }[]
}

export interface FootfallCell extends DataSourceTag {
  h3: string
  geometry: Polygon
  monthlyVisits: number
  band: number
  trend12m: number
  dwellMinutes?: number
}

export type RegisterKind = 'CQC' | 'Ofsted' | 'NHSBSA' | 'GPhC' | 'FSA' | 'Premises Licence' | 'DfE'

export interface RegisterRecord extends DataSourceTag {
  register: RegisterKind
  registerId: string
  name: string
  providerName?: string
  providerId?: string
  status: 'Registered' | 'Deregistered' | 'Suspended' | 'Closed'
  registeredAt?: ISODate
  deregisteredAt?: ISODate
  rating?: string
  ratingDate?: ISODate
  capacity?: number
  capacityLabel?: string
  extra?: Record<string, string | number | boolean | undefined>
}

/** A trading business at a property, the unit of interest for Christie & Co. */
export interface Business extends DataSourceTag {
  businessId: string
  name: string
  sector: Sector
  subSector?: string
  address: string
  postcode: string
  uprn?: string
  location: Point
  titleNumber?: string
  tenure?: Tenure
  operatorCompanyNumber?: string
  operatorName?: string
  freeholderName?: string
  freeholderCompanyNumber?: string
  hereditamentUarn?: string
  epcCertificateId?: string
  registers: RegisterRecord[]
  fhrsRating?: number
  distressFlags: DistressFlag[]
  /** Christie & Co internal context, when linked. */
  crm?: { recordId: string; office?: string; lastInstruction?: ISODate; lastContact?: ISODate }
}

export type DistressFlag =
  | 'Administration'
  | 'Receivership'
  | 'Liquidation'
  | 'Late accounts'
  | 'Gazette notice'
  | 'Regulator inadequate'
  | 'Regulator enforcement'
  | 'FHRS 0-1'
  | 'VOA deletion'
  | 'New charge registered'
  | 'Dispensing volume falling'

export interface Alert {
  alertId: string
  kind:
    | 'Ownership change'
    | 'Planning submitted'
    | 'Planning decided'
    | 'Rating change'
    | 'Registration change'
    | 'Company status'
    | 'Late accounts'
    | 'Lease event'
    | 'New business'
    | 'EPC lodged'
    | 'VOA change'
  title: string
  detail: string
  occurredAt: ISODate
  severity: 'info' | 'warning' | 'critical'
  entityType: 'title' | 'business' | 'company' | 'planning'
  entityId: string
  read: boolean
  sector?: Sector
}

export type PipelineStage = 'Prospect' | 'Approach' | 'Instruction' | 'On market' | 'Under offer' | 'Exchanged' | 'Completed' | 'Lost'
export const PIPELINE_STAGES: PipelineStage[] = ['Prospect', 'Approach', 'Instruction', 'On market', 'Under offer', 'Exchanged', 'Completed', 'Lost']

export interface WatchItem {
  id: string
  entityType: 'title' | 'business' | 'company' | 'area'
  entityId: string
  label: string
  addedAt: ISODate
  notes?: string
  radiusM?: number
  project?: string
  /** Deal pipeline fields */
  stage?: PipelineStage
  sector?: Sector
  office?: string
  assignee?: string
  feeEstimate?: number
  guidePrice?: number
  nextAction?: string
  nextActionDate?: ISODate
  stageChangedAt?: ISODate
}

export interface SearchResult {
  kind: 'address' | 'title' | 'company' | 'business' | 'postcode' | 'planning'
  id: string
  label: string
  sublabel?: string
  location?: Point
}

export interface SourcingFilters {
  sectors: Sector[]
  tenure?: Tenure
  ownerCategories: Proprietor['category'][]
  minRateableValue?: number
  maxRateableValue?: number
  minAreaSqm?: number
  maxAreaSqm?: number
  epcWorseThan?: EPC['rating']
  leaseExpiringWithinMonths?: number
  distressOnly: boolean
  distressFlags: DistressFlag[]
  registerRatings: string[]
  ownedSince?: ISODate
  excludeConstraints: ConstraintKind[]
  planningWithinMonths?: number
  text?: string
}

export const DEFAULT_FILTERS: SourcingFilters = {
  sectors: [],
  ownerCategories: [],
  distressOnly: false,
  distressFlags: [],
  registerRatings: [],
  excludeConstraints: [],
}

export interface DataSourceStatus {
  id: string
  name: string
  provider: string
  licence: DataSourceTag['licence']
  cadence: string
  lastRun?: ISODate
  nextRun?: ISODate
  status: 'ok' | 'stale' | 'error' | 'not-configured' | 'paid'
  records?: number
  note?: string
  docsUrl?: string
}

export interface DocumentOrder {
  orderId: string
  titleNumber: string
  kind: 'Register' | 'Title Plan' | 'Lease' | 'Deed'
  fee: number
  orderedAt: ISODate
  status: 'Queued' | 'Downloading' | 'Stored' | 'Parsed' | 'Failed'
  fileName?: string
  parsedSummary?: string
}

/** CRM clean-up domain. */
export interface CrmRecord {
  recordId: string
  office?: string
  businessName: string
  address: string
  postcode?: string
  contactName?: string
  companyName?: string
  companyNumber?: string
  sector?: string
  tenure?: string
  capacity?: number
  lastContact?: ISODate
  owner?: string
  raw: Record<string, string>
}

export interface MatchCandidate {
  recordId: string
  /** The reference entity we think it is. */
  businessId?: string
  titleNumber?: string
  uprn?: string
  companyNumber?: string
  registerId?: string
  registerKind?: RegisterKind
  confidence: number
  reasons: string[]
  issues: CrmIssue[]
}

export type CrmIssue =
  | 'Duplicate'
  | 'Address unresolved'
  | 'Company dissolved'
  | 'Company not found'
  | 'Owner changed'
  | 'Business deregistered'
  | 'Capacity mismatch'
  | 'Tenure mismatch'
  | 'Postcode invalid'
  | 'Stale contact'

export interface DuplicateGroup {
  groupId: string
  recordIds: string[]
  score: number
  reason: string
  survivorId: string
}

/** A sold trading business (comparable evidence). */
export interface Comparable extends DataSourceTag {
  compId: string
  name: string
  sector: Sector
  subSector?: string
  address: string
  postcode: string
  location: Point
  date: ISODate
  price: number
  tenure: Tenure
  capacity?: number
  capacityLabel?: string
  rateableValue?: number
  turnover?: number
  ebitda?: number
  /** Price divided by capacity (per bed, room, place) where capacity exists. */
  pricePerUnit?: number
  /** Price divided by rateable value. */
  rvMultiple?: number
  /** Price divided by EBITDA. */
  ebitdaMultiple?: number
  buyerType: 'Group' | 'Independent' | 'Investor' | 'Owner-operator'
  /** True when the deal came from Christie & Co's own records rather than public data. */
  contributed: boolean
  confidence: 'Verified' | 'Reported' | 'Derived'
}

export interface ComparableFilters {
  sectors: Sector[]
  tenure?: Tenure
  fromDate?: ISODate
  toDate?: ISODate
  minCapacity?: number
  maxCapacity?: number
  minPrice?: number
  maxPrice?: number
  centre?: [number, number]
  radiusM?: number
  contributedOnly?: boolean
  text?: string
}

export const DEFAULT_COMP_FILTERS: ComparableFilters = { sectors: [] }

export interface ComparableStats {
  count: number
  medianPrice?: number
  medianPricePerUnit?: number
  medianRvMultiple?: number
  medianEbitdaMultiple?: number
  pricePerUnitRange?: [number, number]
  byYear: { year: number; count: number; medianPrice: number }[]
}

/** Catchment / area analysis around a point. */
export interface Catchment {
  centre: [number, number]
  radiusM: number
  population: number
  households: number
  age0to4: number
  age65plus: number
  age85plus: number
  adults: number
  medianHouseholdIncome: number
  affluenceIndex: number
  deprivationDecile: number
  competitors: { sector: Sector; count: number; capacity: number; capacityLabel?: string }[]
  nearest: { businessId: string; name: string; sector: Sector; distanceM: number; capacity?: number; rating?: string; operatorName?: string }[]
  /** Sector-specific supply ratios, e.g. care beds per 100 people aged 85+. */
  ratios: { label: string; value: number; benchmark: number; unit: string; better: 'higher' | 'lower'; note: string }[]
  footfallMonthly?: number
  trafficAadf?: number
  /** Supply counted from real places (Overture Maps) rather than the demo businesses, when collected. */
  realSupply?: { source: string; counts: { sector: Sector; count: number }[]; nearest: { id: string; name: string; category: string; sector: Sector; distanceM: number; address?: string; postcode?: string }[] }
  source: string
}

/** Letter campaign (direct-to-owner outreach) with compliance tracking. */
export type RecipientBasis = 'Register purchased' | 'Business contact' | 'Existing relationship' | 'Blocked: CCOD only' | 'Blocked: suppressed' | 'Blocked: no address'

export interface CampaignRecipient {
  id: string
  businessId?: string
  titleNumber?: string
  recipientName: string
  role: 'Freeholder' | 'Operator'
  address: string
  postcode: string
  sector?: Sector
  basis: RecipientBasis
  included: boolean
  mergeFields: Record<string, string>
}

export interface Campaign {
  campaignId: string
  name: string
  sector?: Sector
  templateId: string
  createdAt: ISODate
  status: 'Draft' | 'Approved' | 'Sent' | 'Closed'
  recipients: CampaignRecipient[]
  liaCompleted: boolean
  liaNotes?: string
  owner?: string
  sentAt?: ISODate
  responses: number
}

export interface LetterTemplate {
  templateId: string
  name: string
  sector?: Sector
  subject: string
  body: string
}

export interface BoundsQuery {
  west: number
  south: number
  east: number
  north: number
}

export type TitleFeature = Feature<Polygon | MultiPolygon, { titleNumber: string; tenure: Tenure; category: string; sector?: Sector; distress: boolean; watched?: boolean }>
export type BusinessFeature = Feature<Point, { businessId: string; sector: Sector; name: string; distress: boolean; rating?: string }>
export type PlanningFeature = Feature<Point, { reference: string; status: PlanningStatus; type: string }>
export type TrafficFeature = Feature<Point, { countPointId: string; aadf: number; year: number; method: string }>
export type FootfallFeature = Feature<Polygon, { h3: string; band: number; monthlyVisits: number }>
export type ConstraintFeature = Feature<Polygon | MultiPolygon | Point, { id: string; kind: ConstraintKind; name: string }>

export type StreetFeature = Feature<LineString, { name: string; major: boolean }>

export interface MapLayers {
  /** Schematic street centrelines for the offline fallback basemap (optional). */
  streets?: FeatureCollection<LineString, StreetFeature['properties']>
  titles: FeatureCollection<TitleFeature['geometry'], TitleFeature['properties']>
  businesses: FeatureCollection<Point, BusinessFeature['properties']>
  /** Real places from Overture Maps (name, category, sector, address), when collected. */
  poi?: FeatureCollection<Point, { id: string; name?: string; category: string; sector: string; confidence: number; postcode?: string }>
  /** HM Land Registry price paid transactions, approximately geocoded by postcode. */
  pricePaid?: FeatureCollection<Point, { id: string; price: number; date: string; type: string; address: string; postcode: string; geocode: string }>
  comparables?: FeatureCollection<Point, { compId: string; sector: Sector; price: number; date: string; name: string }>
  planning: FeatureCollection<Point, PlanningFeature['properties']>
  traffic: FeatureCollection<Point, TrafficFeature['properties']>
  footfall: FeatureCollection<Polygon, FootfallFeature['properties']>
  constraints: FeatureCollection<ConstraintFeature['geometry'], ConstraintFeature['properties']>
}
