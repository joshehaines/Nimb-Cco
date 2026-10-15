import { describe, it, expect } from 'vitest'
import { buildExport, toCsv, headerFor } from '../lib/crmExport'
import type { Business, Hereditament, Title } from '../data/types'

const tag = { source: 'test', licence: 'OGL', fetchedAt: '2026-10-15T00:00:00Z' } as const
const square = { type: 'Polygon' as const, coordinates: [[[-1.54, 52.29], [-1.539, 52.29], [-1.539, 52.291], [-1.54, 52.291], [-1.54, 52.29]]] }

function business(i: number, over: Partial<Business> = {}): Business {
  return { ...tag, businessId: `B${i}`, name: `Business ${i}`, sector: 'Pub', address: `${i} Mill Lane`, postcode: 'CV32 4AB', location: { type: 'Point', coordinates: [-1.5395, 52.2905] }, registers: [], distressFlags: [], titleNumber: `WK${i}`, ...over }
}

function title(i: number, over: Partial<Title> = {}): Title {
  return { ...tag, titleNumber: `WK${i}`, inspireId: i, tenure: 'Freehold', address: `${i} Mill Lane`, postcode: 'CV32 4AB', geometry: square, areaSqm: 800, proprietors: [], leases: [], registerPurchased: false, titlePlanPurchased: false, ...over }
}

const rates: Hereditament = { ...tag, licence: 'VOA-Restricted', uarn: 'U1', address: '1 Mill Lane', postcode: 'CV32 4AB', description: 'PUBLIC HOUSE AND PREMISES', scatCode: '226G', rateableValue: 42000, listYear: 2026, effectiveDate: '2026-04-01' }

describe('CRM export', () => {
  const opts = { preset: 'hubspot' as const, objects: { accounts: true, contacts: true, sites: true, deals: true }, excludeCcodOnly: true, excludeVoa: true, onlyNewToCrm: false, sourceLabel: 'test' }
  const inputs = [
    { b: business(1, { operatorCompanyNumber: '01234567', operatorName: 'Arden Inns Ltd', freeholderName: 'Arden Inns Ltd', freeholderCompanyNumber: '01234567', hereditamentUarn: 'U1' }), t: title(1, { proprietors: [{ name: 'Arden Inns Ltd', category: 'Limited Company or Public Limited Company', companyNumber: '01234567' }] }), h: rates },
    { b: business(2, { freeholderName: 'Private individual' }), t: title(2, { proprietors: [{ name: 'Private individual', category: 'Private Individual', redacted: true }] }) },
    { b: business(3, { freeholderName: 'Hook Norton Brewery Company Limited', freeholderCompanyNumber: '00000001' }), t: title(3, { source: 'HMLR CCOD', licence: 'HMLR-CCOD', proprietors: [{ name: 'Hook Norton Brewery Company Limited', category: 'Limited Company or Public Limited Company', companyNumber: '00000001' }] }) },
  ]

  it('exports every site once with a stable id and keeps restricted data out by default', () => {
    const r = buildExport(inputs, opts)
    expect(r.sites.length).toBe(inputs.length)
    expect(new Set(r.sites.map((s) => s.externalId)).size).toBe(inputs.length)
    expect(r.contacts.every((c) => c.lastName !== 'Private individual')).toBe(true)
    expect(r.sites.every((s) => s.rateableValue === undefined)).toBe(true)
    expect(r.licences).not.toContain('VOA-Restricted')
    const r2 = buildExport(inputs, { ...opts, excludeCcodOnly: false, excludeVoa: false })
    expect(r2.licences).toContain('VOA-Restricted')
    expect(r2.sites.some((s) => s.rateableValue === 42000)).toBe(true)
  })

  it('maps headers per preset and quotes CSV safely', () => {
    expect(headerFor('salesforce', 'accounts', 'name')).toBe('Account Name')
    expect(headerFor('hubspot', 'deals', 'stage')).toBe('Deal Stage')
    expect(headerFor('generic', 'sites', 'transactScore')).toBe('Transact Score')
    expect(headerFor('hubspot', 'accounts', 'name', { name: 'Trading name' })).toBe('Trading name')
    const csv = toCsv([{ name: 'Smith, "Jones" & Co', ok: true }], 'generic', 'accounts')
    expect(csv.split('\n')[1]).toBe('"Smith, ""Jones"" & Co",TRUE')
  })
})
