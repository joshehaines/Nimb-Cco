import type { Alert, Business, Sector, Tenure, Title, WatchItem, Proprietor, DistressFlag } from '@/data/types'
import { haversineM } from '@/lib/geo'

/**
 * Custom alert rules: what to watch for, where, who hears about it and how.
 *
 * A rule is evaluated against each new alert (an event detected by the ingestion jobs: ownership
 * change, Gazette notice, rating change and so on). The matcher is pure and explains itself, so
 * the editor can preview "which of the last 30 days' events would this rule have sent me".
 * The same logic lives in api/alerts/worker.py for production delivery.
 */
export type AlertChannel = 'inapp' | 'email' | 'sms' | 'teams'
export type AlertFrequency = 'instant' | 'hourly' | 'daily' | 'weekly'
export type Severity = Alert['severity']

export interface RuleConditions {
  kinds: Alert['kind'][]
  sectors: Sector[]
  severities: Severity[]
  /** Only when the business behind the event already carries a distress signal. */
  distressOnly: boolean
  distressFlags: DistressFlag[]
  /** Only when the deal score is at or above this. */
  minDealScore?: number
  ownerCategories: Proprietor['category'][]
  tenure?: Tenure
  /** Case-insensitive match in title or detail, e.g. "administrat". */
  keywords?: string
}

export interface RuleScope {
  mode: 'everywhere' | 'my-sites' | 'pipeline' | 'sites' | 'postcodes' | 'offices'
  /** Watch radius around My Sites / pipeline / named sites. */
  radiusM: number
  /** Specific sites (business or title ids) for mode 'sites'. */
  siteIds: string[]
  /** Outward postcode districts, e.g. CV32, BS1, for mode 'postcodes'. */
  postcodes: string[]
  /** Office patches for mode 'offices'. */
  offices: string[]
}

export interface Recipient { staffId: string; channels: AlertChannel[] }

export interface Escalation { afterHours: number; toStaffId: string; channels: AlertChannel[] }

export interface AlertRule {
  id: string
  name: string
  description?: string
  enabled: boolean
  createdBy: string
  createdAt: string
  updatedAt: string
  conditions: RuleConditions
  scope: RuleScope
  /** The owner's own channels. */
  channels: AlertChannel[]
  frequency: AlertFrequency
  /** Critical events ignore the frequency and go at once. */
  instantForCritical: boolean
  recipients: Recipient[]
  escalation?: Escalation
  /** Tag used in the inbox and on deliveries, e.g. "Dirty deals". */
  tag?: string
  lastFiredAt?: string
  firedCount: number
}

export interface NotificationPrefs {
  email: string
  emailVerified: boolean
  mobile: string
  mobileVerified: boolean
  teamsWebhook: string
  quietHours: { enabled: boolean; from: string; to: string }
  digestHour: number
  weeklyDay: number
  timezone: string
}

export interface Delivery {
  id: string
  at: string
  ruleId: string
  ruleName: string
  channel: AlertChannel
  to: string
  toName: string
  alertIds: string[]
  subject: string
  body: string
  status: 'sent' | 'queued' | 'failed' | 'simulated' | 'suppressed'
  note?: string
}

export interface AlertState { read?: boolean; snoozedUntil?: string; assignedTo?: string; notes?: string; dismissed?: boolean; pipelineAdded?: boolean }

export const DEFAULT_CONDITIONS: RuleConditions = { kinds: [], sectors: [], severities: [], distressOnly: false, distressFlags: [], ownerCategories: [] }
export const DEFAULT_SCOPE: RuleScope = { mode: 'everywhere', radiusM: 500, siteIds: [], postcodes: [], offices: [] }
export const DEFAULT_PREFS: NotificationPrefs = { email: '', emailVerified: false, mobile: '', mobileVerified: false, teamsWebhook: '', quietHours: { enabled: true, from: '21:00', to: '07:00' }, digestHour: 8, weeklyDay: 1, timezone: 'Europe/London' }

export const CHANNEL_LABEL: Record<AlertChannel, string> = { inapp: 'In app', email: 'Email', sms: 'Text message', teams: 'Microsoft Teams' }
export const FREQUENCY_LABEL: Record<AlertFrequency, string> = { instant: 'Instantly', hourly: 'Hourly round-up', daily: 'Daily digest', weekly: 'Weekly digest' }
export const SCOPE_LABEL: Record<RuleScope['mode'], string> = { everywhere: 'Everywhere', 'my-sites': 'Around My Sites', pipeline: 'Around pipeline deals', sites: 'Named sites', postcodes: 'Postcode districts', offices: 'Office patches' }

export const newRuleId = () => `R${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export function blankRule(createdBy: string, patch: Partial<AlertRule> = {}): AlertRule {
  const now = new Date().toISOString()
  return { id: newRuleId(), name: 'New alert', enabled: true, createdBy, createdAt: now, updatedAt: now, conditions: { ...DEFAULT_CONDITIONS }, scope: { ...DEFAULT_SCOPE }, channels: ['inapp', 'email'], frequency: 'daily', instantForCritical: true, recipients: [], firedCount: 0, ...patch }
}

/** Ready-made rules for the way the team tracks distressed ("dirty") deals. */
export const RULE_PRESETS: { id: string; name: string; description: string; tag: string; patch: Partial<AlertRule> }[] = [
  { id: 'dirty-deals', name: 'Dirty deals: distress anywhere in my sectors', description: 'Administrations, Gazette notices, new charges, regulator enforcement and late accounts on any operator, sent at once.', tag: 'Dirty deals', patch: { conditions: { ...DEFAULT_CONDITIONS, kinds: ['Company status', 'Gazette notice', 'New charge', 'Distress signal', 'Regulator enforcement', 'Late accounts', 'Licence review'], severities: [] }, frequency: 'instant', channels: ['inapp', 'email', 'sms'] } },
  { id: 'my-sites', name: 'Anything on My Sites', description: 'Every event on a watched site or within 250 m of it, daily digest.', tag: 'My Sites', patch: { scope: { ...DEFAULT_SCOPE, mode: 'my-sites', radiusM: 250 }, frequency: 'daily' } },
  { id: 'ownership', name: 'Ownership changes and sales nearby', description: 'Title transfers and recorded prices within 500 m of a watched site.', tag: 'Ownership', patch: { conditions: { ...DEFAULT_CONDITIONS, kinds: ['Ownership change', 'Price paid recorded'] }, scope: { ...DEFAULT_SCOPE, mode: 'my-sites', radiusM: 500 } } },
  { id: 'lease-events', name: 'Lease breaks and expiries', description: 'Lease events on any site in my sectors, weekly.', tag: 'Leases', patch: { conditions: { ...DEFAULT_CONDITIONS, kinds: ['Lease event'] }, frequency: 'weekly' } },
  { id: 'regulator', name: 'Regulator downgrades and enforcement', description: 'CQC, Ofsted and FSA rating falls or enforcement, instantly.', tag: 'Regulator', patch: { conditions: { ...DEFAULT_CONDITIONS, kinds: ['Rating change', 'Regulator enforcement', 'Registration change'], severities: ['warning', 'critical'] }, frequency: 'instant' } },
  { id: 'deal-score', name: 'Sites crossing the high transact band', description: 'Likely-to-transact score moving into High (55+), daily.', tag: 'Scores', patch: { conditions: { ...DEFAULT_CONDITIONS, kinds: ['Deal score'], minDealScore: 55 } } },
  { id: 'planning', name: 'Planning around pipeline deals', description: 'Applications submitted or decided within 500 m of a pipeline deal.', tag: 'Planning', patch: { conditions: { ...DEFAULT_CONDITIONS, kinds: ['Planning submitted', 'Planning decided'] }, scope: { ...DEFAULT_SCOPE, mode: 'pipeline', radiusM: 500 } } },
  { id: 'competition', name: 'New competitors near My Sites', description: 'A new same-sector operator opening within 400 m of a watched site.', tag: 'Competition', patch: { conditions: { ...DEFAULT_CONDITIONS, kinds: ['Competitor opened', 'New business'] }, scope: { ...DEFAULT_SCOPE, mode: 'my-sites', radiusM: 400 } } },
]

export interface MatchContext {
  business?: Business
  title?: Title
  dealScore?: number
  watchlist: WatchItem[]
  /** Centres of watched / pipeline sites, resolved by the caller. */
  siteCentres: Record<string, [number, number]>
  userOffice?: string
}

export interface MatchResult { match: boolean; reasons: string[] }

const outward = (pc?: string) => (pc ?? '').trim().toUpperCase().split(/\s+/)[0]

/** Does this alert satisfy the rule? Every failed test is named so the editor can explain a miss. */
export function matchRule(rule: AlertRule, alert: Alert, ctx: MatchContext): MatchResult {
  const reasons: string[] = []
  const c = rule.conditions
  const fail = (why: string): MatchResult => ({ match: false, reasons: [...reasons, why] })
  if (!rule.enabled) return fail('rule paused')
  if (c.kinds.length && !c.kinds.includes(alert.kind)) return fail(`kind ${alert.kind} not selected`)
  reasons.push(c.kinds.length ? `kind ${alert.kind}` : 'any kind')
  if (c.severities.length && !c.severities.includes(alert.severity)) return fail(`severity ${alert.severity} below threshold`)
  if (c.sectors.length) {
    if (!alert.sector || !c.sectors.includes(alert.sector)) return fail(`sector ${alert.sector ?? 'unknown'} not selected`)
    reasons.push(`sector ${alert.sector}`)
  }
  if (c.keywords?.trim()) {
    const words = c.keywords.toLowerCase().split(/[,\s]+/).filter(Boolean)
    const hay = `${alert.title} ${alert.detail}`.toLowerCase()
    const hit = words.find((w) => hay.includes(w))
    if (!hit) return fail(`none of "${c.keywords}" in the text`)
    reasons.push(`mentions "${hit}"`)
  }
  if (c.distressOnly || c.distressFlags.length) {
    const flags = ctx.business?.distressFlags ?? []
    const distressKinds: Alert['kind'][] = ['Distress signal', 'Gazette notice', 'Company status', 'New charge', 'Regulator enforcement', 'Late accounts']
    const eventIsDistress = distressKinds.includes(alert.kind)
    if (c.distressFlags.length) {
      const hit = c.distressFlags.find((f) => flags.includes(f))
      if (!hit) return fail(`no ${c.distressFlags.join('/')} flag on the operator`)
      reasons.push(`flag ${hit}`)
    } else if (!flags.length && !eventIsDistress) return fail('no distress signal on the operator')
    else reasons.push(flags.length ? `${flags.length} distress flag${flags.length > 1 ? 's' : ''}` : 'distress event')
  }
  if (c.minDealScore !== undefined) {
    if (ctx.dealScore === undefined || ctx.dealScore < c.minDealScore) return fail(`deal score ${ctx.dealScore ?? 'n/a'} below ${c.minDealScore}`)
    reasons.push(`score ${ctx.dealScore}`)
  }
  if (c.ownerCategories.length) {
    const cats = ctx.title?.proprietors.map((p) => p.category) ?? []
    const hit = c.ownerCategories.find((o) => cats.includes(o))
    if (!hit) return fail(`owner is ${cats[0] ?? 'unknown'}`)
    reasons.push(`owner ${hit}`)
  }
  if (c.tenure) {
    const t = ctx.business?.tenure ?? ctx.title?.tenure
    if (t !== c.tenure) return fail(`tenure ${t ?? 'unknown'}`)
    reasons.push(c.tenure)
  }
  // scope
  const s = rule.scope
  const near = (ids: string[]) => {
    if (!alert.location) return undefined
    let best: { id: string; d: number } | undefined
    for (const id of ids) {
      const centre = ctx.siteCentres[id]
      if (!centre) continue
      const d = haversineM(centre, alert.location)
      if (!best || d < best.d) best = { id, d }
    }
    return best
  }
  if (s.mode === 'my-sites' || s.mode === 'pipeline' || s.mode === 'sites') {
    const ids = s.mode === 'sites' ? s.siteIds : ctx.watchlist.filter((w) => (s.mode === 'pipeline' ? !!w.stage && w.stage !== 'Lost' && w.stage !== 'Completed' : true)).map((w) => w.entityId)
    const direct = ids.find((id) => id === alert.entityId || id === alert.businessId || id === alert.titleNumber)
    if (direct) reasons.push('on a watched site')
    else {
      const b = near(ids)
      if (!b || b.d > s.radiusM) return fail(b ? `nearest watched site ${Math.round(b.d)} m away (radius ${s.radiusM} m)` : 'not near any watched site')
      reasons.push(`${Math.round(b.d)} m from a watched site`)
    }
  } else if (s.mode === 'postcodes') {
    const o = outward(alert.postcode)
    if (!o || !s.postcodes.map((p) => p.toUpperCase()).includes(o)) return fail(`postcode ${o || 'unknown'} outside ${s.postcodes.join(', ')}`)
    reasons.push(`postcode ${o}`)
  } else if (s.mode === 'offices') {
    // Demo: office patches map to the demo areas by postcode area letters.
    const o = outward(alert.postcode).replace(/\d.*$/, '')
    const patch = OFFICE_PATCHES[o]
    if (!patch || !s.offices.includes(patch)) return fail(`postcode area ${o || 'unknown'} is not in ${s.offices.join(', ')} patch`)
    reasons.push(`${patch} patch`)
  }
  return { match: true, reasons }
}

/** Postcode area letters covered by each office (demo mapping for the two demo areas plus the big cities). */
export const OFFICE_PATCHES: Record<string, string> = { CV: 'Birmingham', B: 'Birmingham', WS: 'Birmingham', DY: 'Birmingham', WR: 'Birmingham', BS: 'Bristol', BA: 'Bristol', GL: 'Bristol', TA: 'Bristol', M: 'Manchester', SK: 'Manchester', WA: 'Manchester', LS: 'Leeds', BD: 'Leeds', HG: 'Leeds', E: 'London', EC: 'London', N: 'London', NW: 'London', SE: 'London', SW: 'London', W: 'London', WC: 'London', EH: 'Edinburgh', G: 'Glasgow', EX: 'Exeter', NG: 'Nottingham', NE: 'Newcastle', CF: 'Cardiff' }

/** Is `now` inside the user's quiet hours? Instant messages wait until they end; digests ignore them. */
export function inQuietHours(prefs: NotificationPrefs, now = new Date()): boolean {
  if (!prefs.quietHours.enabled) return false
  const [fh, fm] = prefs.quietHours.from.split(':').map(Number)
  const [th, tm] = prefs.quietHours.to.split(':').map(Number)
  const mins = now.getHours() * 60 + now.getMinutes()
  const from = fh * 60 + fm
  const to = th * 60 + tm
  return from <= to ? mins >= from && mins < to : mins >= from || mins < to
}

/** When the next digest for a rule would go out. */
export function nextDigestAt(frequency: AlertFrequency, prefs: NotificationPrefs, now = new Date()): Date {
  const d = new Date(now)
  if (frequency === 'instant') return d
  if (frequency === 'hourly') { d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d }
  d.setHours(prefs.digestHour, 0, 0, 0)
  if (frequency === 'daily') { if (d <= now) d.setDate(d.getDate() + 1); return d }
  const delta = (prefs.weeklyDay - d.getDay() + 7) % 7
  d.setDate(d.getDate() + delta)
  if (d <= now) d.setDate(d.getDate() + 7)
  return d
}

const SEV_ICON: Record<Severity, string> = { info: '•', warning: '▲', critical: '‼' }
/** Link base for messages: the deployed app root (hash-router builds link through #/). */
const appUrl = () => {
  if (typeof window === 'undefined') return 'https://property-intelligence.internal/'
  const env = (import.meta as unknown as { env?: Record<string, string> }).env ?? {}
  const base = (env.BASE_URL ?? '/').replace(/\/?$/, '/')
  return `${window.location.origin}${base}${env.VITE_ROUTER === 'hash' ? '#/' : ''}`
}
const linkFor = (a: Alert) => (a.entityType === 'company' ? `${appUrl()}companies/${a.entityId}` : `${appUrl()}map/${a.entityType}/${encodeURIComponent(a.entityId)}`)
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Plain-text email. One event = a single message; several = the digest. */
export function renderEmail(rule: AlertRule, alerts: Alert[], recipientName: string): { subject: string; body: string } {
  const crit = alerts.filter((a) => a.severity === 'critical').length
  const subject = alerts.length === 1 ? `[Property Intelligence] ${alerts[0].title}` : `[Property Intelligence] ${rule.name}: ${alerts.length} events${crit ? ` (${crit} critical)` : ''}`
  const lines = [`Hello ${recipientName.split(' ')[0]},`, '', alerts.length === 1 ? `Your alert "${rule.name}" matched one event:` : `Your alert "${rule.name}" matched ${alerts.length} events${crit ? `, ${crit} of them critical` : ''}:`, '']
  for (const a of [...alerts].sort((x, y) => (x.severity === 'critical' ? -1 : y.severity === 'critical' ? 1 : 0))) {
    lines.push(`${SEV_ICON[a.severity]} ${a.title}`, `   ${a.detail}`, `   ${a.kind}${a.sector ? ` · ${a.sector}` : ''}${a.postcode ? ` · ${a.postcode}` : ''} · ${when(a.occurredAt)}`, `   ${linkFor(a)}`, '')
  }
  lines.push('—', `Sent by Property Intelligence because of your alert "${rule.name}"${rule.tag ? ` (${rule.tag})` : ''}. Manage alerts: ${appUrl()}alerts/rules`, 'Internal use only. Ownership data is used under HM Land Registry licence terms; do not forward outside Christie & Co.')
  return { subject, body: lines.join('\n') }
}

/** Text message: one line per event, hard-capped so it stays one or two segments. */
export function renderSms(rule: AlertRule, alerts: Alert[]): string {
  const head = alerts.length === 1 ? `PI alert (${rule.tag ?? rule.name}): ` : `PI ${rule.tag ?? rule.name}: ${alerts.length} events. `
  const items = alerts.slice(0, 3).map((a) => `${a.severity === 'critical' ? '!! ' : ''}${a.title}${a.postcode ? ` (${a.postcode})` : ''}`)
  const text = head + items.join('; ') + (alerts.length > 3 ? ` +${alerts.length - 3} more` : '') + ` ${appUrl()}alerts`
  return text.length > 300 ? text.slice(0, 297) + '…' : text
}

/** Microsoft Teams incoming-webhook card (Adaptive Card JSON), returned as text for the log. */
export function renderTeams(rule: AlertRule, alerts: Alert[]): string {
  const card = {
    type: 'message',
    attachments: [{ contentType: 'application/vnd.microsoft.card.adaptive', content: { type: 'AdaptiveCard', version: '1.4', body: [
      { type: 'TextBlock', size: 'Medium', weight: 'Bolder', text: alerts.length === 1 ? alerts[0].title : `${rule.name}: ${alerts.length} events` },
      ...alerts.slice(0, 8).map((a) => ({ type: 'TextBlock', wrap: true, text: `**${a.severity === 'critical' ? '‼ ' : ''}${a.title}** — ${a.detail} _(${a.kind}, ${when(a.occurredAt)})_` })),
    ], actions: alerts.slice(0, 3).map((a) => ({ type: 'Action.OpenUrl', title: a.title.slice(0, 40), url: linkFor(a) })) } }],
  }
  return JSON.stringify(card, null, 2)
}

/** Channels a recipient can actually be reached on, given their verified details. */
export function deliverableChannels(wanted: AlertChannel[], prefs: Pick<NotificationPrefs, 'email' | 'emailVerified' | 'mobile' | 'mobileVerified' | 'teamsWebhook'>): { ok: AlertChannel[]; blocked: { channel: AlertChannel; why: string }[] } {
  const ok: AlertChannel[] = []
  const blocked: { channel: AlertChannel; why: string }[] = []
  for (const ch of wanted) {
    if (ch === 'inapp') ok.push(ch)
    else if (ch === 'email') {
      if (prefs.email && prefs.emailVerified) ok.push(ch)
      else blocked.push({ channel: ch, why: prefs.email ? 'email not verified' : 'no email address' })
    } else if (ch === 'sms') {
      if (prefs.mobile && prefs.mobileVerified) ok.push(ch)
      else blocked.push({ channel: ch, why: prefs.mobile ? 'mobile not verified' : 'no mobile number' })
    } else if (ch === 'teams') {
      if (prefs.teamsWebhook) ok.push(ch)
      else blocked.push({ channel: ch, why: 'no Teams webhook' })
    }
  }
  return { ok, blocked }
}

export function describeRule(r: AlertRule): string {
  const c = r.conditions
  const what = c.kinds.length ? (c.kinds.length <= 3 ? c.kinds.join(', ') : `${c.kinds.length} event types`) : 'Any event'
  const where = r.scope.mode === 'everywhere' ? 'anywhere' : r.scope.mode === 'postcodes' ? `in ${r.scope.postcodes.join(', ') || 'no districts'}` : r.scope.mode === 'offices' ? `in the ${r.scope.offices.join(', ') || 'no'} patch` : `within ${r.scope.radiusM} m of ${r.scope.mode === 'pipeline' ? 'pipeline deals' : r.scope.mode === 'sites' ? `${r.scope.siteIds.length} named sites` : 'My Sites'}`
  const who = c.sectors.length ? ` for ${c.sectors.join(', ')}` : ''
  const extra = [c.distressOnly ? 'distressed operators only' : '', c.minDealScore !== undefined ? `score ≥ ${c.minDealScore}` : '', c.severities.length ? `${c.severities.join('/')} only` : '', c.keywords ? `mentioning "${c.keywords}"` : ''].filter(Boolean).join(', ')
  return `${what}${who} ${where}${extra ? `, ${extra}` : ''} → ${FREQUENCY_LABEL[r.frequency].toLowerCase()} by ${r.channels.map((ch) => CHANNEL_LABEL[ch].toLowerCase()).join(', ')}${r.recipients.length ? ` to you and ${r.recipients.length} colleague${r.recipients.length > 1 ? 's' : ''}` : ''}.`
}
