import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import type { Polygon, MultiPolygon } from 'geojson'
import { provider } from '@/data'
import { useSite } from '@/hooks/useSite'
import { Spinner, Badge, KV } from '@/components/ui'
import { dateShort, gbp, num, sqm, sqft, monthsUntil } from '@/lib/format'
import { ReportFrame } from '@/components/ReportFrame'
import { useClassFor, useClassForDescription, type UseClass } from '@/lib/useClasses'
import { dealScore } from '@/lib/dealScore'
import { analyseCompetition, DEFAULT_RADIUS_M, type CompetitionResult } from '@/lib/competition'
import { PRICE_PAID_TYPE } from '@/data/real'
import { OWNER_CATEGORY_COLOURS } from '@/lib/sectors'

const acres = (m2: number) => (m2 / 4046.856).toFixed(3)

/** Title plan drawn from the registered extent: north up, scale bar, extent outline. */
function TitlePlan({ geometry, label }: { geometry: Polygon | MultiPolygon; label: string }) {
  const rings = geometry.type === 'Polygon' ? [geometry.coordinates[0]] : geometry.coordinates.map((p) => p[0])
  const pts = rings.flat()
  const lons = pts.map((p) => p[0])
  const lats = pts.map((p) => p[1])
  const minLon = Math.min(...lons), maxLon = Math.max(...lons), minLat = Math.min(...lats), maxLat = Math.max(...lats)
  const lat0 = (minLat + maxLat) / 2
  const mx = 111_320 * Math.cos((lat0 * Math.PI) / 180), my = 111_320
  const wM = (maxLon - minLon) * mx || 1, hM = (maxLat - minLat) * my || 1
  const pad = Math.max(wM, hM) * 0.15
  const size = 260
  const scale = size / (Math.max(wM, hM) + pad * 2)
  const X = (lon: number) => ((lon - minLon) * mx + pad + (Math.max(wM, hM) - wM) / 2) * scale
  const Y = (lat: number) => size - ((lat - minLat) * my + pad + (Math.max(wM, hM) - hM) / 2) * scale
  const bar = [5, 10, 20, 25, 50, 100, 200].reduce((best, v) => (v * scale <= size * 0.4 ? v : best), 5)
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} className="rounded border border-ink-200 bg-[#f7f8fb]" role="img" aria-label={`Title plan of ${label}`}>
      {rings.map((r, i) => <polygon key={i} points={r.map(([lon, lat]) => `${X(lon)},${Y(lat)}`).join(' ')} fill="#be123c22" stroke="#be123c" strokeWidth={1.6} />)}
      <g transform={`translate(${size - 22}, 22)`}><polygon points="0,-12 5,6 0,2 -5,6" fill="#0f2340" /><text y={20} textAnchor="middle" fontSize={9} fill="#0f2340">N</text></g>
      <g transform={`translate(10, ${size - 12})`}><line x1={0} x2={bar * scale} y1={0} y2={0} stroke="#0f2340" strokeWidth={2} /><line x1={0} x2={0} y1={-4} y2={4} stroke="#0f2340" /><line x1={bar * scale} x2={bar * scale} y1={-4} y2={4} stroke="#0f2340" /><text x={bar * scale / 2} y={-5} textAnchor="middle" fontSize={9} fill="#0f2340">{bar} m</text></g>
    </svg>
  )
}

/** Client-ready site report: the info panel's facts plus the analyses, laid out for print. Browser print dialog for PDF. */
export function ReportPage() {
  const { titleNumber = '' } = useParams()
  const { bundle, loading, error } = useSite(titleNumber)
  const [comp, setComp] = useState<CompetitionResult | null>(null)
  const b = bundle?.businesses[0]
  useEffect(() => {
    if (!bundle || !b) return
    const radius = DEFAULT_RADIUS_M[b.sector]
    Promise.all([provider.getBusinessesNear(bundle.centre[0], bundle.centre[1], radius, b.sector), provider.getPoisNear(bundle.centre[0], bundle.centre[1], radius, b.sector)]).then(([demo, real]) => {
      const reg = b.registers.find((r) => r.capacity || r.rating)
      setComp(analyseCompetition({ name: b.name, sector: b.sector, subSector: b.subSector, capacity: reg?.capacity, rating: reg?.rating, operatorName: b.operatorName, centre: bundle.centre }, demo.filter((d) => d.businessId !== b.businessId), real, radius))
    })
  }, [bundle, b])
  const useClasses = useMemo(() => {
    if (!bundle) return []
    const rows = new Map<string, UseClass & { count: number }>()
    const add = (uc: UseClass) => { const k = `${uc.description}|${uc.newClass}`; const cur = rows.get(k); rows.set(k, cur ? { ...cur, count: cur.count + 1 } : { ...uc, count: 1 }) }
    const bizClasses = bundle.businesses.map((x) => useClassFor(x.sector, x.subSector))
    bizClasses.forEach(add)
    for (const hd of bundle.hereditaments) { const uc = useClassForDescription(hd.description); if (!bizClasses.some((bc) => bc.newClass.split(' ')[0] === uc.newClass.split(' ')[0])) add(uc) }
    return Array.from(rows.values())
  }, [bundle])
  if (loading || !bundle) return <div className="p-8">{error ? <span className="text-rose-700 dark:text-rose-300">{error}</span> : <Spinner label="Building report…" />}</div>
  const { title: t, hereditaments, epcs, planning, nearbyPlanning, constraints, traffic, footfall, leases, operatorCompanies, proprietorCompanies, pricePaidNear } = bundle
  const h = hereditaments[0]
  const e = epcs[0]
  const reg = b?.registers.find((r) => r.rating || r.capacity)
  const score = b ? dealScore(b, t, h, e, operatorCompanies.find((c) => c.companyNumber === b.operatorCompanyNumber), planning.length) : null
  const footprint = t.building?.footprintSqm
  const owner = t.proprietors[0]
  const H = ({ children }: { children: React.ReactNode }) => <h2 className="mb-2 border-b border-ink-200 pb-1 text-sm font-semibold uppercase tracking-wide text-brand-700">{children}</h2>
  return (
    <ReportFrame kind="Site report" title={b ? b.name : t.address} subtitle={`${t.address}, ${t.postcode} · Title ${t.titleNumber} (${t.tenure})${t.uprn ? ` · UPRN ${t.uprn}` : ''}`} entityType="title" entityId={t.titleNumber} meta={b ? <div>{b.sector}{b.subSector ? ` · ${b.subSector}` : ''}</div> : undefined}>
      {/* Summary strip */}
      <div className="mb-6 grid grid-cols-4 gap-3 text-center">
        {[['Site area', `${acres(t.areaSqm)} acres`, sqm(t.areaSqm)], ['Rateable value', h ? gbp(h.rateableValue) : '—', h ? `${h.listYear} list` : 'no assessment'], ['EPC', e ? `${e.rating} (${e.score})` : '—', e ? (['F', 'G'].includes(e.rating) ? 'below MEES' : 'lettable') : 'none lodged'], ['Likely to transact', score ? `${score.band} · ${score.score}` : '—', score ? score.reasons.length + ' signals' : '']].map(([k, v, s]) => (
          <div key={k} className="rounded-md border border-ink-200 px-3 py-2"><div className="text-[10px] uppercase tracking-wide text-ink-500">{k}</div><div className="text-lg font-semibold">{v}</div><div className="text-[11px] text-ink-500">{s}</div></div>
        ))}
      </div>

      <div className="grid grid-cols-[260px_1fr] gap-8">
        <section>
          <H>Title plan</H>
          <TitlePlan geometry={t.geometry} label={t.address} />
          <p className="mt-1 text-[10px] text-ink-500">Registered extent from HM Land Registry index polygons: general position only, not a definitive boundary.</p>
        </section>
        <section>
          <H>Ownership</H>
          <KV rows={[['Tenure', t.tenure], ['Proprietor(s)', t.proprietors.map((p) => (p.redacted ? 'Private individual (register not purchased)' : p.name)).join('; ')], ['Owner type', <span key="o" className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: OWNER_CATEGORY_COLOURS[owner?.category ?? 'Other'] }} />{owner?.category}</span>], ['Company no.', owner?.companyNumber ?? '—'], ['Owner status', proprietorCompanies[0] ? `${proprietorCompanies[0].status}${proprietorCompanies[0].accountsOverdue ? ', accounts overdue' : ''}` : '—'], ['Proprietor since', dateShort(t.dateProprietorAdded)], ['Price paid', t.pricePaid ? `${gbp(t.pricePaid)} (${dateShort(t.pricePaidDate)})` : 'Not recorded'], ['Charges', t.charges?.map((c) => c.lender).join('; ') || 'None noted']]} />
          <H>Use classes</H>
          <table className="w-full text-xs">
            <thead><tr className="bg-brand-700 text-left text-white"><th className="px-1.5 py-1 font-medium">Description</th><th className="px-1.5 py-1 font-medium">Pre-2020</th><th className="px-1.5 py-1 font-medium">Current</th><th className="px-1.5 py-1 text-right font-medium">Count</th></tr></thead>
            <tbody>{useClasses.map((u, i) => <tr key={i} className="border-b border-ink-100"><td className="px-1.5 py-1">{u.description}</td><td className="px-1.5 py-1">{u.oldClass}</td><td className="px-1.5 py-1 font-medium">{u.newClass}</td><td className="px-1.5 py-1 text-right">{u.count}</td></tr>)}</tbody>
          </table>
        </section>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-8">
        <section>
          <H>Occupier</H>
          {b ? <KV rows={[['Business', `${b.name} (${b.sector}${b.subSector ? `, ${b.subSector}` : ''})`], ['Operator', `${b.operatorName} · ${b.operatorCompanyNumber}`], ['Operator status', operatorCompanies[0] ? `${operatorCompanies[0].status}${operatorCompanies[0].accountsOverdue ? ', accounts overdue' : ''}` : '—'], ['Tenure', b.tenure], ...b.registers.map((r) => [r.register, `${r.registerId}${r.rating ? ` · ${r.rating}` : ''}${r.capacity ? ` · ${r.capacity} ${r.capacityLabel}` : ''}`] as [string, string]), ['Distress signals', b.distressFlags.join(', ') || 'None']]} /> : <p className="text-sm text-ink-500">No trading business matched to this title.</p>}
        </section>
        <section>
          <H>Built form, rating and energy</H>
          <KV rows={[['Building footprint', footprint ? `${sqm(footprint)} · ${sqft(footprint)} (${Math.min(100, Math.round((footprint / Math.max(1, t.areaSqm)) * 100))}% site coverage)` : 'Not collected'], ['Height / storeys', t.building?.heightM ? `${t.building.heightM.toFixed(1)} m${t.building.levels ? ` · ${t.building.levels} storeys` : ''}` : t.building?.levels ? `${t.building.levels} storeys` : 'Not recorded'], ['VOA description', h?.description ?? '—'], ['Rateable value', h ? `${gbp(h.rateableValue)} (${h.listYear} list)` : '—'], ['Floor area (VOA)', h?.totalAreaSqm ? `${sqm(h.totalAreaSqm)} · ${sqft(h.totalAreaSqm)}` : '—'], ['RV per m²', h?.totalAreaSqm ? gbp(Math.round(h.rateableValue / h.totalAreaSqm)) : '—'], ['EPC', e ? `${e.rating} (${e.score}), lodged ${dateShort(e.lodgedAt)}, expires ${dateShort(e.expiresAt)}` : 'None lodged'], ['MEES', e ? (['F', 'G'].includes(e.rating) ? 'Below the minimum for letting' : e.rating === 'D' || e.rating === 'E' ? 'Lettable; below the proposed 2030 minimum of C' : 'Compliant') : '—']]} />
        </section>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-8">
        <section>
          <H>Leases</H>
          {leases.length ? leases.map((l) => <KV key={l.leaseId} rows={[['Lessee', l.lessee ?? '—'], ['Term', l.termDescription], ['Expiry', `${dateShort(l.expiryDate)} (${monthsUntil(l.expiryDate)} months)`], ['Premium', l.premium ? gbp(l.premium) : '—'], ['Passing rent', l.parsed?.rentPa ? `${gbp(l.parsed.rentPa)} pa` : 'Buy the lease to extract'], ['Reviews / breaks', l.parsed ? `${l.parsed.rentReviewDates?.map(dateShort).join(', ') || 'none'} / ${l.parsed.breakDates?.map(dateShort).join(', ') || 'none'}` : '—']]} />) : <p className="text-sm text-ink-500">No registered leases.</p>}
        </section>
        <section>
          <H>Sales evidence within 150 m (HM Land Registry)</H>
          {pricePaidNear.length ? (
            <table className="w-full text-xs">
              <thead className="text-left text-ink-500"><tr><th className="py-1 font-medium">Address</th><th className="font-medium">Type</th><th className="font-medium">Date</th><th className="text-right font-medium">Price</th></tr></thead>
              <tbody>{pricePaidNear.slice(0, 10).map((r) => <tr key={r.id} className="border-t border-ink-100"><td className="py-1 pr-2">{r.address || r.postcode}</td><td>{r.type === 'O' ? 'Non-res / mixed' : PRICE_PAID_TYPE[r.type]}</td><td>{dateShort(r.date)}</td><td className="text-right tabular-nums">{gbp(r.price)}</td></tr>)}</tbody>
            </table>
          ) : <p className="text-sm text-ink-500">No recorded sales within 150 m in the loaded data.</p>}
        </section>
      </div>

      {score && b && (
        <section className="mt-8 break-inside-avoid">
          <H>Likelihood of a transaction</H>
          <div className="flex items-start gap-4">
            <div className="shrink-0 rounded-md border border-ink-200 px-4 py-3 text-center"><div className="text-3xl font-semibold">{score.score}</div><div className="text-[11px] uppercase tracking-wide text-ink-500">{score.band}</div></div>
            <ul className="grid flex-1 grid-cols-2 gap-x-6 gap-y-0.5 text-xs text-ink-700">{score.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
          </div>
          <p className="mt-1 text-[10px] text-ink-500">An additive score of public signals that precede a sale (distress, lease events, regulator changes, ownership movement, rating and energy position). High is 55 and above. It is a prompt for a conversation, not a valuation.</p>
        </section>
      )}

      {comp && b && (
        <section className="mt-8 break-inside-avoid">
          <H>Competition within {comp.radiusM >= 1000 ? `${comp.radiusM / 1000} km` : `${comp.radiusM} m`}</H>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm"><Badge tone={comp.pressure === 'High' ? 'critical' : comp.pressure === 'Moderate' ? 'warning' : 'good'}>{comp.pressure} pressure</Badge><span className="text-xs text-ink-600">{comp.competitors.length} same-sector operators · {comp.densityPerKm2.toFixed(1)} per km²{comp.nearestM !== undefined ? ` · nearest ${comp.nearestM} m` : ''}</span></div>
          <ul className="mb-2 text-xs text-ink-700">{comp.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
          {comp.main.length > 0 && (
            <table className="w-full text-xs">
              <thead className="text-left text-ink-500"><tr><th className="py-1 font-medium">#</th><th className="font-medium">Competitor</th><th className="font-medium">Offer</th><th className="font-medium">Operator / brand</th><th className="text-right font-medium">Distance</th><th className="text-right font-medium">Score</th></tr></thead>
              <tbody>{comp.main.map((c, i) => <tr key={c.id} className="border-t border-ink-100"><td className="py-1 pr-2 text-ink-400">{i + 1}</td><td className="font-medium">{c.name}{c.kind === 'demo' ? ' (demo)' : ''}</td><td>{c.subSector ?? c.category?.replace(/_/g, ' ') ?? ''}{c.capacity ? ` · ${c.capacity} ${c.capacityLabel ?? ''}` : ''}{c.rating ? ` · ${c.rating}` : ''}</td><td>{c.brand ?? c.operatorName ?? 'Independent'}</td><td className="text-right tabular-nums">{c.distanceM} m</td><td className="text-right tabular-nums">{c.score}</td></tr>)}</tbody>
            </table>
          )}
        </section>
      )}

      <section className="mt-8">
        <H>Planning ({planning.length} on title, {nearbyPlanning.length} within 250 m)</H>
        {planning.length + nearbyPlanning.length ? (
          <table className="w-full text-xs">
            <thead className="text-left text-ink-500"><tr><th className="py-1 font-medium">Reference</th><th className="font-medium">Proposal</th><th className="font-medium">Type</th><th className="font-medium">Received</th><th className="font-medium">Status</th></tr></thead>
            <tbody>{[...planning, ...nearbyPlanning.slice(0, 8)].map((p) => <tr key={p.reference} className="border-t border-ink-100"><td className="py-1 font-mono">{p.reference}</td><td>{p.description}</td><td>{p.type}</td><td>{dateShort(p.receivedDate)}</td><td><Badge>{p.status}</Badge></td></tr>)}</tbody>
          </table>
        ) : <p className="text-sm text-ink-500">No applications recorded.</p>}
      </section>

      <div className="mt-8 grid grid-cols-2 gap-8">
        <section>
          <H>Constraints</H>
          {constraints.length ? <ul className="list-disc pl-5 text-sm">{constraints.map((c) => <li key={c.id}>{c.kind}{c.grade ? ` (Grade ${c.grade})` : ''}: {c.name}</li>)}</ul> : <p className="text-sm text-ink-500">None intersecting the title in the loaded data.</p>}
        </section>
        <section>
          <H>Mobility</H>
          <KV rows={[['Nearest DfT count', traffic[0] ? `${num(traffic[0].aadf)} vehicles/day, ${traffic[0].roadName} (${traffic[0].year})` : 'None within 600 m'], ['HGV share', traffic[0] ? `${Math.round((traffic[0].hgv / traffic[0].aadf) * 100)}%` : '—'], ['Footfall (cell avg)', footfall.length ? `${num(Math.round(footfall.reduce((s, f) => s + f.monthlyVisits, 0) / footfall.length))} visits/month` : 'No coverage']]} />
          {reg && <p className="mt-2 text-xs text-ink-600">{reg.register}: {reg.rating ?? 'unrated'}{reg.capacity ? ` · ${reg.capacity} ${reg.capacityLabel}` : ''}.</p>}
        </section>
      </div>

      <footer className="mt-10 border-t border-ink-200 pt-3 text-[10px] text-ink-500">Sources and refresh: {[t, h, e, ...(b?.registers ?? [])].filter(Boolean).map((s) => `${(s as { source: string }).source} (${dateShort((s as { fetchedAt: string }).fetchedAt)})`).join(' · ')}. Use classes are inferred from the operator's sector and the VOA description and should be confirmed against the planning history. Competitor listings from Overture Maps places; demo operators are fictional.</footer>
    </ReportFrame>
  )
}
