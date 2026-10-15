import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Alert } from '@/data/types'
import { blankRule, deliverableChannels, DEFAULT_PREFS, renderEmail, renderSms, renderTeams, RULE_PRESETS, type AlertChannel, type AlertRule, type AlertState, type Delivery, type NotificationPrefs } from '@/lib/alerts'
import { staffById } from '@/data/staff'

/**
 * Alert rules, notification preferences, the delivery log and per-alert state (read, snoozed,
 * assigned, notes). Persisted per browser in the demo; the API holds them per user in production
 * (/api/alerts/rules, /api/me/notifications, /api/alerts/deliveries).
 */
interface AlertsStore {
  rules: AlertRule[]
  prefs: NotificationPrefs
  deliveries: Delivery[]
  state: Record<string, AlertState>
  /** rule id → alert ids already delivered, so a re-run never sends twice. */
  delivered: Record<string, string[]>
  seeded: boolean
  upsertRule: (r: AlertRule) => void
  removeRule: (id: string) => void
  toggleRule: (id: string, enabled?: boolean) => void
  duplicateRule: (id: string, by: string) => AlertRule | undefined
  setPrefs: (p: Partial<NotificationPrefs>) => void
  setState: (alertId: string, patch: AlertState) => void
  setMany: (alertIds: string[], patch: AlertState) => void
  pushDelivery: (d: Delivery) => void
  clearDeliveries: () => void
  /** Simulate sending a rule's matched alerts over its channels; returns the deliveries written. */
  deliver: (rule: AlertRule, alerts: Alert[], opts?: { test?: boolean; force?: boolean }) => Delivery[]
  seedPresets: (by: string) => void
}

const newId = (p: string) => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`

export const useAlerts = create<AlertsStore>()(
  persist(
    (set, get) => ({
      rules: [],
      prefs: DEFAULT_PREFS,
      deliveries: [],
      state: {},
      delivered: {},
      seeded: false,
      upsertRule: (r) => set((s) => ({ rules: s.rules.some((x) => x.id === r.id) ? s.rules.map((x) => (x.id === r.id ? { ...r, updatedAt: new Date().toISOString() } : x)) : [{ ...r }, ...s.rules] })),
      removeRule: (id) => set((s) => ({ rules: s.rules.filter((r) => r.id !== id) })),
      toggleRule: (id, enabled) => set((s) => ({ rules: s.rules.map((r) => (r.id === id ? { ...r, enabled: enabled ?? !r.enabled, updatedAt: new Date().toISOString() } : r)) })),
      duplicateRule: (id, by) => {
        const src = get().rules.find((r) => r.id === id)
        if (!src) return undefined
        const copy = blankRule(by, { ...src, id: undefined as never, name: `${src.name} (copy)`, firedCount: 0, lastFiredAt: undefined })
        copy.id = newId('R')
        set((s) => ({ rules: [copy, ...s.rules] }))
        return copy
      },
      setPrefs: (p) => set((s) => ({ prefs: { ...s.prefs, ...p } })),
      setState: (alertId, patch) => set((s) => ({ state: { ...s.state, [alertId]: { ...(s.state[alertId] ?? {}), ...patch } } })),
      setMany: (alertIds, patch) => set((s) => ({ state: { ...s.state, ...Object.fromEntries(alertIds.map((id) => [id, { ...(s.state[id] ?? {}), ...patch }])) } })),
      pushDelivery: (d) => set((s) => ({ deliveries: [d, ...s.deliveries].slice(0, 500) })),
      clearDeliveries: () => set({ deliveries: [], delivered: {} }),
      deliver: (rule, alerts, opts = {}) => {
        const already = new Set(get().delivered[rule.id] ?? [])
        const fresh = opts.force || opts.test ? alerts : alerts.filter((a) => !already.has(a.alertId))
        if (!fresh.length) return []
        const prefs = get().prefs
        const out: Delivery[] = []
        const at = new Date().toISOString()
        const owner = staffById(rule.createdBy)
        const ownerName = owner?.name ?? 'You'
        const send = (channel: AlertChannel, to: string, toName: string, status: Delivery['status'], note?: string) => {
          const msg = channel === 'email' ? renderEmail(rule, fresh, toName) : channel === 'sms' ? { subject: 'SMS', body: renderSms(rule, fresh) } : channel === 'teams' ? { subject: 'Teams card', body: renderTeams(rule, fresh) } : { subject: fresh.length === 1 ? fresh[0].title : `${rule.name}: ${fresh.length} events`, body: fresh.map((a) => `${a.title} — ${a.detail}`).join('\n') }
          out.push({ id: newId('D'), at, ruleId: rule.id, ruleName: rule.name, channel, to, toName, alertIds: fresh.map((a) => a.alertId), subject: opts.test ? `[TEST] ${msg.subject}` : msg.subject, body: msg.body, status, note })
        }
        // owner
        const { ok, blocked } = deliverableChannels(rule.channels, prefs)
        for (const ch of ok) send(ch, ch === 'email' ? prefs.email : ch === 'sms' ? prefs.mobile : ch === 'teams' ? 'Teams webhook' : 'in app', ownerName, opts.test ? 'simulated' : 'sent')
        for (const b of blocked) send(b.channel, '—', ownerName, 'suppressed', b.why)
        // colleagues: the directory supplies their details; email and mobile count as verified there
        for (const r of rule.recipients) {
          const st = staffById(r.staffId)
          if (!st) continue
          const theirs = deliverableChannels(r.channels, { email: st.email, emailVerified: true, mobile: st.mobile ?? '', mobileVerified: !!st.mobile, teamsWebhook: '' })
          for (const ch of theirs.ok) send(ch, ch === 'email' ? st.email : ch === 'sms' ? st.mobile ?? '' : 'in app', st.name, opts.test ? 'simulated' : 'sent')
          for (const b of theirs.blocked) send(b.channel, '—', st.name, 'suppressed', b.why)
        }
        set((s) => ({
          deliveries: [...out, ...s.deliveries].slice(0, 500),
          delivered: opts.test ? s.delivered : { ...s.delivered, [rule.id]: Array.from(new Set([...(s.delivered[rule.id] ?? []), ...fresh.map((a) => a.alertId)])) },
          rules: opts.test ? s.rules : s.rules.map((x) => (x.id === rule.id ? { ...x, lastFiredAt: at, firedCount: x.firedCount + fresh.length } : x)),
        }))
        return out
      },
      seedPresets: (by) => {
        if (get().seeded || get().rules.length) return
        const picks = RULE_PRESETS.filter((p) => ['dirty-deals', 'my-sites', 'regulator'].includes(p.id))
        const rules = picks.map((p, i) => blankRule(by, { ...p.patch, name: p.name, description: p.description, tag: p.tag, recipients: i === 0 ? [{ staffId: 's-barratt', channels: ['email'] }, { staffId: 's-reid', channels: ['inapp', 'email'] }] : [] }))
        set({ rules, seeded: true })
      },
    }),
    {
      name: 'cpi-alerts',
      version: 1,
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<AlertsStore>
        return { ...current, ...p, prefs: { ...DEFAULT_PREFS, ...(p.prefs ?? {}), quietHours: { ...DEFAULT_PREFS.quietHours, ...(p.prefs?.quietHours ?? {}) } }, rules: Array.isArray(p.rules) ? p.rules : [], deliveries: Array.isArray(p.deliveries) ? p.deliveries : [], state: p.state && typeof p.state === 'object' ? p.state : {}, delivered: p.delivered && typeof p.delivered === 'object' ? p.delivered : {} }
      },
    },
  ),
)
