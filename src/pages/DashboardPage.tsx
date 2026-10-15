import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { provider, type Alert, type Business, type DashboardStats, type LeaseSummary, type Title } from '@/data'
import { Stat, Card, BarList, Badge, Button } from '@/components/ui'
import { SECTOR_COLOURS } from '@/lib/sectors'
import { useUi } from '@/store/ui'
import { ago, dateShort, monthsUntil, gbp } from '@/lib/format'
import { AlertTriangle, ArrowRight } from 'lucide-react'
import { DEFAULT_FILTERS } from '@/data/types'

export function DashboardPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [titles] = useState<Title[]>([])
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const nav = useNavigate()
  const { watchlist, setFilters, resetFilters, select } = useUi()
  useEffect(() => {
    provider.getAlerts().then(setAlerts).catch(() => setAlerts([]))
    provider.sourceBusinesses({ ...DEFAULT_FILTERS, distressOnly: true }).then(setBusinesses).catch(() => setBusinesses([]))
    provider.getDashboard().then(setStats).catch(() => setStats(null))
  }, [])
  const distressed = businesses.filter((b) => b.distressFlags.length)
  const bySector = useMemo(() => (stats?.bySector ?? []).map(({ sector, count }) => ({ label: sector, value: count, colour: SECTOR_COLOURS[sector as keyof typeof SECTOR_COLOURS] })), [stats])
  const leases: (LeaseSummary & { biz?: Business })[] = useMemo(
    () => titles.flatMap((t) => t.leases.map((l) => ({ ...l, biz: businesses.find((b) => b.titleNumber === t.titleNumber) }))).filter((l) => { const m = monthsUntil(l.expiryDate); return m !== undefined && m >= 0 && m <= 36 }).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)),
    [titles, businesses],
  )
  const openBiz = (b: Business) => {
    select({ type: 'business', id: b.businessId })
    nav(`/map/business/${b.businessId}`)
  }
  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink-900">Market dashboard</h1>
          <p className="text-sm text-ink-500">England &amp; Wales · all figures from the connected sources, refreshed on their own cadence.</p>
        </div>
        <Link to="/map" className="btn-primary shrink-0">Open map <ArrowRight size={14} /></Link>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Trading businesses tracked" value={(stats?.businesses ?? 0).toLocaleString()} sub="across the registered sectors" />
        <Stat label="With distress signals" value={(stats?.distressed ?? distressed.length).toLocaleString()} tone={(stats?.distressed ?? distressed.length) ? 'critical' : 'neutral'} sub="insolvency, late accounts, regulator, FHRS" />
        <Stat label="Lease events next 36 mo" value={(stats?.leaseEvents36m ?? leases.length).toLocaleString()} tone="warning" sub="registered leases expiring" />
        <Stat label="Titles mapped" value={(stats?.titles ?? 0).toLocaleString()} sub={`${(stats?.corporateTitles ?? 0).toLocaleString()} corporately owned`} />
        <Stat label="Unread alerts" value={alerts.filter((a) => !a.read).length} sub={<Link to="/alerts" className="text-brand-700">view feed</Link>} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title="Latest alerts" actions={<Link to="/alerts" className="text-xs text-brand-700">All alerts</Link>} className="lg:col-span-2" padded={false}>
          <ul className="divide-y divide-ink-100">
            {alerts.slice(0, 7).map((a) => (
              <li key={a.alertId} className="flex items-start gap-3 px-4 py-2.5">
                <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${a.severity === 'critical' ? 'bg-rose-600' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500'}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className="truncate text-sm font-medium text-ink-900">{a.title}</span>{a.sector && <Badge>{a.sector}</Badge>}</div>
                  <div className="truncate text-xs text-ink-500">{a.detail}</div>
                </div>
                <span className="shrink-0 text-[11px] text-ink-400">{ago(a.occurredAt)}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Businesses by sector">
          <BarList rows={bySector} />
        </Card>
        <Card title="Distressed operators" actions={<Button size="sm" onClick={() => { resetFilters(); setFilters({ distressOnly: true }); nav('/sourcing') }}>Source these</Button>} className="lg:col-span-2 overflow-x-auto" padded={false}>
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-ink-500"><tr><th className="px-4 py-2 font-medium">Business</th><th className="font-medium">Operator</th><th className="font-medium">Signals</th><th className="font-medium">Tenure</th></tr></thead>
            <tbody>
              {distressed.slice(0, 8).map((b) => (
                <tr key={b.businessId} className="cursor-pointer border-t border-ink-100 hover:bg-ink-50" onClick={() => openBiz(b)}>
                  <td className="px-4 py-2"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SECTOR_COLOURS[b.sector] }} /><div><div className="font-medium">{b.name}</div><div className="text-xs text-ink-500">{b.sector} · {b.postcode}</div></div></div></td>
                  <td className="text-xs">{b.operatorName}</td>
                  <td><div className="flex flex-wrap gap-1">{b.distressFlags.slice(0, 2).map((f) => <Badge key={f} tone="critical">{f}</Badge>)}{b.distressFlags.length > 2 && <Badge>+{b.distressFlags.length - 2}</Badge>}</div></td>
                  <td className="text-xs">{b.tenure}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card title="Lease expiries, next 36 months" actions={<Link to="/leases" className="text-xs text-brand-700">Calendar</Link>} padded={false}>
          <ul className="divide-y divide-ink-100">
            {leases.slice(0, 8).map((l) => (
              <li key={l.leaseId} className="cursor-pointer px-4 py-2 hover:bg-ink-50" onClick={() => l.biz && openBiz(l.biz)}>
                <div className="flex items-center justify-between"><span className="truncate text-sm font-medium">{l.biz?.name ?? l.lessee}</span><Badge tone={monthsUntil(l.expiryDate)! <= 12 ? 'warning' : 'neutral'}>{monthsUntil(l.expiryDate)} mo</Badge></div>
                <div className="text-xs text-ink-500">{dateShort(l.expiryDate)} · {l.termYears} yr term{l.parsed?.rentPa ? ` · ${gbp(l.parsed.rentPa)} pa` : ''}</div>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Deals needing action" actions={<Link to="/pipeline" className="text-xs text-brand-700">Pipeline</Link>} className="lg:col-span-3" padded={false}>
          {(() => {
            const today = new Date().toISOString().slice(0, 10)
            const live = watchlist.filter((w) => w.stage && !['Completed', 'Lost'].includes(w.stage))
            const overdue = live.filter((w) => w.nextActionDate && w.nextActionDate < today)
            const noOwner = live.filter((w) => !w.assignee)
            const noAction = live.filter((w) => !w.nextAction)
            if (!live.length) return <div className="px-4 py-3 text-sm text-ink-500">No active deals. Add a site to the pipeline from the map, Sourcing or an alert.</div>
            return (
              <div className="grid gap-0 divide-y divide-ink-100 md:grid-cols-3 md:divide-x md:divide-y-0">
                {[['Overdue next actions', overdue], ['No owner assigned', noOwner], ['No next action set', noAction]].map(([label, list]) => (
                  <div key={label as string} className="px-4 py-3">
                    <div className="mb-1 flex items-center justify-between text-xs"><span className="font-semibold uppercase tracking-wide text-ink-500">{label as string}</span><Badge tone={(list as typeof live).length ? 'warning' : 'good'}>{(list as typeof live).length}</Badge></div>
                    <ul className="space-y-1 text-xs">{(list as typeof live).slice(0, 4).map((w) => <li key={w.id} className="flex items-center justify-between gap-2"><Link to="/pipeline" className="truncate font-medium hover:underline">{w.label}</Link><span className="shrink-0 text-ink-500">{w.stage}{w.nextActionDate ? ` · ${dateShort(w.nextActionDate)}` : ''}</span></li>)}{!(list as typeof live).length && <li className="text-ink-400">None</li>}</ul>
                  </div>
                ))}
              </div>
            )
          })()}
        </Card>
        <Card title="My Sites" actions={<Link to="/watchlist" className="text-xs text-brand-700">Manage</Link>} className="lg:col-span-3">
          {watchlist.length ? <div className="flex flex-wrap gap-2">{watchlist.slice(0, 12).map((w) => <Link key={w.id} to={w.entityType === 'company' ? `/companies/${w.entityId}` : `/map/${w.entityType}/${w.entityId}`} className="rounded-md border border-ink-200 px-2.5 py-1.5 text-xs hover:bg-ink-50">{w.label}</Link>)}</div> : <div className="flex items-center gap-2 text-sm text-ink-500"><AlertTriangle size={14} /> Nothing watched yet. Open a site on the map and add it to My Sites to receive ownership, planning and regulator alerts.</div>}
        </Card>
      </div>
    </div>
  )
}
