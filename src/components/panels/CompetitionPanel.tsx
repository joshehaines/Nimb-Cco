import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Crosshair, Eye, EyeOff } from 'lucide-react'
import { provider } from '@/data'
import { SECTORS, type Sector } from '@/data/types'
import { useUi } from '@/store/ui'
import { Badge, Button, Select, Spinner, cx } from '@/components/ui'
import { SECTOR_COLOURS } from '@/lib/sectors'
import { analyseCompetition, DEFAULT_RADIUS_M, type CompetitionResult, type SiteForCompetition } from '@/lib/competition'

const RADII = [400, 800, 1500, 3000, 5000, 8000]
const fmtR = (m: number) => (m >= 1000 ? `${m / 1000} km` : `${m} m`)

/**
 * "Highlight competition": ranks same-sector operators around a site, explains each score, and
 * draws the radius ring and the competitors on the map.
 */
export function CompetitionPanel({ site, onResult }: { site: Omit<SiteForCompetition, 'sector'> & { sector?: Sector }; onResult?: (r: CompetitionResult) => void }) {
  const [sector, setSector] = useState<Sector>(site.sector ?? 'Pub')
  const [radius, setRadius] = useState<number>(DEFAULT_RADIUS_M[site.sector ?? 'Pub'])
  const [result, setResult] = useState<CompetitionResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [showAll, setShowAll] = useState(false)
  const { analysis, setAnalysis, clearAnalysis, requestFlyTo, select } = useUi()
  const nav = useNavigate()
  const key = `${site.centre.join(',')}|${sector}|${radius}`

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    Promise.all([provider.getBusinessesNear(site.centre[0], site.centre[1], radius, sector), provider.getPoisNear(site.centre[0], site.centre[1], radius, sector)])
      .then(([demo, real]) => {
        if (cancelled) return
        const r = analyseCompetition({ ...site, sector }, demo.filter((d) => d.name !== site.name), real, radius)
        setResult(r)
        onResult?.(r)
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const drawn = analysis?.kind === 'competition' && analysis.centre[0] === site.centre[0] && analysis.centre[1] === site.centre[1] && analysis.radiusM === radius
  const highlight = () => {
    if (!result) return
    if (drawn) return clearAnalysis()
    setAnalysis({ kind: 'competition', label: `Competition for ${site.name}`, centre: site.centre, radiusM: radius, businessIds: result.competitors.filter((c) => c.kind === 'demo').map((c) => c.id), poiIds: result.competitors.filter((c) => c.kind === 'real').map((c) => c.id) })
    // zoom so the whole ring fits: ~ zoom where ring diameter spans half the viewport
    const zoom = Math.max(12, Math.min(17, 16.6 - Math.log2(radius / 400)))
    requestFlyTo(site.centre[0], site.centre[1], zoom)
  }
  const list = useMemo(() => (result ? (showAll ? result.competitors : result.main) : []), [result, showAll])
  const maxScore = result?.competitors[0]?.score ?? 1

  return (
    <div className="space-y-3 text-sm">
      <div className="flex flex-wrap items-end gap-2">
        <label className="text-xs"><span className="label">Sector</span><Select value={sector} onChange={(e) => { const s = e.target.value as Sector; setSector(s); setRadius(DEFAULT_RADIUS_M[s]) }} className="w-auto py-1 text-xs" aria-label="Competition sector">{SECTORS.filter((s) => s !== 'Other').map((s) => <option key={s}>{s}</option>)}</Select></label>
        <label className="text-xs"><span className="label">Radius</span><Select value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-auto py-1 text-xs" aria-label="Competition radius">{RADII.map((r) => <option key={r} value={r}>{fmtR(r)}</option>)}</Select></label>
        <Button size="sm" variant={drawn ? 'secondary' : 'primary'} onClick={highlight} disabled={!result} className="ml-auto">{drawn ? <EyeOff size={13} /> : <Eye size={13} />} {drawn ? 'Hide on map' : 'Highlight on map'}</Button>
      </div>
      {loading && !result && <Spinner label="Finding competitors…" />}
      {result && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={result.pressure === 'High' ? 'critical' : result.pressure === 'Moderate' ? 'warning' : 'good'}>{result.pressure} pressure</Badge>
            <span className="text-xs text-ink-600">{result.competitors.length} competitor{result.competitors.length === 1 ? '' : 's'} · {result.densityPerKm2.toFixed(1)} per km²{result.nearestM !== undefined ? ` · nearest ${result.nearestM} m` : ''}</span>
          </div>
          <ul className="space-y-1 text-xs text-ink-700">{result.summary.map((s, i) => <li key={i}>{s}</li>)}</ul>
          {result.competitors.length > 0 && (
            <div>
              <div className="mb-1 flex items-center justify-between"><span className="label">{showAll ? 'All competitors' : 'Main competitors'}</span>{result.competitors.length > result.main.length && <button className="text-[11px] text-brand-700 hover:underline" onClick={() => setShowAll(!showAll)}>{showAll ? 'Show main 5' : `Show all ${result.competitors.length}`}</button>}</div>
              <ol className="divide-y divide-ink-100 rounded-md border border-ink-100">
                {list.map((c, i) => (
                  <li key={c.id} className="flex cursor-pointer items-start gap-2 px-2.5 py-2 hover:bg-ink-50" title={c.reasons.join('\n')} onClick={() => { select({ type: c.kind === 'demo' ? 'business' : 'poi', id: c.id }); nav(`/map/${c.kind === 'demo' ? 'business' : 'poi'}/${encodeURIComponent(c.id)}`) }}>
                    <span className="mt-0.5 w-4 shrink-0 text-right text-[11px] text-ink-400">{i + 1}</span>
                    <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: SECTOR_COLOURS[c.sector] }} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5"><span className="truncate font-medium text-ink-900">{c.name}</span>{c.kind === 'demo' ? <Badge tone="warning">Demo</Badge> : <Badge tone="brand">Real</Badge>}</span>
                      <span className="block truncate text-[11px] text-ink-500">{[c.subSector ?? c.category?.replace(/_/g, ' '), c.brand, c.operatorName, c.capacity ? `${c.capacity} ${c.capacityLabel ?? ''}`.trim() : undefined, c.rating ? `rated ${c.rating}` : undefined].filter(Boolean).join(' · ')}</span>
                      <span className="mt-1 block h-1 w-full rounded-full bg-ink-100"><span className={cx('block h-1 rounded-full', i === 0 && !showAll ? 'bg-rose-600' : 'bg-brand-600')} style={{ width: `${Math.max(4, (c.score / maxScore) * 100)}%` }} /></span>
                    </span>
                    <span className="shrink-0 text-right text-[11px] text-ink-500"><span className="block font-semibold text-ink-800">{c.score}</span>{c.distanceM} m</span>
                  </li>
                ))}
              </ol>
              <p className="mt-1 flex items-center gap-1 text-[10px] text-ink-400"><Crosshair size={10} /> Score = proximity (up to 40) + same offer + scale vs this site + rating + brand or group backing. Hover a row for the breakdown.</p>
            </div>
          )}
          {!result.competitors.length && <div className="text-xs text-ink-500">No same-sector operators within {fmtR(radius)}. Try a wider radius.</div>}
        </>
      )}
    </div>
  )
}
