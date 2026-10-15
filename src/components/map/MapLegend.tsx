import { useState } from 'react'
import { ChevronDown, ChevronUp, KeyRound } from 'lucide-react'
import { useUi, PIN_LAYERS, type LayerKey, type TitleColour } from '@/store/ui'
import { cx } from '@/components/ui'
import { OWNER_CATEGORY_COLOURS, SECTOR_COLOURS } from '@/lib/sectors'

const OWNER_SHORT: Record<string, string> = {
  'Limited Company or Public Limited Company': 'Company',
  'Private Individual': 'Private individual',
  'Local Authority': 'Council',
  'Housing Association': 'Housing association',
  Charity: 'Charity',
  'Overseas Company': 'Overseas company',
  Other: 'Other',
}
const PIN_LABEL: Partial<Record<LayerKey, { label: string; swatch: React.ReactNode }>> = {
  poi: { label: 'Places, Overture Maps (by sector)', swatch: <span className="inline-flex -space-x-1">{[SECTOR_COLOURS.Pub, SECTOR_COLOURS.Hotel, SECTOR_COLOURS['Care Home'], SECTOR_COLOURS.Dental].map((c, i) => <span key={i} className="h-2.5 w-2.5 rounded-full border border-ink-800/60" style={{ background: c }} />)}</span> },
  businesses: { label: 'Businesses (by sector)', swatch: <span className="h-3 w-3 rounded-full border-2 border-white shadow-sm" style={{ background: SECTOR_COLOURS.Pub }} /> },
  pricePaid: { label: 'Price paid: non-residential / residential', swatch: <span className="inline-flex gap-0.5"><span className="h-2.5 w-2.5 rounded-full bg-[#7c3aed]" /><span className="h-2.5 w-2.5 rounded-full bg-[#94a3b8]" /></span> },
  comparables: { label: 'Sold comparables', swatch: <span className="h-3 w-3 rounded-full border-2 border-[#111827]/80" style={{ background: SECTOR_COLOURS.Hotel }} /> },
  planning: { label: 'Applications: pending / approved / refused', swatch: <span className="inline-flex gap-0.5"><span className="h-2.5 w-2.5 rounded-full bg-[#2563eb]" /><span className="h-2.5 w-2.5 rounded-full bg-[#15803d]" /><span className="h-2.5 w-2.5 rounded-full bg-[#be123c]" /></span> },
  constraints: { label: 'Planning constraints', swatch: <span className="h-3 w-3 rounded-sm border border-dashed border-[#0e7490] bg-[#0e7490]/20" /> },
  buildings: { label: 'Building footprints', swatch: <span className="h-3 w-3 rounded-sm border border-[#aab4c5] bg-[#d6dce6]" /> },
  traffic: { label: 'Traffic counts (size = vehicles/day)', swatch: <span className="h-3 w-3 rounded-full border-2 border-white bg-[#1e3a8a] shadow-sm" /> },
  footfall: { label: 'Footfall bands', swatch: <span className="h-3 w-5 rounded-sm" style={{ background: 'linear-gradient(90deg,#fef3c7,#f59e0b,#7f1d1d)' }} /> },
}

/** Floating key, top right under the basemap picker: colour titles by owner type or tenure and read every active layer's symbol. */
export function MapLegend() {
  const { layers, titleColour, setTitleColour, analysis } = useUi()
  const [open, setOpen] = useState(() => (typeof window !== 'undefined' ? window.innerWidth >= 1280 : true))
  const pins = PIN_LAYERS.filter((k) => layers[k] && PIN_LABEL[k])
  const active = (layers.titles ? 1 : 0) + pins.length + (analysis ? 1 : 0)
  if (!open)
    return (
      <button className="no-print card absolute right-3 top-14 z-20 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium shadow" onClick={() => setOpen(true)} aria-label="Show map keys">
        <KeyRound size={13} /> Keys ({active}) <ChevronDown size={12} />
      </button>
    )
  return (
    <div className="no-print card absolute right-3 top-14 z-20 w-[230px] overflow-hidden text-xs shadow" role="region" aria-label="Map keys">
      <div className="flex items-center justify-between border-b border-ink-200 px-3 py-1.5">
        <span className="font-semibold">Active layers ({active})</span>
        <button className="btn-ghost btn-sm -mr-1" onClick={() => setOpen(false)} aria-label="Collapse keys"><ChevronUp size={13} /></button>
      </div>
      <div className="max-h-[55vh] space-y-2 overflow-y-auto px-3 py-2">
        {layers.titles && (
          <div>
            <div className="mb-1 flex items-center justify-between"><span className="font-medium text-ink-800">Title plans</span></div>
            <div className="mb-1.5 flex gap-1" role="radiogroup" aria-label="Colour titles by">
              {([['none', 'Plain'], ['owner', 'Owner type'], ['tenure', 'Tenure']] as [TitleColour, string][]).map(([v, l]) => (
                <button key={v} role="radio" aria-checked={titleColour === v} onClick={() => setTitleColour(v)} className={cx('rounded-full border px-2 py-0.5 text-[11px] transition-colors', titleColour === v ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 text-ink-700 hover:bg-ink-100')}>{l}</button>
              ))}
            </div>
            {titleColour === 'owner' && <ul className="space-y-0.5">{Object.entries(OWNER_CATEGORY_COLOURS).filter(([k]) => k !== 'Other').map(([k, c]) => <li key={k} className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm border border-black/10" style={{ background: c }} />{OWNER_SHORT[k] ?? k}</li>)}</ul>}
            {titleColour === 'tenure' && <ul className="space-y-0.5"><li className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-[#2f64b4]" />Freehold</li><li className="flex items-center gap-2"><span className="h-3 w-3 rounded-sm bg-[#c2410c]" />Leasehold</li></ul>}
            {titleColour === 'none' && <div className="flex items-center gap-2 text-ink-600"><span className="h-3 w-3 rounded-sm border border-[#5b7db8] bg-[#2f64b4]/10" />Registered title extent</div>}
            <div className="mt-0.5 flex items-center gap-2 text-ink-600"><span className="h-3 w-3 rounded-sm border-2 border-dashed border-rose-700" />Distress signal (zoom 16+)</div>
          </div>
        )}
        {pins.length > 0 && (
          <ul className="space-y-1 border-t border-ink-100 pt-2">
            {pins.map((k) => <li key={k} className="flex items-center gap-2 text-ink-700"><span className="flex w-6 shrink-0 justify-center">{PIN_LABEL[k]!.swatch}</span>{PIN_LABEL[k]!.label}</li>)}
          </ul>
        )}
        {analysis && <div className="flex items-center gap-2 border-t border-ink-100 pt-2 text-ink-700"><span className="flex w-6 shrink-0 justify-center"><span className="h-3 w-3 rounded-full border-2 border-dashed border-teal-700 bg-teal-700/10" /></span>{analysis.label}; yellow halo = competitor</div>}
        {!layers.titles && !pins.length && !analysis && <div className="text-ink-500">Nothing on the map. Tick layers on the left.</div>}
      </div>
    </div>
  )
}
