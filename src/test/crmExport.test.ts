import { describe, it, expect } from 'vitest'
import { buildExport, toCsv, headerFor } from '../lib/crmExport'
import { MockProvider } from '../data/mock/MockProvider'

describe('CRM export', () => {
  const p = new MockProvider()
  const opts = { preset: 'hubspot' as const, objects: { accounts: true, contacts: true, sites: true, deals: true }, excludeCcodOnly: true, excludeVoa: true, onlyNewToCrm: false, sourceLabel: 'test' }
  it('exports sites with stable ids and never leaks CCOD-only freeholders or redacted individuals', async () => {
    const all = p.allBusinesses().slice(0, 60)
    const inputs = await Promise.all(all.map(async (b) => ({ b, t: b.titleNumber ? await p.getTitle(b.titleNumber) : undefined, h: b.hereditamentUarn ? await p.getHereditament(b.hereditamentUarn) : undefined })))
    const r = buildExport(inputs, opts)
    expect(r.sites.length).toBe(all.length)
    expect(new Set(r.sites.map((s) => s.externalId)).size).toBe(all.length)
    expect(r.accounts.every((a) => a.marketingAllowed || !opts.excludeCcodOnly)).toBe(true)
    expect(r.contacts.every((c) => c.lastName !== 'Private individual')).toBe(true)
    expect(r.excluded.some((x) => /CCOD|redacted|unlicensed/.test(x.reason))).toBe(true)
    expect(r.sites.every((s) => s.rateableValue === undefined)).toBe(true)
    // including CCOD rows flags them rather than hiding them
    const r2 = buildExport(inputs, { ...opts, excludeCcodOnly: false, excludeVoa: false })
    expect(r2.accounts.some((a) => !a.marketingAllowed && /CCOD/.test(a.dataLicence))).toBe(true)
    expect(r2.licences).toContain('VOA-Restricted')
    expect(r.licences).not.toContain('VOA-Restricted')
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
