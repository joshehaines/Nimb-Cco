import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Polygon } from 'geojson'
import { provider, type Business, type Catchment, type Comparable, type ComparableStats } from '@/data'
import { useSite } from '@/hooks/useSite'
import { Spinner, Badge, KV } from '@/components/ui'
import { dateShort, gbp, num, sqm, monthsUntil } from '@/lib/format'
import { canDownload } from '@/lib/env'
import { centroid, haversineM } from '@/lib/geo'

/**
 * Appraisal pack: an indicative value range from comparable evidence, with the
 * property, lease, rates, energy and catchment facts a valuer needs on one page.
 * Indicative only; it supports, never replaces, a Red Book valuation.
 */
export function AppraisalPage() {
  const { businessId = '' } = useParams()
  const [b, setB] = useState<Business | null | undefined>(undefined)
  const [comps, setComps] = useState<{ comps: Comparable[]; stats: ComparableStats } | null>(null)
  const [catchment, setCatchment] = useState<Catchment | null>(null)
  useEffect(() => {
    provider.getBusiness(businessId).then(async (biz) => {
      setB(biz ?? null)
      if (!biz) return
      const twoYears = new Date(Date.now() - 2 * 365 * 86400000).toISOString().slice(0, 10)
      const c = await provider.getComparables({ sectors: [biz.sector], centre: biz.location.coordinates as [number, number], radiusM: 25000, fromDate: twoYears })
      setComps(c.comps.length >= 6 ? c : await provider.getComparables({ sectors: [biz.sector], centre: biz.location.coordinates as [number, number], radiusM: 60000 }))
      setCatchment(await provider.getCatchment(biz.location.coordinates[0], biz.location.coordinates[1], biz.sector === 'Care Home' ? 5000 : 2000))
    })
  }, [businessId])
  const { bundle } = useSite(b?.titleNumber)
  if (b === undefined || !bundle || !comps) return <div className="p-8"><Spinner label="Assembling appraisal…" /></div>
  if (!b) return <div className="p-8">Business not found.</div>
  const { title: t, hereditaments, epcs, leases, operatorCompanies } = bundle
  const h = hereditaments[0]
  const e = epcs[0]
  const lease = leases[0]
  const capacity = b.registers.find((r) => r.capacity)?.capacity
  const capLabel = b.registers.find((r) => r.capacity)?.capacityLabel
  const sameTenure = comps.comps.filter((c) => c.tenure === b.tenure)
  const useComps = sameTenure.length >= 4 ? sameTenure : comps.comps
  const ppu = useComps.map((c) => c.pricePerUnit).filter((x): x is number => !!x).sort((a, b2) => a - b2)
  const rvm = useComps.map((c) => c.rvMultiple).filter((x): x is number => !!x).sort((a, b2) => a - b2)
  const q = (xs: number[], p: number) => (xs.length ? xs[Math.min(xs.length - 1, Math.floor((xs.length - 1) * p))] : undefined)
  const byUnit = capacity && ppu.length ? { low: q(ppu, 0.25)! * capacity, mid: q(ppu, 0.5)! * capacity, high: q(ppu, 0.75)! * capacity } : undefined
  const byRv = h && rvm.length ? { low: q(rvm, 0.25)! * h.rateableValue, mid: q(rvm, 0.5)! * h.rateableValue, high: q(rvm, 0.75)! * h.rateableValue } : undefined
  const blend = byUnit && byRv ? { low: (byUnit.low + byRv.low) / 2, mid: (byUnit.mid + byRv.mid) / 2, high: (byUnit.high + byRv.high) / 2 } : byUnit ?? byRv
  const round = (n?: number) => (n === undefined ? undefined : Math.round(n / 25000) * 25000)
  const adjustments: { label: string; effect: string }[] = []
  if (e && ['F', 'G'].includes(e.rating)) adjustments.push({ label: `EPC ${e.rating}: below MEES minimum`, effect: 'Deduct cost of works or expect 5-10% discount' })
  else if (e && ['D', 'E'].includes(e.rating)) adjustments.push({ label: `EPC ${e.rating}: compliant now, below proposed 2030 standard`, effect: 'Flag capex in sales particulars' })
  if (lease && monthsUntil(lease.expiryDate) !== undefined && monthsUntil(lease.expiryDate)! < 60) adjustments.push({ label: `Lease expires in ${monthsUntil(lease.expiryDate)} months`, effect: 'Short unexpired term reduces leasehold value; renewal terms needed' })
  if (b.distressFlags.length) adjustments.push({ label: `Distress signals: ${b.distressFlags.join(', ')}`, effect: 'Motivated vendor; likely discount to tone but faster process' })
  const inad = b.registers.find((r) => r.rating === 'Inadequate' || r.rating === 'Requires improvement')
  if (inad) adjustments.push({ label: `${inad.register} rated ${inad.rating}`, effect: 'Turnaround buyer pool; discount 10-25% versus Good-rated comparables' })
  const ratio = catchment?.ratios.find((r) => (b.sector === 'Care Home' && r.label.startsWith('Care')) || (b.sector === 'Childcare' && r.label.startsWith('Nursery')) || (b.sector === 'Pub' && r.label.startsWith('Pubs')) || (b.sector === 'Pharmacy' && r.label.startsWith('Pharmacies')) || (b.sector === 'Dental' && r.label.startsWith('Dental')))
  const titleCentre = centroid(t.geometry as Polygon)
  return (
    <div className="mx-auto max-w-4xl bg-surface p-10 text-ink-900 print:p-0">
      <div className="no-print mb-4 flex justify-end gap-2">{canDownload ? <button className="btn-primary" onClick={() => window.print()}>Print / save as PDF</button> : <span className="text-xs text-ink-500">Printing is disabled on this preview host.</span>}</div>
      <header className="mb-6 border-b-2 border-brand-700 pb-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">Christie &amp; Co · Property Intelligence · Indicative appraisal</div>
        <h1 className="mt-1 text-2xl font-semibold">{b.name}</h1>
        <div className="text-sm text-ink-600">{b.sector}{b.subSector ? ` · ${b.subSector}` : ''} · {b.tenure} · {b.address}, {b.postcode}</div>
        <div className="mt-1 text-xs text-ink-500">Prepared {new Date().toLocaleDateString('en-GB')} from public registers and Christie &amp; Co records. Indicative only: not a RICS Red Book valuation and not for lending or reporting purposes.</div>
      </header>

      <section className="mb-6 rounded-lg border border-brand-200 bg-brand-50 p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-brand-800">Indicative value range ({b.tenure})</div>
        {blend ? (
          <div className="mt-2 flex flex-wrap items-end gap-6">
            <div><div className="text-xs text-ink-500">Lower quartile</div><div className="text-xl font-semibold tabular-nums">{gbp(round(blend.low))}</div></div>
            <div><div className="text-xs text-ink-500">Median</div><div className="text-3xl font-semibold tabular-nums text-brand-800">{gbp(round(blend.mid))}</div></div>
            <div><div className="text-xs text-ink-500">Upper quartile</div><div className="text-xl font-semibold tabular-nums">{gbp(round(blend.high))}</div></div>
          </div>
        ) : <div className="mt-2 text-sm">Insufficient comparable evidence to derive a range.</div>}
        <div className="mt-3 grid gap-2 text-xs md:grid-cols-2">
          {byUnit && <div><strong>Per-unit method:</strong> {capacity} {capLabel} × median {gbp(q(ppu, 0.5))} per {capLabel?.replace(/s$/, '')} = {gbp(round(byUnit.mid))} (IQR {gbp(round(byUnit.low))} to {gbp(round(byUnit.high))})</div>}
          {byRv && <div><strong>Rateable value method:</strong> RV {gbp(h!.rateableValue)} × median {q(rvm, 0.5)?.toFixed(1)}x = {gbp(round(byRv.mid))} (IQR {gbp(round(byRv.low))} to {gbp(round(byRv.high))})</div>}
          <div className="md:col-span-2 text-ink-600">Evidence: {useComps.length} {b.sector.toLowerCase()} sales{sameTenure.length >= 4 ? ` (${(b.tenure ?? '').toLowerCase()} only)` : ''} within {comps.comps.length && haversineM(b.location.coordinates, comps.comps[comps.comps.length - 1].location.coordinates) > 25000 ? '60' : '25'} km, {useComps.filter((c) => c.contributed).length} from Christie &amp; Co records. Where both methods apply the range is their average.</div>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-8">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Property and tenure</h2>
          <KV rows={[['Title', t.titleNumber], ['Freeholder', t.proprietors.map((p) => (p.redacted ? 'Private individual' : p.name)).join('; ')], ['Site area', sqm(t.areaSqm)], ['Floor area (VOA)', h?.totalAreaSqm ? sqm(h.totalAreaSqm) : '—'], ['Rateable value', h ? `${gbp(h.rateableValue)} (${h.listYear})` : '—'], ['Last freehold sale', t.pricePaid ? `${gbp(t.pricePaid)} · ${dateShort(t.pricePaidDate)}` : 'Not recorded'], ['Charges', t.charges?.map((c) => c.lender).join('; ') || 'None noted']]} />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Trading and operator</h2>
          <KV rows={[['Operator', `${b.operatorName} (${operatorCompanies[0]?.status ?? 'status unknown'})`], ['Capacity', capacity ? `${capacity} ${capLabel}` : '—'], ...b.registers.filter((r) => r.rating).map((r) => [`${r.register} rating`, `${r.rating} (${dateShort(r.ratingDate)})`] as [string, string]), ['EPC', e ? `${e.rating} (${e.score})` : '—'], ['Lease', lease ? `${lease.termYears} yrs from ${dateShort(lease.dateOfLease)}, expires ${dateShort(lease.expiryDate)}${lease.parsed?.rentPa ? `, rent ${gbp(lease.parsed.rentPa)} pa` : ''}` : b.tenure === 'Freehold' ? 'Owner-occupied' : 'Not registered'], ['Distress', b.distressFlags.join(', ') || 'None']]} />
        </section>
      </div>

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Adjustments to consider</h2>
        {adjustments.length ? <table className="w-full text-xs"><tbody>{adjustments.map((a) => <tr key={a.label} className="border-t border-ink-100"><td className="py-1.5 font-medium">{a.label}</td><td className="py-1.5 text-ink-600">{a.effect}</td></tr>)}</tbody></table> : <p className="text-sm text-ink-500">No adverse factors identified from the data.</p>}
      </section>

      {catchment && (
        <section className="mt-8">
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Catchment ({catchment.radiusM / 1000} km)</h2>
          <KV rows={[['Population', `${num(catchment.population)} (${num(catchment.age65plus)} aged 65+, ${num(catchment.age85plus)} aged 85+, ${num(catchment.age0to4)} aged 0-4)`], ['Household income', `${gbp(catchment.medianHouseholdIncome)} median · affluence index ${catchment.affluenceIndex}`], ['Competing supply', catchment.competitors.filter((c) => c.sector === b.sector).map((c) => `${c.count} ${c.sector.toLowerCase()} sites${c.capacity ? `, ${num(c.capacity)} ${c.capacityLabel}` : ''}`).join('; ') || 'None tracked'], ...(ratio ? [[ratio.label, `${ratio.value} vs England ${ratio.benchmark} · ${ratio.better === 'lower' ? (ratio.value < ratio.benchmark * 0.85 ? 'undersupplied' : ratio.value > ratio.benchmark * 1.15 ? 'saturated' : 'in line') : ''}`] as [string, string]] : []), ['Movement', `${catchment.footfallMonthly ? `${num(catchment.footfallMonthly)} visits/month` : 'no footfall coverage'}${catchment.trafficAadf ? ` · ${num(catchment.trafficAadf)} vehicles/day on busiest road` : ''}`]]} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Comparable schedule ({useComps.length})</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-ink-500"><tr><th className="py-1 font-medium">Business</th><th className="font-medium">Sold</th><th className="font-medium text-right">Price</th><th className="font-medium">Tenure</th><th className="font-medium text-right">Capacity</th><th className="font-medium text-right">£/unit</th><th className="font-medium text-right">RV x</th><th className="font-medium text-right">Dist.</th><th className="font-medium">Source</th></tr></thead>
          <tbody>{useComps.slice(0, 20).map((c) => <tr key={c.compId} className="border-t border-ink-100"><td className="py-1">{c.name}<div className="text-ink-500">{c.address}</div></td><td>{dateShort(c.date)}</td><td className="text-right tabular-nums">{gbp(c.price)}</td><td>{c.tenure}</td><td className="text-right tabular-nums">{c.capacity ?? '—'}</td><td className="text-right tabular-nums">{c.pricePerUnit ? gbp(c.pricePerUnit) : '—'}</td><td className="text-right tabular-nums">{c.rvMultiple ?? '—'}</td><td className="text-right tabular-nums">{num(haversineM(titleCentre, c.location.coordinates) / 1000, 1)} km</td><td><Badge tone={c.contributed ? 'brand' : 'neutral'}>{c.contributed ? 'Christie' : c.confidence}</Badge></td></tr>)}</tbody>
        </table>
      </section>
      <footer className="mt-10 border-t border-ink-200 pt-3 text-[10px] text-ink-500">Comparable prices from HM Land Registry entries and Christie &amp; Co transaction records (confidential). Rateable values under VOA restricted terms. Demographics from ONS mid-year estimates. This document is an internal desktop appraisal; a formal valuation requires inspection, trading accounts and a RICS-qualified valuer.</footer>
    </div>
  )
}
