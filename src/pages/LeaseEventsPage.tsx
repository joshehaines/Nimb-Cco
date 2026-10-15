import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { provider, type Business, type LeaseSummary } from '@/data'
import { Badge, Card, Chip, Stat, Empty } from '@/components/ui'
import { dateShort, gbp, monthsUntil } from '@/lib/format'
import { SECTOR_COLOURS } from '@/lib/sectors'
import { useUi } from '@/store/ui'
import { DEFAULT_FILTERS } from '@/data/types'

type Ev = { lease: LeaseSummary; biz?: Business; kind: 'Expiry' | 'Break' | 'Rent review'; date: string }

export function LeaseEventsPage() {
  const [events, setEvents] = useState<Ev[]>([])
  const [horizon, setHorizon] = useState(36)
  const [kinds, setKinds] = useState<string[]>([])
  const nav = useNavigate()
  const select = useUi((s) => s.select)
  useEffect(() => {
    ;(async () => {
      const biz = await provider.sourceBusinesses(DEFAULT_FILTERS)
      const leases = (await Promise.all(biz.filter((b) => b.titleNumber).map((b) => provider.getLeasesForTitle(b.titleNumber!).catch(() => [])))).flat()
      const evs: Ev[] = []
      for (const l of leases) {
        const b = biz.find((x) => x.titleNumber === l.freeholdTitleNumber)
        evs.push({ lease: l, biz: b, kind: 'Expiry', date: l.expiryDate })
        for (const d of l.parsed?.breakDates ?? []) evs.push({ lease: l, biz: b, kind: 'Break', date: d })
        for (const d of l.parsed?.rentReviewDates ?? []) evs.push({ lease: l, biz: b, kind: 'Rent review', date: d })
      }
      setEvents(evs.sort((a, b) => a.date.localeCompare(b.date)))
    })()
  }, [])
  const shown = useMemo(() => events.filter((e) => { const m = monthsUntil(e.date); return m !== undefined && m >= -6 && m <= horizon && (!kinds.length || kinds.includes(e.kind)) }), [events, horizon, kinds])
  const byMonth = useMemo(() => {
    const m = new Map<string, Ev[]>()
    for (const e of shown) {
      const k = e.date.slice(0, 7)
      m.set(k, [...(m.get(k) ?? []), e])
    }
    return Array.from(m.entries())
  }, [shown])
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">Lease events</h1>
        <p className="text-sm text-ink-500">Expiries from HMLR registered leases; breaks and rent reviews appear once the lease document has been purchased and parsed. Feeds the lease advisory, valuation and agency teams.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label={`Expiries within ${horizon} months`} value={shown.filter((e) => e.kind === 'Expiry').length} tone="warning" />
        <Stat label="Break options known" value={shown.filter((e) => e.kind === 'Break').length} sub="buy and parse leases to find more" />
        <Stat label="Rent reviews known" value={shown.filter((e) => e.kind === 'Rent review').length} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {[12, 24, 36, 60].map((h) => <Chip key={h} label={`${h} months`} selected={horizon === h} onClick={() => setHorizon(h)} />)}
        <span className="mx-2 text-ink-300">|</span>
        {['Expiry', 'Break', 'Rent review'].map((k) => <Chip key={k} label={k} selected={kinds.includes(k)} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])} />)}
      </div>
      {!byMonth.length ? <Empty title="No lease events in this window" /> : byMonth.map(([month, evs]) => (
        <Card key={month} title={new Date(month + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} padded={false}>
          <table className="w-full text-sm">
            <tbody>
              {evs.map((e, i) => (
                <tr key={i} className="cursor-pointer border-t border-ink-100 first:border-t-0 hover:bg-ink-50" onClick={() => { if (e.biz) { select({ type: 'business', id: e.biz.businessId }); nav(`/map/business/${e.biz.businessId}`) } else { select({ type: 'title', id: e.lease.freeholdTitleNumber }); nav(`/map/title/${e.lease.freeholdTitleNumber}`) } }}>
                  <td className="w-28 px-4 py-2 text-xs tabular-nums text-ink-500">{dateShort(e.date)}</td>
                  <td className="w-28"><Badge tone={e.kind === 'Expiry' ? 'warning' : e.kind === 'Break' ? 'critical' : 'info'}>{e.kind}</Badge></td>
                  <td><div className="flex items-center gap-2">{e.biz && <span className="h-2.5 w-2.5 rounded-full" style={{ background: SECTOR_COLOURS[e.biz.sector] }} />}<span className="font-medium">{e.biz?.name ?? e.lease.lessee}</span><span className="text-xs text-ink-500">{e.biz?.address}</span></div></td>
                  <td className="text-xs text-ink-600">{e.lease.termYears} yr from {dateShort(e.lease.dateOfLease)}</td>
                  <td className="text-right text-xs tabular-nums pr-4">{e.lease.parsed?.rentPa ? `${gbp(e.lease.parsed.rentPa)} pa` : <span className="text-ink-400">rent unknown</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ))}
    </div>
  )
}
