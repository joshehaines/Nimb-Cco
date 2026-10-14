import { useState } from 'react'
import { Layers, ChevronLeft, SlidersHorizontal } from 'lucide-react'
import { useUi } from '@/store/ui'
import { Toggle, Chip, Collapsible, cx } from '@/components/ui'
import { SECTORS } from '@/data/types'
import { SECTOR_COLOURS, OWNER_CATEGORY_COLOURS } from '@/lib/sectors'
import { CONSTRAINT_COLOURS } from './MapView'

export function LayerPanel({ hidden = false }: { hidden?: boolean }) {
  const [open, setOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1280 : true))
  const { layers, toggleLayer, constraintKinds, setConstraintKinds, sectorFilter, setSectorFilter, setShowFilters, filters, highlightIds, highlightLabel, setHighlight } = useUi()
  const activeFilterCount = [filters.sectors.length, filters.tenure ? 1 : 0, filters.distressOnly ? 1 : 0, filters.distressFlags.length, filters.ownerCategories.length, filters.leaseExpiringWithinMonths ? 1 : 0, filters.epcWorseThan ? 1 : 0, filters.minRateableValue ? 1 : 0, filters.excludeConstraints.length].reduce((a, b) => a + b, 0)

  if (hidden) return null
  if (!open)
    return (
      <div className="absolute left-3 top-3 z-10 flex gap-2">
        <button onClick={() => setOpen(true)} className="card flex items-center gap-2 px-3 py-2 text-sm font-medium">
          <Layers size={16} /> Layers
        </button>
        <button onClick={() => setShowFilters(true)} className={cx('card flex items-center gap-2 px-3 py-2 text-sm font-medium', activeFilterCount > 0 && 'text-brand-700')}>
          <SlidersHorizontal size={16} /> Filters{activeFilterCount > 0 ? ` (${activeFilterCount})` : ''}
        </button>
      </div>
    )

  return (
    <div className="card absolute left-3 top-3 z-10 flex max-h-[calc(100%-24px)] w-[min(280px,calc(100%-24px))] flex-col overflow-hidden">
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
        {highlightIds.length > 0 && (
          <div className="flex items-center justify-between gap-2 border-b border-amber-200 dark:border-amber-900/60 bg-amber-50 dark:bg-amber-950/40 px-3 py-2 text-xs text-amber-900 dark:text-amber-200">
            <span><span className="mr-1 inline-block h-2.5 w-2.5 rounded-full border border-amber-700 bg-yellow-300" />{highlightIds.length} highlighted{highlightLabel ? ` · ${highlightLabel}` : ''}</span>
            <button className="font-medium hover:underline" onClick={() => setHighlight([])}>clear</button>
          </div>
        )}
        <Collapsible title="Data layers">
          <Toggle checked={layers.titles} onChange={() => toggleLayer('titles')} label="Ownership titles" hint="HMLR INSPIRE + CCOD/OCOD, coloured by proprietor type" />
          <Toggle checked={layers.businesses} onChange={() => toggleLayer('businesses')} label="Demo businesses" hint="Synthetic operators with registers, ownership and distress signals" />
          <Toggle checked={layers.poi} onChange={() => toggleLayer('poi')} label="Real businesses (Overture)" hint="Pubs, hotels, care, childcare, dental, medical, pharmacy, retail, leisure from Overture Maps places" />
          <Toggle checked={layers.buildings} onChange={() => toggleLayer('buildings')} label="Buildings (Overture)" hint="OpenStreetMap-derived footprints, town centres" />
          <Toggle checked={layers.pricePaid} onChange={() => toggleLayer('pricePaid')} label="Price paid (HMLR)" hint="HM Land Registry sales 2019 to 2025; location approximated from the postcode" />
          <Toggle checked={layers.comparables} onChange={() => toggleLayer('comparables')} label="Sold comparables" hint="Business sales, sized by price; dark ring" />
          <Toggle checked={layers.planning} onChange={() => toggleLayer('planning')} label="Planning applications" hint="Daily from Planning Data + PlanIt" />
          <Toggle checked={layers.traffic} onChange={() => toggleLayer('traffic')} label="Traffic counts" hint="DfT AADF, sized by vehicles per day" />
          <Toggle checked={layers.footfall} onChange={() => toggleLayer('footfall')} label="Footfall heatmap" hint="Vendor mobile-location cells (demo data)" />
          <Toggle checked={layers.constraints} onChange={() => toggleLayer('constraints')} label="Planning constraints" hint="Flood, heritage, Green Belt, Article 4" />
          <Toggle checked={layers.satellite} onChange={() => toggleLayer('satellite')} label="Aerial imagery" />
        </Collapsible>
        <Collapsible title="Sectors" right={sectorFilter.length ? <button className="text-[11px] text-brand-700" onClick={(e) => { e.stopPropagation(); setSectorFilter([]) }}>clear</button> : undefined}>
          <div className="flex flex-wrap gap-1.5">
            {SECTORS.filter((s) => s !== 'Other').map((s) => (
              <Chip key={s} label={s} colour={SECTOR_COLOURS[s]} selected={sectorFilter.includes(s)} onClick={() => setSectorFilter(sectorFilter.includes(s) ? sectorFilter.filter((x) => x !== s) : [...sectorFilter, s])} />
            ))}
          </div>
          <p className="mt-2 text-[11px] text-ink-500">Red halo = distress signal on operator or regulator record.</p>
        </Collapsible>
        {layers.constraints && (
          <Collapsible title="Constraint types">
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(CONSTRAINT_COLOURS).map(([k, c]) => (
                <Chip key={k} label={k} colour={c} selected={constraintKinds.includes(k)} onClick={() => setConstraintKinds(constraintKinds.includes(k) ? constraintKinds.filter((x) => x !== k) : [...constraintKinds, k])} />
              ))}
            </div>
          </Collapsible>
        )}
        <Collapsible title="Ownership legend" defaultOpen={false}>
          <ul className="space-y-1 text-xs">
            {Object.entries(OWNER_CATEGORY_COLOURS).map(([k, c]) => (
              <li key={k} className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm border border-black/10" style={{ background: c }} /> {k}
              </li>
            ))}
            <li className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border-2 border-rose-700" /> Distressed occupier or owner</li>
          </ul>
        </Collapsible>
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
