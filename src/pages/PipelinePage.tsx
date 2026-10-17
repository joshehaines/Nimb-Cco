import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Plus, Printer, CalendarClock, GripVertical, Upload } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useShallow } from 'zustand/react/shallow'
import { provider, PIPELINE_STAGES, SECTORS, type PipelineStage, type WatchItem, type Business } from '@/data'
import { Badge, Button, Input, Select, Stat, Empty, cx } from '@/components/ui'
import { SECTOR_COLOURS } from '@/lib/sectors'
import { gbp, dateShort, monthsUntil } from '@/lib/format'
import { DealDrawer } from './DealDrawer'
import { useAlerts } from '@/store/alerts'

const STAGE_TONE: Record<PipelineStage, string> = {
  Prospect: 'border-ink-300',
  Approach: 'border-sky-400',
  Instruction: 'border-brand-600',
  'On market': 'border-violet-500',
  'Under offer': 'border-amber-500',
  Exchanged: 'border-green-500',
  Completed: 'border-green-700',
  Lost: 'border-rose-500',
}
const OFFICES = ['Birmingham', 'London', 'Manchester', 'Bristol', 'Leeds', 'Edinburgh', 'Exeter', 'Nottingham']

/** Deal pipeline over My Sites: every watched site is a card that moves through stages. Stage reports print per column. */
export function PipelinePage() {
  const { watchlist, updateWatch, setStage, removeWatch, addWatch, projects } = useUi(useShallow((s) => ({ watchlist: s.watchlist, updateWatch: s.updateWatch, setStage: s.setStage, removeWatch: s.removeWatch, addWatch: s.addWatch, projects: s.projects })))
  const [bizById, setBizById] = useState<Record<string, Business>>({})
  const [filterOffice, setFilterOffice] = useState('')
  const [filterSector, setFilterSector] = useState('')
  const [filterProject, setFilterProject] = useState('')
  const [dragId, setDragId] = useState<string | null>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [openDeal, setOpenDeal] = useState<string | null>(null)
  const [alertCounts, setAlertCounts] = useState<Record<string, { n: number; critical: number; unread: number }>>({})
  const alertState = useAlerts((s) => s.state)
  const [adding, setAdding] = useState(false)
  const [newQuery, setNewQuery] = useState('')
  const [newResults, setNewResults] = useState<Business[]>([])
  const nav = useNavigate()
  const select = useUi((s) => s.select)

  useEffect(() => {
    ;(async () => {
      const ids = watchlist.filter((w) => w.entityType === 'business').map((w) => w.entityId)
      const entries = await Promise.all(ids.map(async (id) => [id, await provider.getBusiness(id)] as const))
      const map: Record<string, Business> = {}
      for (const [id, b] of entries) if (b) map[id] = b
      setBizById(map)
      // Signal counts per deal: alerts on the business, its title or its operator.
      const all = await provider.getAlerts()
      const counts: Record<string, { n: number; critical: number; unread: number }> = {}
      for (const w of watchlist) {
        const b = map[w.entityId]
        const ids = new Set([w.entityId, b?.businessId, b?.titleNumber, b?.operatorCompanyNumber, b?.freeholderCompanyNumber].filter(Boolean) as string[])
        const hits = all.filter((a) => ids.has(a.entityId) || (a.businessId && ids.has(a.businessId)) || (a.titleNumber && ids.has(a.titleNumber)))
        counts[w.id] = { n: hits.length, critical: hits.filter((a) => a.severity === 'critical').length, unread: hits.filter((a) => !(alertState[a.alertId]?.read ?? a.read)).length }
      }
      setAlertCounts(counts)
      // Fill sector from the business when missing
      for (const w of watchlist) if (w.entityType === 'business' && !w.sector && map[w.entityId]) updateWatch(w.id, { sector: map[w.entityId].sector })
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchlist.length, alertState])

  useEffect(() => {
    if (!newQuery.trim()) return setNewResults([])
    const h = setTimeout(async () => {
      const r = await provider.search(newQuery, 8)
      const bs = (await Promise.all(r.filter((x) => x.kind === 'business').map((x) => provider.getBusiness(x.id)))).filter((b): b is Business => !!b)
      setNewResults(bs)
    }, 150)
    return () => clearTimeout(h)
  }, [newQuery])

  const items = useMemo(() => watchlist.filter((w) => (!filterOffice || w.office === filterOffice) && (!filterSector || w.sector === filterSector) && (!filterProject || w.project === filterProject)), [watchlist, filterOffice, filterSector, filterProject])
  const byStage = (s: PipelineStage) => items.filter((w) => (w.stage ?? 'Prospect') === s)
  const active = items.filter((w) => !['Completed', 'Lost'].includes(w.stage ?? 'Prospect'))
  const PROB: Record<PipelineStage, number> = { Prospect: 0.1, Approach: 0.2, Instruction: 0.5, 'On market': 0.6, 'Under offer': 0.85, Exchanged: 0.98, Completed: 0, Lost: 0 }
  const feeWeighted = active.reduce((sum, w) => sum + (w.feeEstimate ?? 0) * PROB[w.stage ?? 'Prospect'], 0)
  const overdue = items.filter((w) => w.nextActionDate && w.nextActionDate < new Date().toISOString().slice(0, 10) && !['Completed', 'Lost'].includes(w.stage ?? 'Prospect'))

  const open = (w: WatchItem) => {
    if (w.entityType === 'company') nav(`/companies/${w.entityId}`)
    else {
      select({ type: w.entityType as 'title' | 'business', id: w.entityId })
      nav(`/map/${w.entityType}/${w.entityId}`)
    }
  }

  const dealItem = openDeal ? watchlist.find((w) => w.id === openDeal) : undefined
  return (
    <div className="relative flex h-full flex-col">
      {dealItem && <DealDrawer item={dealItem} onClose={() => setOpenDeal(null)} />}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-surface px-5 py-3">
        <div className="mr-2">
          <h1 className="text-lg font-semibold">Deal pipeline</h1>
          <p className="text-xs text-ink-500">Drag cards between stages. Click a deal for its signal timeline, owner, next action and notes. Each stage prints as a client-ready stage report.</p>
        </div>
        <Select aria-label="Filter by office" value={filterOffice} onChange={(e) => setFilterOffice(e.target.value)} className="w-auto py-1 text-xs"><option value="">All offices</option>{OFFICES.map((o) => <option key={o}>{o}</option>)}</Select>
        <Select aria-label="Filter by sector" value={filterSector} onChange={(e) => setFilterSector(e.target.value)} className="w-auto py-1 text-xs"><option value="">All sectors</option>{SECTORS.map((s) => <option key={s}>{s}</option>)}</Select>
        <Select aria-label="Filter by project" value={filterProject} onChange={(e) => setFilterProject(e.target.value)} className="w-auto py-1 text-xs"><option value="">All projects</option>{projects.map((p) => <option key={p}>{p}</option>)}</Select>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" onClick={() => nav('/crm/export?source=pipeline')} disabled={!watchlist.length} title="Export deals, sites and accounts to the CRM"><Upload size={14} /> Export to CRM</Button>
          <Button size="sm" variant="primary" onClick={() => setAdding(!adding)}><Plus size={14} /> Add site</Button>
        </div>
      </div>
      {adding && (
        <div className="border-b border-ink-200 bg-brand-50 px-5 py-3">
          <div className="flex items-center gap-2"><Input autoFocus placeholder="Search a business to add to the pipeline…" value={newQuery} onChange={(e) => setNewQuery(e.target.value)} className="max-w-md" /><Button size="sm" variant="ghost" onClick={() => setAdding(false)}>Close</Button></div>
          {newResults.length > 0 && (
            <ul className="mt-2 flex flex-wrap gap-2">{newResults.map((b) => <li key={b.businessId}><button className="btn-secondary btn-sm" onClick={() => { addWatch({ entityType: 'business', entityId: b.businessId, label: b.name, stage: 'Prospect', sector: b.sector } as never); setNewQuery(''); setAdding(false) }}><span className="h-2 w-2 rounded-full" style={{ background: SECTOR_COLOURS[b.sector] }} />{b.name} <span className="text-ink-500">· {b.sector}</span></button></li>)}</ul>
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-3 border-b border-ink-200 bg-ink-50 px-5 py-3 md:grid-cols-4">
        <Stat label="Active deals" value={active.length} />
        <Stat label="Weighted fee forecast" value={gbp(feeWeighted, { compact: true })} sub="stage-probability weighted" />
        <Stat label="Under offer / exchanged" value={items.filter((w) => w.stage === 'Under offer' || w.stage === 'Exchanged').length} tone="good" />
        <Stat label="Overdue actions" value={overdue.length} tone={overdue.length ? 'critical' : 'neutral'} />
      </div>
      {!watchlist.length ? (
        <div className="p-6"><Empty title="Pipeline is empty" hint="Add sites from the map, sourcing results or the button above. Each card tracks stage, fee estimate and next action." action={<Link to="/sourcing" className="btn-primary">Source sites</Link>} /></div>
      ) : (
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-4">
          {PIPELINE_STAGES.map((stage) => {
            const cards = byStage(stage)
            const fees = cards.reduce((s, w) => s + (w.feeEstimate ?? 0), 0)
            return (
              <div
                key={stage}
                className={cx('flex w-[272px] shrink-0 flex-col rounded-lg border-t-4 bg-ink-100/60', STAGE_TONE[stage], dragId && 'outline-dashed outline-1 outline-brand-300')}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => { if (dragId) setStage(dragId, stage); setDragId(null) }}
              >
                <div className="flex items-center justify-between px-3 py-2">
                  <div><div className="text-sm font-semibold">{stage}</div><div className="text-[11px] text-ink-500">{cards.length} · fees {gbp(fees, { compact: true })}</div></div>
                  <Link to={`/print/stage/${encodeURIComponent(stage)}`} target="_blank" className="btn-ghost btn-sm" title="Stage report"><Printer size={14} /></Link>
                </div>
                <div className="flex-1 space-y-2 overflow-y-auto px-2 pb-2">
                  {cards.map((w) => {
                    const b = bizById[w.entityId]
                    const due = w.nextActionDate ? monthsUntil(w.nextActionDate) : undefined
                    const isOverdue = w.nextActionDate && w.nextActionDate < new Date().toISOString().slice(0, 10)
                    return (
                      <div key={w.id} draggable onDragStart={() => setDragId(w.id)} onDragEnd={() => setDragId(null)} className={cx('card cursor-grab p-2.5 active:cursor-grabbing', dragId === w.id && 'opacity-50')}>
                        <div className="flex items-start gap-1.5">
                          <GripVertical size={14} className="mt-0.5 shrink-0 text-ink-300" />
                          <div className="min-w-0 flex-1">
                            <button className="block w-full truncate text-left text-sm font-medium hover:underline" onClick={() => setOpenDeal(w.id)} title="Open the deal">{w.label}</button>
                            <div className="flex flex-wrap items-center gap-1 text-[11px] text-ink-500">
                              {(w.sector || b?.sector) && <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full" style={{ background: SECTOR_COLOURS[(w.sector || b?.sector)!] }} />{w.sector || b?.sector}</span>}
                              {b && <span>· {b.tenure}</span>}
                              {w.office && <span>· {w.office}</span>}
                            </div>
                          </div>
                        </div>
                        {((b && b.distressFlags.length > 0) || alertCounts[w.id]?.n) ? <div className="mt-1.5 flex flex-wrap items-center gap-1">{b?.distressFlags.slice(0, 2).map((f) => <Badge key={f} tone="critical">{f}</Badge>)}{alertCounts[w.id]?.n ? <Badge tone={alertCounts[w.id].critical ? 'critical' : 'info'} title="Signals on this deal">{alertCounts[w.id].n} signal{alertCounts[w.id].n === 1 ? '' : 's'}{alertCounts[w.id].unread ? ` · ${alertCounts[w.id].unread} new` : ''}</Badge> : null}</div> : null}
                        {editing === w.id ? (
                          <div className="mt-2 space-y-1.5 text-xs">
                            <Select aria-label="Office" value={w.office ?? ''} onChange={(e) => updateWatch(w.id, { office: e.target.value || undefined })} className="py-1 text-xs"><option value="">Office</option>{OFFICES.map((o) => <option key={o}>{o}</option>)}</Select>
                            <Input placeholder="Assignee" value={w.assignee ?? ''} onChange={(e) => updateWatch(w.id, { assignee: e.target.value })} className="py-1 text-xs" />
                            <div className="grid grid-cols-2 gap-1.5">
                              <Input type="number" placeholder="Guide price £" value={w.guidePrice ?? ''} onChange={(e) => updateWatch(w.id, { guidePrice: e.target.value ? Number(e.target.value) : undefined })} className="py-1 text-xs" />
                              <Input type="number" placeholder="Fee est. £" value={w.feeEstimate ?? ''} onChange={(e) => updateWatch(w.id, { feeEstimate: e.target.value ? Number(e.target.value) : undefined })} className="py-1 text-xs" />
                            </div>
                            <Input placeholder="Next action" value={w.nextAction ?? ''} onChange={(e) => updateWatch(w.id, { nextAction: e.target.value })} className="py-1 text-xs" />
                            <Input type="date" value={w.nextActionDate ?? ''} onChange={(e) => updateWatch(w.id, { nextActionDate: e.target.value || undefined })} className="py-1 text-xs" />
                            <Select aria-label="Project" value={w.project ?? ''} onChange={(e) => updateWatch(w.id, { project: e.target.value || undefined })} className="py-1 text-xs"><option value="">No project</option>{projects.map((p) => <option key={p}>{p}</option>)}</Select>
                            <textarea placeholder="Notes" value={w.notes ?? ''} onChange={(e) => updateWatch(w.id, { notes: e.target.value })} className="input py-1 text-xs" rows={2} />
                            <div className="flex justify-between"><button className="text-rose-700 dark:text-rose-300 hover:underline" onClick={() => removeWatch(w.id)}>Remove</button><button className="text-brand-700 hover:underline" onClick={() => setEditing(null)}>Done</button></div>
                          </div>
                        ) : (
                          <div className="mt-2 space-y-0.5 text-[11px] text-ink-600">
                            {(w.guidePrice || w.feeEstimate) && <div>{w.guidePrice ? `Guide ${gbp(w.guidePrice, { compact: true })}` : ''}{w.guidePrice && w.feeEstimate ? ' · ' : ''}{w.feeEstimate ? `Fee ${gbp(w.feeEstimate, { compact: true })}` : ''}</div>}
                            {w.nextAction && <div className={cx('flex items-center gap-1', isOverdue ? 'font-medium text-rose-700 dark:text-rose-300' : '')}><CalendarClock size={11} /> {w.nextAction}{w.nextActionDate ? ` · ${dateShort(w.nextActionDate)}${due !== undefined && due < 0 ? ' (overdue)' : ''}` : ''}</div>}
                            {w.assignee && <div>Owner: {w.assignee}</div>}
                            {w.notes && <div className="line-clamp-2 text-ink-500">{w.notes}</div>}
                            <div className="flex items-center justify-between pt-1"><span className="text-ink-400">{w.stageChangedAt ? `in stage since ${dateShort(w.stageChangedAt)}` : `added ${dateShort(w.addedAt)}`}</span><span className="flex gap-2"><button className="text-ink-500 hover:underline" onClick={() => open(w)}>Site</button><button className="text-brand-700 hover:underline" onClick={() => setEditing(w.id)}>Edit</button><button className="text-brand-700 hover:underline" onClick={() => setOpenDeal(w.id)}>Deal</button></span></div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                  {!cards.length && <div className="rounded-md border border-dashed border-ink-200 p-3 text-center text-[11px] text-ink-400">Drop here</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
