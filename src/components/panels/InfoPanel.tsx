import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { X, Bookmark, BookmarkCheck, FileText, ExternalLink, Download, Building2, AlertTriangle, Printer, Copy } from 'lucide-react'
import { provider, type Business, type DocumentOrder, type PlanningApplication, type TrafficCount, type Company, type LeaseSummary, type Comparable } from '@/data'
import { useUi } from '@/store/ui'
import { useSite, type SiteBundle } from '@/hooks/useSite'
import { Badge, Button, KV, Spinner, Tabs, Sparkline, cx, Empty } from '@/components/ui'
import { SECTOR_COLOURS, SECTOR_ICON } from '@/lib/sectors'
import { gbp, num, sqm, sqft, dateShort, ago, monthsUntil, pct } from '@/lib/format'

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
        badge={b ? <Badge tone="neutral"><span style={{ color: SECTOR_COLOURS[b.sector] }}>●</span> {b.sector}</Badge> : <Badge>{t.tenure}</Badge>}
      />
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-100 px-4 py-2">
        <Button size="sm" variant={watched ? 'secondary' : 'primary'} onClick={() => (watched ? removeWatch(watchlist.find((w) => w.entityId === t.titleNumber)!.id) : addWatch({ entityType: 'title', entityId: t.titleNumber, label: b ? b.name : t.address }))}>
          {watched ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} {watched ? 'In My Sites' : 'Add to My Sites'}
        </Button>
        <Link to={`/report/${t.titleNumber}`} target="_blank" className="btn-secondary btn-sm"><Printer size={14} /> Report</Link>
        {b && <Link to={`/appraisal/${b.businessId}`} target="_blank" className="btn-secondary btn-sm">Appraise</Link>}
        <Link to={`/catchment?lon=${bundle.centre[0]}&lat=${bundle.centre[1]}&label=${encodeURIComponent(b ? b.name : t.address)}`} className="btn-secondary btn-sm">Catchment</Link>
        <Button size="sm" onClick={() => requestFlyTo(bundle.centre[0], bundle.centre[1], 18)}>Zoom</Button>
        <Button size="sm" onClick={() => navigator.clipboard?.writeText(window.location.href)}><Copy size={14} /> Link</Button>
        {distress.length > 0 && <Badge tone="critical" className="ml-auto"><AlertTriangle size={11} /> {distress.length} signal{distress.length > 1 ? 's' : ''}</Badge>}
      </div>
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      <div className="flex-1 overflow-y-auto">
        {tab === 'overview' && <Overview bundle={bundle} b={b} />}
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

function Overview({ bundle, b }: { bundle: SiteBundle; b: Business | null }) {
  const t = bundle.title
  const h = bundle.hereditaments[0]
  const e = bundle.epcs[0]
  const lease = bundle.leases[0]
  const expiry = monthsUntil(lease?.expiryDate)
  const reg = b?.registers.find((r) => r.rating || r.capacity)
  return (
    <>
      {b && b.distressFlags.length > 0 && (
        <div className="m-4 mb-0 rounded-md border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/40 px-3 py-2 text-xs text-rose-800 dark:text-rose-200">
          <div className="font-semibold">Distress signals</div>
          <div className="mt-1 flex flex-wrap gap-1">{b.distressFlags.map((f) => <Badge key={f} tone="critical">{f}</Badge>)}</div>
        </div>
      )}
      <Section title="At a glance">
        <KV
          rows={[
            ['Freeholder', t.proprietors.map((p) => (p.redacted ? 'Private individual (buy register)' : p.name)).join(', ')],
            ['Occupier', b ? `${b.operatorName} (${b.tenure})` : h ? h.description : '—'],
            ['Rateable value', h ? `${gbp(h.rateableValue)} (${h.listYear} list)` : '—'],
            ['Floor area', h?.totalAreaSqm ? `${sqm(h.totalAreaSqm)} · ${sqft(h.totalAreaSqm)}` : '—'],
            ['Site area', `${sqm(t.areaSqm)} · ${(t.areaSqm / 4046.86).toFixed(2)} acres`],
            ['EPC', e ? <span><Badge tone={['A+', 'A', 'B', 'C'].includes(e.rating) ? 'good' : e.rating === 'D' || e.rating === 'E' ? 'warning' : 'critical'}>{e.rating} ({e.score})</Badge> {['F', 'G'].includes(e.rating) ? 'Below MEES minimum' : ''}</span> : '—'],
            ['Lease', lease ? `${lease.termYears} yrs from ${dateShort(lease.dateOfLease)} · expires ${dateShort(lease.expiryDate)}${expiry !== undefined ? ` (${expiry} mo)` : ''}` : t.leases.length ? '' : 'None registered'],
            [reg ? `${reg.register} record` : 'Register', reg ? `${reg.rating ?? ''}${reg.capacity ? ` · ${reg.capacity} ${reg.capacityLabel}` : ''}` : '—'],
            ['Last sold', t.pricePaid ? `${gbp(t.pricePaid)} · ${dateShort(t.pricePaidDate)}` : '—'],
            ['Planning', `${bundle.planning.length} on title · ${bundle.nearbyPlanning.length} within 250 m`],
            ['Traffic', bundle.traffic[0] ? `${num(bundle.traffic[0].aadf)} vehicles/day on ${bundle.traffic[0].roadName}` : 'No DfT count within 600 m'],
            ['Footfall', bundle.footfall.length ? `${num(Math.round(bundle.footfall.reduce((s, f) => s + f.monthlyVisits, 0) / bundle.footfall.length))} visits/month (cell avg)` : 'No coverage'],
          ]}
        />
      </Section>
      <Section title="Identifiers">
        <KV rows={[['Title number', t.titleNumber], ['INSPIRE ID', String(t.inspireId)], ['UPRN', t.uprn], ['VOA UARN', h?.uarn], ['EPC', e?.certificateId], ...(b?.registers.map((r) => [r.register, r.registerId] as [string, string]) ?? [])]} />
      </Section>
      <Section title="Sources">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          <SourceTag {...t} />
          {h && <SourceTag {...h} />}
          {e && <SourceTag {...e} />}
          {b?.registers.map((r) => <SourceTag key={r.registerId} {...r} />)}
        </div>
      </Section>
    </>
  )
}

function OrderButton({ titleNumber, kind, label, onOrdered, disabled }: { titleNumber: string; kind: DocumentOrder['kind']; label: string; onOrdered: () => void; disabled?: boolean }) {
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
    <Button size="sm" disabled={disabled} onClick={async () => setOrder(await provider.orderDocument(titleNumber, kind))}>
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
  return (
    <>
      <Section title="Applications on this title"><PlanningList apps={bundle.planning} /></Section>
      <Section title="Within 250 m"><PlanningList apps={bundle.nearbyPlanning.slice(0, 15)} /></Section>
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
      <Section title="Footfall (mobile location, demo vendor cells)">
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
      <div className="flex-1 overflow-y-auto">
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
      <div className="flex-1 overflow-y-auto">
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
      <div className="flex-1 overflow-y-auto">
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
