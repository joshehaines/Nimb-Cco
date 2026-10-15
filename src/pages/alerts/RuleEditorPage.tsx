import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, Save, Trash2, Send, Mail, MessageSquare, Bell, Smartphone, Sparkles } from 'lucide-react'
import { useAuth } from '@/auth'
import { useUi } from '@/store/ui'
import { useAlerts } from '@/store/alerts'
import { Badge, Button, Card, Checkbox, Chip, Input, Select, Spinner, Toggle, cx } from '@/components/ui'
import { SECTORS, type Alert, type Sector, type DistressFlag, type Proprietor } from '@/data/types'
import { SECTOR_COLOURS, OWNER_CATEGORY_COLOURS } from '@/lib/sectors'
import { OFFICES, useStaff } from '@/data/staff'
import { blankRule, describeRule, deliverableChannels, renderEmail, renderSms, renderTeams, CHANNEL_LABEL, FREQUENCY_LABEL, SCOPE_LABEL, RULE_PRESETS, type AlertChannel, type AlertFrequency, type AlertRule, type RuleScope } from '@/lib/alerts'
import { logAudit } from '@/lib/audit'
import { ago } from '@/lib/format'
import { StaffPicker } from './StaffPicker'
import { useAlertFeed } from './useAlertFeed'

const KIND_GROUPS: { title: string; kinds: Alert['kind'][] }[] = [
  { title: 'Distress and company', kinds: ['Distress signal', 'Gazette notice', 'Company status', 'New charge', 'Late accounts', 'Licence review'] },
  { title: 'Regulators', kinds: ['Rating change', 'Regulator enforcement', 'Registration change'] },
  { title: 'Ownership and sales', kinds: ['Ownership change', 'Price paid recorded', 'VOA change', 'EPC lodged'] },
  { title: 'Leases and scores', kinds: ['Lease event', 'Deal score'] },
  { title: 'Planning and competition', kinds: ['Planning submitted', 'Planning decided', 'New business', 'Competitor opened'] },
]
const DISTRESS_FLAGS: DistressFlag[] = ['Administration', 'Receivership', 'Liquidation', 'Late accounts', 'Gazette notice', 'Regulator inadequate', 'Regulator enforcement', 'FHRS 0-1', 'VOA deletion', 'New charge registered', 'Dispensing volume falling']
const OWNER_CATS: Proprietor['category'][] = ['Limited Company or Public Limited Company', 'Private Individual', 'Local Authority', 'Housing Association', 'Charity', 'Overseas Company']
const CH_ICON: Record<AlertChannel, React.ReactNode> = { inapp: <Bell size={13} />, email: <Mail size={13} />, sms: <Smartphone size={13} />, teams: <MessageSquare size={13} /> }

/** Full-page editor for one alert rule, with a live preview of what it would have sent. */
export function RuleEditorPage() {
  const STAFF = useStaff((st) => st.staff)
  const { id = 'new' } = useParams()
  const nav = useNavigate()
  const user = useAuth((s) => s.user)
  const { rules, upsertRule, removeRule, prefs, deliver } = useAlerts()
  const watchlist = useUi((s) => s.watchlist)
  const existing = rules.find((r) => r.id === id)
  const [rule, setRule] = useState<AlertRule>(() => existing ?? blankRule(user?.id ?? 'demo-agent'))
  const [preview, setPreview] = useState<'email' | 'sms' | 'teams'>('email')
  const [saved, setSaved] = useState(false)
  useEffect(() => { if (existing) setRule(existing) }, [existing])
  const feed = useAlertFeed()
  const matches = useMemo(() => feed.evaluate({ ...rule, enabled: true }), [feed, rule])
  const hits = matches.filter((m) => m.result.match).map((m) => m.alert)
  const misses = matches.filter((m) => !m.result.match)
  const set = (patch: Partial<AlertRule>) => setRule((r) => ({ ...r, ...patch }))
  const setC = (patch: Partial<AlertRule['conditions']>) => setRule((r) => ({ ...r, conditions: { ...r.conditions, ...patch } }))
  const setS = (patch: Partial<RuleScope>) => setRule((r) => ({ ...r, scope: { ...r.scope, ...patch } }))
  const toggleIn = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v])
  const channelState = deliverableChannels(rule.channels, prefs)
  const save = () => {
    upsertRule({ ...rule, name: rule.name.trim() || 'Untitled alert' })
    logAudit('settings-changed', `${existing ? 'Updated' : 'Created'} alert rule "${rule.name}"`, { entityType: 'alert-rule', entityId: rule.id })
    setSaved(true)
    setTimeout(() => nav('/alerts/rules'), 400)
  }
  const sample = hits.slice(0, 5)
  const previewText = sample.length ? (preview === 'email' ? renderEmail(rule, sample, user?.name ?? 'You').body : preview === 'sms' ? renderSms(rule, sample) : renderTeams(rule, sample)) : 'No matching events in the last 40 days to preview. Widen the conditions or the area.'

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/alerts/rules" className="btn-ghost btn-sm" aria-label="Back to rules"><ArrowLeft size={16} /></Link>
          <div><h1 className="text-xl font-semibold">{existing ? 'Edit alert' : 'New alert'}</h1><p className="text-sm text-ink-500">{describeRule(rule)}</p></div>
        </div>
        <div className="flex gap-2">
          {existing && <Button onClick={() => { if (confirm(`Delete "${rule.name}"?`)) { removeRule(rule.id); nav('/alerts/rules') } }}><Trash2 size={14} /> Delete</Button>}
          <Button onClick={() => { const d = deliver(rule, sample.length ? sample : hits, { test: true }); alert(`Test sent over ${d.filter((x) => x.status !== 'suppressed').length} channel(s)${d.some((x) => x.status === 'suppressed') ? `; ${d.filter((x) => x.status === 'suppressed').length} suppressed (see Deliveries)` : ''}.`) }} disabled={!hits.length}><Send size={14} /> Send test</Button>
          <Button variant="primary" onClick={save}><Save size={14} /> {saved ? 'Saved' : 'Save alert'}</Button>
        </div>
      </div>

      {!existing && (
        <Card title="Start from a preset" className="bg-ink-50">
          <div className="flex flex-wrap gap-2">{RULE_PRESETS.map((p) => <button key={p.id} className="rounded-md border border-ink-200 bg-surface px-3 py-2 text-left text-xs hover:border-brand-400 hover:bg-brand-50" onClick={() => setRule((r) => ({ ...r, ...p.patch, name: p.name, description: p.description, tag: p.tag }))}><span className="flex items-center gap-1 font-medium text-ink-900"><Sparkles size={12} className="text-brand-600" /> {p.name}</span><span className="mt-0.5 block max-w-[260px] text-ink-500">{p.description}</span></button>)}</div>
        </Card>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <Card title="Name">
            <div className="grid gap-3 sm:grid-cols-[1fr_200px]">
              <label className="text-xs"><span className="label">Alert name</span><Input value={rule.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Dirty deals: care homes in the Midlands" /></label>
              <label className="text-xs"><span className="label">Tag</span><Input value={rule.tag ?? ''} onChange={(e) => set({ tag: e.target.value || undefined })} placeholder="Dirty deals" list="alert-tags" /><datalist id="alert-tags">{['Dirty deals', 'My Sites', 'Ownership', 'Leases', 'Regulator', 'Scores', 'Planning', 'Competition'].map((t) => <option key={t} value={t} />)}</datalist></label>
            </div>
            <label className="mt-2 block text-xs"><span className="label">Notes for colleagues (optional)</span><Input value={rule.description ?? ''} onChange={(e) => set({ description: e.target.value || undefined })} placeholder="Why this alert exists and what to do when it fires" /></label>
          </Card>

          <Card title="What to watch for" actions={<span className="text-xs text-ink-500">{rule.conditions.kinds.length ? `${rule.conditions.kinds.length} event types` : 'Any event type'}</span>}>
            <div className="space-y-3">
              {KIND_GROUPS.map((g) => (
                <div key={g.title}>
                  <div className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{g.title}<button className="font-normal normal-case text-brand-700 hover:underline" onClick={() => setC({ kinds: g.kinds.every((k) => rule.conditions.kinds.includes(k)) ? rule.conditions.kinds.filter((k) => !g.kinds.includes(k)) : Array.from(new Set([...rule.conditions.kinds, ...g.kinds])) })}>{g.kinds.every((k) => rule.conditions.kinds.includes(k)) ? 'none' : 'all'}</button></div>
                  <div className="flex flex-wrap gap-1.5">{g.kinds.map((k) => <Chip key={k} label={k} selected={rule.conditions.kinds.includes(k)} onClick={() => setC({ kinds: toggleIn(rule.conditions.kinds, k) })} />)}</div>
                </div>
              ))}
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Sectors <span className="font-normal normal-case">(none = all)</span></div>
                <div className="flex flex-wrap gap-1.5">{SECTORS.filter((s) => s !== 'Other').map((s: Sector) => <Chip key={s} label={s} colour={SECTOR_COLOURS[s]} selected={rule.conditions.sectors.includes(s)} onClick={() => setC({ sectors: toggleIn(rule.conditions.sectors, s) })} />)}</div>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-500">Severity</div>
                  <div className="flex gap-1.5">{(['info', 'warning', 'critical'] as const).map((s) => <Chip key={s} label={s} colour={s === 'critical' ? '#be123c' : s === 'warning' ? '#d97706' : '#0284c7'} selected={rule.conditions.severities.includes(s)} onClick={() => setC({ severities: toggleIn(rule.conditions.severities, s) })} />)}</div>
                </div>
                <label className="text-xs"><span className="label">Keywords in the event text (comma separated)</span><Input value={rule.conditions.keywords ?? ''} onChange={(e) => setC({ keywords: e.target.value || undefined })} placeholder="administrat, winding-up, petition" /></label>
              </div>
              <div className="rounded-md border border-rose-200 bg-rose-50/60 p-3 dark:border-rose-900/50 dark:bg-rose-950/30">
                <Toggle checked={rule.conditions.distressOnly} onChange={(v) => setC({ distressOnly: v })} label="Distressed operators only" hint="Only fire when the operator already carries a distress signal, or the event itself is one" />
                {rule.conditions.distressOnly && <div className="mt-2 flex flex-wrap gap-1.5">{DISTRESS_FLAGS.map((f) => <Chip key={f} label={f} selected={rule.conditions.distressFlags.includes(f)} onClick={() => setC({ distressFlags: toggleIn(rule.conditions.distressFlags, f) })} />)}</div>}
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="text-xs"><span className="label">Minimum likely-to-transact score</span><Select value={rule.conditions.minDealScore ?? ''} onChange={(e) => setC({ minDealScore: e.target.value ? Number(e.target.value) : undefined })}><option value="">Any</option>{[30, 45, 55, 65, 75].map((n) => <option key={n} value={n}>{n}+ {n >= 55 ? '(High)' : n >= 30 ? '(Medium)' : ''}</option>)}</Select></label>
                <label className="text-xs"><span className="label">Tenure</span><Select value={rule.conditions.tenure ?? ''} onChange={(e) => setC({ tenure: (e.target.value || undefined) as never })}><option value="">Any</option><option>Freehold</option><option>Leasehold</option></Select></label>
                <div className="text-xs"><span className="label">Owner type</span><div className="mt-1 flex flex-wrap gap-1">{OWNER_CATS.map((o) => <Chip key={o} label={o === 'Limited Company or Public Limited Company' ? 'Company' : o} colour={OWNER_CATEGORY_COLOURS[o]} selected={rule.conditions.ownerCategories.includes(o)} onClick={() => setC({ ownerCategories: toggleIn(rule.conditions.ownerCategories, o) })} />)}</div></div>
              </div>
            </div>
          </Card>

          <Card title="Where">
            <div className="flex flex-wrap gap-1.5">{(Object.keys(SCOPE_LABEL) as RuleScope['mode'][]).map((m) => <Chip key={m} label={SCOPE_LABEL[m]} selected={rule.scope.mode === m} onClick={() => setS({ mode: m })} />)}</div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {(rule.scope.mode === 'my-sites' || rule.scope.mode === 'pipeline' || rule.scope.mode === 'sites') && <label className="text-xs"><span className="label">Radius around each site</span><Select value={rule.scope.radiusM} onChange={(e) => setS({ radiusM: Number(e.target.value) })}>{[0, 100, 250, 500, 1000, 2000, 5000].map((r) => <option key={r} value={r}>{r === 0 ? 'The site only' : r >= 1000 ? `${r / 1000} km` : `${r} m`}</option>)}</Select></label>}
              {rule.scope.mode === 'sites' && <div className="text-xs md:col-span-2"><span className="label">Named sites (from My Sites)</span>{watchlist.length ? <div className="mt-1 flex flex-wrap gap-1.5">{watchlist.map((w) => <Chip key={w.id} label={w.label} selected={rule.scope.siteIds.includes(w.entityId)} onClick={() => setS({ siteIds: toggleIn(rule.scope.siteIds, w.entityId) })} />)}</div> : <div className="mt-1 text-ink-500">Nothing in My Sites yet. Add sites from the map and they appear here.</div>}</div>}
              {rule.scope.mode === 'postcodes' && <label className="text-xs md:col-span-2"><span className="label">Postcode districts (outward codes, comma separated)</span><Input value={rule.scope.postcodes.join(', ')} onChange={(e) => setS({ postcodes: e.target.value.split(/[,\s]+/).map((p) => p.trim().toUpperCase()).filter(Boolean) })} placeholder="CV32, CV34, BS1" /></label>}
              {rule.scope.mode === 'offices' && <div className="text-xs md:col-span-2"><span className="label">Office patches</span><div className="mt-1 flex flex-wrap gap-1.5">{OFFICES.map((o) => <Chip key={o} label={o} selected={rule.scope.offices.includes(o)} onClick={() => setS({ offices: toggleIn(rule.scope.offices, o) })} />)}</div></div>}
              {rule.scope.mode === 'everywhere' && <p className="text-xs text-ink-500 md:col-span-2">Every event the platform detects, England and Wales. Combine with sectors or distress-only to keep it useful.</p>}
            </div>
          </Card>

          <Card title="Who to tell" actions={<span className="text-xs text-ink-500">You{rule.recipients.length ? ` + ${rule.recipients.length}` : ''}</span>}>
            <StaffPicker value={rule.recipients} onChange={(recipients) => set({ recipients })} excludeId={user?.id} />
            <div className="mt-3 rounded-md border border-ink-200 p-3">
              <Toggle checked={!!rule.escalation} onChange={(v) => set({ escalation: v ? { afterHours: 4, toStaffId: 's-reid', channels: ['email', 'sms'] } : undefined })} label="Escalate if nobody opens a critical alert" hint="Sends the unread critical event on to someone else after a delay" />
              {rule.escalation && (
                <div className="mt-2 grid gap-2 sm:grid-cols-3 text-xs">
                  <label><span className="label">After</span><Select value={rule.escalation.afterHours} onChange={(e) => set({ escalation: { ...rule.escalation!, afterHours: Number(e.target.value) } })}>{[1, 2, 4, 8, 24].map((h) => <option key={h} value={h}>{h} hour{h > 1 ? 's' : ''}</option>)}</Select></label>
                  <label><span className="label">To</span><Select value={rule.escalation.toStaffId} onChange={(e) => set({ escalation: { ...rule.escalation!, toStaffId: e.target.value } })}>{STAFF.map((s) => <option key={s.id} value={s.id}>{s.name} · {s.office}</option>)}</Select></label>
                  <div><span className="label">By</span><div className="mt-1 flex gap-1">{(['email', 'sms', 'teams'] as AlertChannel[]).map((ch) => <button key={ch} type="button" className={cx('rounded-full border px-2 py-0.5 text-[11px]', rule.escalation!.channels.includes(ch) ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200')} onClick={() => set({ escalation: { ...rule.escalation!, channels: toggleIn(rule.escalation!.channels, ch) } })}>{CHANNEL_LABEL[ch]}</button>)}</div></div>
                </div>
              )}
            </div>
          </Card>

          <Card title="How and when">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="label mb-1">Your channels</div>
                {(['inapp', 'email', 'sms', 'teams'] as AlertChannel[]).map((ch) => {
                  const blocked = channelState.blocked.find((b) => b.channel === ch)
                  return <Checkbox key={ch} checked={rule.channels.includes(ch)} onChange={() => set({ channels: toggleIn(rule.channels, ch) })} swatch={<span className="mt-1 text-ink-500">{CH_ICON[ch]}</span>} label={<span className="flex items-center gap-2">{CHANNEL_LABEL[ch]}{rule.channels.includes(ch) && blocked && <Badge tone="warning">{blocked.why}</Badge>}</span>} hint={ch === 'email' ? prefs.email || 'Set your address under My channels' : ch === 'sms' ? prefs.mobile || 'Add a mobile under My channels' : ch === 'teams' ? (prefs.teamsWebhook ? 'Channel webhook set' : 'Paste a channel webhook under My channels') : 'Inbox and the bell in the navigation'} />
                })}
                {channelState.blocked.length > 0 && <Link to="/alerts/channels" className="text-xs text-brand-700 hover:underline">Set up channels</Link>}
              </div>
              <div className="space-y-3">
                <label className="block text-xs"><span className="label">Frequency</span><Select value={rule.frequency} onChange={(e) => set({ frequency: e.target.value as AlertFrequency })}>{(Object.keys(FREQUENCY_LABEL) as AlertFrequency[]).map((f) => <option key={f} value={f}>{FREQUENCY_LABEL[f]}</option>)}</Select></label>
                <Toggle checked={rule.instantForCritical} onChange={(v) => set({ instantForCritical: v })} label="Critical events go at once" hint="Administrations, Gazette notices and enforcement skip the digest" />
                <p className="text-[11px] text-ink-500">Quiet hours {prefs.quietHours.enabled ? `${prefs.quietHours.from} to ${prefs.quietHours.to}` : 'off'}: instant messages wait until they end; digests go at {String(prefs.digestHour).padStart(2, '0')}:00. Change under My channels.</p>
                <Toggle checked={rule.enabled} onChange={(v) => set({ enabled: v })} label={rule.enabled ? 'Active' : 'Paused'} />
              </div>
            </div>
          </Card>
        </div>

        {/* Live preview */}
        <div className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card title="Would have matched" actions={feed.loading ? <Spinner /> : <span className="text-xs text-ink-500">last 40 days</span>}>
            <div className="flex items-end gap-2"><span className="text-3xl font-semibold tabular-nums">{hits.length}</span><span className="pb-1 text-sm text-ink-500">of {feed.alerts.length} events{hits.filter((h) => h.severity === 'critical').length ? ` · ${hits.filter((h) => h.severity === 'critical').length} critical` : ''}</span></div>
            {hits.length > 25 && rule.frequency === 'instant' && <p className="mt-1 text-[11px] text-amber-700">That is a lot of instant messages. Consider a daily digest or narrower conditions.</p>}
            <ul className="mt-2 max-h-64 divide-y divide-ink-100 overflow-y-auto text-xs">
              {hits.slice(0, 30).map((h) => <li key={h.alertId} className="py-1.5" title={matches.find((m) => m.alert.alertId === h.alertId)?.result.reasons.join(' · ')}><span className={cx('mr-1 inline-block h-2 w-2 rounded-full', h.severity === 'critical' ? 'bg-rose-600' : h.severity === 'warning' ? 'bg-amber-500' : 'bg-sky-500')} /><span className="font-medium">{h.title}</span><span className="text-ink-500"> · {h.kind} · {ago(h.occurredAt)}</span></li>)}
              {!hits.length && !feed.loading && <li className="py-2 text-ink-500">Nothing in the recent feed matches. The nearest misses: {misses.slice(0, 3).map((m) => m.result.reasons.at(-1)).join('; ') || '—'}.</li>}
            </ul>
          </Card>
          <Card title="Message preview" actions={<div className="flex gap-1">{(['email', 'sms', 'teams'] as const).map((p) => <button key={p} className={cx('rounded-full border px-2 py-0.5 text-[11px]', preview === p ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200')} onClick={() => setPreview(p)}>{CHANNEL_LABEL[p]}</button>)}</div>}>
            {preview === 'email' && sample.length > 0 && <div className="mb-1 text-xs font-medium">{renderEmail(rule, sample, user?.name ?? 'You').subject}</div>}
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-md bg-ink-50 p-3 text-[11px] leading-snug text-ink-800">{previewText}</pre>
            {preview === 'sms' && sample.length > 0 && <div className="mt-1 text-[10px] text-ink-500">{renderSms(rule, sample).length} characters · {Math.ceil(renderSms(rule, sample).length / 153)} segment(s)</div>}
          </Card>
        </div>
      </div>
    </div>
  )
}
