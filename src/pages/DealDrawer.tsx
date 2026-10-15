import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { X, CalendarClock, UserRound, BellPlus, Printer, MapPin, Trash2, StickyNote, AlertTriangle } from 'lucide-react'
import type { Polygon } from 'geojson'
import { provider, PIPELINE_STAGES, type Business, type Title, type Alert, type PipelineStage, type WatchItem } from '@/data'
import { useUi } from '@/store/ui'
import { useAlerts } from '@/store/alerts'
import { useAuth } from '@/auth'
import { Badge, Button, Input, Select, cx } from '@/components/ui'
import { useStaff } from '@/data/staff'
import { dealScore } from '@/lib/dealScore'
import { blankRule } from '@/lib/alerts'
import { ago, dateShort, gbp } from '@/lib/format'
import { centroid } from '@/lib/geo'
import { SECTOR_COLOURS } from '@/lib/sectors'

/**
 * One deal in depth: the site, its signal timeline (every alert on the business, title or
 * operator), the people on it, the next action, notes, and the alert rules that feed it. This is
 * where a dirty deal is worked from first signal to instruction.
 */
export function DealDrawer({ item, onClose }: { item: WatchItem; onClose: () => void }) {
  const STAFF = useStaff((st) => st.staff)
  const { updateWatch, setStage, removeWatch, select, requestFlyTo } = useUi()
  const { rules, state, setState } = useAlerts()
  const user = useAuth((s) => s.user)
  const nav = useNavigate()
  const [b, setB] = useState<Business | null>(null)
  const [t, setT] = useState<Title | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [note, setNote] = useState('')
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const biz = item.entityType === 'business' ? await provider.getBusiness(item.entityId) : (item.entityType === 'title' ? (await provider.getBusinessesForTitle(item.entityId))[0] : undefined)
      const title = biz?.titleNumber ? await provider.getTitle(biz.titleNumber) : item.entityType === 'title' ? await provider.getTitle(item.entityId) : undefined
      const all = await provider.getAlerts()
      const ids = new Set([item.entityId, biz?.businessId, biz?.titleNumber, biz?.operatorCompanyNumber, biz?.freeholderCompanyNumber, title?.titleNumber, ...(title?.proprietors.map((p) => p.companyNumber) ?? [])].filter(Boolean) as string[])
      if (cancelled) return
      setB(biz ?? null)
      setT(title ?? null)
      setAlerts(all.filter((a) => ids.has(a.entityId) || (a.businessId && ids.has(a.businessId)) || (a.titleNumber && ids.has(a.titleNumber))).sort((x, y) => y.occurredAt.localeCompare(x.occurredAt)))
    })()
    return () => { cancelled = true }
  }, [item])
  const score = b ? dealScore(b, t ?? undefined) : null
  const timeline = useMemo(() => {
    const events: { at: string; kind: string; text: string; tone: 'info' | 'warning' | 'critical' | 'neutral'; alert?: Alert }[] = alerts.map((a) => ({ at: a.occurredAt, kind: a.kind, text: a.title, tone: a.severity, alert: a }))
    events.push({ at: item.addedAt, kind: 'Tracked', text: `Added to My Sites${item.notes?.startsWith('From alert') ? ` (${item.notes})` : ''}`, tone: 'neutral' })
    if (item.stageChangedAt) events.push({ at: item.stageChangedAt, kind: 'Stage', text: `Moved to ${item.stage}`, tone: 'neutral' })
    for (const n of item.log ?? []) events.push({ at: n.at, kind: 'Note', text: `${n.by}: ${n.text}`, tone: 'neutral' })
    return events.sort((x, y) => y.at.localeCompare(x.at))
  }, [alerts, item])
  const feeding = rules.filter((r) => r.enabled && (r.scope.mode === 'my-sites' || r.scope.mode === 'pipeline' || (r.scope.mode === 'sites' && r.scope.siteIds.includes(item.entityId)) || (r.scope.mode === 'everywhere' && (!r.conditions.sectors.length || (b && r.conditions.sectors.includes(b.sector))))))
  const overdue = item.nextActionDate && item.nextActionDate < new Date().toISOString().slice(0, 10)
  const addNote = () => {
    if (!note.trim()) return
    updateWatch(item.id, { log: [...(item.log ?? []), { at: new Date().toISOString(), by: user?.name ?? 'You', text: note.trim() }] })
    setNote('')
  }
  const watchRule = () => {
    const r = blankRule(user?.id ?? 'demo-agent', { name: `Deal: ${item.label}`, tag: 'Pipeline', scope: { mode: 'sites', radiusM: 250, siteIds: [item.entityId, ...(b?.businessId ? [b.businessId] : []), ...(t?.titleNumber ? [t.titleNumber] : [])], postcodes: [], offices: [] }, frequency: 'instant', recipients: item.assignee ? STAFF.filter((s) => s.name === item.assignee && s.id !== user?.id).map((s) => ({ staffId: s.id, channels: ['inapp' as const, 'email' as const] })) : [] })
    useAlerts.getState().upsertRule(r)
    nav(`/alerts/rules/${r.id}`)
  }
  const openSite = () => {
    if (item.entityType === 'company') return nav(`/companies/${item.entityId}`)
    const pos = b?.location.coordinates ?? (t ? centroid(t.geometry as Polygon) : undefined)
    if (pos) requestFlyTo(pos[0], pos[1], 17.5)
    select({ type: item.entityType as 'business' | 'title', id: item.entityId })
    nav(`/map/${item.entityType}/${item.entityId}`)
  }
  return (
    <aside className="no-print absolute inset-y-0 right-0 z-30 flex w-full max-w-[460px] flex-col border-l border-ink-200 bg-surface shadow-xl" role="dialog" aria-label="Deal">
      <div className="flex items-start justify-between gap-3 border-b border-ink-200 px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5"><h2 className="truncate text-base font-semibold">{item.label}</h2>{(item.sector || b?.sector) && <Badge tone="neutral"><span style={{ color: SECTOR_COLOURS[(item.sector || b?.sector)!] }}>●</span> {item.sector || b?.sector}</Badge>}{score && <Badge tone={score.band === 'High' ? 'critical' : score.band === 'Medium' ? 'warning' : 'neutral'}>{score.band} · {score.score}</Badge>}</div>
          <div className="text-xs text-ink-500">{b ? `${b.operatorName} · ${b.tenure} · ${b.address}` : t ? `${t.address} · ${t.titleNumber}` : item.entityId}</div>
        </div>
        <button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close"><X size={16} /></button>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 border-b border-ink-100 px-4 py-2">
        <Select value={item.stage ?? 'Prospect'} onChange={(e) => setStage(item.id, e.target.value as PipelineStage)} className="w-auto py-1 text-xs" aria-label="Stage">{PIPELINE_STAGES.map((s) => <option key={s}>{s}</option>)}</Select>
        <Button size="sm" onClick={openSite}><MapPin size={13} /> Site</Button>
        <Button size="sm" onClick={watchRule} title="Instant alert for anything on this site, shared with the deal owner"><BellPlus size={13} /> Alert on this deal</Button>
        {t && <Link to={`/report/${t.titleNumber}`} target="_blank" className="btn-secondary btn-sm"><Printer size={13} /> Report</Link>}
        <button className="btn-ghost btn-sm ml-auto text-rose-700" onClick={() => { if (confirm('Remove this deal from the pipeline?')) { removeWatch(item.id); onClose() } }} title="Remove"><Trash2 size={13} /></button>
      </div>
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-3 text-sm">
        {b && b.distressFlags.length > 0 && <div className="flex flex-wrap items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200"><AlertTriangle size={12} /> {b.distressFlags.map((f) => <Badge key={f} tone="critical">{f}</Badge>)}</div>}
        <section>
          <div className="label mb-1.5">People and next action</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label><span className="label flex items-center gap-1"><UserRound size={11} /> Deal owner</span><Select value={item.assignee ?? ''} onChange={(e) => updateWatch(item.id, { assignee: e.target.value || undefined })} className="py-1 text-xs"><option value="">Unassigned</option>{STAFF.map((s) => <option key={s.id} value={s.name}>{s.name} · {s.office}</option>)}</Select></label>
            <label><span className="label">Office</span><Input value={item.office ?? ''} onChange={(e) => updateWatch(item.id, { office: e.target.value || undefined })} className="py-1 text-xs" placeholder="Birmingham" /></label>
            <label className="col-span-2"><span className="label flex items-center gap-1"><CalendarClock size={11} /> Next action</span><Input value={item.nextAction ?? ''} onChange={(e) => updateWatch(item.id, { nextAction: e.target.value })} className="py-1 text-xs" placeholder="Call the administrator; request trading accounts" /></label>
            <label><span className="label">Due</span><Input type="date" value={item.nextActionDate ?? ''} onChange={(e) => updateWatch(item.id, { nextActionDate: e.target.value || undefined })} className={cx('py-1 text-xs', overdue && 'border-rose-400')} /></label>
            <label><span className="label">Fee estimate</span><Input type="number" value={item.feeEstimate ?? ''} onChange={(e) => updateWatch(item.id, { feeEstimate: e.target.value ? Number(e.target.value) : undefined })} className="py-1 text-xs" placeholder="£" /></label>
            <label><span className="label">Guide price</span><Input type="number" value={item.guidePrice ?? ''} onChange={(e) => updateWatch(item.id, { guidePrice: e.target.value ? Number(e.target.value) : undefined })} className="py-1 text-xs" placeholder="£" /></label>
            <label><span className="label">Project</span><Input value={item.project ?? ''} onChange={(e) => updateWatch(item.id, { project: e.target.value || undefined })} className="py-1 text-xs" placeholder="Midlands care disposals" /></label>
          </div>
          {overdue && <div className="mt-1.5 text-xs font-medium text-rose-700">Next action overdue since {dateShort(item.nextActionDate)}.</div>}
        </section>
        <section>
          <div className="label mb-1.5 flex items-center justify-between"><span>Signal timeline ({alerts.length} alert{alerts.length === 1 ? '' : 's'})</span>{feeding.length > 0 && <span className="font-normal normal-case text-ink-500">fed by {feeding.map((r) => r.tag ?? r.name).slice(0, 3).join(', ')}</span>}</div>
          <ol className="relative ml-2 border-l border-ink-200 pl-4">
            {timeline.map((e, i) => (
              <li key={i} className="relative pb-3 last:pb-0">
                <span className={cx('absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-surface', e.tone === 'critical' ? 'bg-rose-600' : e.tone === 'warning' ? 'bg-amber-500' : e.tone === 'info' ? 'bg-sky-500' : 'bg-ink-300')} />
                <div className="flex items-start justify-between gap-2 text-xs">
                  <div className="min-w-0">
                    <div className={cx('text-ink-900', e.alert && !(state[e.alert.alertId]?.read ?? e.alert.read) && 'font-semibold')}>{e.text}</div>
                    <div className="text-ink-500">{e.kind}{e.alert ? ` · ${e.alert.detail}` : ''}</div>
                  </div>
                  <span className="shrink-0 text-ink-400" title={e.at}>{ago(e.at)}</span>
                </div>
                {e.alert && !(state[e.alert.alertId]?.read ?? e.alert.read) && <button className="mt-0.5 text-[11px] text-brand-700 hover:underline" onClick={() => setState(e.alert!.alertId, { read: true })}>mark read</button>}
              </li>
            ))}
            {!timeline.length && <li className="text-xs text-ink-500">No signals yet.</li>}
          </ol>
        </section>
        <section>
          <div className="label mb-1.5 flex items-center gap-1"><StickyNote size={11} /> Notes</div>
          {item.notes && <div className="mb-1.5 rounded-md bg-ink-50 px-2.5 py-1.5 text-xs text-ink-700">{item.notes}</div>}
          <div className="flex gap-1.5"><Input value={note} onChange={(e) => setNote(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addNote()} placeholder="Add a dated note for the team" className="py-1 text-xs" aria-label="New note" /><Button size="sm" onClick={addNote} disabled={!note.trim()}>Add</Button></div>
        </section>
        <section className="text-[11px] text-ink-500">
          {b && <div>Operator {b.operatorName} ({b.operatorCompanyNumber}) · freeholder {b.freeholderName ?? 'see title'} · RV and EPC on the site panel.</div>}
          {item.feeEstimate && item.stage && <div>Weighted fee at this stage: {gbp(Math.round(item.feeEstimate * ({ Prospect: 0.1, Approach: 0.2, Instruction: 0.5, 'On market': 0.6, 'Under offer': 0.85, Exchanged: 0.98, Completed: 1, Lost: 0 } as Record<PipelineStage, number>)[item.stage]))}.</div>}
        </section>
      </div>
    </aside>
  )
}
