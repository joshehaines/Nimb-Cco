import { useEffect, useRef, useState } from 'react'
import { Layers, SlidersHorizontal, EyeOff, X, ChevronRight } from 'lucide-react'
import { useUi, PIN_LAYERS, type LayerKey } from '@/store/ui'
import { useShallow } from 'zustand/react/shallow'
import { Checkbox, Chip, cx } from '@/components/ui'
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

interface Row { key: LayerKey; label: string; hint: string; swatch: React.ReactNode; demo?: boolean; hidden?: boolean }
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
      { key: 'poi', label: 'Places (Overture Maps)', hint: 'Pubs, hotels, care, childcare, dental, medical, pharmacy, retail and leisure from Overture Maps places, nationwide. Small dots, coloured by sector.', swatch: <Multi colours={[SECTOR_COLOURS.Pub, SECTOR_COLOURS.Hotel, SECTOR_COLOURS['Care Home']]} /> },
      { key: 'businesses', label: 'Businesses', hint: 'Registered businesses from CQC, Ofsted, NHSBSA and the Food Standards Agency, linked to their title, owner, operator, rates and EPC. Larger white-ringed dots; red halo = distress signal.', swatch: <Dot fill={SECTOR_COLOURS.Pub} /> },
    ],
  },
  {
    title: 'Market evidence',
    rows: [
      { key: 'pricePaid', label: 'Price paid', hint: 'HM Land Registry sales 2019 to 2025. Purple non-residential, grey residential, sized by price.', swatch: <Multi colours={['#7c3aed', '#94a3b8']} /> },
      { key: 'comparables', label: 'Sold comparables', hint: 'Trading-business sales sized by price, with a dark ring.', swatch: <Dot fill={SECTOR_COLOURS.Hotel} stroke="#111827" />, hidden: true },
    ],
  },
  {
    title: 'Planning',
    rows: [
      { key: 'planning', label: 'Applications', hint: 'Blue pending, green approved, red refused, grey withdrawn.', swatch: <Multi colours={['#2563eb', '#15803d', '#be123c']} /> },
      { key: 'constraints', label: 'Constraints', hint: 'Flood zones, conservation areas, listed buildings, Green Belt, Article 4.', swatch: <Square fill="rgba(14,116,144,0.25)" stroke="#0e7490" /> },
    ],
  },
  {
    title: 'Context',
    rows: [
      { key: 'buildings', label: 'Buildings', hint: 'Overture Maps building footprints where loaded.', swatch: <Square fill="rgba(100,116,139,0.25)" stroke="#64748b" /> },
      { key: 'traffic', label: 'Traffic counts', hint: 'Department for Transport count points sized by vehicles per day. Darker blue is a more recent count.', swatch: <Dot fill="#1e3a8a" size={14} /> },
      { key: 'footfall', label: 'Footfall heatmap', hint: 'Mobile-location footfall bands, available once a vendor feed is connected.', swatch: <Square fill="#f59e0b" stroke="#dc2626" />, hidden: true },
    ],
  },
]

const QUICK_SECTORS = SECTORS.filter((s) => s !== 'Other')

/** Top-left of the map: one Layers button (a popover that is also the key), Filters, and one-tap sector chips. */
export function LayerPanel({ hidden = false }: { hidden?: boolean }) {
  const [open, setOpen] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const { layers, setLayer, clearPins, analysis, clearAnalysis, constraintKinds, setConstraintKinds, sectorFilter, setSectorFilter, setShowFilters, filters, highlightIds, highlightLabel, setHighlight, titleColour, setTitleColour, setLocationOpen } = useUi(useShallow((s) => ({ layers: s.layers, setLayer: s.setLayer, clearPins: s.clearPins, analysis: s.analysis, clearAnalysis: s.clearAnalysis, constraintKinds: s.constraintKinds, setConstraintKinds: s.setConstraintKinds, sectorFilter: s.sectorFilter, setSectorFilter: s.setSectorFilter, setShowFilters: s.setShowFilters, filters: s.filters, highlightIds: s.highlightIds, highlightLabel: s.highlightLabel, setHighlight: s.setHighlight, titleColour: s.titleColour, setTitleColour: s.setTitleColour, setLocationOpen: s.setLocationOpen })))
  const activeFilterCount = [filters.sectors.length, filters.tenure ? 1 : 0, filters.distressOnly ? 1 : 0, filters.distressFlags.length, filters.ownerCategories.length, filters.leaseExpiringWithinMonths ? 1 : 0, filters.epcWorseThan ? 1 : 0, filters.minRateableValue ? 1 : 0, filters.excludeConstraints.length, filters.distressedOwners ? 1 : 0, filters.distressedTenants ? 1 : 0, filters.minFootprintSqm || filters.maxFootprintSqm ? 1 : 0, filters.minSiteCoverage !== undefined || filters.maxSiteCoverage !== undefined ? 1 : 0, filters.leaseStartAfter || filters.leaseStartBefore || filters.leaseEndAfter || filters.leaseEndBefore ? 1 : 0].reduce((a, b) => a + b, 0)
  const onCount = (layers.titles ? 1 : 0) + PIN_LAYERS.filter((k) => layers[k]).length

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [open])

  const toggleSector = (s: (typeof QUICK_SECTORS)[number]) => {
    const next = sectorFilter.includes(s) ? sectorFilter.filter((x) => x !== s) : [...sectorFilter, s]
    setSectorFilter(next)
    if (next.length && !layers.businesses) setLayer('businesses', true)
  }

  if (hidden) return null
  return (
    <div ref={wrap} className="no-print pointer-events-none absolute left-3 right-3 top-3 z-20 flex flex-col items-start gap-2">
      <div className="pointer-events-auto flex max-w-full items-center gap-2">
        <button onClick={() => setOpen(!open)} aria-expanded={open} className={cx('card flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium shadow', open && 'ring-2 ring-brand-500/40')} data-tour="layers">
          <Layers size={16} /> Layers{onCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] text-white">{onCount}</span>}
        </button>
        <button onClick={() => setShowFilters(true)} className={cx('card flex shrink-0 items-center gap-2 px-3 py-2 text-sm font-medium shadow', activeFilterCount > 0 && 'text-brand-700')}>
          <SlidersHorizontal size={16} /> Filters{activeFilterCount > 0 && <span className="rounded-full bg-brand-600 px-1.5 text-[10px] text-white">{activeFilterCount}</span>}
        </button>
        <div className="scrollbar-none hidden min-w-0 items-center gap-1.5 overflow-x-auto rounded-full sm:flex" role="group" aria-label="Show businesses by sector">
          {QUICK_SECTORS.map((s) => {
            const on = sectorFilter.includes(s)
            return (
              <button key={s} type="button" onClick={() => toggleSector(s)} aria-pressed={on} className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium shadow-sm transition-colors', on ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 bg-surface text-ink-700 hover:bg-ink-50')}>
                <span className="h-2 w-2 rounded-full" style={{ background: on ? '#fff' : SECTOR_COLOURS[s] }} />{s}
              </button>
            )
          })}
          {sectorFilter.length > 0 && <button type="button" onClick={() => setSectorFilter([])} className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-ink-600 hover:text-ink-900"><X size={12} /> All sectors</button>}
        </div>
      </div>

      {(analysis || highlightIds.length > 0) && !open && (
        <div className="pointer-events-auto flex flex-wrap gap-2">
          {analysis && <span className="card flex items-center gap-2 px-2.5 py-1 text-xs text-teal-900 dark:text-teal-200"><span className="inline-block h-2.5 w-2.5 rounded-full border-2 border-dashed border-teal-700" />{analysis.label} · {analysis.radiusM >= 1000 ? `${analysis.radiusM / 1000} km` : `${analysis.radiusM} m`}<button className="text-ink-500 hover:text-ink-900" onClick={clearAnalysis} aria-label="Clear ring"><X size={12} /></button></span>}
          {highlightIds.length > 0 && <span className="card flex items-center gap-2 px-2.5 py-1 text-xs text-amber-900 dark:text-amber-200"><span className="inline-block h-2.5 w-2.5 rounded-full border border-amber-700 bg-yellow-300" />{highlightIds.length} highlighted{highlightLabel ? ` · ${highlightLabel}` : ''}<button className="text-ink-500 hover:text-ink-900" onClick={() => setHighlight([])} aria-label="Clear highlight"><X size={12} /></button></span>}
        </div>
      )}

      {open && (
        <div className="card pointer-events-auto flex max-h-[calc(100vh-180px)] w-[min(300px,100%)] flex-col overflow-hidden shadow-xl" role="dialog" aria-label="Map layers">
          <div className="flex items-center justify-between border-b border-ink-200 px-3 py-2 text-xs text-ink-500">
            <span>{onCount === 0 ? 'Nothing on the map yet' : `${onCount} on the map`}</span>
            <span className="flex items-center gap-3">
              {onCount > 0 && <button className="flex items-center gap-1 font-medium text-brand-700 hover:underline" onClick={() => { clearPins(); setLayer('titles', false) }}><EyeOff size={12} /> Clear</button>}
              <button className="text-ink-500 hover:text-ink-900" onClick={() => setOpen(false)} aria-label="Close layers"><X size={14} /></button>
            </span>
          </div>
          <div className="overflow-y-auto py-1">
            {GROUPS.map((g) => {
              const rows = g.rows.filter((r) => !r.hidden)
              if (!rows.length) return null
              return (
                <div key={g.title} className="px-3 pt-1.5">
                  <div className="text-[10.5px] font-semibold uppercase tracking-wide text-ink-500">{g.title}</div>
                  {rows.map((r) => (
                    <div key={r.key} title={r.hint}>
                      <Checkbox checked={layers[r.key]} onChange={(v) => setLayer(r.key, v)} swatch={r.swatch} label={r.label} />
                      {r.key === 'titles' && layers.titles && (
                        <div className="mb-1 ml-[26px]">
                          <div className="flex gap-1" role="radiogroup" aria-label="Colour titles by">
                            {([['none', 'Plain'], ['owner', 'Owner type'], ['tenure', 'Tenure']] as const).map(([v, l]) => <Chip key={v} label={l} selected={titleColour === v} onClick={() => setTitleColour(v)} />)}
                          </div>
                          {titleColour === 'owner' && <ul className="mt-1.5 grid grid-cols-2 gap-x-2 gap-y-0.5 text-[11px] text-ink-700">{Object.entries(OWNER_CATEGORY_COLOURS).filter(([k]) => k !== 'Other').map(([k, c]) => <li key={k} className="flex items-center gap-1.5 truncate"><span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: c }} />{k.replace('Limited Company or Public Limited Company', 'Company')}</li>)}</ul>}
                          {titleColour === 'tenure' && <ul className="mt-1.5 flex gap-3 text-[11px] text-ink-700"><li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#2f64b4]" />Freehold</li><li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#c2410c]" />Leasehold</li></ul>}
                          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-ink-500"><span className="h-2.5 w-2.5 rounded-sm border-2 border-dashed border-rose-700" />Dashed red: distress signal (zoom 16+)</div>
                        </div>
                      )}
                      {r.key === 'constraints' && layers.constraints && (
                        <div className="mb-1 ml-[26px] flex flex-wrap gap-1">
                          {Object.entries(CONSTRAINT_COLOURS).map(([k, c]) => <Chip key={k} label={k} colour={c} selected={constraintKinds.includes(k)} onClick={() => setConstraintKinds(constraintKinds.includes(k) ? constraintKinds.filter((x) => x !== k) : [...constraintKinds, k])} />)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
          <button className="flex items-center justify-between border-t border-ink-200 px-3 py-2 text-left text-xs font-medium text-brand-700 hover:bg-ink-50" onClick={() => { setOpen(false); setLocationOpen(true) }}>
            <span>All layers: tenure, constraints by type, market<span className="block font-normal text-ink-500">Grouped the way a site appraisal asks</span></span>
            <ChevronRight size={14} />
          </button>
        </div>
      )}
    </div>
  )
}
