import { useState } from 'react'
import { Layers2, Check } from 'lucide-react'
import { useUi, type BasemapId } from '@/store/ui'
import { cx } from '@/components/ui'

export const BASEMAPS: { id: BasemapId; label: string; hint: string; needsKey?: boolean; swatch: string }[] = [
  { id: 'light', label: 'Streets', hint: 'OpenStreetMap, light', swatch: 'linear-gradient(135deg,#f3f1ea 0%,#d9e2d0 50%,#f8f6f0 100%)' },
  { id: 'minimal', label: 'Minimal', hint: 'Grey base so data stands out', swatch: 'linear-gradient(135deg,#f4f4f2 0%,#e3e4e6 100%)' },
  { id: 'dark', label: 'Dark', hint: 'Night mode', swatch: 'linear-gradient(135deg,#1c2130 0%,#2c3447 100%)' },
  { id: 'satellite', label: 'Satellite', hint: 'Aerial imagery', swatch: 'linear-gradient(135deg,#3f5a2f 0%,#6b7a4a 50%,#2f4a3a 100%)' },
  { id: 'hybrid', label: 'Hybrid', hint: 'Imagery with roads and labels', swatch: 'linear-gradient(135deg,#3f5a2f 0%,#8d8f6a 50%,#2f4a3a 100%)' },
  { id: 'os-light', label: 'OS Light', hint: 'Ordnance Survey, needs a key', needsKey: true, swatch: 'linear-gradient(135deg,#ffffff 0%,#e9eef5 100%)' },
  { id: 'os-road', label: 'OS Road', hint: 'Ordnance Survey road map, needs a key', needsKey: true, swatch: 'linear-gradient(135deg,#fdf6e3 0%,#d9e6f2 100%)' },
]

/** Floating basemap picker, bottom-left of the map. */
export function BasemapControl({ hasOsKey }: { hasOsKey: boolean }) {
  const basemap = useUi((s) => s.basemap)
  const setBasemap = useUi((s) => s.setBasemap)
  const [open, setOpen] = useState(false)
  const current = BASEMAPS.find((b) => b.id === basemap) ?? BASEMAPS[0]
  return (
    <div className="no-print absolute right-3 top-3 z-30 flex flex-col items-end gap-2">
      <button className="btn-secondary btn-sm shadow" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Change basemap">
        <span className="h-4 w-4 rounded-sm border border-ink-300" style={{ background: current.swatch }} />
        <Layers2 size={14} /> {current.label}
      </button>
      {open && (
        <div className="card flex flex-wrap justify-end gap-2 p-2 shadow-xl" style={{ maxWidth: 420 }} role="radiogroup" aria-label="Basemap">
          {BASEMAPS.filter((b) => !b.needsKey || hasOsKey).map((b) => (
            <button key={b.id} role="radio" aria-checked={basemap === b.id} title={b.hint} onClick={() => { setBasemap(b.id); setOpen(false) }} className={cx('group flex w-[76px] flex-col items-center gap-1 rounded-md p-1 text-[11px] transition-colors hover:bg-ink-100', basemap === b.id ? 'text-brand-700 font-semibold' : 'text-ink-700')}>
              <span className={cx('relative h-11 w-full rounded border', basemap === b.id ? 'border-brand-600 ring-2 ring-brand-200' : 'border-ink-200')} style={{ background: b.swatch }}>
                {basemap === b.id && <Check size={14} className="absolute right-1 top-1 rounded-full bg-brand-700 p-0.5 text-white" />}
              </span>
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
