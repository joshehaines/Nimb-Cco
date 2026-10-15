import { describe, it, expect } from 'vitest'
import { dealScore } from '../lib/dealScore'
import type { Business, Title } from '../data/types'

const tag = { source: 'test', licence: 'OGL', fetchedAt: '2026-10-15T00:00:00Z' } as const
const square = { type: 'Polygon' as const, coordinates: [[[-1.54, 52.29], [-1.539, 52.29], [-1.539, 52.291], [-1.54, 52.291], [-1.54, 52.29]]] }

function business(over: Partial<Business>): Business {
  return { ...tag, businessId: 'B1', name: 'The Copper Kettle', sector: 'Pub', address: '12 Mill Lane', postcode: 'CV32 4AB', location: { type: 'Point', coordinates: [-1.5395, 52.2905] }, registers: [], distressFlags: [], ...over }
}

function title(over: Partial<Title>): Title {
  return { ...tag, titleNumber: 'WK1', inspireId: 1, tenure: 'Freehold', address: '12 Mill Lane', postcode: 'CV32 4AB', geometry: square, areaSqm: 800, proprietors: [], leases: [], registerPurchased: false, titlePlanPurchased: false, ...over }
}

describe('deal score', () => {
  const soon = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10)
  const distressed = business({ businessId: 'B1', tenure: 'Leasehold', distressFlags: ['Administration', 'Late accounts'] })
  const distressedTitle = title({ leases: [{ ...tag, leaseId: 'L1', freeholdTitleNumber: 'WK1', dateOfLease: '2012-01-01', termYears: 15, termDescription: '15 years', expiryDate: soon }] })
  const clean = business({ businessId: 'B2', name: 'Vara Dental', sector: 'Dental', tenure: 'Freehold' })

  it('ranks a distressed, short-lease site above a clean one and explains every point', () => {
    const hot = dealScore(distressed, distressedTitle)
    const cold = dealScore(clean, title({ titleNumber: 'WK2' }))
    expect(hot.score).toBeGreaterThan(cold.score)
    for (const s of [hot, cold]) {
      expect(s.score).toBeGreaterThanOrEqual(0)
      expect(s.score).toBeLessThanOrEqual(100)
      const sum = s.reasons.reduce((a, r) => a + Number(r.split(' ')[0]), 0)
      expect(Math.max(0, Math.min(100, sum))).toBe(s.score)
    }
    expect(['High', 'Medium', 'Low']).toContain(hot.band)
  })

  it('copes with a business that has no title, rates or EPC', () => {
    const s = dealScore(clean)
    expect(s.score).toBeGreaterThanOrEqual(0)
    expect(Array.isArray(s.reasons)).toBe(true)
  })
})
