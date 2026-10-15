import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Radar, ArrowLeftRight, X } from 'lucide-react'
import { provider, type Catchment, type SearchResult } from '@/data'
import { Badge, Button, Card, Chip, Input, Stat, Spinner, Empty, BarList, KV, cx } from '@/components/ui'
import { SECTOR_COLOURS } from '@/lib/sectors'
import { gbp, num } from '@/lib/format'
import { useUi } from '@/store/ui'

const RADII = [500, 1000, 2000, 5000, 8000]
type Site = { label: string; lon: number; lat: number }

function SitePicker({ site, onPick, placeholder }: { site?: Site; onPick: (s?: Site) => void; placeholder: string }) {
  const [q, setQ] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  useEffect(() => {
    if (!q.trim()) return setResults([])
    const h = setTimeout(() => provider.search(q, 7).then((r) => setResults(r.filter((x) => x.location))), 150)
    return () => clearTimeout(h)
  }, [q])
  if (site) return <div className="flex items-center justify-between rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-sm"><span className="truncate font-medium">{site.label}</span><button className="btn-ghost btn-sm" onClick={() => onPick(undefined)}><X size={13} /></button></div>
  return (
    <div className="relative">
      <Input placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
      {results.length > 0 && <ul className="absolute z-10 mt-1 w-full rounded-md border border-ink-200 bg-surface py-1 shadow-lg">{results.map((r) => <li key={r.kind + r.id}><button className="block w-full truncate px-2.5 py-1.5 text-left text-xs hover:bg-ink-50" onClick={() => { onPick({ label: r.label, lon: r.location!.coordinates[0], lat: r.location!.coordinates[1] }); setQ(''); setResults([]) }}>{r.label} <span className="text-ink-500">{r.sublabel}</span></button></li>)}</ul>}
    </div>
  )
}

function CatchmentColumn({ site, radius, data, compare }: { site: Site; radius: number; data: Catchment | null; compare?: Catchment | null }) {
  const nav = useNavigate()
  const select = useUi((s) => s.select)
  if (!data) return <Spinner label="Computing catchment…" />
  const delta = (a?: number, b?: number) => (compare && a !== undefined && b !== undefined && b !== 0 ? <span className={cx('ml-1 text-[10px]', a >= b ? 'text-green-700 dark:text-green-300' : 'text-rose-700 dark:text-rose-300')}>{a >= b ? '+' : ''}{Math.round(((a - b) / b) * 100)}%</span> : null)
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Population" value={<>{num(data.population)}{delta(data.population, compare?.population)}</>} sub={`${num(data.households)} households`} />
        <Stat label="Aged 85+" value={<>{num(data.age85plus)}{delta(data.age85plus, compare?.age85plus)}</>} sub={`${num(data.age65plus)} aged 65+`} />
        <Stat label="Children 0-4" value={<>{num(data.age0to4)}{delta(data.age0to4, compare?.age0to4)}</>} />
        <Stat label="Median household income" value={<>{gbp(data.medianHouseholdIncome, { compact: true })}{delta(data.medianHouseholdIncome, compare?.medianHouseholdIncome)}</>} sub={`Affluence index ${data.affluenceIndex} · IMD decile ${data.deprivationDecile}`} />
      </div>
      <Card title="Supply ratios vs England benchmark">
        <ul className="space-y-2">
          {data.ratios.map((r) => {
            const pct = r.benchmark ? r.value / r.benchmark : 0
            const good = r.better === 'lower' ? pct < 0.85 : pct > 1.15
            const bad = r.better === 'lower' ? pct > 1.15 : pct < 0.85
            return (
              <li key={r.label} className="text-xs">
                <div className="flex items-center justify-between"><span className="font-medium">{r.label}</span><span className="tabular-nums">{r.value} <span className="text-ink-500">vs {r.benchmark}</span> <Badge tone={good ? 'good' : bad ? 'critical' : 'neutral'}>{good ? 'Undersupplied' : bad ? 'Saturated' : 'In line'}</Badge></span></div>
                <div className="mt-1 h-1.5 w-full rounded-full bg-ink-100"><div className={cx('h-1.5 rounded-full', good ? 'bg-green-600' : bad ? 'bg-rose-600' : 'bg-brand-500')} style={{ width: `${Math.min(100, pct * 50)}%` }} /></div>
                <div className="mt-0.5 text-ink-500">{r.note}</div>
              </li>
            )
          })}
        </ul>
      </Card>
      <Card title={`Competitors within ${radius >= 1000 ? `${radius / 1000} km` : `${radius} m`}`}>
        {data.competitors.length ? <BarList rows={data.competitors.map((c) => ({ label: `${c.sector}${c.capacity ? ` · ${num(c.capacity)} ${c.capacityLabel ?? ''}` : ''}`, value: c.count, colour: SECTOR_COLOURS[c.sector] }))} /> : <div className="text-xs text-ink-500">No tracked businesses in this radius.</div>}
      </Card>
      {data.realSupply && (
        <Card title={`Real supply within ${radius >= 1000 ? `${radius / 1000} km` : `${radius} m`} (Overture Maps)`}>
          {data.realSupply.counts.length ? <BarList rows={data.realSupply.counts.map((c) => ({ label: c.sector, value: c.count, colour: SECTOR_COLOURS[c.sector] }))} /> : <div className="text-xs text-ink-500">No places recorded in this radius.</div>}
          <ul className="mt-3 divide-y divide-ink-100 text-xs">{data.realSupply.nearest.map((n) => <li key={n.id} className="flex cursor-pointer items-center justify-between py-1.5 hover:bg-ink-50" onClick={() => { select({ type: 'poi', id: n.id }); nav(`/map/poi/${encodeURIComponent(n.id)}`) }}><span className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SECTOR_COLOURS[n.sector] }} /><span className="truncate"><span className="font-medium">{n.name}</span> <span className="text-ink-500">· {n.category.replace(/_/g, ' ')}</span></span></span><span className="shrink-0 text-ink-500">{n.distanceM} m</span></li>)}</ul>
          <div className="mt-2 text-[11px] text-ink-500">Real businesses from {data.realSupply.source}. Capacities (beds, places) are not in this source, so the supply ratios above still use the demo registers.</div>
        </Card>
      )}
      <Card title="Nearest registered businesses" padded={false}>
        <ul className="divide-y divide-ink-100 text-xs">{data.nearest.map((n) => <li key={n.businessId} className="flex cursor-pointer items-center justify-between px-4 py-1.5 hover:bg-ink-50" onClick={() => { select({ type: 'business', id: n.businessId }); nav(`/map/business/${n.businessId}`) }}><span className="flex min-w-0 items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SECTOR_COLOURS[n.sector] }} /><span className="truncate"><span className="font-medium">{n.name}</span> <span className="text-ink-500">· {n.operatorName}</span></span></span><span className="shrink-0 text-ink-500">{n.capacity ? `${n.capacity} · ` : ''}{n.rating ? `${n.rating} · ` : ''}{n.distanceM} m</span></li>)}</ul>
      </Card>
      <Card title="Movement"><KV rows={[['Footfall (cell avg)', data.footfallMonthly ? `${num(data.footfallMonthly)} visits/month` : 'No coverage'], ['Busiest road', data.trafficAadf ? `${num(data.trafficAadf)} vehicles/day` : '—'], ['Centre', `${site.lat.toFixed(4)}, ${site.lon.toFixed(4)}`]]} /></Card>
      <div className="text-[11px] text-ink-500">Sources: {data.source}. Benchmarks are England averages; sector teams can override them in settings once live data is connected.</div>
    </div>
  )
}

/** Catchment analysis: demographics, competitor supply and need ratios around one or two sites. */
export function CatchmentPage() {
  const [params] = useSearchParams()
  const [a, setA] = useState<Site | undefined>(params.get('lon') ? { label: params.get('label') ?? 'Selected site', lon: Number(params.get('lon')), lat: Number(params.get('lat')) } : undefined)
  const [b, setB] = useState<Site | undefined>()
  const [compare, setCompare] = useState(false)
  const [radius, setRadius] = useState(Number(params.get('radius')) || 2000)
  const [da, setDa] = useState<Catchment | null>(null)
  const [db, setDb] = useState<Catchment | null>(null)
  const mapView = useUi((s) => s.mapView)
  useEffect(() => { setDa(null); if (a) provider.getCatchment(a.lon, a.lat, radius).then(setDa) }, [a, radius])
  useEffect(() => { setDb(null); if (b) provider.getCatchment(b.lon, b.lat, radius).then(setDb) }, [b, radius])
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Catchment analysis</h1>
          <p className="text-sm text-ink-500">Who lives around a site, who already serves them, and whether the numbers support a new registration, an extension or a disposal pitch. Compare two sites side by side.</p>
        </div>
        <div className="flex gap-2"><Button size="sm" onClick={() => setCompare(!compare)}><ArrowLeftRight size={13} /> {compare ? 'Single site' : 'Compare two sites'}</Button></div>
      </div>
      <Card>
        <div className={cx('grid gap-3', compare ? 'md:grid-cols-2' : 'md:grid-cols-[1fr_auto]')}>
          <div><div className="label mb-1">Site A</div><SitePicker site={a} onPick={setA} placeholder="Search a business, address or postcode…" />{!a && <button className="mt-1 text-xs text-brand-700 hover:underline" onClick={() => setA({ label: 'Current map centre', lon: mapView.lon, lat: mapView.lat })}>Use current map centre</button>}</div>
          {compare && <div><div className="label mb-1">Site B</div><SitePicker site={b} onPick={setB} placeholder="Search a second site…" /></div>}
          <div className={compare ? 'md:col-span-2' : ''}><div className="label mb-1">Radius</div><div className="flex flex-wrap gap-1.5">{RADII.map((r) => <Chip key={r} label={r >= 1000 ? `${r / 1000} km` : `${r} m`} selected={radius === r} onClick={() => setRadius(r)} />)}<span className="ml-2 self-center text-[11px] text-ink-500">Care: 5 km is the usual need-assessment catchment. Nurseries and pubs: 1 to 2 km.</span></div></div>
        </div>
      </Card>
      {!a ? <Empty title="Pick a site to analyse" hint="Search above, use the map centre, or open any site on the map and press Catchment." action={<Link to="/map" className="btn-primary"><Radar size={14} /> Open map</Link>} /> : (
        <div className={cx('grid gap-5', compare && b ? 'lg:grid-cols-2' : '')}>
          <div><h2 className="mb-2 text-sm font-semibold">{a.label}</h2><CatchmentColumn site={a} radius={radius} data={da} compare={compare ? db : undefined} /></div>
          {compare && b && <div><h2 className="mb-2 text-sm font-semibold">{b.label}</h2><CatchmentColumn site={b} radius={radius} data={db} compare={da} /></div>}
        </div>
      )}
    </div>
  )
}
