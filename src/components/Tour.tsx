import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui'

interface Step { title: string; body: string; route?: string; target?: string }

const STEPS: Step[] = [
  { title: 'Welcome', body: 'Property Intelligence brings ownership, operators, regulators, planning, rates, traffic and sales evidence onto one map, with Christie & Co sector registers that no mapping product carries. This tour takes a minute.' },
  { title: 'Search anything', body: 'Addresses, postcodes, title numbers, business and company names, planning references. Press ⌘K or Ctrl+K from any page.', target: 'search' },
  { title: 'The map', body: 'You land on title plans only. Use the sector chips to show those businesses, or open Layers to add sales, planning, traffic and constraints. Click anything for its panel.', route: '/map', target: 'layers' },
  { title: 'Find', body: 'Sourcing filters every trading site by sector, tenure, owner type, rateable value, lease expiry, EPC and distress. Comparables and Catchment sit alongside it.', route: '/sourcing', target: 'nav-find' },
  { title: 'Track', body: 'My sites, the deal pipeline, alerts and lease events. The red dot means unread alerts.', route: '/pipeline', target: 'nav-track' },
  { title: 'Outreach', body: 'Direct-to-owner campaigns with the licence gate built in, and clean exports to the CRM. Every export is written to the audit log.', route: '/campaigns', target: 'nav-outreach' },
  { title: 'Settings', body: 'Your initials at the bottom of the rail open settings: theme, an Ordnance Survey key for the basemap, this tour and sign out.', target: 'settings' },
]

/** Short guided tour, started from Settings. Highlights the element marked data-tour="<target>" and keeps a card near it. */
export function Tour({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [i, setI] = useState(0)
  const nav = useNavigate()
  const step = STEPS[i]
  useEffect(() => {
    if (!open) return
    setI(0)
  }, [open])
  useEffect(() => {
    if (!open) return
    if (step.route) nav(step.route)
    const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
    el?.classList.add('tour-target')
    el?.scrollIntoView({ block: 'nearest' })
    return () => el?.classList.remove('tour-target')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, i])
  if (!open) return null
  const el = step.target ? document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`) : null
  const r = el?.getBoundingClientRect()
  const style: React.CSSProperties = r && window.innerWidth >= 900 ? { position: 'fixed', top: Math.min(window.innerHeight - 260, Math.max(16, r.top)), left: Math.min(window.innerWidth - 380, r.right + 16) } : { position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)' }
  return (
    <div className="fixed inset-0 z-[70] bg-black/30" onClick={onClose}>
      <div className="card w-[360px] max-w-[calc(100vw-32px)] p-4 shadow-2xl" style={style} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Guided tour">
        <div className="flex items-start justify-between gap-2"><div className="text-[11px] font-semibold uppercase tracking-wide text-brand-700">Step {i + 1} of {STEPS.length}</div><button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close tour"><X size={14} /></button></div>
        <h2 className="mt-1 text-base font-semibold">{step.title}</h2>
        <p className="mt-1 text-sm text-ink-700">{step.body}</p>
        <div className="mt-4 flex items-center justify-between">
          <Button size="sm" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}><ChevronLeft size={14} /> Back</Button>
          <div className="flex gap-1">{STEPS.map((_, k) => <span key={k} className={`h-1.5 w-1.5 rounded-full ${k === i ? 'bg-brand-700' : 'bg-ink-300'}`} />)}</div>
          {i < STEPS.length - 1 ? <Button size="sm" variant="primary" onClick={() => setI(i + 1)}>Next <ChevronRight size={14} /></Button> : <Button size="sm" variant="primary" onClick={onClose}>Finish</Button>}
        </div>
      </div>
    </div>
  )
}
