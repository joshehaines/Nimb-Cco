import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { X, Bookmark, BookmarkCheck, FileText, ExternalLink, Download, Building2, AlertTriangle, Printer, Copy, BellPlus } from 'lucide-react'
import { useAlerts } from '@/store/alerts'
import { useAuth } from '@/auth'
import { blankRule } from '@/lib/alerts'
import { provider, type Business, type DocumentOrder, type PlanningApplication, type TrafficCount, type Company, type LeaseSummary, type Comparable, type Title } from '@/data'
import { PRICE_PAID_TYPE, type PlaceProps, type PricePaidRow } from '@/data/real'
import type { Point } from 'geojson'
import { useUi } from '@/store/ui'
import { useSite, type SiteBundle } from '@/hooks/useSite'
import { Badge, Button, KV, Spinner, Tabs, Sparkline, cx, Empty } from '@/components/ui'
import { SECTOR_COLOURS, SECTOR_ICON } from '@/lib/sectors'
import { gbp, num, sqm, sqft, dateShort, ago, monthsUntil, pct } from '@/lib/format'
import { haversineM } from '@/lib/geo'
import { SiteSummary } from './SiteSummary'
import { logAudit } from '@/lib/audit'
import { mock } from '@/data'

type Tab = 'overview' | 'ownership' | 'leases' | 'operator' | 'planning' | 'rates' | 'mobility' | 'constraints'

export function InfoPanel() {
  const selected = useUi((s) => s.selected)
  const select = useUi((s) => s.select)
  const nav = useNavigate()
  const close = () => {
    select(null)
    nav('/map')
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return (
    <aside className="no-print absolute inset-y-0 right-0 z-30 flex w-full max-w-[440px] flex-col border-l border-ink-200 bg-surface shadow-xl lg:static lg:z-auto lg:shrink-0">
      {selected?.type === 'planning' && <PlanningDetail reference={selected.id} onClose={close} />}
      {selected?.type === 'traffic' && <TrafficDetail id={selected.id} onClose={close} />}
      {selected?.type === 'comparable' && <ComparableDetail id={selected.id} onClose={close} />}
      {selected?.type === 'poi' && <PoiDetail id={selected.id} onClose={close} />}
      {selected?.type === 'sale' && <SaleDetail id={selected.id} onClose={close} />}
      {selected?.type === 'point' && <PointDetail id={selected.id} onClose={close} />}
      {(selected?.type === 'title' || selected?.type === 'business') && <SitePanel key={selected.id} sel={selected} onClose={close} />}
    </aside>
  )
}

function Header({ title, subtitle, onClose, badge }: { title: string; subtitle?: string; onClose: () => void; badge?: React.ReactNode }) {
  return (
    <header className="flex items-start gap-2 border-b border-ink-200 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-base font-semibold text-ink-900">{title}</h2>
          {badge}
        </div>
        {subtitle && <div className="truncate text-xs text-ink-500">{subtitle}</div>}
      </div>
      <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close">
        <X size={16} />
      </button>
    </header>
  )
}

function SitePanel({ sel, onClose }: { sel: { type: 'title' | 'business'; id: string }; onClose: () => void }) {
  const [business, setBusiness] = useState<Business | null>(null)
  const [titleNumber, setTitleNumber] = useState<string | undefined>(sel.type === 'title' ? sel.id : undefined)
  const [refresh, setRefresh] = useState(0)
  const navTo = useNavigate()
  useEffect(() => {
    if (sel.type === 'business') provider.getBusiness(sel.id).then((b) => { setBusiness(b ?? null); setTitleNumber(b?.titleNumber) })
    else provider.getBusinessesForTitle(sel.id).then((bs) => setBusiness(bs[0] ?? null))
  }, [sel, refresh])
  const { bundle, loading, error } = useSite(titleNumber, refresh)
  const [tab, setTab] = useState<Tab>('overview')
  const { addWatch, removeWatch, isWatched, watchlist, requestFlyTo } = useUi()
  const watched = isWatched('title', titleNumber ?? '')

  if (error) return <><Header title="Not found" onClose={onClose} /><div className="p-4 text-sm text-rose-700 dark:text-rose-300">{error}</div></>
  if (!bundle || loading) return <><Header title={business?.name ?? sel.id} onClose={onClose} /><Spinner label="Assembling site bundle…" /></>
  const t = bundle.title
  const b = business ?? bundle.businesses[0] ?? null
  const distress = b?.distressFlags ?? []
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'ownership', label: 'Ownership' },
    { id: 'leases', label: 'Leases & docs', count: bundle.leases.length },
    { id: 'operator', label: 'Operator', count: b ? b.registers.length : 0 },
    { id: 'planning', label: 'Planning', count: bundle.planning.length },
    { id: 'rates', label: 'Rates & EPC' },
    { id: 'mobility', label: 'Mobility' },
    { id: 'constraints', label: 'Constraints', count: bundle.constraints.length },
  ]
  return (
    <>
      <Header
        title={b ? b.name : t.address}
        subtitle={b ? `${b.address} · ${t.postcode}` : `${t.postcode} · ${t.titleNumber}`}
        onClose={onClose}
        badge={<span className="flex items-center gap-1">{b ? <Badge tone="neutral"><span style={{ color: SECTOR_COLOURS[b.sector] }}>●</span> {b.sector}</Badge> : <Badge>{t.tenure}</Badge>}{(b ? b.source : t.source) === 'Synthetic' && <Badge tone="warning" title="Synthetic demo record: ownership, operator, registers and signals are generated, not real">Demo</Badge>}</span>}
      />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-100 px-4 py-2">
        <Button size="sm" variant={watched ? 'secondary' : 'primary'} onClick={() => (watched ? removeWatch(watchlist.find((w) => w.entityId === t.titleNumber)!.id) : addWatch({ entityType: 'title', entityId: t.titleNumber, label: b ? b.name : t.address }))}>
          {watched ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} {watched ? 'In My Sites' : 'Add to My Sites'}
        </Button>
        <Link to={`/report/${t.titleNumber}`} target="_blank" className="btn-secondary btn-sm"><Printer size={14} /> Report</Link>
        {b && <Link to={`/appraisal/${b.businessId}`} target="_blank" className="btn-secondary btn-sm">Appraise</Link>}
        <Link to={`/catchment?lon=${bundle.centre[0]}&lat=${bundle.centre[1]}&label=${encodeURIComponent(b ? b.name : t.address)}`} className="btn-secondary btn-sm">Catchment</Link>
        <Button size="sm" onClick={() => requestFlyTo(bundle.centre[0], bundle.centre[1], 18)}>Zoom</Button>
        <Button size="sm" title="Create an alert for anything that happens at or near this site" onClick={() => { if (!watched) addWatch({ entityType: 'title', entityId: t.titleNumber, label: b ? b.name : t.address }); const r = blankRule(useAuth.getState().user?.id ?? 'demo-agent', { name: `Watch ${b ? b.name : t.address}`, tag: 'Site watch', scope: { mode: 'sites', radiusM: 250, siteIds: [t.titleNumber, ...(b ? [b.businessId] : [])], postcodes: [], offices: [] }, frequency: 'instant' }); useAlerts.getState().upsertRule(r); navTo(`/alerts/rules/${r.id}`) }}><BellPlus size={14} /> Alert</Button>
        <Button size="sm" onClick={() => navigator.clipboard?.writeText(window.location.href)}><Copy size={14} /> Link</Button>
        {distress.length > 0 && <Badge tone="critical" className="ml-auto"><AlertTriangle size={11} /> {distress.length} signal{distress.length > 1 ? 's' : ''}</Badge>}
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto" tabIndex={0}>
        {tab === 'overview' && <SiteSummary bundle={bundle} b={b} onOrdered={() => setRefresh((r) => r + 1)} />}
        {tab === 'ownership' && <Ownership bundle={bundle} onOrdered={() => setRefresh((r) => r + 1)} />}
        {tab === 'leases' && <Leases bundle={bundle} onOrdered={() => setRefresh((r) => r + 1)} />}
        {tab === 'operator' && <Operator b={b} companies={bundle.operatorCompanies} />}
        {tab === 'planning' && <Planning bundle={bundle} />}
        {tab === 'rates' && <Rates bundle={bundle} />}
        {tab === 'mobility' && <Mobility bundle={bundle} />}
        {tab === 'constraints' && <Constraints bundle={bundle} />}
      </div>
    </>
  )
}

function Section({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="border-b border-ink-100 px-4 py-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="label">{title}</h4>
        {right}
      </div>
      {children}
    </section>
  )
}

function SourceTag({ source, fetchedAt, licence }: { source: string; fetchedAt: string; licence: string }) {
  return <span className="text-[10px] text-ink-400" title={`Licence: ${licence}`}>{source} · {ago(fetchedAt)}</span>
}

export function OrderButton({ titleNumber, kind, label, onOrdered, disabled }: { titleNumber: string; kind: DocumentOrder['kind']; label: string; onOrdered: () => void; disabled?: boolean }) {
  const [order, setOrder] = useState<DocumentOrder | null>(null)
  useEffect(() => {
    if (!order || order.status === 'Parsed' || order.status === 'Failed') return
    const h = setInterval(async () => {
      const all = await provider.getDocumentOrders()
      const o = all.find((x) => x.orderId === order.orderId)
      if (o) {
        setOrder({ ...o })
        if (o.status === 'Parsed' || o.status === 'Failed') onOrdered()
      }
    }, 500)
    return () => clearInterval(h)
  }, [order, onOrdered])
  if (order) return <Badge tone={order.status === 'Parsed' ? 'good' : 'info'}>{order.status === 'Parsed' ? 'Stored & parsed' : `${order.status}…`}</Badge>
  return (
    <Button size="sm" disabled={disabled} onClick={async () => { const o = await provider.orderDocument(titleNumber, kind); setOrder(o); logAudit('document-order', `${label} ordered for ${titleNumber} (£7)`, { entityType: 'title', entityId: titleNumber, licences: ['HMLR-Doc'] }) }}>
      <Download size={13} /> {label} · £7
    </Button>
  )
}

function CompanyLine({ c }: { c: Company }) {
  const tone = c.status === 'active' ? 'good' : c.status === 'dissolved' || c.status === 'dormant' ? 'neutral' : 'critical'
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <Link to={`/companies/${c.companyNumber}`} className="flex min-w-0 items-center gap-1.5 text-brand-700 hover:underline">
        <Building2 size={13} className="shrink-0" /> <span className="truncate">{c.name}</span>
      </Link>
      <span className="flex shrink-0 items-center gap-1">
        <Badge tone={tone}>{c.status}</Badge>
        {c.accountsOverdue && <Badge tone="warning">late accounts</Badge>}
      </span>
    </div>
  )
}

function Ownership({ bundle, onOrdered }: { bundle: SiteBundle; onOrdered: () => void }) {
  const t = bundle.title
  return (
    <>
      <Section title="Registered proprietors" right={<SourceTag {...t} />}>
        <ul className="space-y-2">
          {t.proprietors.map((p, i) => {
            const c = bundle.proprietorCompanies.find((x) => x.companyNumber === p.companyNumber)
            return (
              <li key={i} className="rounded-md border border-ink-100 p-2.5">
                <div className="text-sm font-medium text-ink-900">{p.redacted ? <span className="italic text-ink-500">Private individual · name withheld until register is purchased</span> : p.name}</div>
                <div className="text-xs text-ink-500">{p.category}{p.companyNumber ? ` · ${p.companyNumber}` : ''}</div>
                {p.address && <div className="mt-1 text-xs text-ink-600">{p.address}</div>}
                {c && <div className="mt-2"><CompanyLine c={c} /></div>}
              </li>
            )
          })}
        </ul>
        {t.licence === 'HMLR-CCOD' && <p className="mt-2 text-[11px] text-ink-500">CCOD licence: may not be used to market goods or services to this proprietor. Use the purchased register and a legitimate-interests assessment for any approach.</p>}
      </Section>
      <Section title="Title">
        <KV rows={[['Title number', t.titleNumber], ['Tenure', t.tenure], ['Proprietor since', dateShort(t.dateProprietorAdded)], ['Price paid', t.pricePaid ? `${gbp(t.pricePaid)} on ${dateShort(t.pricePaidDate)}` : 'Not recorded'], ['Charges', t.charges?.length ? t.charges.map((c) => `${c.lender} (${dateShort(c.date)})`).join('; ') : 'None noted'], ['Leases in schedule', String(t.leases.length)]]} />
      </Section>
      <Section title="HM Land Registry documents">
        <div className="flex flex-wrap gap-2">
          <OrderButton titleNumber={t.titleNumber} kind="Register" label={t.registerPurchased ? 'Register (stored)' : 'Order register'} onOrdered={onOrdered} disabled={t.registerPurchased} />
          <OrderButton titleNumber={t.titleNumber} kind="Title Plan" label={t.titlePlanPurchased ? 'Title plan (stored)' : 'Order title plan'} onOrdered={onOrdered} disabled={t.titlePlanPurchased} />
        </div>
        <p className="mt-2 text-[11px] text-ink-500">Official copies via Business Gateway at HMLR cost (£7). Documents are stored once for the whole firm and parsed into structured fields; nobody pays twice.</p>
      </Section>
      {bundle.proprietorCompanies.length > 0 && (
        <Section title="Owner's wider estate">
          <OwnerEstate companyNumber={bundle.proprietorCompanies[0].companyNumber} />
        </Section>
      )}
    </>
  )
}

function OwnerEstate({ companyNumber }: { companyNumber: string }) {
  const [titles, setTitles] = useState<number | null>(null)
  const [biz, setBiz] = useState<Business[]>([])
  useEffect(() => {
    provider.getTitlesForCompany(companyNumber).then((t) => setTitles(t.length))
    provider.getBusinessesForCompany(companyNumber).then(setBiz)
  }, [companyNumber])
  return (
    <div className="text-sm">
      <div>{titles === null ? '…' : `${titles} freehold title${titles === 1 ? '' : 's'} held by this company or its group`}{biz.length ? `, ${biz.length} trading sites` : ''}.</div>
      <Link to={`/companies/${companyNumber}`} className="mt-1 inline-flex items-center gap-1 text-brand-700 hover:underline">Open estate view <ExternalLink size={12} /></Link>
    </div>
  )
}

function LeaseCard({ l, titleNumber, onOrdered }: { l: LeaseSummary; titleNumber: string; onOrdered: () => void }) {
  const m = monthsUntil(l.expiryDate)
  return (
    <li className="rounded-md border border-ink-100 p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-sm font-medium">{l.lessee ?? 'Lessee not recorded'}</div>
          <div className="text-xs text-ink-500">{l.termDescription}</div>
        </div>
        <Badge tone={m !== undefined && m < 0 ? 'critical' : m !== undefined && m <= 24 ? 'warning' : 'neutral'}>{m !== undefined && m < 0 ? 'Expired / holding over' : `Expires ${dateShort(l.expiryDate)}`}</Badge>
      </div>
      <KV rows={[['Date of lease', dateShort(l.dateOfLease)], ['Term', `${l.termYears} years`], ['Premium', l.premium ? gbp(l.premium) : 'None recorded'], ['Alienation clause', l.alienationClause === undefined ? '—' : l.alienationClause ? 'Yes' : 'No'], ['Leasehold title', l.leaseholdTitleNumber]]} />
      {l.parsed ? (
        <div className="mt-2 rounded-md bg-brand-50 p-2.5 text-xs">
          <div className="mb-1 flex items-center justify-between font-semibold text-brand-800"><span>Extracted from lease document</span><span className="font-normal text-brand-700">confidence {pct(l.parsed.confidence)}</span></div>
          <KV rows={[['Passing rent', l.parsed.rentPa ? `${gbp(l.parsed.rentPa)} pa` : '—'], ['Rent reviews', l.parsed.rentReviewDates?.map(dateShort).join(', ') || 'None'], ['Break dates', l.parsed.breakDates?.map(dateShort).join(', ') || 'None'], ['Repairing', l.parsed.repairingObligation], ['Permitted use', l.parsed.permittedUse], ['Tied supply', l.parsed.tiedSupply ? 'Yes' : 'No']]} />
        </div>
      ) : (
        <div className="mt-2"><OrderButton titleNumber={titleNumber} kind="Lease" label="Order lease & extract terms" onOrdered={onOrdered} /></div>
      )}
      <div className="mt-1.5"><SourceTag {...l} /></div>
    </li>
  )
}

function Leases({ bundle, onOrdered }: { bundle: SiteBundle; onOrdered: () => void }) {
  return (
    <>
      <Section title="Registered leases">
        {bundle.leases.length ? <ul className="space-y-2">{bundle.leases.map((l) => <LeaseCard key={l.leaseId} l={l} titleNumber={bundle.title.titleNumber} onOrdered={onOrdered} />)}</ul> : <Empty title="No leases noted against this freehold" hint="Leases over 7 years must be registered. Shorter leases and licences will only be visible from the occupier's records or a purchased register." />}
      </Section>
      <Section title="Document store">
        <DocList titleNumber={bundle.title.titleNumber} />
      </Section>
    </>
  )
}

function DocList({ titleNumber }: { titleNumber: string }) {
  const [docs, setDocs] = useState<DocumentOrder[]>([])
  useEffect(() => {
    const load = () => provider.getDocumentOrders().then((d) => setDocs(d.filter((x) => x.titleNumber === titleNumber)))
    load()
    const h = setInterval(load, 1000)
    return () => clearInterval(h)
  }, [titleNumber])
  if (!docs.length) return <div className="text-xs text-ink-500">No documents purchased for this title yet. <Link to="/documents" className="text-brand-700">View firm-wide store</Link>.</div>
  return (
    <ul className="space-y-1.5 text-xs">
      {docs.map((d) => (
        <li key={d.orderId} className="flex items-start gap-2 rounded border border-ink-100 p-2">
          <FileText size={14} className="mt-0.5 shrink-0 text-ink-400" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between"><span className="font-medium">{d.kind}</span><Badge tone={d.status === 'Parsed' ? 'good' : d.status === 'Failed' ? 'critical' : 'info'}>{d.status}</Badge></div>
            <div className="text-ink-500">{d.fileName ?? 'Awaiting Business Gateway'} · {ago(d.orderedAt)}</div>
            {d.parsedSummary && <div className="mt-1 text-ink-700">{d.parsedSummary}</div>}
          </div>
        </li>
      ))}
    </ul>
  )
}

function Operator({ b, companies }: { b: Business | null; companies: Company[] }) {
  if (!b) return <Empty title="No trading business matched to this title" hint="VOA may still show a hereditament. Use the Rates & EPC tab." />
  const op = companies.find((c) => c.companyNumber === b.operatorCompanyNumber)
  return (
    <>
      <Section title="Operator">
        <div className="mb-2 flex items-center gap-2 text-sm"><span className="text-lg">{SECTOR_ICON[b.sector]}</span><div><div className="font-medium">{b.name}</div><div className="text-xs text-ink-500">{b.sector}{b.subSector ? ` · ${b.subSector}` : ''} · {b.tenure}</div></div></div>
        {op ? <CompanyLine c={op} /> : <div className="text-sm">{b.operatorName}</div>}
        {op && <div className="mt-2"><KV rows={[['Company no.', op.companyNumber], ['Incorporated', dateShort(op.incorporated)], ['SIC', op.sicCodes.join(', ')], ['Charges', op.charges.filter((c) => !c.satisfied).map((c) => c.lender).join(', ') || 'None outstanding'], ['Directors', op.officers.filter((o) => o.role === 'Director').map((o) => o.name).join(', ')], ['PSC', op.pscs.map((p) => p.name).join(', ')]]} /></div>}
      </Section>
      {b.registers.map((r) => (
        <Section key={r.register + r.registerId} title={`${r.register} register`} right={<SourceTag {...r} />}>
          <KV
            rows={[
              ['ID', r.registerId],
              ['Status', <Badge tone={r.status === 'Registered' ? 'good' : 'critical'}>{r.status}</Badge>],
              ...(r.rating ? [['Rating', <span><Badge tone={['Outstanding', 'Good', '5', '4'].includes(r.rating) ? 'good' : ['Requires improvement', '3', '2'].includes(r.rating) ? 'warning' : 'critical'}>{r.rating}</Badge> <span className="text-xs text-ink-500">{dateShort(r.ratingDate)}</span></span>] as [string, React.ReactNode]] : []),
              ...(r.capacity ? [['Capacity', `${r.capacity} ${r.capacityLabel}`] as [string, string]] : []),
              ...(r.registeredAt ? [['Registered', dateShort(r.registeredAt)] as [string, string]] : []),
              ...Object.entries(r.extra ?? {}).map(([k, v]) => [k.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()), typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v)] as [string, string]),
            ]}
          />
        </Section>
      ))}
    </>
  )
}

const statusTone = (s: PlanningApplication['status']) => (s === 'Approved' || s === 'Appeal Allowed' ? 'good' : s === 'Refused' || s === 'Appeal Dismissed' ? 'critical' : s === 'Pending' || s === 'Appeal' ? 'info' : 'neutral')

function PlanningList({ apps }: { apps: PlanningApplication[] }) {
  const select = useUi((s) => s.select)
  const nav = useNavigate()
  if (!apps.length) return <div className="text-xs text-ink-500">None.</div>
  return (
    <ul className="space-y-2">
      {apps.map((p) => (
        <li key={p.reference} className="rounded-md border border-ink-100 p-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <button className="font-medium text-brand-700 hover:underline" onClick={() => { select({ type: 'planning', id: p.reference }); nav(`/map/planning/${encodeURIComponent(p.reference)}`) }}>{p.reference}</button>
            <Badge tone={statusTone(p.status)}>{p.status}</Badge>
          </div>
          <div className="mt-1 text-ink-800">{p.description}</div>
          <div className="mt-1 text-ink-500">{p.type} · received {dateShort(p.receivedDate)}{p.decisionDate ? ` · decided ${dateShort(p.decisionDate)}` : ''}{p.address ? ` · ${p.address}` : ''}</div>
        </li>
      ))}
    </ul>
  )
}

function Planning({ bundle }: { bundle: SiteBundle }) {
  const authority = bundle.planning[0]?.authority ?? bundle.nearbyPlanning[0]?.authority
  const stats = useMemo(() => {
    if (!authority || !mock) return undefined
    const apps = mock.allPlanning().filter((p) => p.authority === authority)
    const decided = apps.filter((p) => p.decisionDate)
    const approved = decided.filter((p) => p.status === 'Approved').length
    const refused = decided.filter((p) => p.status === 'Refused').length
    const appeals = apps.filter((p) => p.status.startsWith('Appeal'))
    const allowed = appeals.filter((p) => p.status === 'Appeal Allowed').length
    const weeks = decided.map((p) => (new Date(p.decisionDate!).getTime() - new Date(p.receivedDate).getTime()) / (7 * 86400000)).sort((a, b) => a - b)
    const byType = new Map<string, { n: number; approved: number }>()
    for (const p of decided) {
      const cur = byType.get(p.type) ?? { n: 0, approved: 0 }
      cur.n += 1
      if (p.status === 'Approved') cur.approved += 1
      byType.set(p.type, cur)
    }
    return { total: apps.length, decided: decided.length, approvalRate: decided.length ? approved / decided.length : 0, refused, appeals: appeals.length, allowed, medianWeeks: weeks.length ? weeks[Math.floor(weeks.length / 2)] : undefined, byType: Array.from(byType.entries()).sort((a, b) => b[1].n - a[1].n) }
  }, [authority])
  return (
    <>
      <Section title="Applications on this title"><PlanningList apps={bundle.planning} /></Section>
      <Section title="Within 250 m"><PlanningList apps={bundle.nearbyPlanning.slice(0, 15)} /></Section>
      {stats && authority && (
        <Section title={`${authority}: decision statistics`}>
          <KV rows={[['Applications tracked', num(stats.total)], ['Approval rate', `${pct(stats.approvalRate)} of ${num(stats.decided)} decided`], ['Refusals', num(stats.refused)], ['Appeals', `${stats.appeals} lodged · ${stats.allowed} allowed${stats.appeals ? ` (${pct(stats.allowed / stats.appeals)})` : ''}`], ['Median time to decision', stats.medianWeeks !== undefined ? `${Math.round(stats.medianWeeks)} weeks` : '—']]} />
          <table className="mt-2 w-full text-xs"><thead className="text-left text-ink-500"><tr><th className="font-medium">Type</th><th className="text-right font-medium">Decided</th><th className="text-right font-medium">Approved</th></tr></thead><tbody>{stats.byType.map(([type, v]) => <tr key={type} className="border-t border-ink-100"><td className="py-1">{type}</td><td className="text-right tabular-nums">{v.n}</td><td className="text-right tabular-nums">{pct(v.approved / v.n)}</td></tr>)}</tbody></table>
          <p className="mt-2 text-[11px] text-ink-500">Computed from the applications loaded for this authority. Landstack and Searchland publish the equivalent as appeal trackers; here it sits beside the site.</p>
        </Section>
      )}
    </>
  )
}

function Rates({ bundle }: { bundle: SiteBundle }) {
  return (
    <>
      {bundle.hereditaments.map((h) => (
        <Section key={h.uarn} title="Business rates (VOA)" right={<SourceTag {...h} />}>
          <KV rows={[['Description', h.description], ['SCAT', h.scatCode], ['Rateable value', `${gbp(h.rateableValue)} · ${h.listYear} list`], ['Est. rates payable', gbp(Math.round(h.rateableValue * (h.rateableValue > 51000 ? 0.555 : 0.499)))], ['Total area', h.totalAreaSqm ? `${sqm(h.totalAreaSqm)} · ${sqft(h.totalAreaSqm)}` : 'Not area based'], ['RV per m²', h.totalAreaSqm ? gbp(Math.round(h.rateableValue / h.totalAreaSqm)) : '—'], ['Effective', dateShort(h.effectiveDate)], ['UARN', h.uarn]]} />
          {h.floors && (
            <table className="mt-2 w-full text-xs">
              <thead><tr className="text-left text-ink-500"><th className="py-1 font-medium">Floor</th><th className="font-medium">Use</th><th className="text-right font-medium">m²</th></tr></thead>
              <tbody>{h.floors.map((f) => <tr key={f.floor} className="border-t border-ink-100"><td className="py-1">{f.floor}</td><td>{f.use}</td><td className="text-right tabular-nums">{num(f.areaSqm)}</td></tr>)}</tbody>
            </table>
          )}
          <p className="mt-2 text-[11px] text-ink-500">VOA data under restricted terms: internal use only; attach the terms if passed on.</p>
        </Section>
      ))}
      {!bundle.hereditaments.length && <Section title="Business rates (VOA)"><div className="text-xs text-ink-500">No non-domestic hereditament matched to this UPRN.</div></Section>}
      {bundle.epcs.map((e) => (
        <Section key={e.certificateId} title={`EPC (${e.kind})`} right={<SourceTag {...e} />}>
          <div className="mb-2 flex items-center gap-2">
            <span className={cx('rounded px-2 py-0.5 text-sm font-bold text-white', e.rating <= 'B' ? 'bg-green-700' : e.rating <= 'D' ? 'bg-amber-600' : 'bg-rose-700')}>{e.rating}</span>
            <span className="text-sm">{e.score} · lodged {dateShort(e.lodgedAt)} · expires {dateShort(e.expiresAt)}</span>
          </div>
          <KV rows={[['MEES', ['F', 'G'].includes(e.rating) ? 'Sub-standard: cannot be let without exemption' : e.rating === 'E' || e.rating === 'D' ? 'Compliant now; below proposed 2030 minimum (B)' : 'Compliant'], ['Floor area', e.floorAreaSqm ? sqm(e.floorAreaSqm) : '—'], ['Main heating', e.mainHeating], ['Certificate', e.certificateId]]} />
        </Section>
      ))}
    </>
  )
}

function Mobility({ bundle }: { bundle: SiteBundle }) {
  const ff = bundle.footfall
  const avg = ff.length ? Math.round(ff.reduce((s, f) => s + f.monthlyVisits, 0) / ff.length) : 0
  const trend = ff.length ? ff.reduce((s, f) => s + f.trend12m, 0) / ff.length : 0
  return (
    <>
      <Section title="Footfall (mobile location; vendor feed not yet connected)">
        {ff.length ? <KV rows={[['Monthly visits (cell avg)', num(avg)], ['12-month trend', <span className={trend >= 0 ? 'text-green-700 dark:text-green-300' : 'text-rose-700 dark:text-rose-300'}>{trend >= 0 ? '+' : ''}{pct(trend, 1)}</span>], ['Avg dwell', `${Math.round(ff.reduce((s, f) => s + (f.dwellMinutes ?? 0), 0) / ff.length)} min`], ['Cells within 220 m', String(ff.length)]]} /> : <div className="text-xs text-ink-500">No footfall coverage here. Vendor feed not contracted.</div>}
      </Section>
      <Section title="Traffic counts within 600 m (DfT)">
        {bundle.traffic.length ? (
          <ul className="space-y-2">
            {bundle.traffic.map((t) => (
              <li key={t.countPointId} className="flex items-center justify-between gap-2 rounded-md border border-ink-100 p-2 text-xs">
                <div>
                  <div className="font-medium">{t.roadName} <span className="font-normal text-ink-500">· CP {t.countPointId}</span></div>
                  <div className="text-ink-500">{num(t.aadf)} AADF · {t.year} {t.method} · HGV {num(t.hgv)} · cycles {num(t.pedalCycles)}</div>
                </div>
                <Sparkline points={t.history.map((h) => h.aadf)} />
              </li>
            ))}
          </ul>
        ) : <div className="text-xs text-ink-500">No count point within 600 m. Minor roads are sampled on rotation by DfT.</div>}
      </Section>
    </>
  )
}

function Constraints({ bundle }: { bundle: SiteBundle }) {
  const kinds = useMemo(() => Array.from(new Set(bundle.constraints.map((c) => c.kind))), [bundle.constraints])
  return (
    <Section title="Constraints intersecting the title">
      {kinds.length ? (
        <ul className="space-y-2">
          {bundle.constraints.map((c) => (
            <li key={c.id} className="rounded-md border border-ink-100 p-2.5 text-xs">
              <div className="flex items-center justify-between"><span className="font-medium">{c.kind}{c.grade ? ` · Grade ${c.grade}` : ''}</span><SourceTag {...c} /></div>
              <div className="text-ink-600">{c.name}</div>
            </li>
          ))}
        </ul>
      ) : <div className="text-xs text-ink-500">No flood zone, heritage, Green Belt or Article 4 constraint intersects this title. Absence in the data is not proof of absence; coverage varies by authority.</div>}
    </Section>
  )
}

function PlanningDetail({ reference, onClose }: { reference: string; onClose: () => void }) {
  const [p, setP] = useState<PlanningApplication | null | undefined>(undefined)
  const select = useUi((s) => s.select)
  const nav = useNavigate()
  useEffect(() => {
    provider.getPlanning(reference).then((x) => setP(x ?? null))
  }, [reference])
  if (p === undefined) return <><Header title={reference} onClose={onClose} /><Spinner /></>
  if (!p) return <><Header title="Not found" onClose={onClose} /></>
  return (
    <>
      <Header title={p.reference} subtitle={p.address} onClose={onClose} badge={<Badge tone={statusTone(p.status)}>{p.status}</Badge>} />
      <div className="flex-1 overflow-y-auto" tabIndex={0}>
        <Section title="Proposal"><p className="text-sm">{p.description}</p></Section>
        <Section title="Details">
          <KV rows={[['Authority', p.authority], ['Type', p.type], ['Received', dateShort(p.receivedDate)], ['Decided', dateShort(p.decisionDate)], ['Applicant', p.applicant], ['Agent', p.agent], ['Title(s)', p.titleNumbers.map((t) => <button key={t} className="text-brand-700 hover:underline" onClick={() => { select({ type: 'title', id: t }); nav(`/map/title/${t}`) }}>{t}</button>)]]} />
        </Section>
        {p.summary && <Section title="Decision summary (AI extracted)"><p className="text-sm">{p.summary}</p></Section>}
        <Section title="Source"><a href={p.portalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm text-brand-700 hover:underline">Open on council portal <ExternalLink size={13} /></a><div className="mt-1"><SourceTag {...p} /></div></Section>
      </div>
    </>
  )
}

function ComparableDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [c, setC] = useState<Comparable | null | undefined>(undefined)
  useEffect(() => {
    provider.getComparable(id).then((x) => setC(x ?? null))
  }, [id])
  if (c === undefined) return <><Header title={id} onClose={onClose} /><Spinner /></>
  if (!c) return <><Header title="Not found" onClose={onClose} /></>
  return (
    <>
      <Header title={c.name} subtitle={`${c.address}, ${c.postcode}`} onClose={onClose} badge={<Badge tone={c.contributed ? 'brand' : 'neutral'}>{c.contributed ? 'Christie deal' : c.confidence}</Badge>} />
      <div className="flex-1 overflow-y-auto" tabIndex={0}>
        <Section title="Transaction">
          <div className="text-3xl font-semibold tabular-nums">{gbp(c.price)}</div>
          <div className="text-xs text-ink-500">{c.tenure} · sold {dateShort(c.date)} · buyer: {c.buyerType}</div>
          <div className="mt-3"><KV rows={[['Sector', `${c.sector}${c.subSector ? ` · ${c.subSector}` : ''}`], ['Capacity', c.capacity ? `${c.capacity} ${c.capacityLabel}` : '—'], ['Price per unit', c.pricePerUnit ? `${gbp(c.pricePerUnit)} per ${c.capacityLabel?.replace(/s$/, '')}` : '—'], ['Rateable value', gbp(c.rateableValue)], ['RV multiple', c.rvMultiple ? `${c.rvMultiple}x` : '—'], ['Turnover', gbp(c.turnover)], ['EBITDA', c.ebitda ? `${gbp(c.ebitda)} (${c.ebitdaMultiple}x)` : '—']]} /></div>
        </Section>
        <Section title="Source"><SourceTag {...c} /><div className="mt-1 text-[11px] text-ink-500">{c.contributed ? 'From Christie & Co transaction records. Internal use only.' : 'Derived from public registers; price paid as recorded by HM Land Registry.'}</div></Section>
        <Section title="Use in evidence"><Link to={`/comparables?sector=${encodeURIComponent(c.sector)}&lon=${c.location.coordinates[0]}&lat=${c.location.coordinates[1]}&radius=5000`} className="text-sm text-brand-700 hover:underline">Find similar comparables within 5 km</Link></Section>
      </div>
    </>
  )
}

/** A real business from Overture Maps places. Only what the source records; no synthetic attributes. */
function PoiDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [p, setP] = useState<(PlaceProps & { location: Point }) | null | undefined>(undefined)
  const [sales, setSales] = useState<(PricePaidRow & { distanceM: number })[]>([])
  const [nearby, setNearby] = useState<(PlaceProps & { distanceM: number })[]>([])
  const [inBuilding, setInBuilding] = useState<(PlaceProps & { distanceM: number })[]>([])
  const nav = useNavigate()
  useEffect(() => {
    provider.getPoi(id).then(async (x) => {
      setP(x ?? null)
      if (!x) return
      const [lon, lat] = x.location.coordinates
      setInBuilding((await provider.getPoisNear(lon, lat, 1)).filter((n) => n.id !== x.id))
      setSales(await provider.getPricePaidNear(lon, lat, 150, { limit: 8 }))
      setNearby((await provider.getPoisNear(lon, lat, 400, x.sector as never)).filter((n) => n.id !== x.id).slice(0, 8))
    })
  }, [id])
  if (p === undefined) return <><Header title="Loading" onClose={onClose} /><Spinner /></>
  if (!p) return <><Header title="Not found" onClose={onClose} /></>
  const [lon, lat] = p.location.coordinates
  const label = p.category.replace(/_/g, ' ')
  return (
    <>
      <Header title={p.name ?? label} subtitle={[p.address, p.postcode].filter(Boolean).join(', ') || p.locality} onClose={onClose} badge={<Badge tone="brand">Real · Overture</Badge>} />
      <div className="flex flex-wrap gap-1.5 border-b border-ink-100 px-4 py-2">
        <Button size="sm" variant="secondary" onClick={() => nav(`/catchment?lon=${lon}&lat=${lat}&label=${encodeURIComponent(p.name ?? label)}`)}>Catchment</Button>
        <Button size="sm" variant="secondary" onClick={() => useUi.getState().requestFlyTo(lon, lat, 18)}>Zoom</Button>
        {p.website && <a className="btn text-xs" href={p.website} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Website</a>}
      </div>
      <div className="flex-1 overflow-y-auto" tabIndex={0}>
        {inBuilding.length > 0 && (
          <Section title={`Also in this building (${inBuilding.length})`}>
            <ul className="divide-y divide-ink-100 text-xs">{inBuilding.map((n) => <li key={n.id} className="flex cursor-pointer items-center justify-between py-1.5 hover:bg-ink-50" onClick={() => { useUi.getState().select({ type: 'poi', id: n.id }); nav(`/map/poi/${encodeURIComponent(n.id)}`) }}><span className="truncate font-medium">{n.name ?? n.category}</span><span className="shrink-0 text-ink-500">{n.category.replace(/_/g, ' ')}</span></li>)}</ul>
            <p className="mt-1 text-[10px] text-ink-400">One footprint, several units: the map shows them as a single dot with a count.</p>
          </Section>
        )}
        <Section title="What the source records">
          <KV rows={[['Category', `${label} (${p.sector})`], ['Brand', p.brand ?? '—'], ['Phone', p.phone ?? '—'], ['Postcode', p.postcode ?? '—'], ['Source confidence', `${Math.round(p.confidence * 100)}%`]]} />
          {p.placed === 'building' && <p className="mt-2 text-[11px] text-ink-500">Pin placed at the centre of the building footprint{p.orig ? `; the listing's own point is ${Math.round(haversineM(p.orig, p.location.coordinates))} m away, on the street frontage` : ''}.</p>}
          <p className="mt-2 text-[11px] text-ink-500">Overture Maps places, CDLA-Permissive-2.0. Ownership, operator, regulator and rating data are not yet connected for real businesses; the Ownership and Operator tabs will populate once HM Land Registry, Companies House and the sector registers are licensed.</p>
        </Section>
        <Section title={`Same sector within 400 m (${nearby.length})`}>
          {nearby.length ? <ul className="divide-y divide-ink-100 text-xs">{nearby.map((n) => <li key={n.id} className="flex cursor-pointer items-center justify-between py-1.5 hover:bg-ink-50" onClick={() => { useUi.getState().select({ type: 'poi', id: n.id }); nav(`/map/poi/${encodeURIComponent(n.id)}`) }}><span className="truncate font-medium">{n.name ?? n.category}</span><span className="shrink-0 text-ink-500">{n.distanceM} m</span></li>)}</ul> : <div className="text-xs text-ink-500">None recorded.</div>}
        </Section>
        <Section title={`HM Land Registry sales within 150 m (${sales.length})`}>
          {sales.length ? <ul className="divide-y divide-ink-100 text-xs">{sales.map((r) => <li key={r.id} className="flex cursor-pointer items-center justify-between py-1.5 hover:bg-ink-50" onClick={() => { useUi.getState().select({ type: 'sale', id: r.id }); nav(`/map/sale/${encodeURIComponent(r.id)}`) }}><span className="truncate"><span className="font-medium">{gbp(r.price)}</span> · {r.address}</span><span className="shrink-0 text-ink-500">{dateShort(r.date)}{r.type === 'O' ? ' · non-res' : ''}</span></li>)}</ul> : <div className="text-xs text-ink-500">None geocoded nearby.</div>}
        </Section>
      </div>
    </>
  )
}

/** HM Land Registry price paid transaction. */
function SaleDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [r, setR] = useState<PricePaidRow | null | undefined>(undefined)
  const [near, setNear] = useState<(PricePaidRow & { distanceM: number })[]>([])
  const nav = useNavigate()
  useEffect(() => {
    provider.getPricePaid(id).then(async (x) => {
      setR(x ?? null)
      if (x && x.lon !== null && x.lat !== null) setNear((await provider.getPricePaidNear(x.lon, x.lat, 250, { limit: 12 })).filter((n) => n.id !== x.id))
    })
  }, [id])
  if (r === undefined) return <><Header title="Loading" onClose={onClose} /><Spinner /></>
  if (!r) return <><Header title="Not found" onClose={onClose} /></>
  return (
    <>
      <Header title={r.address || r.postcode} subtitle={`${r.locality ? `${r.locality}, ` : ''}${r.town} ${r.postcode}`} onClose={onClose} badge={<Badge tone={r.type === 'O' ? 'brand' : 'neutral'}>{r.type === 'O' ? 'Non-residential' : 'Residential'}</Badge>} />
      <div className="flex-1 overflow-y-auto" tabIndex={0}>
        <Section title="Transaction">
          <div className="text-3xl font-semibold tabular-nums">{gbp(r.price)}</div>
          <div className="text-xs text-ink-500">{r.tenure} · completed {dateShort(r.date)}{r.newBuild ? ' · new build' : ''}</div>
          <div className="mt-3"><KV rows={[['Property type', PRICE_PAID_TYPE[r.type]], ['PPD category', r.category === 'A' ? 'A: standard price paid' : 'B: additional (repossessions, buy-to-let portfolios, transfers under a power of sale, non-market)'], ['Location', r.geocode === 'postcode' ? 'Approximate: postcode centroid' : r.geocode === 'sector' ? 'Approximate: postcode sector only' : 'Not geocoded']]} /></div>
          <p className="mt-2 text-[11px] text-ink-500">HM Land Registry Price Paid Data, Open Government Licence v3. Contains HM Land Registry data © Crown copyright and database right 2026. Positions are approximated from the postcode until an address gazetteer (AddressBase) is licensed.</p>
        </Section>
        <Section title={`Other sales within 250 m (${near.length})`}>
          {near.length ? <ul className="divide-y divide-ink-100 text-xs">{near.map((n) => <li key={n.id} className="flex cursor-pointer items-center justify-between py-1.5 hover:bg-ink-50" onClick={() => { useUi.getState().select({ type: 'sale', id: n.id }); nav(`/map/sale/${encodeURIComponent(n.id)}`) }}><span className="truncate"><span className="font-medium">{gbp(n.price)}</span> · {n.address}</span><span className="shrink-0 text-ink-500">{dateShort(n.date)}{n.type === 'O' ? ' · non-res' : ''}</span></li>)}</ul> : <div className="text-xs text-ink-500">None.</div>}
        </Section>
      </div>
    </>
  )
}

function TrafficDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [t, setT] = useState<TrafficCount | null>(null)
  const view = useUi((s) => s.mapView)
  useEffect(() => {
    provider.getTrafficNear(view.lon, view.lat, 5000).then((ts) => setT(ts.find((x) => x.countPointId === id) ?? null))
  }, [id, view.lon, view.lat])
  if (!t) return <><Header title={`Count point ${id}`} onClose={onClose} /><Spinner /></>
  return (
    <>
      <Header title={t.roadName} subtitle={`DfT count point ${t.countPointId} · ${t.roadType} road`} onClose={onClose} />
      <div className="flex-1 overflow-y-auto" tabIndex={0}>
        <Section title={`Annual average daily flow (${t.year}, ${t.method})`}>
          <div className="text-3xl font-semibold tabular-nums">{num(t.aadf)}</div>
          <div className="text-xs text-ink-500">vehicles per day, both directions</div>
          <div className="mt-3"><Sparkline points={t.history.map((h) => h.aadf)} width={380} height={60} /></div>
          <div className="flex justify-between text-[10px] text-ink-500"><span>{t.history[0]?.year}</span><span>{t.history[t.history.length - 1]?.year}</span></div>
        </Section>
        <Section title="Composition"><KV rows={[['Cars & taxis', num(t.cars)], ['Light goods', num(t.lgv)], ['Heavy goods', num(t.hgv)], ['Pedal cycles', num(t.pedalCycles)]]} /></Section>
        <Section title="History">
          <table className="w-full text-xs"><tbody>{t.history.slice().reverse().map((h) => <tr key={h.year} className="border-t border-ink-100"><td className="py-1">{h.year}</td><td className="text-right tabular-nums">{num(h.aadf)}</td></tr>)}</tbody></table>
          <div className="mt-2"><SourceTag {...t} /></div>
        </Section>
      </div>
    </>
  )
}


/** "What is here?": everything the platform knows about an arbitrary dropped pin. */
function PointDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const [lon, lat] = id.split(',').map(Number)
  const [title, setTitle] = useState<Title | null | undefined>(undefined)
  const [near, setNear] = useState<{ businesses: (Business & { distanceM: number })[]; places: (PlaceProps & { distanceM: number })[]; sales: (PricePaidRow & { distanceM: number })[]; traffic: TrafficCount[] } | null>(null)
  const nav = useNavigate()
  const { addWatch, setPin } = useUi()
  useEffect(() => {
    setPin([lon, lat])
    provider.getTitleAt(lon, lat).then((t) => setTitle(t ?? null))
    Promise.all([provider.getBusinessesNear(lon, lat, 200), provider.getPoisNear(lon, lat, 150), provider.getPricePaidNear(lon, lat, 150, { limit: 6 }), provider.getTrafficNear(lon, lat, 600)]).then(([businesses, places, sales, traffic]) => setNear({ businesses, places, sales, traffic }))
  }, [id, lon, lat, setPin])
  const postcode = near?.places[0]?.postcode ?? near?.businesses[0]?.postcode ?? title?.postcode
  return (
    <>
      <Header title="Dropped pin" subtitle={`${lat.toFixed(5)}, ${lon.toFixed(5)}${postcode ? ` · near ${postcode}` : ''}`} onClose={onClose} badge={<Badge tone="brand">What is here</Badge>} />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-100 px-4 py-2">
        <a className="btn-secondary btn-sm" href={`https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}`} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Street View</a>
        <Button size="sm" onClick={() => addWatch({ entityType: 'area', entityId: id, label: `Pin near ${postcode ?? `${lat.toFixed(4)}, ${lon.toFixed(4)}`}`, radiusM: 250 })}><Bookmark size={13} /> Watch this spot</Button>
        <Button size="sm" onClick={() => navigator.clipboard?.writeText(`${lat.toFixed(6)}, ${lon.toFixed(6)}`)}><Copy size={13} /> Coordinates</Button>
        <Button size="sm" onClick={() => { setPin(undefined); onClose() }}>Clear pin</Button>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Section title="Registered title at this point">
          {title === undefined ? <Spinner /> : title ? (
            <button className="w-full rounded-md border border-ink-200 p-2.5 text-left hover:bg-ink-50" onClick={() => { useUi.getState().select({ type: 'title', id: title.titleNumber }); nav(`/map/title/${title.titleNumber}`) }}>
              <div className="text-sm font-medium">{title.address}</div>
              <div className="text-xs text-ink-500">{title.titleNumber} · {title.tenure} · {title.proprietors.map((p) => (p.redacted ? 'Private individual' : p.name)).join(', ')} · {sqm(title.areaSqm)}</div>
            </button>
          ) : <div className="text-xs text-ink-500">No registered title covers this point in the loaded data. Title polygons are loaded for the West Midlands and West of England so far; other areas appear as HM Land Registry INSPIRE polygons are added.</div>}
        </Section>
        <Section title={`Businesses within 200 m (${near ? near.businesses.length + near.places.length : '…'})`}>
          {near && (near.businesses.length || near.places.length) ? <ul className="divide-y divide-ink-100 text-xs">
            {near.businesses.slice(0, 6).map((b) => <li key={b.businessId} className="flex cursor-pointer items-center justify-between py-1.5 hover:bg-ink-50" onClick={() => { useUi.getState().select({ type: 'business', id: b.businessId }); nav(`/map/business/${b.businessId}`) }}><span className="truncate"><span className="font-medium">{b.name}</span> <Badge tone="warning">Demo</Badge> <span className="text-ink-500">{b.sector}</span></span><span className="shrink-0 text-ink-500">{b.distanceM} m</span></li>)}
            {near.places.slice(0, 8).map((p) => <li key={p.id} className="flex cursor-pointer items-center justify-between py-1.5 hover:bg-ink-50" onClick={() => { useUi.getState().select({ type: 'poi', id: p.id }); nav(`/map/poi/${encodeURIComponent(p.id)}`) }}><span className="truncate"><span className="font-medium">{p.name ?? p.category}</span> <span className="text-ink-500">{p.category.replace(/_/g, ' ')}</span></span><span className="shrink-0 text-ink-500">{p.distanceM} m</span></li>)}
          </ul> : <div className="text-xs text-ink-500">{near ? 'None recorded.' : 'Looking…'}</div>}
        </Section>
        <Section title={`HM Land Registry sales within 150 m (${near?.sales.length ?? '…'})`}>
          {near?.sales.length ? <ul className="divide-y divide-ink-100 text-xs">{near.sales.map((r) => <li key={r.id} className="flex cursor-pointer items-center justify-between py-1.5 hover:bg-ink-50" onClick={() => { useUi.getState().select({ type: 'sale', id: r.id }); nav(`/map/sale/${encodeURIComponent(r.id)}`) }}><span className="truncate"><span className="font-medium">{gbp(r.price)}</span> · {r.address || r.postcode}</span><span className="shrink-0 text-ink-500">{dateShort(r.date)}</span></li>)}</ul> : <div className="text-xs text-ink-500">{near ? 'None.' : 'Looking…'}</div>}
        </Section>
        <Section title="Traffic">
          {near?.traffic[0] ? <div className="text-xs">{num(near.traffic[0].aadf)} vehicles/day on {near.traffic[0].roadName} ({near.traffic[0].year}, DfT count within 600 m)</div> : <div className="text-xs text-ink-500">No DfT count point within 600 m.</div>}
        </Section>
      </div>
    </>
  )
}
