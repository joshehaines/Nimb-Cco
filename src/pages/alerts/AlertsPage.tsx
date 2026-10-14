import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Bell, BellRing, Plus, Play, Pause, Copy, Pencil, Trash2, Send, UserRound, Clock, KanbanSquare, Check, EyeOff, StickyNote, Mail, Smartphone, MessageSquare, Filter } from 'lucide-react'
import { useAuth } from '@/auth'
import { useUi } from '@/store/ui'
import { useAlerts } from '@/store/alerts'
import { Badge, Button, Card, Chip, Empty, Input, Select, Spinner, Stat, Tabs, Toggle, cx } from '@/components/ui'
import { ALERT_KINDS, type Alert } from '@/data/types'
import { STAFF, staffById } from '@/data/mock/staff'
import { describeRule, CHANNEL_LABEL, FREQUENCY_LABEL, type AlertChannel } from '@/lib/alerts'
import { ago, dateShort } from '@/lib/format'
import { logAudit } from '@/lib/audit'
import { useAlertFeed, useRuleMatches, type FeedAlert } from './useAlertFeed'
import { ChannelsTab } from './ChannelsTab'
import { DeliveriesTab } from './DeliveriesTab'

type Tab = 'inbox' | 'rules' | 'deliveries' | 'channels'
const CH_ICON: Record<AlertChannel, React.ReactNode> = { inapp: <Bell size={11} />, email: <Mail size={11} />, sms: <Smartphone size={11} />, teams: <MessageSquare size={11} /> }

/** Alerts: inbox of detected events, the rules that route them, the delivery log and channels. */
export function AlertsPage() {
  const { tab = 'inbox' } = useParams()
  const nav = useNavigate()
  const user = useAuth((s) => s.user)
  const { rules, seedPresets, deliveries, state } = useAlerts()
  useEffect(() => { seedPresets(user?.id ?? 'demo-agent') }, [seedPresets, user])
  const feed = useAlertFeed()
  const matches = useRuleMatches(feed.alerts, feed.evaluate)
  const unread = feed.alerts.filter((a) => !(state[a.alertId]?.read ?? a.read) && !state[a.alertId]?.dismissed).length
  const critical7 = feed.alerts.filter((a) => a.severity === 'critical' && Date.now() - new Date(a.occurredAt).getTime() < 7 * 86400000).length
  const sent7 = deliveries.filter((d) => d.status === 'sent' && Date.now() - new Date(d.at).getTime() < 7 * 86400000).length
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'inbox', label: 'Inbox', count: unread },
    { id: 'rules', label: 'My alerts', count: rules.length },
    { id: 'deliveries', label: 'Deliveries', count: deliveries.length },
    { id: 'channels', label: 'My channels' },
  ]
  return (
    <div className="mx-auto max-w-7xl space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold"><BellRing size={20} /> Alerts</h1>
          <p className="text-sm text-ink-500">Events detected across HM Land Registry, Companies House, the Gazette, regulators, planning, EPC and VOA, routed by the alerts you and your colleagues set up. Email, text or Teams, instantly or as a digest.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => nav('/alerts/channels')}>My channels</Button>
          <Button variant="primary" onClick={() => nav('/alerts/rules/new')}><Plus size={14} /> New alert</Button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Unread" value={unread} tone={unread ? 'warning' : undefined} sub={`${feed.alerts.length} events in the feed`} />
        <Stat label="Critical, last 7 days" value={critical7} tone={critical7 ? 'critical' : undefined} sub="administrations, Gazette, enforcement" />
        <Stat label="Active alerts" value={rules.filter((r) => r.enabled).length} sub={`${rules.filter((r) => r.recipients.length).length} shared with colleagues`} />
        <Stat label="Sent, last 7 days" value={sent7} sub={`${deliveries.filter((d) => d.status === 'suppressed').length} suppressed (channel not set up)`} />
      </div>
      <Tabs tabs={tabs} value={tab as Tab} onChange={(t) => nav(t === 'inbox' ? '/alerts' : `/alerts/${t}`)} />
      {tab === 'inbox' && <Inbox feed={feed} matches={matches} />}
      {tab === 'rules' && <RulesTab matches={matches} />}
      {tab === 'deliveries' && <DeliveriesTab />}
      {tab === 'channels' && <ChannelsTab />}
    </div>
  )
}

function Inbox({ feed, matches }: { feed: ReturnType<typeof useAlertFeed>; matches: ReturnType<typeof useRuleMatches> }) {
  const nav = useNavigate()
  const user = useAuth((s) => s.user)
  const { select, addWatch, isWatched } = useUi()
  const { state, setState, setMany, rules, deliver } = useAlerts()
  const [kinds, setKinds] = useState<Alert['kind'][]>([])
  const [severity, setSeverity] = useState<'' | Alert['severity']>('')
  const [ruleId, setRuleId] = useState('')
  const [view, setView] = useState<'open' | 'mine' | 'snoozed' | 'all'>('open')
  const [q, setQ] = useState('')
  const [sel, setSel] = useState<Set<string>>(new Set())
  const [noteFor, setNoteFor] = useState<string | null>(null)
  const [showKinds, setShowKinds] = useState(false)
  const now = Date.now()
  const st = (a: Alert) => state[a.alertId] ?? {}
  const isRead = (a: Alert) => st(a).read ?? a.read
  const isSnoozed = (a: Alert) => !!st(a).snoozedUntil && new Date(st(a).snoozedUntil!).getTime() > now
  const shown = useMemo(() => feed.alerts.filter((a) => {
    const s = st(a)
    if (view === 'open' && (s.dismissed || isSnoozed(a))) return false
    if (view === 'mine' && s.assignedTo !== user?.id) return false
    if (view === 'snoozed' && !isSnoozed(a)) return false
    if (kinds.length && !kinds.includes(a.kind)) return false
    if (severity && a.severity !== severity) return false
    if (ruleId && !(matches.byAlert[a.alertId] ?? []).some((m) => m.rule.id === ruleId)) return false
    if (q && !`${a.title} ${a.detail} ${a.postcode ?? ''} ${a.business?.operatorName ?? ''}`.toLowerCase().includes(q.toLowerCase())) return false
    return true
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [feed.alerts, state, view, kinds, severity, ruleId, q, matches, user])
  const groups = useMemo(() => {
    const g = new Map<string, FeedAlert[]>()
    for (const a of shown) {
      const d = new Date(a.occurredAt)
      const key = now - d.getTime() < 86400000 ? 'Today' : now - d.getTime() < 2 * 86400000 ? 'Yesterday' : now - d.getTime() < 7 * 86400000 ? 'This week' : 'Earlier'
      ;(g.get(key) ?? g.set(key, []).get(key)!).push(a)
    }
    return Array.from(g.entries())
  }, [shown, now])
  const open = (a: FeedAlert) => {
    setState(a.alertId, { read: true })
    if (a.entityType === 'company') nav(`/companies/${a.entityId}`)
    else { select({ type: a.entityType, id: a.entityId }); nav(`/map/${a.entityType}/${encodeURIComponent(a.entityId)}`) }
  }
  const ids = sel.size ? Array.from(sel) : []
  const bulk = (patch: Parameters<typeof setMany>[1], label: string) => { setMany(ids, patch); logAudit('settings-changed', `${label} ${ids.length} alert${ids.length === 1 ? '' : 's'}`); setSel(new Set()) }
  const snooze = (idsIn: string[], days: number) => setMany(idsIn, { snoozedUntil: new Date(now + days * 86400000).toISOString() })
  const toPipeline = (a: FeedAlert) => {
    const b = a.business
    addWatch({ entityType: b ? 'business' : a.entityType === 'company' ? 'company' : 'title', entityId: b ? b.businessId : a.entityId, label: b ? b.name : a.title, stage: 'Prospect', sector: a.sector, office: user?.office, assignee: user?.name, notes: `From alert: ${a.title} (${dateShort(a.occurredAt)})` })
    setState(a.alertId, { pipelineAdded: true, read: true })
    logAudit('settings-changed', `Added ${b ? b.name : a.title} to the pipeline from an alert`, { entityType: 'alert', entityId: a.alertId })
  }
  const runRules = () => {
    let n = 0
    for (const r of rules.filter((x) => x.enabled)) n += deliver(r, matches.byRule[r.id] ?? []).filter((d) => d.status === 'sent').length
    alert(n ? `${n} message${n === 1 ? '' : 's'} written to Deliveries.` : 'Nothing new to send: every matching event has already been delivered.')
  }
  const activeKinds = ALERT_KINDS.filter((k) => feed.alerts.some((a) => a.kind === k))
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_280px]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-md border border-ink-200 p-0.5 text-xs">{(['open', 'mine', 'snoozed', 'all'] as const).map((v) => <button key={v} className={cx('rounded px-2.5 py-1', view === v ? 'bg-brand-700 text-white' : 'text-ink-700 hover:bg-ink-100')} onClick={() => setView(v)}>{v === 'open' ? 'Open' : v === 'mine' ? 'Assigned to me' : v === 'snoozed' ? 'Snoozed' : 'Everything'}</button>)}</div>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search events, operators, postcodes" className="w-64 py-1 text-xs" aria-label="Search alerts" />
          <Select value={severity} onChange={(e) => setSeverity(e.target.value as never)} className="w-auto py-1 text-xs" aria-label="Severity"><option value="">Any severity</option><option value="critical">Critical</option><option value="warning">Warning</option><option value="info">Info</option></Select>
          <Select value={ruleId} onChange={(e) => setRuleId(e.target.value)} className="w-auto py-1 text-xs" aria-label="Matched by alert"><option value="">Any alert rule</option>{rules.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select>
          <Button size="sm" onClick={() => setShowKinds(!showKinds)} className={cx(kinds.length > 0 && 'text-brand-700')}><Filter size={13} /> Types{kinds.length ? ` (${kinds.length})` : ''}</Button>
          <span className="ml-auto flex gap-2"><Button size="sm" onClick={runRules} title="Evaluate every active alert against the feed and write the messages to Deliveries"><Play size={13} /> Run alerts now</Button><Button size="sm" onClick={() => setMany(shown.map((a) => a.alertId), { read: true })} disabled={!shown.length}><Check size={13} /> Mark all read</Button></span>
        </div>
        {showKinds && <div className="flex flex-wrap gap-1.5">{activeKinds.map((k) => <Chip key={k} label={k} selected={kinds.includes(k)} onClick={() => setKinds(kinds.includes(k) ? kinds.filter((x) => x !== k) : [...kinds, k])} />)}{kinds.length > 0 && <button className="text-xs text-brand-700 hover:underline" onClick={() => setKinds([])}>clear</button>}</div>}
        {sel.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand-200 bg-brand-50 px-3 py-2 text-xs dark:border-brand-900/50 dark:bg-brand-950/30">
            <span className="font-medium">{sel.size} selected</span>
            <Button size="sm" onClick={() => bulk({ read: true }, 'Marked read')}><Check size={12} /> Read</Button>
            <Button size="sm" onClick={() => { snooze(ids, 1); setSel(new Set()) }}><Clock size={12} /> Snooze 1 day</Button>
            <Button size="sm" onClick={() => { snooze(ids, 7); setSel(new Set()) }}><Clock size={12} /> 7 days</Button>
            <Select className="w-auto py-1 text-xs" value="" onChange={(e) => e.target.value && bulk({ assignedTo: e.target.value }, 'Assigned')} aria-label="Assign to"><option value="">Assign to…</option>{STAFF.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.office}</option>)}</Select>
            <Button size="sm" onClick={() => bulk({ dismissed: true }, 'Dismissed')}><EyeOff size={12} /> Dismiss</Button>
            <button className="ml-auto text-brand-700 hover:underline" onClick={() => setSel(new Set())}>clear selection</button>
          </div>
        )}
        {feed.loading && !feed.alerts.length && <Spinner label="Loading events…" />}
        {!feed.loading && !shown.length && <Empty title="Nothing here" hint={view === 'open' ? 'No open events match these filters.' : view === 'mine' ? 'Nothing is assigned to you. Select events and use Assign to hand them out.' : 'Nothing snoozed.'} />}
        {groups.map(([label, list]) => (
          <div key={label}>
            <div className="mb-1 flex items-center justify-between px-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500"><span>{label} · {list.length}</span><button className="font-normal normal-case text-brand-700 hover:underline" onClick={() => setSel(new Set([...sel, ...list.map((a) => a.alertId)]))}>select all</button></div>
            <ul className="card divide-y divide-ink-100">
              {list.map((a) => {
                const s = st(a)
                const hits = matches.byAlert[a.alertId] ?? []
                const assignee = s.assignedTo ? staffById(s.assignedTo) : undefined
                return (
                  <li key={a.alertId} className={cx('group flex items-start gap-3 px-3 py-2.5 hover:bg-ink-50', isRead(a) && 'opacity-75', s.dismissed && 'opacity-50')}>
                    <input type="checkbox" className="mt-1.5 h-3.5 w-3.5" checked={sel.has(a.alertId)} onChange={(e) => { const n = new Set(sel); e.target.checked ? n.add(a.alertId) : n.delete(a.alertId); setSel(n) }} aria-label={`Select ${a.title}`} />
                    <span className={cx('mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full', a.severity === 'critical' ? 'bg-rose-600' : a.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500')} />
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => open(a)}>
                      <div className="flex flex-wrap items-center gap-1.5"><span className={cx('text-sm text-ink-900', !isRead(a) && 'font-semibold')}>{a.title}</span><Badge>{a.kind}</Badge>{a.sector && <Badge tone="brand">{a.sector}</Badge>}{!isRead(a) && <Badge tone="info">new</Badge>}{a.score !== undefined && a.score >= 55 && <Badge tone="critical">score {a.score}</Badge>}{s.pipelineAdded && <Badge tone="violet">in pipeline</Badge>}</div>
                      <div className="text-xs text-ink-600">{a.detail}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-ink-500">
                        {a.postcode && <span>{a.postcode}</span>}
                        {a.business?.operatorName && <span>{a.business.operatorName}</span>}
                        {hits.map((h) => <span key={h.rule.id} className="rounded-full bg-ink-100 px-1.5 text-ink-700" title={h.reasons.join(' · ')}>{h.rule.tag ?? h.rule.name}</span>)}
                        {!hits.length && <span className="italic text-ink-400">matches none of your alerts</span>}
                        {assignee && <span className="flex items-center gap-0.5"><UserRound size={10} /> {assignee.name}</span>}
                        {isSnoozed(a) && <span className="flex items-center gap-0.5"><Clock size={10} /> until {dateShort(s.snoozedUntil)}</span>}
                        {s.notes && <span className="flex items-center gap-0.5"><StickyNote size={10} /> {s.notes}</span>}
                      </div>
                      {noteFor === a.alertId && <div className="mt-1 flex gap-1" onClick={(e) => e.stopPropagation()}><Input autoFocus defaultValue={s.notes ?? ''} placeholder="Note for the team" className="py-1 text-xs" aria-label="Note" onKeyDown={(e) => { if (e.key === 'Enter') { setState(a.alertId, { notes: (e.target as HTMLInputElement).value }); setNoteFor(null) } if (e.key === 'Escape') setNoteFor(null) }} /><Button size="sm" onClick={(e) => { const input = (e.currentTarget.previousSibling as HTMLInputElement); setState(a.alertId, { notes: input.value }); setNoteFor(null) }}>Save</Button></div>}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[11px] text-ink-400">{ago(a.occurredAt)}</span>
                      <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <button className="btn-ghost btn-sm" title="Snooze 7 days" onClick={() => snooze([a.alertId], 7)}><Clock size={13} /></button>
                        <button className="btn-ghost btn-sm" title="Note" onClick={() => setNoteFor(noteFor === a.alertId ? null : a.alertId)}><StickyNote size={13} /></button>
                        <Select className="w-auto py-0.5 text-[11px]" value={s.assignedTo ?? ''} onChange={(e) => setState(a.alertId, { assignedTo: e.target.value || undefined })} aria-label="Assign"><option value="">Assign</option>{STAFF.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
                        <button className="btn-ghost btn-sm" title={a.business && isWatched('business', a.business.businessId) ? 'Already in My Sites' : 'Add to pipeline as a prospect'} onClick={() => toPipeline(a)} disabled={!!s.pipelineAdded}><KanbanSquare size={13} /></button>
                        <button className="btn-ghost btn-sm" title="Dismiss" onClick={() => setState(a.alertId, { dismissed: true })}><EyeOff size={13} /></button>
                      </div>
                    </div>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
      <aside className="space-y-3">
        <Card title="Your alerts" actions={<Link to="/alerts/rules" className="text-xs text-brand-700 hover:underline">manage</Link>}>
          <ul className="space-y-2 text-xs">
            {rules.slice(0, 6).map((r) => <li key={r.id} className="flex items-start justify-between gap-2"><span className="min-w-0"><Link to={`/alerts/rules/${r.id}`} className={cx('block truncate font-medium hover:underline', !r.enabled && 'text-ink-400 line-through')}>{r.name}</Link><span className="text-ink-500">{(matches.byRule[r.id] ?? []).length} matched · {FREQUENCY_LABEL[r.frequency].toLowerCase()}</span></span><span className="flex shrink-0 gap-0.5 text-ink-500">{r.channels.map((c) => <span key={c} title={CHANNEL_LABEL[c]}>{CH_ICON[c]}</span>)}</span></li>)}
            {!rules.length && <li className="text-ink-500">No alerts yet. <Link to="/alerts/rules/new" className="text-brand-700 hover:underline">Create one</Link> or start from a preset.</li>}
          </ul>
        </Card>
        <Card title="How this works">
          <ul className="space-y-1.5 text-[11px] text-ink-600">
            <li>Each event is a change the ingestion jobs detected overnight or on their feed cadence.</li>
            <li>Your alerts decide which events reach you, where, and whether colleagues hear too. Tags on each row show which alert caught it.</li>
            <li>Assign an event to whoever is working the deal; use <strong>Assigned to me</strong> as a to-do list. Snoozed events return on the date.</li>
            <li><strong>Add to pipeline</strong> puts the site in Prospect with the event as the first note, which is how a dirty deal starts being tracked.</li>
          </ul>
        </Card>
      </aside>
    </div>
  )
}

function RulesTab({ matches }: { matches: ReturnType<typeof useRuleMatches> }) {
  const nav = useNavigate()
  const user = useAuth((s) => s.user)
  const { rules, toggleRule, removeRule, duplicateRule, deliver } = useAlerts()
  const [mineOnly, setMineOnly] = useState(false)
  const list = rules.filter((r) => !mineOnly || r.createdBy === user?.id || r.recipients.some((x) => x.staffId === user?.id))
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Toggle checked={mineOnly} onChange={setMineOnly} label="Only alerts that involve me" />
        <Button variant="primary" onClick={() => nav('/alerts/rules/new')}><Plus size={14} /> New alert</Button>
      </div>
      {!list.length && <Empty title="No alerts yet" hint="Create one from scratch or start from a preset such as Dirty deals." action={<Button variant="primary" onClick={() => nav('/alerts/rules/new')}><Plus size={14} /> New alert</Button>} />}
      <ul className="space-y-2">
        {list.map((r) => {
          const owner = staffById(r.createdBy)
          const hits = matches.byRule[r.id] ?? []
          return (
            <li key={r.id} className={cx('card p-4', !r.enabled && 'opacity-70')}>
              <div className="flex flex-wrap items-start gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2"><Link to={`/alerts/rules/${r.id}`} className="text-sm font-semibold text-ink-900 hover:underline">{r.name}</Link>{r.tag && <Badge tone="brand">{r.tag}</Badge>}<Badge tone={r.enabled ? 'good' : 'neutral'}>{r.enabled ? 'active' : 'paused'}</Badge>{r.escalation && <Badge tone="warning">escalates</Badge>}</div>
                  <div className="mt-0.5 text-xs text-ink-600">{r.description ?? describeRule(r)}</div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
                    <span className="flex items-center gap-1">{r.channels.map((c) => <span key={c} title={CHANNEL_LABEL[c]}>{CH_ICON[c]}</span>)} {FREQUENCY_LABEL[r.frequency]}</span>
                    <span>{hits.length} matched in the feed{hits.filter((h) => h.severity === 'critical').length ? ` (${hits.filter((h) => h.severity === 'critical').length} critical)` : ''}</span>
                    <span>{r.firedCount ? `${r.firedCount} sent · last ${ago(r.lastFiredAt)}` : 'never sent'}</span>
                    <span>by {owner?.name ?? r.createdBy}{r.createdBy !== user?.id ? '' : ' (you)'}</span>
                  </div>
                  {r.recipients.length > 0 && <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px]"><span className="text-ink-500">Also to:</span>{r.recipients.map((x) => { const s = staffById(x.staffId); return s ? <span key={x.staffId} className="rounded-full bg-ink-100 px-2 py-0.5 text-ink-700" title={`${s.office} · ${x.channels.map((c) => CHANNEL_LABEL[c]).join(', ')}`}>{s.name}</span> : null })}</div>}
                </div>
                <div className="flex shrink-0 flex-wrap gap-1">
                  <Button size="sm" onClick={() => toggleRule(r.id)} title={r.enabled ? 'Pause' : 'Resume'}>{r.enabled ? <Pause size={13} /> : <Play size={13} />} {r.enabled ? 'Pause' : 'Resume'}</Button>
                  <Button size="sm" onClick={() => { const d = deliver(r, hits.slice(0, 5), { test: true }); alert(d.length ? `Test written to Deliveries (${d.filter((x) => x.status !== 'suppressed').length} channel(s)).` : 'No matching events to send.') }} disabled={!hits.length}><Send size={13} /> Test</Button>
                  <Button size="sm" onClick={() => nav(`/alerts/rules/${r.id}`)}><Pencil size={13} /> Edit</Button>
                  <Button size="sm" onClick={() => { const c = duplicateRule(r.id, user?.id ?? 'demo-agent'); if (c) nav(`/alerts/rules/${c.id}`) }}><Copy size={13} /></Button>
                  <Button size="sm" onClick={() => confirm(`Delete "${r.name}"?`) && removeRule(r.id)} aria-label="Delete"><Trash2 size={13} /></Button>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
