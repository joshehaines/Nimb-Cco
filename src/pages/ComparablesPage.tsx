import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Download, MapPin, Scale } from 'lucide-react'
import { provider, SECTORS, DEFAULT_COMP_FILTERS, type Comparable, type ComparableFilters, type ComparableStats, type Sector, type SearchResult } from '@/data'
import { Badge, Button, Card, Chip, Input, Select, Stat, Spinner, Empty, BarList } from '@/components/ui'
import { SECTOR_COLOURS } from '@/lib/sectors'
import { gbp, dateShort, num } from '@/lib/format'
import { haversineM } from '@/lib/geo'
import { useUi } from '@/store/ui'
import { canDownload } from '@/lib/env'

const RADII = [1000, 2000, 5000, 10000, 25000]

/** Comparable evidence: sold trading businesses with price per unit, RV and EBITDA multiples, filterable by sector, radius and date. */
export function ComparablesPage() {
  const [params, setParams] = useSearchParams()
  const [filters, setFilters] = useState<ComparableFilters>(() => ({
    ...DEFAULT_COMP_FILTERS,
    sectors: params.get('sector') ? [params.get('sector') as Sector] : [],
    centre: params.get('lon') && params.get('lat') ? [Number(params.get('lon')), Number(params.get('lat'))] : undefined,
    radiusM: params.get('radius') ? Number(params.get('radius')) : undefined,
  }))
  const [centreLabel, setCentreLabel] = useState(params.get('label') ?? (params.get('lon') ? 'selected point' : ''))
  const [result, setResult] = useState<{ comps: Comparable[]; stats: ComparableStats } | null>(null)
  const [sort, setSort] = useState<'date' | 'price' | 'ppu' | 'distance'>('date')
  const [q, setQ] = useState('')
  const [qResults, setQResults] = useState<SearchResult[]>([])
  const nav = useNavigate()
  const { select, requestFlyTo, setLayer } = useUi()

  useEffect(() => {
    setResult(null)
    provider.getComparables(filters).then(setResult)
    const p = new URLSearchParams()
    if (filters.sectors[0]) p.set('sector', filters.sectors[0])
    if (filters.centre) { p.set('lon', String(filters.centre[0])); p.set('lat', String(filters.centre[1])) }
    if (filters.radiusM) p.set('radius', String(filters.radiusM))
    if (centreLabel) p.set('label', centreLabel)
    setParams(p, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters])

  useEffect(() => {
    if (!q.trim()) return setQResults([])
    const h = setTimeout(() => provider.search(q, 6).then((r) => setQResults(r.filter((x) => x.location))), 150)
    return () => clearTimeout(h)
  }, [q])

  const sorted = useMemo(() => {
    if (!result) return []
    const c = [...result.comps]
    c.sort((a, b) => {
      if (sort === 'price') return b.price - a.price
      if (sort === 'ppu') return (b.pricePerUnit ?? 0) - (a.pricePerUnit ?? 0)
      if (sort === 'distance' && filters.centre) return haversineM(filters.centre, a.location.coordinates) - haversineM(filters.centre, b.location.coordinates)
      return b.date.localeCompare(a.date)
    })
    return c
  }, [result, sort, filters.centre])

  const toggleSector = (s: Sector) => setFilters({ ...filters, sectors: filters.sectors.includes(s) ? filters.sectors.filter((x) => x !== s) : [...filters.sectors, s] })
  const exportCsv = () => {
    const cols = ['Name', 'Sector', 'Sub-sector', 'Address', 'Postcode', 'Date', 'Price', 'Tenure', 'Capacity', 'Unit', 'Price per unit', 'Rateable value', 'RV multiple', 'Turnover', 'EBITDA', 'EBITDA multiple', 'Buyer', 'Source', 'Confidence']
    const lines = sorted.map((c) => [c.name, c.sector, c.subSector, c.address, c.postcode, c.date, c.price, c.tenure, c.capacity, c.capacityLabel, c.pricePerUnit, c.rateableValue, c.rvMultiple, c.turnover, c.ebitda, c.ebitdaMultiple, c.buyerType, c.source, c.confidence].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const blob = new Blob([`# Comparable schedule. Contributed deals are Christie & Co confidential records.\n${cols.join(',')}\n${lines.join('\n')}`], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `comparables-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }
  const plot = () => {
    setLayer('comparables', true)
    if (filters.centre) requestFlyTo(filters.centre[0], filters.centre[1], filters.radiusM && filters.radiusM > 5000 ? 11 : 13)
    nav('/map')
  }
  const stats = result?.stats
  const unit = sorted.find((c) => c.capacityLabel)?.capacityLabel

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Comparables</h1>
          <p className="text-sm text-ink-500">Sold trading businesses from HM Land Registry price paid, registers and Christie &amp; Co's own deal records. Filter by sector, distance and date; export a schedule for valuation files.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" onClick={plot} disabled={!sorted.length}><MapPin size={13} /> Plot on map</Button>
          <Button size="sm" onClick={exportCsv} disabled={!sorted.length || !canDownload}><Download size={13} /> Schedule CSV</Button>
        </div>
      </div>

      <Card padded={false}>
        <div className="grid gap-4 p-4 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">{SECTORS.filter((s) => s !== 'Other').map((s) => <Chip key={s} label={s} colour={SECTOR_COLOURS[s]} selected={filters.sectors.includes(s)} onClick={() => toggleSector(s)} />)}</div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4 xl:grid-cols-6">
              <label className="text-xs"><span className="label">Tenure</span><Select value={filters.tenure ?? ''} onChange={(e) => setFilters({ ...filters, tenure: (e.target.value || undefined) as never })}><option value="">Any</option><option>Freehold</option><option>Leasehold</option></Select></label>
              <label className="text-xs"><span className="label">From</span><Input type="date" value={filters.fromDate ?? ''} onChange={(e) => setFilters({ ...filters, fromDate: e.target.value || undefined })} /></label>
              <label className="text-xs"><span className="label">To</span><Input type="date" value={filters.toDate ?? ''} onChange={(e) => setFilters({ ...filters, toDate: e.target.value || undefined })} /></label>
              <label className="text-xs"><span className="label">Min capacity</span><Input type="number" value={filters.minCapacity ?? ''} onChange={(e) => setFilters({ ...filters, minCapacity: e.target.value ? Number(e.target.value) : undefined })} /></label>
              <label className="text-xs"><span className="label">Max capacity</span><Input type="number" value={filters.maxCapacity ?? ''} onChange={(e) => setFilters({ ...filters, maxCapacity: e.target.value ? Number(e.target.value) : undefined })} /></label>
              <label className="text-xs"><span className="label">Max price £</span><Input type="number" value={filters.maxPrice ?? ''} onChange={(e) => setFilters({ ...filters, maxPrice: e.target.value ? Number(e.target.value) : undefined })} /></label>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={!!filters.contributedOnly} onChange={(e) => setFilters({ ...filters, contributedOnly: e.target.checked || undefined })} /> Christie &amp; Co deals only</label>
              <Input placeholder="Name, address or postcode" value={filters.text ?? ''} onChange={(e) => setFilters({ ...filters, text: e.target.value || undefined })} className="w-56 py-1" />
              <button className="text-ink-500 hover:underline" onClick={() => { setFilters(DEFAULT_COMP_FILTERS); setCentreLabel('') }}>Reset</button>
            </div>
          </div>
          <div className="w-full space-y-2 lg:w-80">
            <div className="label">Distance from</div>
            {filters.centre ? (
              <div className="flex items-center justify-between rounded-md border border-brand-200 bg-brand-50 px-2.5 py-1.5 text-xs"><span className="truncate">{centreLabel || `${filters.centre[1].toFixed(4)}, ${filters.centre[0].toFixed(4)}`}</span><button className="text-brand-700 hover:underline" onClick={() => setFilters({ ...filters, centre: undefined, radiusM: undefined })}>clear</button></div>
            ) : (
              <div className="relative">
                <Input placeholder="Search a site, address or postcode…" value={q} onChange={(e) => setQ(e.target.value)} className="py-1.5 text-xs" />
                {qResults.length > 0 && <ul className="absolute z-10 mt-1 w-full rounded-md border border-ink-200 bg-surface py-1 shadow-lg">{qResults.map((r) => <li key={r.kind + r.id}><button className="block w-full truncate px-2.5 py-1.5 text-left text-xs hover:bg-ink-50" onClick={() => { setFilters({ ...filters, centre: r.location!.coordinates as [number, number], radiusM: filters.radiusM ?? 5000 }); setCentreLabel(r.label); setQ(''); setQResults([]) }}>{r.label} <span className="text-ink-500">{r.sublabel}</span></button></li>)}</ul>}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5">{RADII.map((r) => <Chip key={r} label={r >= 1000 ? `${r / 1000} km` : `${r} m`} selected={filters.radiusM === r} onClick={() => setFilters({ ...filters, radiusM: r, centre: filters.centre ?? [useUi.getState().mapView.lon, useUi.getState().mapView.lat] })} />)}</div>
            {!filters.centre && <div className="text-[11px] text-ink-500">Pick a radius to use the current map centre.</div>}
          </div>
        </div>
      </Card>

      {!result ? <Spinner label="Searching comparables…" /> : !result.comps.length ? <Empty title="No comparables match" hint="Widen the radius or date range, or clear the sector filter." /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Comparables" value={stats!.count} sub={`${result.comps.filter((c) => c.contributed).length} Christie deals`} />
            <Stat label="Median price" value={gbp(stats!.medianPrice, { compact: true })} />
            <Stat label={`Median £ per ${unit ? unit.replace(/s$/, '') : 'unit'}`} value={stats!.medianPricePerUnit ? gbp(stats!.medianPricePerUnit, { compact: true }) : '—'} sub={stats!.pricePerUnitRange ? `IQR ${gbp(stats!.pricePerUnitRange[0], { compact: true })} to ${gbp(stats!.pricePerUnitRange[1], { compact: true })}` : undefined} />
            <Stat label="Median RV multiple" value={stats!.medianRvMultiple ? `${stats!.medianRvMultiple.toFixed(1)}x` : '—'} />
            <Stat label="Median EBITDA multiple" value={stats!.medianEbitdaMultiple ? `${stats!.medianEbitdaMultiple.toFixed(1)}x` : '—'} />
            <Stat label="Freehold share" value={`${Math.round((result.comps.filter((c) => c.tenure === 'Freehold').length / result.comps.length) * 100)}%`} />
          </div>
          <div className="grid gap-4 xl:grid-cols-3">
            <Card title="Median price by year"><BarList rows={stats!.byYear.map((y) => ({ label: `${y.year} (${y.count})`, value: y.medianPrice }))} format={(n) => gbp(n, { compact: true })} /></Card>
            <Card title={`Schedule · ${sorted.length}`} className="overflow-x-auto xl:col-span-2" padded={false} actions={<Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className="w-auto py-1 text-xs"><option value="date">Newest</option><option value="price">Price</option><option value="ppu">£ per unit</option>{filters.centre && <option value="distance">Distance</option>}</Select>}>
              <table className="w-full min-w-[640px] text-xs">
                <thead className="bg-ink-50 text-left text-ink-500"><tr><th className="font-medium">Business</th><th className="font-medium">Sold</th><th className="font-medium text-right">Price</th><th className="font-medium">Tenure</th><th className="font-medium text-right">Capacity</th><th className="font-medium text-right">£/unit</th><th className="font-medium text-right">RV x</th><th className="font-medium text-right">EBITDA x</th><th className="hidden font-medium xl:table-cell">Buyer</th>{filters.centre && <th className="font-medium text-right">Dist.</th>}<th className="hidden font-medium lg:table-cell">Source</th></tr></thead>
                <tbody>
                  {sorted.slice(0, 200).map((c) => (
                    <tr key={c.compId} className="border-t border-ink-100 hover:bg-ink-50">
                      <td><div className="flex items-center gap-2"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: SECTOR_COLOURS[c.sector] }} /><div className="min-w-[160px]"><button className="font-medium hover:underline" onClick={() => { select({ type: 'comparable', id: c.compId }); setLayer('comparables', true); nav(`/map/comparable/${c.compId}`) }}>{c.name}</button><div className="text-ink-500">{c.sector}{c.subSector ? ` · ${c.subSector}` : ''} · {c.address}</div></div></div></td>
                      <td>{dateShort(c.date)}</td>
                      <td className="text-right font-medium tabular-nums">{gbp(c.price)}</td>
                      <td>{c.tenure}</td>
                      <td className="text-right tabular-nums">{c.capacity ? `${c.capacity} ${c.capacityLabel}` : '—'}</td>
                      <td className="text-right tabular-nums">{c.pricePerUnit ? gbp(c.pricePerUnit) : '—'}</td>
                      <td className="text-right tabular-nums">{c.rvMultiple ?? '—'}</td>
                      <td className="text-right tabular-nums">{c.ebitdaMultiple ?? '—'}</td>
                      <td className="hidden xl:table-cell">{c.buyerType}</td>
                      {filters.centre && <td className="text-right tabular-nums">{num(haversineM(filters.centre, c.location.coordinates) / 1000, 1)} km</td>}
                      <td className="hidden lg:table-cell"><Badge tone={c.contributed ? 'brand' : 'neutral'}>{c.contributed ? 'Christie' : c.confidence}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
          <p className="text-[11px] text-ink-500"><Scale size={11} className="mr-1 inline" />Public comparables derive from HM Land Registry price paid entries on company ownership records and purchased registers. Christie &amp; Co deals are confidential and must not leave the firm. <Link to="/admin" className="text-brand-700">Licence notes</Link>.</p>
        </>
      )}
    </div>
  )
}
