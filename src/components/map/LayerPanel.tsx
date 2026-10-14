import { useState } from 'react'
import { Layers, ChevronLeft, SlidersHorizontal, EyeOff } from 'lucide-react'
import { useUi, PIN_LAYERS, type LayerKey } from '@/store/ui'
import { Checkbox, Chip, Collapsible, cx } from '@/components/ui'
import { SECTORS } from '@/data/types'
import { SECTOR_COLOURS, OWNER_CATEGORY_COLOURS } from '@/lib/sectors'
import { CONSTRAINT_COLOURS } from './MapView'

/** Legend swatches that match the map symbols, so a tick box shows what it will put on the map. */
const Dot = ({ fill, stroke = '#fff', size = 12, dashed = false }: { fill: string; stroke?: string; size?: number; dashed?: boolean }) => (
  <span aria-hidden className={cx('mt-0.5 inline-block shrink-0 rounded-full', dashed && 'border-dashed')} style={{ width: size, height: size, background: fill, border: `${dashed ? 2 : 1.5}px ${dashed ? 'dashed' : 'solid'} ${stroke}` }} />
)
const Square = ({ fill, stroke }: { fill: string; stroke: string }) => <span aria-hidden className="mt-1 inline-block h-3 w-3 shrink-0 rounded-sm" style={{ background: fill, border: `1.5px solid ${stroke}` }} />
const Multi = ({ colours }: { colours: string[] }) => (
  <span aria-hidden className="mt-1 inline-flex shrink-0 -space-x-1">{colours.map((c, i) => <span key={i} className="h-3 w-3 rounded-full border border-white" style={{ background: c }} />)}</span>
)

interface Row { key: LayerKey; label: string; hint: string; swatch: React.ReactNode; demo?: boolean }
interface Group { title: string; rows: Row[] }

const GROUPS: Group[] = [
  {
    title: 'Ownership',
    rows: [
      { key: 'titles', label: 'Title plans', hint: 'HM Land Registry title extents. Plain outlines; colour by proprietor type or tenure below.', swatch: <Square fill="rgba(47,100,180,0.12)" stroke="#2f64b4" /> },
    ],
  },
  {
    title: 'Businesses',
    rows: [
      { key: 'poi', label: 'Real businesses', hint: 'Pubs, hotels, care, childcare, dental, medical, pharmacy, retail and leisure from Overture Maps places. Small dots, coloured by sector.', swatch: <Multi colours={[SECTOR_COLOURS.Pub, SECTOR_COLOURS.Hotel, SECTOR_COLOURS['Care Home']]} /> },
      { key: 'businesses', label: 'Demo businesses', hint: 'Fictional operators with ownership, leases, registers and distress signals, for trying sourcing, pipeline and campaigns. Larger white-ringed dots.', swatch: <Dot fill={SECTOR_COLOURS.Pub} />, demo: true },
    ],
  },
  {
    title: 'Market evidence',
    rows: [
      { key: 'pricePaid', label: 'Price paid', hint: 'HM Land Registry sales 2019 to 2025. Purple non-residential, grey residential, sized by price.', swatch: <Multi colours={['#7c3aed', '#94a3b8']} /> },
      { key: 'comparables', label: 'Sold comparables', hint: 'Trading-business sales sized by price, with a dark ring.', swatch: <Dot fill={SECTOR_COLOURS.Hotel} stroke="#111827" />, demo: true },
    ],
  },
  {
    title: 'Planning',
    rows: [
      { key: 'planning', label: 'Applications', hint: 'Blue pending, green approved, red refused, grey withdrawn.', swatch: <Multi colours={['#2563eb', '#15803d', '#be123c']} />, demo: true },
      { key: 'constraints', label: 'Constraints', hint: 'Flood zones, conservation areas, listed buildings, Green Belt, Article 4.', swatch: <Square fill="rgba(14,116,144,0.25)" stroke="#0e7490" />, demo: true },
    ],
  },
  {
    title: 'Context',
    rows: [
      { key: 'buildings', label: 'Buildings', hint: 'Overture building footprints in the demo areas.', swatch: <Square fill="rgba(100,116,139,0.25)" stroke="#64748b" /> },
      { key: 'traffic', label: 'Traffic counts', hint: 'Department for Transport count points sized by vehicles per day. Darker blue is a more recent count.', swatch: <Dot fill="#1e3a8a" size={14} /> },
      { key: 'footfall', label: 'Footfall heatmap', hint: 'Mobile-location footfall bands (demo cells until a vendor feed is connected).', swatch: <Square fill="#f59e0b" stroke="#dc2626" />, demo: true },
    ],
  },
]

export function LayerPanel({ hidden = false }: { hidden?: boolean }) {
  const [open, setOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1280 : true))
  const { layers, setLayer, clearPins, analysis, clearAnalysis, constraintKinds, setConstraintKinds, sectorFilter, setSectorFilter, setShowFilters, filters, highlightIds, highlightLabel, setHighlight, titleColour, setTitleColour } = useUi()
  const activeFilterCount = [filters.sectors.length, filters.tenure ? 1 : 0, filters.distressOnly ? 1 : 0, filters.distressFlags.length, filters.ownerCategories.length, filters.leaseExpiringWithinMonths ? 1 : 0, filters.epcWorseThan ? 1 : 0, filters.minRateableValue ? 1 : 0, filters.excludeConstraints.length].reduce((a, b) => a + b, 0)
  const pinCount = PIN_LAYERS.filter((k) => layers[k]).length
  const anyBusinessLayer = layers.businesses || layers.poi || layers.comparables

  if (hidden) return null
  if (!open)
    return (
      <div className="absolute left-3 top-3 z-10 flex gap-2">
        <button onClick={() => setOpen(true)} className="card flex items-center gap-2 px-3 py-2 text-sm font-medium" data-tour="layers">
          <Layers size={16} /> Layers{pinCount > 0 ? <span className="rounded-full bg-brand-600 px-1.5 text-[10px] text-white">{pinCount}</span> : null}
        </button>
        <button onClick={() => setShowFilters(true)} className={cx('card flex items-center gap-2 px-3 py-2 text-sm font-medium', activeFilterCount > 0 && 'text-brand-700')}>
          <SlidersHorizontal size={16} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>
    )

  return (
    <div className="card absolute left-3 top-3 z-10 flex max-h-[calc(100%-24px)] w-[min(300px,calc(100%-24px))] flex-col overflow-hidden" data-tour="layers">
      <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Layers size={16} /> Layers
        </div>
        <div className="flex items-center gap-1">
          <button className={cx('btn-ghost btn-sm relative', activeFilterCount > 0 && 'text-brand-700')} onClick={() => setShowFilters(true)} title="Sourcing filters">
            <SlidersHorizontal size={14} /> Filters
            {activeFilterCount > 0 && <span className="absolute -right-1 -top-1 rounded-full bg-brand-600 px-1 text-[9px] text-white">{activeFilterCount}</span>}
          </button>
          <button className="btn-ghost btn-sm" onClick={() => setOpen(false)} aria-label="Collapse">
            <ChevronLeft size={14} />
          </button>
        </div>
      </div>
      <div className="overflow-y-auto">
        <div className="flex items-center justify-between gap-2 border-b border-ink-100 px-4 py-2 text-[11px] text-ink-500">
          <span>{pinCount === 0 ? 'Tick a layer to add it to the map.' : `${pinCount} layer${pinCount === 1 ? '' : 's'} on the map`}</span>
          {pinCount > 0 && <button className="flex items-center gap-1 font-medium text-brand-700 hover:underline" onClick={clearPins}><EyeOff size={12} /> Clear all</button>}
        </div>
        {analysis && (
          <div className="flex items-center justify-between gap-2 border-b border-teal-200 dark:border-teal-900/60 bg-teal-50 dark:bg-teal-950/40 px-3 py-2 text-xs text-teal-900 dark:text-teal-200">
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed border-teal-700" />{analysis.label} · {analysis.radiusM >= 1000 ? `${analysis.radiusM / 1000} km` : `${analysis.radiusM} m`} ring, {analysis.businessIds.length + analysis.poiIds.length} highlighted</span>
            <button className="font-medium hover:underline" onClick={clearAnalysis}>clear</button>
          </div>
        )}
        {highlightIds.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-b border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full border border-amber-700 bg-yellow-300" />{highlightIds.length} highlighted{highlightLabel ? ` · ${highlightLabel}` : ''}</span>
            <button className="font-medium hover:underline" onClick={() => setHighlight([])}>clear</button>
          </div>
        )}
        {GROUPS.map((g) => {
          const on = g.rows.filter((r) => layers[r.key]).length
          return (
            <Collapsible key={g.title} title={g.title} right={on > 0 ? <span className="rounded-full bg-brand-50 px-1.5 text-[10px] font-semibold text-brand-700">{on}</span> : undefined}>
              {g.rows.map((r) => (
                <Checkbox key={r.key} checked={layers[r.key]} onChange={(v) => setLayer(r.key, v)} swatch={r.swatch} hint={r.hint} label={<span className="flex items-center gap-1.5">{r.label}{r.demo && <span className="rounded bg-amber-100 px-1 text-[9px] font-semibold uppercase tracking-wide text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">Demo</span>}</span>} />
              ))}
            </Collapsible>
          )
        })}
        <Collapsible title="Title colouring" defaultOpen={false}>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {([['none', 'Plain'], ['owner', 'Proprietor type'], ['tenure', 'Tenure']] as const).map(([v, l]) => <Chip key={v} label={l} selected={titleColour === v} onClick={() => setTitleColour(v)} />)}
          </div>
          <ul className={cx('space-y-1 text-xs', titleColour !== 'owner' && 'hidden')}>
            {Object.entries(OWNER_CATEGORY_COLOURS).map(([k, c]) => (
              <li key={k} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm border border-black/10" style={{ background: c }} /> {k}
              </li>
            ))}
          </ul>
          <ul className="mt-1 space-y-1 text-xs"><li className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border-2 border-dashed border-rose-700" /> Dashed red: distress signal on occupier or owner (zoom 16+)</li><li className="text-ink-500">Titles draw from zoom 14.5; outlines follow the real building footprints in the demo areas.</li></ul>
        </Collapsible>
        {anyBusinessLayer && (
          <Collapsible title="Sectors" right={sectorFilter.length ? <button className="text-[11px] text-brand-700" onClick={(e) => { e.stopPropagation(); setSectorFilter([]) }}>clear</button> : undefined}>
            <div className="flex flex-wrap gap-1.5">
              {SECTORS.filter((s) => s !== 'Other').map((s) => (
                <Chip key={s} label={s} colour={SECTOR_COLOURS[s]} selected={sectorFilter.includes(s)} onClick={() => setSectorFilter(sectorFilter.includes(s) ? sectorFilter.filter((x) => x !== s) : [...sectorFilter, s])} />
              ))}
            </div>
            <p className="mt-2 text-[11px] text-ink-500">Pick sectors to show only those businesses. Red halo on a demo business = distress signal.</p>
          </Collapsible>
        )}
        {layers.constraints && (
          <Collapsible title="Constraint types">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CONSTRAINT_COLOURS).map(([k, c]) => (
                <Chip key={k} label={k} colour={c} selected={constraintKinds.includes(k)} onClick={() => setConstraintKinds(constraintKinds.includes(k) ? constraintKinds.filter((x) => x !== k) : [...constraintKinds, k])} />
              ))}
            </div>
          </Collapsible>
        )}
        {layers.footfall && (
          <Collapsible title="Footfall legend" defaultOpen>
            <div className="h-2 w-full rounded-full" style={{ background: 'linear-gradient(90deg,#fef3c7,#fcd34d,#f59e0b,#dc2626,#7f1d1d)' }} />
            <div className="mt-1 flex justify-between text-[10px] text-ink-500"><span>Band 1</span><span>Band 9 (3,500+/day)</span></div>
          </Collapsible>
        )}
      </div>
    </div>
  )
}
