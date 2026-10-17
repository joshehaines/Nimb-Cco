import { Trash2, Pentagon, Ruler, Copy } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useShallow } from 'zustand/react/shallow'
import { haversineM, polygonAreaSqm } from '@/lib/geo'
import { num } from '@/lib/format'

export const areaReadout = (coords: [number, number][]) => {
  const m2 = polygonAreaSqm({ type: 'Polygon', coordinates: [[...coords, coords[0]]] })
  return { m2, ft2: m2 * 10.7639, acres: m2 / 4046.856, ha: m2 / 10_000 }
}
export const lengthReadout = (coords: [number, number][]) => {
  const m = coords.slice(1).reduce((s, p, i) => s + haversineM(coords[i], p), 0)
  return { m, km: m / 1000, miles: m / 1609.344 }
}

/** Measurements for every polygon or line the user has drawn, in the units surveyors quote. */
export function DrawPanel() {
  const { drawings, removeDrawing, clearDrawings, requestFlyTo } = useUi(useShallow((s) => ({ drawings: s.drawings, removeDrawing: s.removeDrawing, clearDrawings: s.clearDrawings, requestFlyTo: s.requestFlyTo })))
  if (!drawings.length) return null
  return (
    <div className="no-print card absolute bottom-16 right-3 z-20 w-[240px] overflow-hidden text-xs shadow">
      <div className="flex items-center justify-between border-b border-ink-200 px-3 py-1.5"><span className="font-semibold">My shapes ({drawings.length})</span><button className="text-[11px] text-brand-700 hover:underline" onClick={clearDrawings}>Remove my polygons</button></div>
      <ul className="max-h-[40vh] divide-y divide-ink-100 overflow-y-auto">
        {drawings.map((d, i) => {
          const centre = d.coords.reduce((a, c) => [a[0] + c[0] / d.coords.length, a[1] + c[1] / d.coords.length], [0, 0])
          if (d.kind === 'polygon') {
            const a = areaReadout(d.coords)
            const text = `${num(Math.round(a.m2))} m² · ${num(Math.round(a.ft2))} ft² · ${a.acres.toFixed(3)} acres · ${a.ha.toFixed(3)} ha`
            return (
              <li key={d.id} className="px-3 py-2">
                <div className="flex items-center justify-between"><button className="flex items-center gap-1 font-medium hover:underline" onClick={() => requestFlyTo(centre[0], centre[1])}><Pentagon size={12} className="text-violet-600" /> Site {i + 1}</button><span className="flex gap-0.5"><button className="btn-ghost btn-sm" title="Copy measurements" onClick={() => navigator.clipboard?.writeText(text)}><Copy size={11} /></button><button className="btn-ghost btn-sm" title="Remove" onClick={() => removeDrawing(d.id)}><Trash2 size={11} /></button></span></div>
                <div className="mt-1 rounded-md bg-violet-50 px-2 py-1.5 text-violet-900 dark:bg-violet-950/40 dark:text-violet-100">
                  <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">Site area</div>
                  <div className="grid grid-cols-2 gap-x-2 tabular-nums"><span>{num(Math.round(a.m2))} m²</span><span>{num(Math.round(a.ft2))} ft²</span><span>{a.acres.toFixed(3)} acres</span><span>{a.ha.toFixed(3)} hectares</span></div>
                </div>
              </li>
            )
          }
          const l = lengthReadout(d.coords)
          return (
            <li key={d.id} className="px-3 py-2">
              <div className="flex items-center justify-between"><button className="flex items-center gap-1 font-medium hover:underline" onClick={() => requestFlyTo(centre[0], centre[1])}><Ruler size={12} className="text-sky-600" /> Measurement {i + 1}</button><button className="btn-ghost btn-sm" title="Remove" onClick={() => removeDrawing(d.id)}><Trash2 size={11} /></button></div>
              <div className="mt-1 tabular-nums text-ink-700">{num(Math.round(l.m))} m · {l.km.toFixed(2)} km · {l.miles.toFixed(2)} miles</div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
