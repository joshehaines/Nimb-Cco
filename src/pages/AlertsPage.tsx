import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { provider, type Alert } from '@/data'
import { Badge, Button, Chip, Card, Toggle, Select } from '@/components/ui'
import { SECTORS } from '@/data/types'
import { SECTOR_COLOURS } from '@/lib/sectors'
import { ago } from '@/lib/format'
import { useUi } from '@/store/ui'

const KINDS: Alert['kind'][] = ['Ownership change', 'Planning submitted', 'Planning decided', 'Rating change', 'Registration change', 'Company status', 'Late accounts', 'Lease event', 'New business', 'EPC lodged', 'VOA change']

export function AlertsPage() {
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [kinds, setKinds] = useState<string[]>([])
  const [unreadOnly, setUnreadOnly] = useState(false)
  const nav = useNavigate()
  const select = useUi((s) => s.select)
  const { alertRules, setAlertRules, watchlist } = useUi()
  const [showRules, setShowRules] = useState(false)
  const load = () => provider.getAlerts().then((a) => setAlerts([...a]))
  useEffect(() => {
    load()
  }, [])
  const open = async (a: Alert) => {
    await provider.markAlertRead(a.alertId)
    load()
    if (a.entityType === 'company') nav(`/companies/${a.entityId}`)
    else {
      select({ type: a.entityType, id: a.entityId })
      nav(`/map/${a.entityType}/${encodeURIComponent(a.entityId)}`)
    }
  }
  const shown = alerts.filter((a) => (!kinds.length || kinds.includes(a.kind)) && (!unreadOnly || !a.read) && alertRules.kinds.includes(a.kind) && (!alertRules.sectors.length || !a.sector || alertRules.sectors.includes(a.sector)) && (!alertRules.watchedOnly || watchlist.some((w) => w.entityId === a.entityId)))
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold">Alerts</h1>
          <p className="text-sm text-ink-500">Changes detected across HMLR, Companies House, regulators, planning, EPC and VOA feeds for watched sites, sectors and areas.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={() => setShowRules(!showRules)}>{showRules ? 'Hide rules' : 'Alert rules'}</Button>
          <Button size="sm" onClick={() => setUnreadOnly(!unreadOnly)}>{unreadOnly ? 'Show all' : 'Unread only'}</Button>
          <Button size="sm" onClick={async () => { for (const a of alerts) await provider.markAlertRead(a.alertId); load() }}>Mark all read</Button>
        </div>
      </div>
      {showRules && (
        <Card title="Alert rules (per user)">
          <div className="grid gap-5 md:grid-cols-3">
            <div>
              <div className="label mb-2">Event types</div>
              <div className="flex flex-wrap gap-1.5">{KINDS.map((k) => <Chip key={k} label={k} selected={alertRules.kinds.includes(k)} onClick={() => setAlertRules({ kinds: alertRules.kinds.includes(k) ? alertRules.kinds.filter((x) => x !== k) : [...alertRules.kinds, k] })} />)}</div>
            </div>
            <div>
              <div className="label mb-2">Sectors (empty = all)</div>
              <div className="flex flex-wrap gap-1.5">{SECTORS.filter((x) => x !== 'Other').map((sct) => <Chip key={sct} label={sct} colour={SECTOR_COLOURS[sct]} selected={alertRules.sectors.includes(sct)} onClick={() => setAlertRules({ sectors: alertRules.sectors.includes(sct) ? alertRules.sectors.filter((x) => x !== sct) : [...alertRules.sectors, sct] })} />)}</div>
            </div>
            <div className="space-y-2">
              <Toggle checked={alertRules.watchedOnly} onChange={(v) => setAlertRules({ watchedOnly: v })} label="Only My Sites" hint="Otherwise sector-wide events in your offices' areas are included" />
              <label className="block text-xs"><span className="label">Radius around watched sites</span><Select value={alertRules.radiusM} onChange={(e) => setAlertRules({ radiusM: Number(e.target.value) })}>{[100, 250, 500, 1000, 2000].map((r) => <option key={r} value={r}>{r} m</option>)}</Select></label>
              <label className="block text-xs"><span className="label">Delivery</span><Select value={alertRules.digest} onChange={(e) => setAlertRules({ digest: e.target.value as never })}><option value="instant">Instant</option><option value="daily">Daily digest</option><option value="weekly">Weekly digest</option></Select></label>
              <Toggle checked={alertRules.channels.email} onChange={(v) => setAlertRules({ channels: { ...alertRules.channels, email: v } })} label="Email" />
              <Toggle checked={alertRules.channels.teams} onChange={(v) => setAlertRules({ channels: { ...alertRules.channels, teams: v } })} label="Microsoft Teams channel" />
            </div>
          </div>
        </Card>
      )}
      <div className="flex flex-wrap gap-1.5">{KINDS.map((k) => <Chip key={k} label={k} selected={kinds.includes(k)} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])} />)}</div>
      <ul className="card divide-y divide-ink-100">
        {shown.map((a) => (
          <li key={a.alertId} className={`flex cursor-pointer items-start gap-3 px-4 py-3 hover:bg-ink-50 ${a.read ? 'opacity-70' : ''}`} onClick={() => open(a)}>
            <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${a.severity === 'critical' ? 'bg-rose-600' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500'}`} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2"><span className="text-sm font-medium text-ink-900">{a.title}</span><Badge>{a.kind}</Badge>{a.sector && <Badge tone="brand">{a.sector}</Badge>}{!a.read && <Badge tone="info">new</Badge>}</div>
              <div className="text-xs text-ink-600">{a.detail}</div>
            </div>
            <span className="shrink-0 text-xs text-ink-400">{ago(a.occurredAt)}</span>
          </li>
        ))}
        {!shown.length && <li className="p-6 text-center text-sm text-ink-500">No alerts match.</li>}
      </ul>
      <p className="text-xs text-ink-500">Alert rules (configurable in production): any proprietor change on a watched title; planning received or decided within a watched radius; CQC, Ofsted or FHRS rating change for a watched business or sector; Companies House status change, late filing or new charge for any operator or freeholder in My Sites; lease expiry or break within 12 months; EPC lodged; VOA list alteration.</p>
    </div>
  )
}
