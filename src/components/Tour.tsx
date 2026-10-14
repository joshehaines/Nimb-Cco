import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { Button } from '@/components/ui'

interface Step { title: string; body: string; route?: string; target?: string }

const STEPS: Step[] = [
  { title: 'Welcome', body: 'Property Intelligence brings ownership, operators, regulators, planning, rates, traffic and sales evidence onto one map, with Christie & Co sector registers that no mapping product carries. This tour takes a minute.' },
  { title: 'Search anything', body: 'Addresses, postcodes, title numbers, business and company names, planning references. Press ⌘K or Ctrl+K from any page.', target: 'search' },
  { title: 'The map', body: 'Ownership parcels coloured by proprietor type, demo and real businesses by sector, real HM Land Registry sales, buildings and DfT traffic. Switch layers on the left; click anything for its panel.', route: '/map', target: 'nav-map' },
  { title: 'Sourcing', body: 'Fifteen filters across sector, tenure, owner type, rateable value, lease expiry, EPC, regulator rating and distress signals. Results sort by the likely-to-transact score and export to CSV or straight into the CRM.', route: '/sourcing', target: 'nav-sourcing' },
  { title: 'Pipeline', body: 'Drag sites between stages. Fees are weighted by stage and every stage prints as a client report.', route: '/pipeline', target: 'nav-pipeline' },
  { title: 'Comparables and catchment', body: 'Sold trading businesses with price per bed, place or room beside real Land Registry sales, and a catchment view that counts real supply against the population around any site.', route: '/comparables', target: 'nav-comparables' },
  { title: 'Campaigns', body: 'Direct-to-owner letters with the licence gate built in: recipients known only from free ownership data stay blocked until the register is bought, and approval needs a recorded legitimate-interests assessment.', route: '/campaigns', target: 'nav-campaigns' },
  { title: 'Export to CRM', body: 'Clean, de-duplicated accounts, contacts, sites and deals with stable external IDs, in the column layout your CRM imports. Every export is written to the audit log.', route: '/crm/export', target: 'nav-crm-export' },
  { title: 'Settings', body: 'Your persona or account, an Ordnance Survey key for the basemap, demo areas and this tour live under Settings at the bottom of the navigation.', target: 'settings' },
]

/** Nine-step guided tour. Highlights the element marked data-tour="<target>" and keeps a card near it. */
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
