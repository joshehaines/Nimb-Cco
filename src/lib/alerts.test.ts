import { describe, expect, it } from 'vitest'
import { blankRule, deliverableChannels, DEFAULT_PREFS, inQuietHours, matchRule, nextDigestAt, renderEmail, renderSms, type MatchContext } from './alerts'
import type { Alert } from '@/data/types'

const alert = (patch: Partial<Alert> = {}): Alert => ({ alertId: 'A1', kind: 'Gazette notice', title: 'Gazette notice: Arden Inns Ltd', detail: 'Notice of intention to appoint administrators.', occurredAt: '2026-10-01T09:00:00Z', severity: 'critical', entityType: 'company', entityId: '01234567', read: false, sector: 'Pub', businessId: 'B0001', titleNumber: 'WK1', postcode: 'CV32 4AB', location: [-1.5365, 52.2888], ...patch })
const ctx = (patch: Partial<MatchContext> = {}): MatchContext => ({ watchlist: [], siteCentres: {}, ...patch })

describe('matchRule', () => {
  it('matches any event when the rule has no conditions', () => {
    const r = blankRule('u')
    expect(matchRule(r, alert(), ctx()).match).toBe(true)
  })
  it('filters by kind, sector and severity and explains the miss', () => {
    const r = blankRule('u', { conditions: { kinds: ['Lease event'], sectors: [], severities: [], distressOnly: false, distressFlags: [], ownerCategories: [] } })
    const m = matchRule(r, alert(), ctx())
    expect(m.match).toBe(false)
    expect(m.reasons.at(-1)).toMatch(/kind Gazette notice not selected/)
    r.conditions.kinds = ['Gazette notice']
    r.conditions.sectors = ['Hotel']
    expect(matchRule(r, alert(), ctx()).reasons.at(-1)).toMatch(/sector Pub not selected/)
    r.conditions.sectors = ['Pub']
    r.conditions.severities = ['critical']
    expect(matchRule(r, alert(), ctx()).match).toBe(true)
    expect(matchRule(r, alert({ severity: 'info' }), ctx()).match).toBe(false)
  })
  it('keywords match title or detail', () => {
    const r = blankRule('u', { conditions: { kinds: [], sectors: [], severities: [], distressOnly: false, distressFlags: [], ownerCategories: [], keywords: 'administrat, liquidat' } })
    expect(matchRule(r, alert(), ctx()).reasons).toContain('mentions "administrat"')
    expect(matchRule(r, alert({ detail: 'Rating now Good' }), ctx()).match).toBe(false)
  })
  it('scopes to watched sites by id or radius', () => {
    const r = blankRule('u', { scope: { mode: 'my-sites', radiusM: 300, siteIds: [], postcodes: [], offices: [] } })
    const wl = [{ id: 'w1', entityType: 'business' as const, entityId: 'B0099', label: 'x', addedAt: '2026-01-01' }]
    expect(matchRule(r, alert(), ctx({ watchlist: wl, siteCentres: { B0099: [-1.5365, 52.2888] } })).match).toBe(true)
    expect(matchRule(r, alert(), ctx({ watchlist: wl, siteCentres: { B0099: [-1.5, 52.2888] } })).reasons.at(-1)).toMatch(/nearest watched site \d+ m away/)
    expect(matchRule(r, alert({ businessId: 'B0099' }), ctx({ watchlist: wl, siteCentres: {} })).reasons).toContain('on a watched site')
  })
  it('scopes to postcode districts and office patches', () => {
    const r = blankRule('u', { scope: { mode: 'postcodes', radiusM: 0, siteIds: [], postcodes: ['cv32'], offices: [] } })
    expect(matchRule(r, alert(), ctx()).match).toBe(true)
    expect(matchRule(r, alert({ postcode: 'BS1 4DJ' }), ctx()).match).toBe(false)
    const o = blankRule('u', { scope: { mode: 'offices', radiusM: 0, siteIds: [], postcodes: [], offices: ['Bristol'] } })
    expect(matchRule(o, alert({ postcode: 'BS1 4DJ' }), ctx()).match).toBe(true)
    expect(matchRule(o, alert(), ctx()).match).toBe(false)
  })
  it('distress-only passes distress events even without flags, otherwise needs a flag', () => {
    const r = blankRule('u', { conditions: { kinds: [], sectors: [], severities: [], distressOnly: true, distressFlags: [], ownerCategories: [] } })
    expect(matchRule(r, alert({ kind: 'EPC lodged', severity: 'info' }), ctx()).match).toBe(false)
    expect(matchRule(r, alert(), ctx()).match).toBe(true)
  })
  it('deal score threshold', () => {
    const r = blankRule('u', { conditions: { kinds: [], sectors: [], severities: [], distressOnly: false, distressFlags: [], ownerCategories: [], minDealScore: 55 } })
    expect(matchRule(r, alert(), ctx({ dealScore: 40 })).match).toBe(false)
    expect(matchRule(r, alert(), ctx({ dealScore: 61 })).match).toBe(true)
  })
})

describe('messages and schedule', () => {
  it('renders an email with every event and a link', () => {
    const r = blankRule('u', { name: 'Dirty deals', tag: 'Dirty deals' })
    const { subject, body } = renderEmail(r, [alert(), alert({ alertId: 'A2', title: 'Second', severity: 'info' })], 'Priya Ahuja')
    expect(subject).toContain('2 events (1 critical)')
    expect(body).toContain('Hello Priya')
    expect(body).toContain('Second')
    expect(body).toContain('companies/01234567')
  })
  it('keeps a text message short', () => {
    const r = blankRule('u', { name: 'Dirty deals' })
    const sms = renderSms(r, Array.from({ length: 6 }, (_, i) => alert({ alertId: `A${i}`, title: `Event number ${i} with a long title to push the length` })))
    expect(sms.length).toBeLessThanOrEqual(300)
    expect(sms).toContain('+3 more')
  })
  it('blocks channels without verified details', () => {
    const { ok, blocked } = deliverableChannels(['inapp', 'email', 'sms', 'teams'], { ...DEFAULT_PREFS, email: 'a@b.c', emailVerified: false })
    expect(ok).toEqual(['inapp'])
    expect(blocked.map((b) => b.why)).toEqual(['email not verified', 'no mobile number', 'no Teams webhook'])
  })
  it('quiet hours wrap midnight and digests land on the digest hour', () => {
    const p = { ...DEFAULT_PREFS, quietHours: { enabled: true, from: '21:00', to: '07:00' }, digestHour: 8 }
    expect(inQuietHours(p, new Date(2026, 9, 14, 23, 0))).toBe(true)
    expect(inQuietHours(p, new Date(2026, 9, 14, 12, 0))).toBe(false)
    const next = nextDigestAt('daily', p, new Date(2026, 9, 14, 9, 0))
    expect(next.getDate()).toBe(15)
    expect(next.getHours()).toBe(8)
  })
})
