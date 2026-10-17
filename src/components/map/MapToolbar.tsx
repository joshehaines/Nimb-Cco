import { useEffect, useState, type MutableRefObject, type RefObject } from 'react'
import { ZoomIn, ZoomOut, Compass, Mountain, PersonStanding, Ruler, Pentagon, MapPin, LocateFixed, Maximize2, Minimize2, Layers2, X } from 'lucide-react'
import type { Map as MLMap } from 'maplibre-gl'
import { useUi, type MapTool } from '@/store/ui'
import { useShallow } from 'zustand/react/shallow'
import { cx } from '@/components/ui'
import { haversineM, polygonAreaSqm } from '@/lib/geo'
import { num } from '@/lib/format'

/** Google Street View at a point, in a new tab. */
export const streetViewUrl = (lon: number, lat: number) => `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${lat.toFixed(6)},${lon.toFixed(6)}`

const TOOL_HINT: Record<MapTool, string> = {
  none: '',
  polygon: 'Click the corners of the site. Double-click or press Enter to finish, Esc to cancel.',
  line: 'Click along the route to measure. Double-click or Enter to finish, Esc to cancel.',
  pin: 'Click anywhere on the map to see what is there.',
  streetview: 'Click a road to open Google Street View at that spot.',
}

/** Bottom toolbar: view controls on the left, tools on the right. */
export function MapToolbar({ mapRef, containerRef, onBasemap }: { mapRef: MutableRefObject<MLMap | null>; containerRef: RefObject<HTMLDivElement>; onBasemap: () => void }) {
  const { tool, setTool, draft, finishDraft, cancelDraft, undoDraftPoint } = useUi(useShallow((s) => ({ tool: s.tool, setTool: s.setTool, draft: s.draft, finishDraft: s.finishDraft, cancelDraft: s.cancelDraft, undoDraftPoint: s.undoDraftPoint })))
  const [pitched, setPitched] = useState(false)
  const [full, setFull] = useState(false)
  const [locating, setLocating] = useState(false)
  const map = () => mapRef.current
  useEffect(() => {
    const onFs = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFs)
    return () => document.removeEventListener('fullscreenchange', onFs)
  }, [])
  const pick = (t: MapTool) => setTool(tool === t ? 'none' : t)
  const locate = () => {
    if (!navigator.geolocation) return alert('Location is not available in this browser.')
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); map()?.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 16 }); useUi.getState().setPin([pos.coords.longitude, pos.coords.latitude]) },
      () => { setLocating(false); alert('Could not get your location.') },
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }
  const Btn = ({ title, onClick, active, children, disabled, desktop }: { title: string; onClick: () => void; active?: boolean; children: React.ReactNode; disabled?: boolean; desktop?: boolean }) => (
    <button type="button" title={title} aria-label={title} aria-pressed={active} disabled={disabled} onClick={onClick} className={cx('h-9 w-9 shrink-0 items-center justify-center rounded-md transition-colors disabled:opacity-40', desktop ? 'hidden sm:flex' : 'flex', active ? 'bg-brand-700 text-white' : 'text-ink-700 hover:bg-ink-100')}>
      {children}
    </button>
  )
  return (
    <>
      {tool !== 'none' && (
        <div className="no-print absolute bottom-16 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-1.5 text-xs text-brand-900 shadow dark:border-brand-900/60 dark:bg-brand-950/60 dark:text-brand-100">
          <span>{TOOL_HINT[tool]}</span>
          {(tool === 'polygon' || tool === 'line') && draft.length > 0 && <span className="text-brand-700">{draft.length} point{draft.length === 1 ? '' : 's'}{tool === 'polygon' && draft.length >= 3 ? ` · ${num(Math.round(polygonAreaSqm({ type: 'Polygon', coordinates: [[...draft, draft[0]]] })))} m²` : tool === 'line' && draft.length >= 2 ? ` · ${num(Math.round(draft.slice(1).reduce((s, p, i) => s + haversineM(draft[i], p), 0)))} m` : ''}</span>}
          {(tool === 'polygon' || tool === 'line') && <><button className="font-medium hover:underline" onClick={undoDraftPoint} disabled={!draft.length}>undo</button><button className="font-medium hover:underline" onClick={finishDraft} disabled={draft.length < (tool === 'line' ? 2 : 3)}>finish</button></>}
          <button className="btn-ghost btn-sm -mr-1" onClick={cancelDraft} aria-label="Cancel tool"><X size={12} /></button>
        </div>
      )}
      <div className="scrollbar-none no-print absolute bottom-3 left-1/2 z-20 flex max-w-[calc(100%-16px)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-lg border border-ink-200 bg-surface/95 p-1 shadow-lg backdrop-blur" role="toolbar" aria-label="Map tools">
        <Btn title="Map type" onClick={onBasemap}><Layers2 size={17} /></Btn>
        <Btn desktop title="Zoom in" onClick={() => map()?.zoomIn()}><ZoomIn size={17} /></Btn>
        <Btn desktop title="Zoom out" onClick={() => map()?.zoomOut()}><ZoomOut size={17} /></Btn>
        <Btn title="Reset north and tilt (right-drag to rotate)" onClick={() => map()?.resetNorthPitch()}><Compass size={17} /></Btn>
        <Btn desktop title={pitched ? 'Flat view' : '3D tilt'} active={pitched} onClick={() => { const p = !pitched; setPitched(p); map()?.easeTo({ pitch: p ? 55 : 0 }) }}><Mountain size={17} /></Btn>
        <span className="mx-1 h-6 w-px bg-ink-200" />
        <Btn title="Street View: click a road" active={tool === 'streetview'} onClick={() => pick('streetview')}><PersonStanding size={18} className={tool === 'streetview' ? '' : 'text-amber-500'} /></Btn>
        <Btn title="Measure a distance" active={tool === 'line'} onClick={() => pick('line')}><Ruler size={17} /></Btn>
        <Btn title="Draw a site and measure its area" active={tool === 'polygon'} onClick={() => pick('polygon')}><Pentagon size={17} /></Btn>
        <Btn title="Drop a pin: what is here?" active={tool === 'pin'} onClick={() => pick('pin')}><MapPin size={17} /></Btn>
        <Btn title="My location" onClick={locate} disabled={locating}><LocateFixed size={17} className={locating ? 'animate-pulse' : ''} /></Btn>
        <Btn title={full ? 'Exit full screen' : 'Full screen'} onClick={() => (document.fullscreenElement ? document.exitFullscreen() : containerRef.current?.parentElement?.requestFullscreen?.())}>{full ? <Minimize2 size={17} /> : <Maximize2 size={17} />}</Btn>
      </div>
    </>
  )
}
