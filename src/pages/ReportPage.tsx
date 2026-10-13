import { useParams } from 'react-router-dom'
import { useSite } from '@/hooks/useSite'
import { Spinner, Badge, KV } from '@/components/ui'
import { dateShort, gbp, num, sqm, sqft, monthsUntil } from '@/lib/format'

/** Printable site report. Opens in a new tab; use the browser print dialog for PDF. */
export function ReportPage() {
  const { titleNumber = '' } = useParams()
  const { bundle, loading, error } = useSite(titleNumber)
  if (loading || !bundle) return <div className="p-8">{error ? <span className="text-rose-700">{error}</span> : <Spinner label="Building report…" />}</div>
  const { title: t, businesses, hereditaments, epcs, planning, nearbyPlanning, constraints, traffic, footfall, leases, operatorCompanies, proprietorCompanies } = bundle
  const b = businesses[0]
  const h = hereditaments[0]
  const e = epcs[0]
  return (
    <div className="mx-auto max-w-4xl bg-white p-10 text-ink-900 print:p-0">
      <div className="no-print mb-4 flex justify-end gap-2"><button className="btn-primary" onClick={() => window.print()}>Print / save as PDF</button></div>
      <header className="mb-6 border-b-2 border-brand-700 pb-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">Christie &amp; Co · Property Intelligence · Site report</div>
        <h1 className="mt-1 text-2xl font-semibold">{b ? b.name : t.address}</h1>
        <div className="text-sm text-ink-600">{t.address}, {t.postcode} · Title {t.titleNumber} · UPRN {t.uprn}</div>
        <div className="mt-1 text-xs text-ink-500">Generated {new Date().toLocaleString('en-GB')}. Contains HM Land Registry data © Crown copyright (CCOD licence: not for direct marketing), VOA data under restricted terms, OGL data from MHCLG, DfT, CQC, Ofsted, FSA, NHSBSA and Companies House. Internal use only.</div>
      </header>
      <div className="grid grid-cols-2 gap-8">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Ownership</h2>
          <KV rows={[['Tenure', t.tenure], ['Proprietor(s)', t.proprietors.map((p) => (p.redacted ? 'Private individual (register not purchased)' : p.name)).join('; ')], ['Category', t.proprietors[0]?.category], ['Company no.', t.proprietors[0]?.companyNumber], ['Proprietor since', dateShort(t.dateProprietorAdded)], ['Price paid', t.pricePaid ? `${gbp(t.pricePaid)} (${dateShort(t.pricePaidDate)})` : 'Not recorded'], ['Charges', t.charges?.map((c) => c.lender).join('; ') || 'None noted'], ['Site area', `${sqm(t.areaSqm)} · ${(t.areaSqm / 4046.86).toFixed(2)} acres`], ['Owner status', proprietorCompanies[0] ? `${proprietorCompanies[0].status}${proprietorCompanies[0].accountsOverdue ? ', accounts overdue' : ''}` : '—']]} />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Occupier</h2>
          {b ? <KV rows={[['Business', `${b.name} (${b.sector}${b.subSector ? `, ${b.subSector}` : ''})`], ['Operator', `${b.operatorName} · ${b.operatorCompanyNumber}`], ['Operator status', operatorCompanies[0] ? `${operatorCompanies[0].status}${operatorCompanies[0].accountsOverdue ? ', accounts overdue' : ''}` : '—'], ['Tenure', b.tenure], ...b.registers.map((r) => [`${r.register}`, `${r.registerId}${r.rating ? ` · ${r.rating}` : ''}${r.capacity ? ` · ${r.capacity} ${r.capacityLabel}` : ''}`] as [string, string]), ['Distress signals', b.distressFlags.join(', ') || 'None']]} /> : <p className="text-sm text-ink-500">No trading business matched.</p>}
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Rating &amp; energy</h2>
          <KV rows={[['VOA description', h?.description], ['Rateable value', h ? `${gbp(h.rateableValue)} (${h.listYear} list)` : '—'], ['Floor area', h?.totalAreaSqm ? `${sqm(h.totalAreaSqm)} · ${sqft(h.totalAreaSqm)}` : '—'], ['RV / m²', h?.totalAreaSqm ? gbp(Math.round(h.rateableValue / h.totalAreaSqm)) : '—'], ['EPC', e ? `${e.rating} (${e.score}) lodged ${dateShort(e.lodgedAt)}, expires ${dateShort(e.expiresAt)}` : '—'], ['MEES', e ? (['F', 'G'].includes(e.rating) ? 'Sub-standard' : 'Compliant') : '—']]} />
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Leases</h2>
          {leases.length ? leases.map((l) => <KV key={l.leaseId} rows={[['Lessee', l.lessee], ['Term', l.termDescription], ['Expiry', `${dateShort(l.expiryDate)} (${monthsUntil(l.expiryDate)} months)`], ['Premium', l.premium ? gbp(l.premium) : '—'], ['Passing rent', l.parsed?.rentPa ? `${gbp(l.parsed.rentPa)} pa` : 'Buy lease to extract'], ['Reviews / breaks', l.parsed ? `${l.parsed.rentReviewDates?.map(dateShort).join(', ') || 'none'} / ${l.parsed.breakDates?.map(dateShort).join(', ') || 'none'}` : '—']]} />) : <p className="text-sm text-ink-500">No registered leases.</p>}
        </section>
      </div>
      <section className="mt-8">
        <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Planning history ({planning.length} on title, {nearbyPlanning.length} within 250 m)</h2>
        <table className="w-full text-xs">
          <thead className="text-left text-ink-500"><tr><th className="py-1 font-medium">Reference</th><th className="font-medium">Proposal</th><th className="font-medium">Type</th><th className="font-medium">Received</th><th className="font-medium">Status</th></tr></thead>
          <tbody>{[...planning, ...nearbyPlanning.slice(0, 8)].map((p) => <tr key={p.reference} className="border-t border-ink-100"><td className="py-1 font-mono">{p.reference}</td><td>{p.description}</td><td>{p.type}</td><td>{dateShort(p.receivedDate)}</td><td><Badge>{p.status}</Badge></td></tr>)}</tbody>
        </table>
      </section>
      <div className="mt-8 grid grid-cols-2 gap-8">
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Constraints</h2>
          {constraints.length ? <ul className="list-disc pl-5 text-sm">{constraints.map((c) => <li key={c.id}>{c.kind}{c.grade ? ` (Grade ${c.grade})` : ''}: {c.name}</li>)}</ul> : <p className="text-sm text-ink-500">None intersecting.</p>}
        </section>
        <section>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-600">Mobility</h2>
          <KV rows={[['Nearest DfT count', traffic[0] ? `${num(traffic[0].aadf)} vehicles/day, ${traffic[0].roadName} (${traffic[0].year})` : 'None within 600 m'], ['HGV share', traffic[0] ? `${Math.round((traffic[0].hgv / traffic[0].aadf) * 100)}%` : '—'], ['Footfall (cell avg)', footfall.length ? `${num(Math.round(footfall.reduce((s, f) => s + f.monthlyVisits, 0) / footfall.length))} visits/month` : 'No coverage']]} />
        </section>
      </div>
      <footer className="mt-10 border-t border-ink-200 pt-3 text-[10px] text-ink-500">Sources and refresh: {[t, h, e, ...(b?.registers ?? [])].filter(Boolean).map((s) => `${(s as { source: string }).source} (${dateShort((s as { fetchedAt: string }).fetchedAt)})`).join(' · ')}. Title extents from INSPIRE index polygons show general position only and are not definitive boundaries.</footer>
    </div>
  )
}
