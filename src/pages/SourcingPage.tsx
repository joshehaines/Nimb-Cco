import { useEffect, useMemo, useState } from 'react'
import { dealScore } from '@/lib/dealScore'
import { logAudit } from '@/lib/audit'
import { useNavigate } from 'react-router-dom'
import { SlidersHorizontal, Download, Bookmark, MapPin, Upload, BellPlus } from 'lucide-react'
import { useAlerts } from '@/store/alerts'
import { useAuth } from '@/auth'
import { blankRule } from '@/lib/alerts'
import { provider, type Business, type Hereditament, type Title } from '@/data'
import { useUi } from '@/store/ui'
import { Badge, Button, Empty, Spinner } from '@/components/ui'
import { SourcingDrawer } from '@/components/panels/SourcingDrawer'
import { SECTOR_COLOURS } from '@/lib/sectors'
import { gbp, dateShort, monthsUntil, num } from '@/lib/format'
import { canDownload } from '@/lib/env'

type Row = { b: Business; t?: Title; h?: Hereditament }

export function SourcingPage() {
  const { filters, setShowFilters, addWatch, select, bounds, resetFilters, setHighlight } = useUi()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [onlyMapArea, setOnlyMapArea] = useState(false)
  const [sort, setSort] = useState<'name' | 'rv' | 'lease' | 'distress' | 'score'>('score')
  const nav = useNavigate()
  useEffect(() => {
    setRows(null)
    provider.sourceBusinesses(filters, onlyMapArea ? bounds : undefined).then(async (bs) => {
      const out: Row[] = []
      for (const b of bs) out.push({ b, t: b.titleNumber ? await provider.getTitle(b.titleNumber) : undefined, h: b.hereditamentUarn ? await provider.getHereditament(b.hereditamentUarn) : undefined })
      setRows(out)
    })
  }, [filters, onlyMapArea, bounds])
  const sorted = useMemo(() => {
    if (!rows) return []
    const c = [...rows]
    c.sort((x, y) => {
      if (sort === 'score') return dealScore(y.b, y.t, y.h).score - dealScore(x.b, x.t, x.h).score
      if (sort === 'name') return x.b.name.localeCompare(y.b.name)
      if (sort === 'rv') return (y.h?.rateableValue ?? 0) - (x.h?.rateableValue ?? 0)
      if (sort === 'lease') return (monthsUntil(x.t?.leases[0]?.expiryDate) ?? 9999) - (monthsUntil(y.t?.leases[0]?.expiryDate) ?? 9999)
      return y.b.distressFlags.length - x.b.distressFlags.length
    })
    return c
  }, [rows, sort])
  const exportCsv = () => {
    const cols = ['Business', 'Sector', 'Address', 'Postcode', 'Tenure', 'Operator', 'Operator company no', 'Freeholder', 'Title', 'UPRN', 'Rateable value', 'Floor area m2', 'Lease expiry', 'Distress flags', 'Register', 'Register ID', 'Rating', 'Transact score']
    const lines = sorted.map(({ b, t, h }) => [b.name, b.sector, b.address, b.postcode, b.tenure, b.operatorName, b.operatorCompanyNumber, b.freeholderName, b.titleNumber, b.uprn, h?.rateableValue, h?.totalAreaSqm, t?.leases[0]?.expiryDate, b.distressFlags.join('; '), b.registers[0]?.register, b.registers[0]?.registerId, b.registers[0]?.rating].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const blob = new Blob([`# Export contains HMLR CCOD (no direct marketing) and VOA restricted data. Internal use only.\n${cols.join(',')}\n${lines.join('\n')}`], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `sourcing-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    logAudit('export', `Sourcing CSV: ${sorted.length} businesses`, { licences: ['OGL', 'HMLR-CCOD', 'VOA-Restricted'], count: sorted.length })
  }
  const active = [filters.sectors.length && `${filters.sectors.length} sectors`, filters.tenure, filters.distressOnly && 'distressed', filters.distressFlags.length && `${filters.distressFlags.length} signals`, filters.leaseExpiringWithinMonths && `lease < ${filters.leaseExpiringWithinMonths} mo`, filters.epcWorseThan && `EPC worse than ${filters.epcWorseThan}`, filters.ownerCategories.length && `${filters.ownerCategories.length} owner types`, filters.minRateableValue && `RV ≥ ${gbp(filters.minRateableValue)}`, filters.ownedSince && `owned since ${filters.ownedSince}`, filters.excludeConstraints.length && `excl. ${filters.excludeConstraints.length} constraints`, filters.text && `"${filters.text}"`].filter(Boolean) as string[]
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-surface px-5 py-3">
        <h1 className="text-lg font-semibold">Site sourcing</h1>
        <Button size="sm" variant="primary" onClick={() => setShowFilters(true)}><SlidersHorizontal size={14} /> Filters</Button>
        {active.map((a) => <Badge key={a} tone="brand">{a}</Badge>)}
        {active.length > 0 && <button className="text-xs text-ink-500 hover:underline" onClick={resetFilters}>clear</button>}
        <div className="ml-auto flex items-center gap-2 text-xs">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={onlyMapArea} onChange={(e) => setOnlyMapArea(e.target.checked)} /> Current map area only</label>
          <select className="input w-auto py-1" aria-label="Sort results" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
            <option value="score">Sort: likely to transact</option><option value="distress">Sort: distress</option><option value="rv">Sort: rateable value</option><option value="lease">Sort: lease expiry</option><option value="name">Sort: name</option>
          </select>
          <Button size="sm" onClick={() => { setHighlight(sorted.map(({ b }) => b.businessId), 'sourcing results'); nav('/map') }} disabled={!sorted.length}><MapPin size={13} /> Plot on map</Button>
          <Button size="sm" onClick={() => sorted.forEach(({ b }) => addWatch({ entityType: 'business', entityId: b.businessId, label: b.name }))}><Bookmark size={13} /> Watch all</Button>
          <Button size="sm" onClick={exportCsv} disabled={!sorted.length || !canDownload} title={canDownload ? 'Export CSV' : 'Downloads are disabled on this preview host'}><Download size={13} /> CSV</Button>
          <Button size="sm" onClick={() => { const r = blankRule(useAuth.getState().user?.id ?? 'demo-agent', { name: `Sourcing: ${[filters.sectors.join('/'), filters.distressOnly ? 'distressed' : '', filters.tenure ?? ''].filter(Boolean).join(' · ') || 'all sites'}`, tag: 'Sourcing', conditions: { kinds: [], sectors: filters.sectors, severities: [], distressOnly: filters.distressOnly, distressFlags: filters.distressFlags, ownerCategories: filters.ownerCategories, tenure: filters.tenure }, frequency: 'daily' }); useAlerts.getState().upsertRule(r); nav(`/alerts/rules/${r.id}`) }} title="Turn these filters into an alert so new events on matching sites reach you"><BellPlus size={13} /> Alert me on this search</Button>
          <Button size="sm" variant="primary" onClick={() => nav('/crm/export?source=sourcing')} disabled={!sorted.length} title="Clean, de-duplicated accounts, contacts and sites for the CRM"><Upload size={13} /> Export to CRM</Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-5">
        {!rows ? <Spinner label="Running filters across sources…" /> : !rows.length ? <Empty title="No businesses match" hint="Loosen the filters or switch off 'current map area only'." action={<Button onClick={() => setShowFilters(true)}>Edit filters</Button>} /> : (
          <>
            <div className="mb-2 text-xs text-ink-500">{rows.length} businesses · {rows.filter((r) => r.b.distressFlags.length).length} with distress signals · combined RV {gbp(rows.reduce((s, r) => s + (r.h?.rateableValue ?? 0), 0), { compact: true })}</div>
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead className="bg-ink-50 text-left text-xs text-ink-500 whitespace-nowrap">
                  <tr><th className="px-3 py-2 font-medium">Business</th><th className="font-medium">Operator</th><th className="font-medium">Freeholder</th><th className="font-medium">Tenure</th><th className="font-medium text-right">RV</th><th className="font-medium text-right">Area m²</th><th className="font-medium">Lease expiry</th><th className="font-medium">Register</th><th className="font-medium">Signals</th><th className="font-medium text-right" title="Likely-to-transact score from the signals held: insolvency, lease events, EPC, tenure length, charges, regulator ratings">Score</th><th></th></tr>
                </thead>
                <tbody>
                  {sorted.map(({ b, t, h }) => {
                    const lease = t?.leases[0]
                    const m = monthsUntil(lease?.expiryDate)
                    const reg = b.registers.find((r) => r.rating || r.capacity)
                    return (
                      <tr key={b.businessId} className="border-t border-ink-100 hover:bg-ink-50">
                        <td className="px-3 py-2"><div className="flex items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SECTOR_COLOURS[b.sector] }} /><div className="min-w-[180px]"><button className="text-left font-medium text-ink-900 hover:underline" onClick={() => { select({ type: 'business', id: b.businessId }); nav(`/map/business/${b.businessId}`) }}>{b.name}</button><div className="text-xs text-ink-500">{b.sector} · {b.address}</div></div></div></td>
                        <td className="text-xs">{b.operatorName}</td>
                        <td className="text-xs">{b.freeholderName}</td>
                        <td className="text-xs">{b.tenure}</td>
                        <td className="text-right text-xs tabular-nums">{gbp(h?.rateableValue)}</td>
                        <td className="text-right text-xs tabular-nums">{num(h?.totalAreaSqm)}</td>
                        <td className="text-xs">{lease ? <span className={m !== undefined && m <= 24 ? 'font-medium text-amber-700 dark:text-amber-300' : ''}>{dateShort(lease.expiryDate)}</span> : '—'}</td>
                        <td className="text-xs">{reg ? `${reg.register}${reg.rating ? ` · ${reg.rating}` : ''}${reg.capacity ? ` · ${reg.capacity} ${reg.capacityLabel}` : ''}` : '—'}</td>
                        <td className="text-right"><ScoreBadge b={b} t={t} h={h} /></td>
                        <td><div className="flex flex-wrap gap-1">{b.distressFlags.slice(0, 2).map((f) => <Badge key={f} tone="critical">{f}</Badge>)}{b.distressFlags.length > 2 && <Badge>+{b.distressFlags.length - 2}</Badge>}</div></td>
                        <td className="pr-2"><div className="flex gap-1"><button className="btn-ghost btn-sm" title="Show on map" onClick={() => { select({ type: 'business', id: b.businessId }); useUi.getState().requestFlyTo(b.location.coordinates[0], b.location.coordinates[1], 17.5); nav(`/map/business/${b.businessId}`) }}><MapPin size={14} /></button><button className="btn-ghost btn-sm" title="Watch" onClick={() => addWatch({ entityType: 'business', entityId: b.businessId, label: b.name })}><Bookmark size={14} /></button></div></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
      <SourcingDrawer />
    </div>
  )
}

function ScoreBadge({ b, t, h }: { b: Business; t?: Title; h?: Hereditament }) {
  const d = dealScore(b, t, h)
  return <span title={d.reasons.join('\n') || 'No signals'} className={`inline-block min-w-[2.5rem] rounded px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums ${d.band === 'High' ? 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200' : d.band === 'Medium' ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200' : 'bg-ink-100 text-ink-600'}`}>{d.score}</span>
}
