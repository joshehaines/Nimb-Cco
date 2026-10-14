import { describe, it, expect } from 'vitest'
import { dealScore } from '../lib/dealScore'
import { MockProvider } from '../data/mock/MockProvider'

describe('deal score', () => {
  const p = new MockProvider()
  it('ranks distressed, short-lease sites above clean ones and explains every point', async () => {
    const all = p.allBusinesses()
    const scored = await Promise.all(all.map(async (b) => ({ b, s: dealScore(b, b.titleNumber ? await p.getTitle(b.titleNumber) : undefined) })))
    const distressed = scored.filter((x) => x.b.distressFlags.length)
    const clean = scored.filter((x) => !x.b.distressFlags.length)
    const avg = (xs: typeof scored) => xs.reduce((a, x) => a + x.s.score, 0) / xs.length
    expect(avg(distressed)).toBeGreaterThan(avg(clean))
    for (const { s } of scored) {
      expect(s.score).toBeGreaterThanOrEqual(0)
      expect(s.score).toBeLessThanOrEqual(100)
      const sum = s.reasons.reduce((a, r) => a + Number(r.split(' ')[0]), 0)
      expect(Math.max(0, Math.min(100, sum))).toBe(s.score)
    }
    expect(scored.some((x) => x.s.band === 'High')).toBe(true)
  })
})
