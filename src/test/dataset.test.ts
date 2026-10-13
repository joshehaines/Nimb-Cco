import { describe, expect, it } from 'vitest'
import { generateDataset } from '@/data/mock/generate'
import { MockProvider } from '@/data/mock/MockProvider'
import { DEFAULT_FILTERS } from '@/data/types'

describe('synthetic dataset', () => {
  const ds = generateDataset()
  it('is deterministic', () => {
    const a = Array.from(generateDataset().titles.keys()).slice(0, 20)
    const b = Array.from(generateDataset().titles.keys()).slice(0, 20)
    expect(a).toEqual(b)
  })
  it('has a coherent world', () => {
    expect(ds.titles.size).toBeGreaterThan(300)
    expect(ds.businesses.size).toBe(142)
    expect(ds.companies.size).toBeGreaterThan(60)
    expect(ds.planning.size).toBe(190)
    expect(ds.traffic.length).toBeGreaterThan(10)
    expect(ds.footfall.length).toBeGreaterThan(100)
    for (const b of ds.businesses.values()) {
      expect(ds.titles.has(b.titleNumber!)).toBe(true)
      expect(ds.companies.has(b.operatorCompanyNumber!)).toBe(true)
      expect(ds.hereditaments.has(b.hereditamentUarn!)).toBe(true)
      if (b.tenure === 'Leasehold') expect(ds.titles.get(b.titleNumber!)!.leases.length).toBeGreaterThan(0)
    }
  })
})

describe('MockProvider', () => {
  const p = new MockProvider()
  it('searches by name and postcode', async () => {
    const r = await p.search('pug')
    expect(r.some((x) => x.kind === 'business')).toBe(true)
  })
  it('sources distressed care homes', async () => {
    const r = await p.sourceBusinesses({ ...DEFAULT_FILTERS, sectors: ['Care Home'], distressOnly: true })
    expect(r.every((b) => b.sector === 'Care Home' && b.distressFlags.length > 0)).toBe(true)
  })
  it('matches the dirty CRM export back to businesses', async () => {
    const crm = p.dataset.crm
    const matches = await p.matchCrmRecords(crm)
    const resolved = matches.filter((m) => m.businessId).length
    expect(resolved / crm.length).toBeGreaterThan(0.8)
    const dups = await p.findDuplicates(crm)
    expect(dups.length).toBeGreaterThan(5)
  })
  it('fulfils a document order and reveals private proprietors', async () => {
    const t = p.allTitles().find((x) => x.proprietors[0].category === 'Private Individual')!
    expect(t.proprietors[0].redacted).toBe(true)
    const order = await p.orderDocument(t.titleNumber, 'Register')
    expect(order.status).toBe('Queued')
    await new Promise((r) => setTimeout(r, 4200))
    expect((await p.getDocumentOrders())[0].status).toBe('Parsed')
    expect((await p.getTitle(t.titleNumber))!.registerPurchased).toBe(true)
  }, 10000)
})
