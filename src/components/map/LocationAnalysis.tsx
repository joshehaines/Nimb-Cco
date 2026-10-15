import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, X, Radar } from 'lucide-react'
import { useUi, type LayerKey } from '@/store/ui'
import { Checkbox, cx } from '@/components/ui'
import { CONSTRAINT_COLOURS } from './MapView'

type Row =
  | { kind: 'layer'; label: string; layer: LayerKey; hint?: string; demo?: boolean }
  | { kind: 'constraint'; label: string; constraint: string }
  | { kind: 'tenure'; label: string; tenure: 'freehold' | 'leasehold' }
  | { kind: 'pricePaid'; label: string; value: 'residential' | 'nonResidential' }
  | { kind: 'missing'; label: string; source: string }
  | { kind: 'custom'; label: string; node: ReactNode }

interface Group { title: string; rows: Row[] }

/**
 * Location Analysis: the Nimbus-style right-hand drawer that groups every layer by what a
 * surveyor is asking (boundaries, planning, constraints, markets, infrastructure, mobility).
 * Rows marked "not collected" name the open source that fills them when the office load runs.
 * Constraint rows come from planning.data.gov.uk via the planning_pdg loader; a kind with no rows in
 * view simply draws nothing.
 */
export function LocationAnalysis() {
  const { locationOpen, setLocationOpen, layers, setLayer, constraintKinds, setConstraintKinds, tenureFilter, setTenureFilter, pricePaidFilter, setPricePaidFilter, viewCounts } = useUi()
  const [open, setOpen] = useState<Record<string, boolean>>({ Boundaries: true, Planning: true })
  const toggleConstraint = (k: string, on: boolean) => {
    const next = on ? Array.from(new Set([...constraintKinds, k])) : constraintKinds.filter((x) => x !== k)
    setConstraintKinds(next)
    if (on && !layers.constraints) setLayer('constraints', true)
    if (!next.length && layers.constraints) setLayer('constraints', false)
  }
  const GROUPS: Group[] = [
    { title: 'Boundaries', rows: [
      { kind: 'layer', label: 'Title plans (HM Land Registry)', layer: 'titles' },
      { kind: 'tenure', label: 'Freehold', tenure: 'freehold' },
      { kind: 'tenure', label: 'Leasehold', tenure: 'leasehold' },
      { kind: 'missing', label: 'Unregistered land', source: 'HMLR INSPIRE gap analysis after load' },
      { kind: 'missing', label: 'Local authority and ward boundaries', source: 'ONS Open Geography' },
    ] },
    { title: 'Planning', rows: [
      { kind: 'layer', label: 'Planning applications', layer: 'planning', demo: true },
      { kind: 'missing', label: 'Planning decisions (last 12 months)', source: 'planning.data.gov.uk + PlanIt' },
      { kind: 'missing', label: 'Local plan allocations', source: 'planning.data.gov.uk (local-plan-boundary, allocation)' },
    ] },
    { title: 'Planning policy constraints', rows: [
      { kind: 'constraint', label: 'Article 4 direction', constraint: 'Article 4' },
      { kind: 'constraint', label: 'Green Belt', constraint: 'Green Belt' },
      { kind: 'constraint', label: 'Conservation area', constraint: 'Conservation Area' },
      { kind: 'constraint', label: 'Areas of Outstanding Natural Beauty', constraint: 'AONB' },
      { kind: 'constraint', label: 'National Parks', constraint: 'National Park' },
    ] },
    { title: 'Environmental constraints', rows: [
      { kind: 'constraint', label: 'Flood Zone 2', constraint: 'Flood Zone 2' },
      { kind: 'constraint', label: 'Flood Zone 3', constraint: 'Flood Zone 3' },
      { kind: 'constraint', label: 'Tree preservation orders', constraint: 'TPO' },
      { kind: 'constraint', label: 'Sites of Special Scientific Interest', constraint: 'SSSI' },
      { kind: 'constraint', label: 'Ancient woodland', constraint: 'Ancient Woodland' },
      { kind: 'missing', label: 'Nitrate vulnerable zones', source: 'Environment Agency' },
    ] },
    { title: 'Heritage constraints', rows: [
      { kind: 'constraint', label: 'Listed buildings', constraint: 'Listed Building' },
      { kind: 'constraint', label: 'Scheduled monuments', constraint: 'Scheduled Monument' },
      { kind: 'missing', label: 'Registered parks and gardens', source: 'Historic England NHLE' },
    ] },
    { title: 'Strategic land', rows: [
      { kind: 'constraint', label: 'Brownfield register', constraint: 'Brownfield Register' },
      { kind: 'missing', label: 'Strategic housing land (SHLAA)', source: 'Each local planning authority' },
    ] },
    { title: 'Residential market', rows: [
      { kind: 'pricePaid', label: 'Price paid: residential sales', value: 'residential' },
      { kind: 'missing', label: 'For sale and to let listings', source: 'Portal feeds under licence (never scraped)' },
      { kind: 'missing', label: 'Population and demographics', source: 'ONS Census 2021 (catchment page uses modelled data today)' },
    ] },
    { title: 'Commercial market', rows: [
      { kind: 'pricePaid', label: 'Price paid: non-residential sales', value: 'nonResidential' },
      { kind: 'layer', label: 'Sold comparables (trading businesses)', layer: 'comparables', demo: true },
      { kind: 'layer', label: 'Real businesses (Overture Maps)', layer: 'poi' },
      { kind: 'missing', label: 'Rateable values on the map', source: 'VOA rating list, once licensed' },
    ] },
    { title: 'Energy and infrastructure', rows: [
      { kind: 'missing', label: 'Substations and grid capacity', source: 'DNO open data portals' },
      { kind: 'missing', label: 'EV charging points', source: 'National Chargepoint Registry' },
    ] },
    { title: 'Mobility', rows: [
      { kind: 'layer', label: 'Traffic counts (DfT)', layer: 'traffic' },
      { kind: 'layer', label: 'Footfall', layer: 'footfall', demo: true },
      { kind: 'missing', label: 'Bus stops and rail stations', source: 'NaPTAN' },
    ] },
    { title: 'Other', rows: [
      { kind: 'layer', label: 'Building footprints', layer: 'buildings' },
      { kind: 'layer', label: 'Demo businesses', layer: 'businesses', demo: true },
    ] },
  ]
  const onCount = (g: Group) => g.rows.filter((r) => (r.kind === 'layer' && layers[r.layer]) || (r.kind === 'constraint' && layers.constraints && constraintKinds.includes(r.constraint)) || (r.kind === 'pricePaid' && layers.pricePaid && (pricePaidFilter === 'all' || pricePaidFilter === r.value))).length

  if (!locationOpen)
    return (
      <button className="no-print absolute right-0 top-1/2 z-20 flex -translate-y-1/2 items-center gap-1.5 rounded-l-md border border-r-0 border-ink-200 bg-surface px-1.5 py-3 text-xs font-semibold shadow [writing-mode:vertical-rl] rotate-180" onClick={() => setLocationOpen(true)} aria-label="Open Location Analysis">
        <Radar size={14} className="rotate-90" /> Location Analysis
      </button>
    )
  return (
    <aside className="no-print card absolute bottom-3 right-3 top-3 z-30 flex w-[320px] max-w-[calc(100%-24px)] flex-col overflow-hidden shadow-xl" role="region" aria-label="Location Analysis">
      <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold"><Radar size={16} /> Location Analysis</div>
        <button className="btn-ghost btn-sm" onClick={() => setLocationOpen(false)} aria-label="Close"><X size={14} /></button>
      </div>
      <div className="border-b border-ink-100 px-3 py-1.5 text-[11px] text-ink-500">Properties in view: <strong className="text-ink-800">{viewCounts.titles}</strong> · {viewCounts.freehold} freehold · {viewCounts.leasehold} leasehold</div>
      <div className="flex-1 overflow-y-auto">
        {GROUPS.map((g) => {
          const isOpen = open[g.title] ?? false
          const n = onCount(g)
          return (
            <div key={g.title} className="border-b border-ink-100">
              <button className="flex w-full items-center justify-between px-3 py-2 text-left text-sm font-medium" onClick={() => setOpen({ ...open, [g.title]: !isOpen })} aria-expanded={isOpen}>
                <span>{g.title}</span><span className="flex items-center gap-2">{n > 0 && <span className="rounded-full bg-brand-50 px-1.5 text-[10px] font-semibold text-brand-700">{n}</span>}{isOpen ? <ChevronDown size={14} className="text-ink-400" /> : <ChevronRight size={14} className="text-ink-400" />}</span>
              </button>
              {isOpen && (
                <div className="px-3 pb-2">
                  {g.rows.map((r, i) => {
                    if (r.kind === 'layer') return <Checkbox key={i} checked={layers[r.layer]} onChange={(v) => setLayer(r.layer, v)} label={<span className="flex items-center gap-1.5">{r.label}{r.demo && <span className="rounded bg-amber-100 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Demo</span>}</span>} />
                    if (r.kind === 'constraint') return <Checkbox key={i} checked={layers.constraints && constraintKinds.includes(r.constraint)} onChange={(v) => toggleConstraint(r.constraint, v)} swatch={<span className="mt-1 h-3 w-3 shrink-0 rounded-sm border" style={{ background: `${CONSTRAINT_COLOURS[r.constraint]}33`, borderColor: CONSTRAINT_COLOURS[r.constraint] }} />} label={r.label} />
                    if (r.kind === 'tenure') return <Checkbox key={i} checked={tenureFilter[r.tenure]} disabled={!layers.titles} onChange={(v) => setTenureFilter({ [r.tenure]: v })} swatch={<span className="mt-1 h-3 w-3 shrink-0 rounded-sm" style={{ background: r.tenure === 'freehold' ? '#2f64b4' : '#c2410c' }} />} label={<span>{r.label} <span className="text-ink-500">({viewCounts[r.tenure]} in view)</span></span>} />
                    if (r.kind === 'pricePaid') {
                      const on = layers.pricePaid && (pricePaidFilter === 'all' || pricePaidFilter === r.value)
                      const other = r.value === 'residential' ? 'nonResidential' : 'residential'
                      const otherOn = layers.pricePaid && (pricePaidFilter === 'all' || pricePaidFilter === other)
                      return <Checkbox key={i} checked={on} onChange={(v) => { if (v) { setLayer('pricePaid', true); setPricePaidFilter(otherOn ? 'all' : r.value) } else if (otherOn) setPricePaidFilter(other); else setLayer('pricePaid', false) }} swatch={<span className="mt-1 h-3 w-3 shrink-0 rounded-full" style={{ background: r.value === 'residential' ? '#94a3b8' : '#7c3aed' }} />} label={r.label} />
                    }
                    if (r.kind === 'missing') return <div key={i} className={cx('flex items-start gap-2.5 py-1.5 text-sm text-ink-400')}><span className="mt-0.5 h-4 w-4 shrink-0 rounded border border-dashed border-ink-300" /><span><span>{r.label}</span><span className="block text-[11px] leading-snug">Not collected yet · {r.source}</span></span></div>
                    return <div key={i}>{r.node}</div>
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
      <div className="border-t border-ink-100 px-3 py-1.5 text-[10px] text-ink-400">Rows marked "not collected" are on the data plan; the office load script fetches them from the named source.</div>
    </aside>
  )
}
