import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Minus, Plus, Share2, Check, FileText, Map as MapIcon, Printer } from 'lucide-react'
import type { Business } from '@/data'
import type { SiteBundle } from '@/hooks/useSite'
import { Badge, KV, cx } from '@/components/ui'
import { gbp, num, sqm, sqft, dateShort, monthsUntil } from '@/lib/format'
import { dealScore } from '@/lib/dealScore'
import { useClassFor, useClassForDescription, type UseClass } from '@/lib/useClasses'
import { OWNER_CATEGORY_COLOURS } from '@/lib/sectors'
import { PRICE_PAID_TYPE } from '@/data/real'
import { OrderButton } from './InfoPanel'
import { CompetitionPanel } from './CompetitionPanel'
import type { CompetitionResult } from '@/lib/competition'

const acres = (m2: number) => `${(m2 / 4046.86).toFixed(m2 / 4046.86 < 1 ? 3 : 2)} acres`
const ha = (m2: number) => `${(m2 / 10_000).toFixed(2)} ha`

/** One expandable row of the summary: label, a value at a glance, and detail when opened. */
function Row({ id, label, value, open, onToggle, children }: { id: string; label: string; value?: ReactNode; open: boolean; onToggle: (id: string) => void; children: ReactNode }) {
  return (
    <div className="rounded-md border border-ink-200 bg-surface">
      <button type="button" className="flex w-full items-center gap-3 px-3 py-2.5 text-left" onClick={() => onToggle(id)} aria-expanded={open}>
        <span className="flex-1 text-sm font-medium text-ink-900">{label}</span>
        {!open && value !== undefined && <span className="max-w-[55%] truncate text-right text-xs text-ink-600">{value}</span>}
        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-ink-300 text-ink-600">{open ? <Minus size={12} /> : <Plus size={12} />}</span>
      </button>
      {open && <div className="border-t border-ink-100 px-3 py-3 text-sm">{children}</div>}
    </div>
  )
}

function Card({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('rounded-md border border-ink-200 bg-surface px-3 py-2.5', className)}>{children}</div>
}

/**
 * Nimbus-style overview: address, use classes, title and owner, downloads, then the facts a
 * surveyor opens one by one (site area, built form, rates, price paid, EPC, planning), the
 * likely-to-transact score and the competition analysis.
 */
export function SiteSummary({ bundle, b, onOrdered }: { bundle: SiteBundle; b: Business | null; onOrdered: () => void }) {
  const t = bundle.title
  const h = bundle.hereditaments[0]
  const e = bundle.epcs[0]
  const lease = bundle.leases[0]
  const expiry = monthsUntil(lease?.expiryDate)
  const reg = b?.registers.find((r) => r.rating || r.capacity)
  const [open, setOpen] = useState<Set<string>>(() => new Set())
  const [copied, setCopied] = useState(false)
  const [comp, setComp] = useState<CompetitionResult | null>(null)
  const toggle = (id: string) => setOpen((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const ROWS = ['area', 'footprint', 'heights', 'rates', 'price', 'epc', 'planning', 'score', 'competition']
  const allOpen = ROWS.every((r) => open.has(r))

  // Use classes: the trading business plus every rated hereditament, grouped by description.
  const useClasses = useMemo(() => {
    const rows = new Map<string, UseClass & { count: number }>()
    const add = (uc: UseClass) => { const k = `${uc.description}|${uc.newClass}`; const cur = rows.get(k); rows.set(k, cur ? { ...cur, count: cur.count + 1 } : { ...uc, count: 1 }) }
    const bizClasses = bundle.businesses.map((biz) => useClassFor(biz.sector, biz.subSector))
    bizClasses.forEach(add)
    // Hereditaments add rows only for uses the trading business does not already cover (e.g. a flat above a shop).
    for (const hd of bundle.hereditaments) {
      const uc = useClassForDescription(hd.description)
      if (bizClasses.some((bc) => bc.newClass.split(' ')[0] === uc.newClass.split(' ')[0])) continue
      add(uc)
    }
    if (!rows.size) add(b ? useClassFor(b.sector, b.subSector) : { description: t.proprietors.some((p) => p.category === 'Private Individual') ? 'Dwellinghouse' : 'Commercial, business and service', oldClass: t.proprietors.some((p) => p.category === 'Private Individual') ? 'C3' : '—', newClass: t.proprietors.some((p) => p.category === 'Private Individual') ? 'C3' : 'E' })
    return Array.from(rows.values())
  }, [bundle, b, t])

  const owner = t.proprietors[0]
  const ownerCompany = bundle.proprietorCompanies.find((c) => c.companyNumber === owner?.companyNumber)
  const footprint = t.building?.footprintSqm
  const levels = t.building?.levels
  const gia = footprint && levels ? footprint * levels : h?.totalAreaSqm
  const score = b ? dealScore(b, t, h, e, bundle.operatorCompanies.find((c) => c.companyNumber === b.operatorCompanyNumber), bundle.planning.length) : null
  const ppNonRes = bundle.pricePaidNear.filter((r) => r.type === 'O')
  const share = async () => {
    try { await navigator.clipboard?.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* ignore */ }
  }
  const addressLines = t.address.split(/,\s*/)

  return (
    <div className="space-y-2 bg-ink-50 p-3">
      {b && b.distressFlags.length > 0 && (
        <div className="rounded-md border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
          <div className="font-semibold">Distress signals</div>
          <div className="mt-1 flex flex-wrap gap-1">{b.distressFlags.map((f) => <Badge key={f} tone="critical">{f}</Badge>)}</div>
        </div>
      )}

      {/* Summary card */}
      <Card className="py-3">
        <div className="text-sm font-medium leading-snug text-ink-900">{addressLines.map((l, i) => <div key={i}>{l}</div>)}<div>{t.postcode}</div></div>
        <div className="mt-3">
          <div className="label mb-1">Use classes</div>
          <table className="w-full text-[11px]">
            <thead><tr className="bg-brand-700 text-left text-white"><th className="rounded-l px-1.5 py-1 font-medium">Description</th><th className="px-1.5 py-1 font-medium">Old class</th><th className="px-1.5 py-1 font-medium">New class</th><th className="rounded-r px-1.5 py-1 text-right font-medium"># of properties</th></tr></thead>
            <tbody>{useClasses.map((u, i) => <tr key={i} className="border-b border-ink-100 last:border-0"><td className="px-1.5 py-1 text-ink-800">{u.description}</td><td className="px-1.5 py-1">{u.oldClass}</td><td className="px-1.5 py-1 font-medium">{u.newClass}</td><td className="px-1.5 py-1 text-right">{u.count}</td></tr>)}</tbody>
          </table>
          <p className="mt-1 text-[10px] text-ink-400">Use Classes Order (England), classes before and after 1 September 2020. Derived from the operator's sector and the VOA description; confirm against the planning history before relying on it.</p>
        </div>
        <div className="mt-3 flex items-center justify-between">
          <button className="flex items-center gap-1 text-xs font-medium text-ink-700 hover:underline" onClick={share}>{copied ? <Check size={13} /> : <Share2 size={13} />} {copied ? 'Link copied' : 'Share this title'}</button>
          <Link to={`/report/${t.titleNumber}`} target="_blank" className="btn-primary btn-sm"><Printer size={13} /> Site report</Link>
        </div>
      </Card>

      <Card><div className="flex items-center justify-between gap-2 text-sm"><span className="text-ink-700">Title number</span><span className="font-medium text-ink-900">{t.titleNumber} <span className="font-normal text-ink-500">({t.tenure})</span></span></div></Card>

      <Card>
        <div className="flex items-start justify-between gap-2 text-sm">
          <span className="shrink-0 text-ink-700">Owner</span>
          <span className="min-w-0 text-right">
            <span className="block truncate font-medium text-ink-900">{owner?.redacted ? <span className="italic text-ink-500">Private individual (withheld until the register is bought)</span> : owner?.name}{owner?.companyNumber ? <span className="font-normal text-ink-500"> ({owner.companyNumber})</span> : ''}</span>
            <span className="mt-0.5 flex items-center justify-end gap-1.5 text-[11px] text-ink-500"><span className="h-2 w-2 rounded-sm" style={{ background: OWNER_CATEGORY_COLOURS[owner?.category ?? 'Other'] }} />{owner?.category}{t.proprietors.length > 1 ? ` · +${t.proprietors.length - 1} more` : ''}</span>
          </span>
        </div>
        {owner?.companyNumber && <Link to={`/companies/${owner.companyNumber}`} className="mt-1.5 flex items-center justify-end gap-0.5 text-xs text-brand-700 hover:underline">Search company properties <ChevronRight size={12} /></Link>}
        {ownerCompany && <div className="mt-1 text-right text-[11px] text-ink-500">{ownerCompany.status}{ownerCompany.accountsOverdue ? ' · accounts overdue' : ''}</div>}
        {t.licence === 'HMLR-CCOD' && <p className="mt-1.5 text-[10px] text-ink-400">CCOD licence: not for direct marketing to this proprietor.</p>}
      </Card>

      <Card>
        <div className="label mb-1.5">Downloads</div>
        <div className="grid grid-cols-2 gap-1.5">
          <OrderButton titleNumber={t.titleNumber} kind="Title Plan" label={t.titlePlanPurchased ? 'Title plan (stored)' : 'Title plan'} onOrdered={onOrdered} disabled={t.titlePlanPurchased} />
          <OrderButton titleNumber={t.titleNumber} kind="Register" label={t.registerPurchased ? 'Register & lease schedule (stored)' : 'Register & lease schedule'} onOrdered={onOrdered} disabled={t.registerPurchased} />
          <Link to={`/report/${t.titleNumber}`} target="_blank" className="btn-secondary btn-sm justify-start"><FileText size={13} /> Site report · free</Link>
          <Link to={`/catchment?lon=${bundle.centre[0]}&lat=${bundle.centre[1]}&label=${encodeURIComponent(b ? b.name : t.address)}`} className="btn-secondary btn-sm justify-start"><MapIcon size={13} /> Catchment report</Link>
        </div>
        <p className="mt-1.5 text-[10px] text-ink-400">Official copies are bought once at HM Land Registry cost and stored for the whole firm.</p>
      </Card>

      <div className="flex items-center justify-end"><button className="text-xs font-semibold text-ink-800 hover:underline" onClick={() => setOpen(allOpen ? new Set() : new Set(ROWS))}>{allOpen ? 'Collapse all' : 'Expand all'}</button></div>

      <Row id="area" label="Site area" value={acres(t.areaSqm)} open={open.has('area')} onToggle={toggle}>
        <KV rows={[['Site area', `${sqm(t.areaSqm)} · ${sqft(t.areaSqm)}`], ['', `${acres(t.areaSqm)} · ${ha(t.areaSqm)}`], ['Source', `${t.source} title extent`]]} />
      </Row>
      <Row id="footprint" label="Building footprints" value={footprint ? sqm(footprint) : 'Not collected here'} open={open.has('footprint')} onToggle={toggle}>
        {footprint ? <KV rows={[['Footprint', `${sqm(footprint)} · ${sqft(footprint)}`], ['Site coverage', `${Math.min(100, Math.round((footprint / Math.max(1, t.areaSqm)) * 100))}%`], ['Source', t.building?.source ?? '—']]} /> : <div className="text-xs text-ink-500">Building footprints are collected for the demo areas from Overture Maps. Outside them the title extent is shown without built form.</div>}
      </Row>
      <Row id="heights" label="Building heights" value={t.building?.heightM ? `${t.building.heightM.toFixed(1)} m` : levels ? `${levels} storeys` : 'Not recorded'} open={open.has('heights')} onToggle={toggle}>
        <KV rows={[['Height', t.building?.heightM ? `${t.building.heightM.toFixed(1)} m` : 'Not recorded'], ['Storeys', levels ? String(levels) : 'Not recorded'], ['Estimated gross internal area', gia ? `${sqm(gia)} · ${sqft(gia)}${footprint && levels ? ' (footprint × storeys)' : ' (VOA)'}` : '—'], ['Source', t.building?.source ?? 'Overture Maps buildings (height and storeys where mapped); LiDAR DSM can fill gaps']]} />
      </Row>
      <Row id="rates" label="Commercial uses, sizes & rates assessments" value={h ? `${gbp(h.rateableValue)} RV` : 'No assessment'} open={open.has('rates')} onToggle={toggle}>
        {bundle.hereditaments.length ? (
          <table className="w-full text-xs">
            <thead className="text-left text-ink-500"><tr><th className="py-1 font-medium">Description</th><th className="py-1 font-medium">Area</th><th className="py-1 text-right font-medium">Rateable value</th></tr></thead>
            <tbody>{bundle.hereditaments.map((x) => <tr key={x.uarn} className="border-t border-ink-100"><td className="py-1 pr-2">{x.description}<div className="text-[10px] text-ink-500">{x.scatCode} · {x.listYear} list · {x.address}</div></td><td className="py-1 pr-2 whitespace-nowrap">{x.totalAreaSqm ? `${sqm(x.totalAreaSqm)}` : '—'}</td><td className="py-1 text-right font-medium tabular-nums">{gbp(x.rateableValue)}</td></tr>)}</tbody>
          </table>
        ) : <div className="text-xs text-ink-500">No non-domestic hereditament matched to this title's UPRN.</div>}
        {h?.floors?.length ? <div className="mt-2 text-[11px] text-ink-600">Floors: {h.floors.map((f) => `${f.floor} ${f.use} ${sqm(f.areaSqm)}`).join(' · ')}</div> : null}
        <p className="mt-1.5 text-[10px] text-ink-400">VOA rating list. Restricted terms: stays in the platform, excluded from CRM exports by default.</p>
      </Row>
      <Row id="price" label="Price paid" value={t.pricePaid ? `${gbp(t.pricePaid)} · ${dateShort(t.pricePaidDate)}` : ppNonRes.length ? `${ppNonRes.length} non-residential sales within 150 m` : 'Not recorded'} open={open.has('price')} onToggle={toggle}>
        <KV rows={[['This title', t.pricePaid ? `${gbp(t.pricePaid)} on ${dateShort(t.pricePaidDate)}` : 'No price recorded on the register'], ['Proprietor since', dateShort(t.dateProprietorAdded)]]} />
        {bundle.pricePaidNear.length > 0 && (
          <div className="mt-2">
            <div className="label mb-1">HM Land Registry sales within 150 m</div>
            <ul className="divide-y divide-ink-100 text-xs">{bundle.pricePaidNear.slice(0, 8).map((r) => <li key={r.id} className="flex items-center justify-between gap-2 py-1"><span className="min-w-0 truncate">{r.address || r.postcode}<span className="text-ink-500"> · {PRICE_PAID_TYPE[r.type]} · {dateShort(r.date)}</span></span><span className="shrink-0 font-medium tabular-nums">{gbp(r.price)}</span></li>)}</ul>
          </div>
        )}
        <Link to={`/comparables?lon=${bundle.centre[0]}&lat=${bundle.centre[1]}&radius=1000${b ? `&sector=${encodeURIComponent(b.sector)}` : ''}`} className="mt-2 inline-flex items-center gap-0.5 text-xs text-brand-700 hover:underline">Find particulars and comparables <ChevronRight size={12} /></Link>
      </Row>
      <Row id="epc" label="Energy Performance Certificate (EPC)" value={e ? <Badge tone={['A+', 'A', 'B', 'C'].includes(e.rating) ? 'good' : e.rating === 'D' || e.rating === 'E' ? 'warning' : 'critical'}>{e.rating} · {e.score}</Badge> : 'None lodged'} open={open.has('epc')} onToggle={toggle}>
        {e ? <KV rows={[['Rating', <span key="r"><Badge tone={['A+', 'A', 'B', 'C'].includes(e.rating) ? 'good' : e.rating === 'D' || e.rating === 'E' ? 'warning' : 'critical'}>{e.rating} ({e.score})</Badge> {['F', 'G'].includes(e.rating) ? 'Below the MEES minimum for letting' : e.rating === 'D' || e.rating === 'E' ? 'Below the proposed 2030 minimum of C' : ''}</span>], ['Type', e.kind], ['Floor area', e.floorAreaSqm ? sqm(e.floorAreaSqm) : '—'], ['Heating', e.mainHeating ?? '—'], ['Lodged', dateShort(e.lodgedAt)], ['Expires', dateShort(e.expiresAt)], ['Certificate', e.certificateId]]} /> : <div className="text-xs text-ink-500">No EPC found for this address in the Open Data Communities register.</div>}
      </Row>
      <Row id="planning" label="Planning" value={`${bundle.planning.length} on title · ${bundle.nearbyPlanning.length} within 250 m`} open={open.has('planning')} onToggle={toggle}>
        {bundle.planning.length ? <ul className="divide-y divide-ink-100 text-xs">{bundle.planning.slice(0, 5).map((p) => <li key={p.reference} className="py-1"><span className="font-medium">{p.reference}</span> · {p.status} · {dateShort(p.receivedDate)}<div className="truncate text-ink-600">{p.description}</div></li>)}</ul> : <div className="text-xs text-ink-500">No applications recorded against this title. See the Planning tab for the 250 m neighbourhood and the authority's decision statistics.</div>}
        {bundle.constraints.length > 0 && <div className="mt-2 text-xs text-ink-600">Constraints: {bundle.constraints.map((c) => c.kind).join(', ')}</div>}
      </Row>
      {b && score && (
        <Row id="score" label="Likely to transact" value={<Badge tone={score.band === 'High' ? 'critical' : score.band === 'Medium' ? 'warning' : 'neutral'}>{score.band} · {score.score}</Badge>} open={open.has('score')} onToggle={toggle}>
          <div className="mb-1 flex items-center gap-2"><Badge tone={score.band === 'High' ? 'critical' : score.band === 'Medium' ? 'warning' : 'neutral'}>{score.band} · {score.score}/100</Badge><span className="text-xs text-ink-500">{b.operatorName} · {b.tenure}{reg ? ` · ${reg.register} ${reg.rating ?? ''}${reg.capacity ? ` · ${reg.capacity} ${reg.capacityLabel}` : ''}` : ''}{lease ? ` · lease expires ${dateShort(lease.expiryDate)}${expiry !== undefined ? ` (${expiry} mo)` : ''}` : ''}</span></div>
          <ul className="space-y-0.5 text-xs text-ink-700">{score.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </Row>
      )}
      <Row id="competition" label="Highlight competition" value={comp ? <span>{comp.competitors.length} within {comp.radiusM >= 1000 ? `${comp.radiusM / 1000} km` : `${comp.radiusM} m`} · <span className={cx('font-medium', comp.pressure === 'High' ? 'text-rose-700' : comp.pressure === 'Moderate' ? 'text-amber-700' : 'text-green-700')}>{comp.pressure}</span></span> : 'Who competes with this site'} open={open.has('competition')} onToggle={toggle}>
        <CompetitionPanel site={{ name: b ? b.name : t.address, sector: b?.sector, subSector: b?.subSector, capacity: reg?.capacity, rating: reg?.rating, operatorName: b?.operatorName, centre: bundle.centre }} onResult={setComp} />
      </Row>

      <div className="px-1 pt-1 text-[10px] text-ink-400">Identifiers: {t.titleNumber} · INSPIRE {t.inspireId}{t.uprn ? ` · UPRN ${t.uprn}` : ''}{h ? ` · VOA ${h.uarn}` : ''}{e ? ` · EPC ${e.certificateId}` : ''}{b?.registers.map((r) => ` · ${r.register} ${r.registerId}`).join('')}. Sources: {Array.from(new Set([t.source, h?.source, e?.source, ...(b?.registers.map((r) => r.source) ?? [])].filter(Boolean))).join(', ')}. {num(bundle.footfall.length)} footfall cells, {bundle.traffic.length} DfT counts within 600 m.</div>
    </div>
  )
}
