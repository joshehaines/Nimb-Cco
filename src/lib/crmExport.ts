import type { Business, Campaign, CrmRecord, EPC, Hereditament, MatchCandidate, Title, WatchItem } from '@/data/types'
import { dealScore } from './dealScore'

/**
 * Export clean, de-duplicated records INTO the CRM. Four objects (accounts, contacts, sites, deals)
 * with stable external ids so a re-export updates rather than duplicates. Presets map the objects to
 * the import column names Salesforce, HubSpot and Dynamics 365 expect; headers can be overridden
 * per preset and saved as a template.
 *
 * Licence rules are enforced here, not left to the user: accounts and contacts whose only source is
 * HM Land Registry company-ownership data are flagged marketingAllowed=false (and excluded by
 * default), redacted private individuals are never exported as contacts, and VOA fields are
 * excluded by default because the rating list terms restrict onward supply.
 */
export type CrmPreset = 'generic' | 'salesforce' | 'hubspot' | 'dynamics'
export type CrmObject = 'accounts' | 'contacts' | 'sites' | 'deals'

export interface ExportInput { b: Business; t?: Title; h?: Hereditament; e?: EPC; w?: WatchItem }
export interface ExportOptions {
  preset: CrmPreset
  objects: Record<CrmObject, boolean>
  excludeCcodOnly: boolean
  excludeVoa: boolean
  onlyNewToCrm: boolean
  office?: string
  owner?: string
  sourceLabel: string
  existingMatches?: MatchCandidate[]
  existingRecords?: CrmRecord[]
  campaign?: Campaign
}

export interface AccountRow { externalId: string; name: string; companyNumber?: string; type: 'Operator' | 'Freeholder' | 'Property company'; sector?: string; address?: string; postcode?: string; status?: string; marketingAllowed: boolean; dataLicence: string; source: string; crmRecordId?: string }
export interface ContactRow { externalId: string; accountExternalId?: string; firstName?: string; lastName: string; role: string; address?: string; postcode?: string; marketingAllowed: boolean; lawfulBasis: string; source: string; crmRecordId?: string }
export interface SiteRow { externalId: string; name: string; sector: string; subSector?: string; address: string; postcode: string; uprn?: string; titleNumber?: string; tenure?: string; lon: number; lat: number; capacity?: number; capacityLabel?: string; register?: string; registerId?: string; rating?: string; epcBand?: string; leaseExpiry?: string; rateableValue?: number; floorAreaSqm?: number; distressFlags: string; transactScore: number; operatorAccountExternalId?: string; freeholderAccountExternalId?: string; office?: string; owner?: string; source: string; crmRecordId?: string }
export interface DealRow { externalId: string; name: string; stage: string; siteExternalId: string; accountExternalId?: string; amount?: number; guidePrice?: number; closeDate?: string; nextStep?: string; office?: string; owner?: string; project?: string; source: string }
export interface Excluded { object: CrmObject; name: string; reason: string }
export interface ExportResult { accounts: AccountRow[]; contacts: ContactRow[]; sites: SiteRow[]; deals: DealRow[]; excluded: Excluded[]; licences: string[] }

export const PRESET_LABEL: Record<CrmPreset, string> = { generic: 'Generic CSV', salesforce: 'Salesforce (Data Import Wizard)', hubspot: 'HubSpot (Import)', dynamics: 'Microsoft Dynamics 365 (Import Data)' }

/** Column headers per preset: object -> field -> header. Fields absent from a preset are still exported under the generic header. */
export const PRESET_HEADERS: Record<CrmPreset, Partial<Record<CrmObject, Record<string, string>>>> = {
  generic: {},
  salesforce: {
    accounts: { externalId: 'External_Id__c', name: 'Account Name', companyNumber: 'Account Number', type: 'Type', sector: 'Industry', address: 'Billing Street', postcode: 'Billing Postal Code', status: 'Description', marketingAllowed: 'Marketing_Allowed__c', dataLicence: 'Data_Licence__c', source: 'Account Source' },
    contacts: { externalId: 'External_Id__c', accountExternalId: 'Account External Id', firstName: 'First Name', lastName: 'Last Name', role: 'Title', address: 'Mailing Street', postcode: 'Mailing Postal Code', marketingAllowed: 'Marketing_Allowed__c', lawfulBasis: 'Lawful_Basis__c', source: 'Lead Source' },
    sites: { externalId: 'External_Id__c', name: 'Name', sector: 'Sector__c', address: 'Street__c', postcode: 'Postal_Code__c', uprn: 'UPRN__c', titleNumber: 'Title_Number__c', tenure: 'Tenure__c', lon: 'Longitude__c', lat: 'Latitude__c', transactScore: 'Transact_Score__c', operatorAccountExternalId: 'Operator Account External Id', freeholderAccountExternalId: 'Freeholder Account External Id' },
    deals: { externalId: 'External_Id__c', name: 'Opportunity Name', stage: 'Stage', siteExternalId: 'Site External Id', accountExternalId: 'Account External Id', amount: 'Amount', closeDate: 'Close Date', nextStep: 'Next Step', owner: 'Opportunity Owner', source: 'Lead Source' },
  },
  hubspot: {
    accounts: { externalId: 'Record ID (external)', name: 'Company name', companyNumber: 'Company number', type: 'Type', sector: 'Industry', address: 'Street Address', postcode: 'Postal Code', status: 'Description', marketingAllowed: 'Marketing contact status', source: 'Original Source' },
    contacts: { externalId: 'Record ID (external)', accountExternalId: 'Associated Company', firstName: 'First Name', lastName: 'Last Name', role: 'Job Title', address: 'Street Address', postcode: 'Postal Code', marketingAllowed: 'Marketing contact status', lawfulBasis: 'Legal basis for processing contact data', source: 'Original Source' },
    sites: { externalId: 'Record ID (external)', name: 'Name', address: 'Street Address', postcode: 'Postal Code' },
    deals: { externalId: 'Record ID (external)', name: 'Deal Name', stage: 'Deal Stage', amount: 'Amount', closeDate: 'Close Date', owner: 'Deal owner', nextStep: 'Next step', accountExternalId: 'Associated Company', siteExternalId: 'Associated Site' },
  },
  dynamics: {
    accounts: { externalId: 'Account Number', name: 'Account Name', companyNumber: 'Company Registration Number', type: 'Relationship Type', sector: 'Industry', address: 'Address 1: Street 1', postcode: 'Address 1: ZIP/Postal Code', status: 'Description', marketingAllowed: 'Send Marketing Materials', source: 'Lead Source' },
    contacts: { externalId: 'External Id', accountExternalId: 'Company Name', firstName: 'First Name', lastName: 'Last Name', role: 'Job Title', address: 'Address 1: Street 1', postcode: 'Address 1: ZIP/Postal Code', marketingAllowed: 'Send Marketing Materials', lawfulBasis: 'Lawful Basis', source: 'Lead Source' },
    sites: { externalId: 'Site Id', name: 'Name', address: 'Address 1: Street 1', postcode: 'Address 1: ZIP/Postal Code' },
    deals: { externalId: 'Opportunity Id', name: 'Topic', stage: 'Pipeline Phase', accountExternalId: 'Potential Customer', amount: 'Est. Revenue', closeDate: 'Est. Close Date', owner: 'Owner', nextStep: 'Next Step' },
  },
}

const GENERIC_HEADERS: Record<string, string> = {
  externalId: 'External ID', accountExternalId: 'Account External ID', siteExternalId: 'Site External ID', operatorAccountExternalId: 'Operator Account External ID', freeholderAccountExternalId: 'Freeholder Account External ID',
  name: 'Name', companyNumber: 'Company Number', type: 'Type', sector: 'Sector', subSector: 'Sub-sector', address: 'Address', postcode: 'Postcode', status: 'Status', marketingAllowed: 'Marketing Allowed', dataLicence: 'Data Licence', source: 'Source', crmRecordId: 'Existing CRM Record ID',
  firstName: 'First Name', lastName: 'Last Name', role: 'Role', lawfulBasis: 'Lawful Basis', uprn: 'UPRN', titleNumber: 'Title Number', tenure: 'Tenure', lon: 'Longitude', lat: 'Latitude', capacity: 'Capacity', capacityLabel: 'Capacity Unit', register: 'Register', registerId: 'Register ID', rating: 'Rating', epcBand: 'EPC Band', leaseExpiry: 'Lease Expiry', rateableValue: 'Rateable Value', floorAreaSqm: 'Floor Area m2', distressFlags: 'Distress Signals', transactScore: 'Transact Score', office: 'Office', owner: 'Owner', stage: 'Stage', amount: 'Fee Estimate', guidePrice: 'Guide Price', closeDate: 'Next Action Date', nextStep: 'Next Step', project: 'Project',
}

export const VOA_FIELDS = new Set(['rateableValue', 'floorAreaSqm'])

export function headerFor(preset: CrmPreset, object: CrmObject, field: string, overrides?: Record<string, string>) {
  return overrides?.[field] ?? PRESET_HEADERS[preset][object]?.[field] ?? GENERIC_HEADERS[field] ?? field
}

const slug = (s: string) => s.replace(/[^A-Za-z0-9]+/g, '').slice(0, 24)
const splitName = (full: string) => {
  const parts = full.trim().split(/\s+/)
  return parts.length > 1 ? { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] } : { firstName: undefined, lastName: full }
}

export function buildExport(inputs: ExportInput[], opts: ExportOptions): ExportResult {
  const accounts = new Map<string, AccountRow>()
  const contacts = new Map<string, ContactRow>()
  const sites: SiteRow[] = []
  const deals: DealRow[] = []
  const excluded: Excluded[] = []
  const licences = new Set<string>()
  const crmIdByBusiness = new Map<string, string>()
  const crmIdByCompany = new Map<string, string>()
  for (const m of opts.existingMatches ?? []) {
    if (m.businessId) crmIdByBusiness.set(m.businessId, m.recordId)
    if (m.companyNumber) crmIdByCompany.set(m.companyNumber, m.recordId)
  }
  const suppressed = new Set((opts.campaign?.recipients ?? []).filter((r) => r.basis === 'Blocked: suppressed').map((r) => r.recipientName.toLowerCase()))
  const source = `Property Intelligence · ${opts.sourceLabel} · ${new Date().toISOString().slice(0, 10)}`

  const upsertAccount = (row: AccountRow) => {
    const cur = accounts.get(row.externalId)
    if (!cur) accounts.set(row.externalId, row)
    else if (!cur.marketingAllowed && row.marketingAllowed) accounts.set(row.externalId, { ...cur, ...row })
    return row.externalId
  }

  for (const { b, t, h, e, w } of inputs) {
    const crmId = crmIdByBusiness.get(b.businessId)
    if (opts.onlyNewToCrm && crmId) {
      excluded.push({ object: 'sites', name: b.name, reason: `already in CRM as ${crmId}` })
      continue
    }
    licences.add('OGL')
    // Operator account: from Companies House and the registers, so a business contact.
    let operatorId: string | undefined
    if (b.operatorName) {
      operatorId = `ACC-${b.operatorCompanyNumber ?? slug(b.operatorName)}`
      upsertAccount({ externalId: operatorId, name: b.operatorName, companyNumber: b.operatorCompanyNumber, type: 'Operator', sector: b.sector, address: b.address, postcode: b.postcode, status: 'Trading', marketingAllowed: true, dataLicence: 'Companies House, sector registers (OGL): business contact', source, crmRecordId: crmIdByCompany.get(b.operatorCompanyNumber ?? '') })
      contacts.set(`CON-${operatorId}-op`, { externalId: `CON-${operatorId}-op`, accountExternalId: operatorId, lastName: 'Operator', role: `Operator of ${b.name}`, address: b.address, postcode: b.postcode, marketingAllowed: true, lawfulBasis: 'Legitimate interests: business-to-business contact at the trading address', source })
    }
    // Freeholder account/contact: licence depends on where the name came from.
    let freeholderId: string | undefined
    const prop = t?.proprietors[0]
    if (prop && t) {
      const ccodOnly = t.licence === 'HMLR-CCOD' && !t.registerPurchased
      const privateIndividual = prop.category === 'Private Individual'
      if (privateIndividual && prop.redacted) {
        excluded.push({ object: 'contacts', name: `${b.name} freeholder`, reason: 'private individual: name is redacted until the register is purchased' })
      } else if (privateIndividual) {
        if (ccodOnly) excluded.push({ object: 'contacts', name: prop.name, reason: 'private individual from unlicensed data' })
        else {
          const id = `CON-${slug(prop.name)}-${t.titleNumber}`
          contacts.set(id, { externalId: id, ...splitName(prop.name), role: `Freeholder of ${b.name}`, address: prop.address ?? t.address, postcode: t.postcode, marketingAllowed: !suppressed.has(prop.name.toLowerCase()), lawfulBasis: 'Legitimate interests: register purchased (HM Land Registry official copy)', source, crmRecordId: crmId })
          licences.add('HMLR-Doc')
        }
      } else if (prop.name !== b.operatorName) {
        freeholderId = `ACC-${prop.companyNumber ?? slug(prop.name)}`
        const allowed = !ccodOnly || !!crmIdByCompany.get(prop.companyNumber ?? '')
        if (ccodOnly && opts.excludeCcodOnly && !allowed) {
          excluded.push({ object: 'accounts', name: prop.name, reason: 'only known from HM Land Registry CCOD/OCOD, which cannot be used for marketing; buy the register or tick include' })
          freeholderId = undefined
        } else {
          upsertAccount({ externalId: freeholderId, name: prop.name, companyNumber: prop.companyNumber, type: prop.category === 'Limited Company or Public Limited Company' || prop.category === 'Overseas Company' ? 'Property company' : 'Freeholder', sector: undefined, address: prop.address, postcode: undefined, status: prop.category, marketingAllowed: allowed, dataLicence: ccodOnly ? 'HM Land Registry CCOD/OCOD: research only, no direct marketing' : 'HM Land Registry register purchased (official copy)', source, crmRecordId: crmIdByCompany.get(prop.companyNumber ?? '') })
          licences.add(ccodOnly ? 'HMLR-CCOD' : 'HMLR-Doc')
        }
      } else {
        freeholderId = operatorId
      }
    }
    const reg = b.registers.find((r) => r.capacity || r.rating) ?? b.registers[0]
    const lease = t?.leases[0]
    const score = dealScore(b, t, h, e)
    if (h && !opts.excludeVoa) licences.add('VOA-Restricted')
    sites.push({
      externalId: `SITE-${b.businessId}`, name: b.name, sector: b.sector, subSector: b.subSector, address: b.address, postcode: b.postcode, uprn: b.uprn, titleNumber: b.titleNumber, tenure: b.tenure,
      lon: b.location.coordinates[0], lat: b.location.coordinates[1], capacity: reg?.capacity, capacityLabel: reg?.capacityLabel, register: reg?.register, registerId: reg?.registerId, rating: reg?.rating, epcBand: e?.rating,
      leaseExpiry: lease?.expiryDate, rateableValue: opts.excludeVoa ? undefined : h?.rateableValue, floorAreaSqm: opts.excludeVoa ? undefined : h?.totalAreaSqm,
      distressFlags: b.distressFlags.join('; '), transactScore: score.score, operatorAccountExternalId: operatorId, freeholderAccountExternalId: freeholderId, office: w?.office ?? opts.office, owner: w?.assignee ?? opts.owner, source, crmRecordId: crmId,
    })
    if (w && opts.objects.deals) {
      deals.push({ externalId: `DEAL-${w.id}`, name: `${b.name} · ${w.stage ?? 'Prospect'}`, stage: w.stage ?? 'Prospect', siteExternalId: `SITE-${b.businessId}`, accountExternalId: operatorId ?? freeholderId, amount: w.feeEstimate, guidePrice: w.guidePrice, closeDate: w.nextActionDate, nextStep: w.nextAction, office: w.office ?? opts.office, owner: w.assignee ?? opts.owner, project: w.project, source })
    }
  }
  return {
    accounts: opts.objects.accounts ? Array.from(accounts.values()) : [],
    contacts: opts.objects.contacts ? Array.from(contacts.values()) : [],
    sites: opts.objects.sites ? sites : [],
    deals: opts.objects.deals ? deals : [],
    excluded,
    licences: Array.from(licences),
  }
}

export function toCsv(rows: Record<string, unknown>[], preset: CrmPreset, object: CrmObject, overrides?: Record<string, string>, drop: Set<string> = new Set()): string {
  if (!rows.length) return ''
  const fields = Object.keys(rows[0]).filter((f) => !drop.has(f))
  const esc = (v: unknown) => {
    const s = v === undefined || v === null ? '' : typeof v === 'boolean' ? (v ? 'TRUE' : 'FALSE') : String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  return [fields.map((f) => esc(headerFor(preset, object, f, overrides))).join(','), ...rows.map((r) => fields.map((f) => esc(r[f])).join(','))].join('\n')
}

export function readme(result: ExportResult, opts: ExportOptions): string {
  return [
    `Property Intelligence CRM export · ${new Date().toISOString()}`,
    `Preset: ${PRESET_LABEL[opts.preset]} · Source: ${opts.sourceLabel}`,
    '',
    `accounts.csv  ${result.accounts.length} rows   contacts.csv ${result.contacts.length} rows   sites.csv ${result.sites.length} rows   deals.csv ${result.deals.length} rows`,
    `excluded: ${result.excluded.length} (see excluded.csv)`,
    '',
    'Import order: accounts, then contacts and sites (they reference account external ids), then deals.',
    'External IDs are stable: re-importing the same export updates records instead of creating duplicates.',
    'Marketing Allowed = FALSE rows must not be used for direct marketing. Their data licence column says why.',
    `Licence classes present: ${result.licences.join(', ') || 'OGL only'}.`,
    opts.excludeVoa ? 'VOA rateable values and floor areas were excluded (restricted terms).' : 'VOA fields included: internal use only under the VOA rating list terms.',
  ].join('\n')
}
