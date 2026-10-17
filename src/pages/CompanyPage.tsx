import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bookmark, BookmarkCheck, ExternalLink, MapPin, Download, BellPlus, Upload } from 'lucide-react'
import { useAlerts } from '@/store/alerts'
import { useAuth } from '@/auth'
import { blankRule } from '@/lib/alerts'
import { logAudit } from '@/lib/audit'
import { canDownload } from '@/lib/env'
import { centroid } from '@/lib/geo'
import type { Polygon } from 'geojson'
import { provider, type Business, type Company, type Title } from '@/data'
import { Badge, Button, Card, KV, Spinner, Stat } from '@/components/ui'
import { dateShort, gbp, sqm } from '@/lib/format'
import { SECTOR_COLOURS } from '@/lib/sectors'
import { useUi } from '@/store/ui'
import { useShallow } from 'zustand/react/shallow'

export function CompanyPage() {
  const { companyNumber = '' } = useParams()
  const [company, setCompany] = useState<Company | null | undefined>(undefined)
  const [group, setGroup] = useState<Company[]>([])
  const [titles, setTitles] = useState<Title[]>([])
  const [biz, setBiz] = useState<Business[]>([])
  const nav = useNavigate()
  const { addWatch, removeWatch, isWatched, watchlist, select, requestFlyTo, setHighlight } = useUi(useShallow((s) => ({ addWatch: s.addWatch, removeWatch: s.removeWatch, isWatched: s.isWatched, watchlist: s.watchlist, select: s.select, requestFlyTo: s.requestFlyTo, setHighlight: s.setHighlight })))
  const user = useAuth((s) => s.user)
  useEffect(() => {
    provider.getCompany(companyNumber).then((c) => setCompany(c ?? null))
    provider.getCompanyGroup(companyNumber).then(setGroup)
    provider.getTitlesForCompany(companyNumber).then(setTitles)
    provider.getBusinessesForCompany(companyNumber).then(setBiz)
  }, [companyNumber])
  if (company === undefined) return <Spinner />
  if (!company) return <div className="p-6">Company not found.</div>
  const watched = isWatched('company', companyNumber)
  const tone = company.status === 'active' ? 'good' : ['dissolved', 'dormant'].includes(company.status) ? 'neutral' : 'critical'
  const operated = biz.filter((b) => group.some((g) => g.companyNumber === b.operatorCompanyNumber))
  const owned = biz.filter((b) => group.some((g) => g.companyNumber === b.freeholderCompanyNumber))
  const distressed = biz.filter((b) => b.distressFlags.length)
  const plot = () => {
    setHighlight(biz.map((b) => b.businessId), `${company.name} portfolio`)
    const first = biz[0]?.location.coordinates ?? (titles[0] ? centroid(titles[0].geometry as Polygon) : undefined)
    if (first) requestFlyTo(first[0], first[1], 14.5)
    nav('/map')
  }
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const rows = [
      ['Kind', 'Name / address', 'Role', 'Sector', 'Tenure', 'Title', 'Postcode', 'Site area m2', 'Price paid', 'Proprietor since', 'Leases', 'Register', 'Rating', 'Distress flags', 'Entity company'],
      ...biz.map((b) => ['Trading site', b.name, group.some((g) => g.companyNumber === b.operatorCompanyNumber) ? 'Operator' : 'Freeholder', b.sector, b.tenure, b.titleNumber, b.postcode, '', '', '', '', b.registers[0]?.register, b.registers[0]?.rating, b.distressFlags.join('; '), group.find((g) => g.companyNumber === b.operatorCompanyNumber || g.companyNumber === b.freeholderCompanyNumber)?.name]),
      ...titles.map((t) => ['Freehold title', t.address, 'Freeholder', '', t.tenure, t.titleNumber, t.postcode, t.areaSqm, t.pricePaid, t.dateProprietorAdded, t.leases.length, '', '', '', t.proprietors.find((p) => p.companyNumber)?.name]),
    ]
    const csv = `# Portfolio of ${company.name} and group. Contains HM Land Registry CCOD data: not for direct marketing. Internal use only.\n` + rows.map((r) => r.map(esc).join(',')).join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `portfolio-${company.companyNumber}.csv`
    a.click()
    logAudit('export', `Portfolio CSV: ${company.name} (${rows.length - 1} rows)`, { entityType: 'company', entityId: company.companyNumber, licences: ['HMLR-CCOD'], count: rows.length - 1 })
  }
  const alertOnPortfolio = () => {
    const r = blankRule(user?.id ?? 'demo-agent', { name: `Portfolio: ${company.name}`, tag: 'Portfolio', description: `Anything on a site ${company.name} or its group owns or operates`, scope: { mode: 'sites', radiusM: 0, siteIds: Array.from(new Set([...biz.map((b) => b.businessId), ...titles.map((t) => t.titleNumber), ...group.map((g) => g.companyNumber)])), postcodes: [], offices: [] }, frequency: 'instant' })
    useAlerts.getState().upsertRule(r)
    nav(`/alerts/rules/${r.id}`)
  }
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><h1 className="text-xl font-semibold">{company.name}</h1><Badge tone={tone}>{company.status}</Badge>{company.accountsOverdue && <Badge tone="warning">accounts overdue</Badge>}</div>
          <p className="text-sm text-ink-500">{company.companyNumber} · incorporated {dateShort(company.incorporated)} · SIC {company.sicCodes.join(', ')} · {company.registeredAddress}</p>
        </div>
        <div className="flex gap-2">
          <Button variant={watched ? 'secondary' : 'primary'} onClick={() => (watched ? removeWatch(watchlist.find((w) => w.entityId === companyNumber)!.id) : addWatch({ entityType: 'company', entityId: companyNumber, label: company.name }))}>{watched ? <BookmarkCheck size={14} /> : <Bookmark size={14} />} {watched ? 'Watching' : 'Watch company'}</Button>
          <Button onClick={plot} disabled={!biz.length && !titles.length} title="Highlight every site the group owns or operates on the map"><MapPin size={14} /> Plot portfolio</Button>
          <Button onClick={alertOnPortfolio} title="Instant alert for anything on any site in the portfolio"><BellPlus size={14} /> Alert on portfolio</Button>
          <Button onClick={exportCsv} disabled={!canDownload || (!biz.length && !titles.length)}><Download size={14} /> CSV</Button>
          <Button onClick={() => nav(`/crm/export?source=watchlist`)} title="Add the portfolio to My Sites first, then export"><Upload size={14} /> To CRM</Button>
          <a className="btn-secondary" href={`https://find-and-update.company-information.service.gov.uk/company/${company.companyNumber}`} target="_blank" rel="noreferrer">Companies House <ExternalLink size={13} /></a>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Stat label="Freehold titles (group)" value={titles.length} sub={`${sqm(titles.reduce((s, t) => s + t.areaSqm, 0))} total`} />
        <Stat label="Sites operated" value={operated.length} />
        <Stat label="Sites owned & let" value={owned.length} />
        <Stat label="Sites with distress signals" value={distressed.length} tone={distressed.length ? 'critical' : 'neutral'} sub={distressed.slice(0, 2).map((b) => b.name).join(', ') || 'none'} />
        <Stat label="Outstanding charges" value={company.charges.filter((c) => !c.satisfied).length} tone={company.charges.some((c) => !c.satisfied) ? 'warning' : 'neutral'} sub={company.charges.filter((c) => !c.satisfied).map((c) => c.lender).join(', ') || 'none'} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Company">
          <KV rows={[['Officers', company.officers.map((o) => `${o.name} (${o.role})`).join('; ')], ['Persons with significant control', company.pscs.map((p) => p.name).join('; ')], ['Parent', company.parentCompanyNumber ? <Link className="text-brand-700" to={`/companies/${company.parentCompanyNumber}`}>{group.find((g) => g.companyNumber === company.parentCompanyNumber)?.name ?? company.parentCompanyNumber}</Link> : 'None (top of group)'], ['Last accounts', dateShort(company.lastAccountsMadeUpTo)], ['Gazette', company.gazetteNotices.length ? company.gazetteNotices.map((g) => `${g.type} (${dateShort(g.date)})`).join('; ') : 'No notices']]} />
        </Card>
        <Card title={`Group structure · ${group.length}`} padded={false}>
          <ul className="divide-y divide-ink-100">{group.map((g) => <li key={g.companyNumber} className="flex items-center justify-between px-4 py-2 text-sm"><Link to={`/companies/${g.companyNumber}`} className={g.companyNumber === companyNumber ? 'font-semibold' : 'text-brand-700 hover:underline'}>{g.parentCompanyNumber ? '└ ' : ''}{g.name}</Link><Badge tone={g.status === 'active' ? 'good' : 'critical'}>{g.status}</Badge></li>)}</ul>
        </Card>
        <Card title="Charges" padded={false}>
          <ul className="divide-y divide-ink-100 text-sm">{company.charges.length ? company.charges.map((c, i) => <li key={i} className="flex items-center justify-between px-4 py-2"><span>{c.lender}</span><span className="text-xs text-ink-500">{dateShort(c.created)} {c.satisfied ? '· satisfied' : ''}</span></li>) : <li className="px-4 py-3 text-xs text-ink-500">No charges registered.</li>}</ul>
        </Card>
      </div>
      <Card title={`Trading sites · ${biz.length}`} padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-ink-500"><tr><th className="px-4 py-2 font-medium">Business</th><th className="font-medium">Role</th><th className="font-medium">Tenure</th><th className="font-medium">Register</th><th className="font-medium">Signals</th></tr></thead>
          <tbody>{biz.map((b) => <tr key={b.businessId} className="cursor-pointer border-t border-ink-100 hover:bg-ink-50" onClick={() => { select({ type: 'business', id: b.businessId }); requestFlyTo(b.location.coordinates[0], b.location.coordinates[1], 17.5); nav(`/map/business/${b.businessId}`) }}><td className="px-4 py-2"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SECTOR_COLOURS[b.sector] }} /><div><div className="font-medium">{b.name}</div><div className="text-xs text-ink-500">{b.sector} · {b.address}</div></div></div></td><td className="text-xs">{group.some((g) => g.companyNumber === b.operatorCompanyNumber) ? 'Operator' : 'Freeholder'}</td><td className="text-xs">{b.tenure}</td><td className="text-xs">{b.registers[0] ? `${b.registers[0].register}${b.registers[0].rating ? ` · ${b.registers[0].rating}` : ''}` : '—'}</td><td><div className="flex gap-1">{b.distressFlags.slice(0, 2).map((f) => <Badge key={f} tone="critical">{f}</Badge>)}</div></td></tr>)}</tbody>
        </table>
      </Card>
      <Card title={`Freehold titles held · ${titles.length}`} padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left text-xs text-ink-500"><tr><th className="px-4 py-2 font-medium">Title</th><th className="font-medium">Address</th><th className="font-medium text-right">Site area</th><th className="font-medium">Added</th><th className="font-medium text-right">Price paid</th><th className="font-medium">Leases</th></tr></thead>
          <tbody>{titles.map((t) => <tr key={t.titleNumber} className="cursor-pointer border-t border-ink-100 hover:bg-ink-50" onClick={() => { select({ type: 'title', id: t.titleNumber }); nav(`/map/title/${t.titleNumber}`) }}><td className="px-4 py-2 font-mono text-xs">{t.titleNumber}</td><td className="text-xs">{t.address}</td><td className="text-right text-xs tabular-nums">{sqm(t.areaSqm)}</td><td className="text-xs">{dateShort(t.dateProprietorAdded)}</td><td className="text-right text-xs tabular-nums">{gbp(t.pricePaid)}</td><td className="text-xs">{t.leases.length}</td></tr>)}</tbody>
        </table>
      </Card>
    </div>
  )
}
