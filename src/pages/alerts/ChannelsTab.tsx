import { useState } from 'react'
import { Mail, Smartphone, MessageSquare, Moon, Clock, CheckCircle2, Send } from 'lucide-react'
import { useAuth } from '@/auth'
import { useAlerts } from '@/store/alerts'
import { Badge, Button, Card, Input, Select, Toggle } from '@/components/ui'
import { logAudit } from '@/lib/audit'
import { blankRule, CHANNEL_LABEL, nextDigestAt, type AlertChannel } from '@/lib/alerts'

/**
 * Where alerts reach this user: email, mobile for text messages, a Teams channel webhook, quiet
 * hours and digest timing. Verification is simulated on the demo build (any 6-digit code); in
 * production the API sends the code over the channel being verified.
 */
export function ChannelsTab() {
  const user = useAuth((s) => s.user)
  const { prefs, setPrefs, rules, deliver } = useAlerts()
  const [email, setEmail] = useState(prefs.email || user?.email || '')
  const [mobile, setMobile] = useState(prefs.mobile)
  const [webhook, setWebhook] = useState(prefs.teamsWebhook)
  const [code, setCode] = useState<{ channel: 'email' | 'sms'; value: string } | null>(null)
  const usedBy = (ch: AlertChannel) => rules.filter((r) => r.channels.includes(ch)).length
  const verify = (channel: 'email' | 'sms') => {
    if (!code || code.channel !== channel) { setCode({ channel, value: '' }); return }
    if (!/^\d{6}$/.test(code.value)) return
    if (channel === 'email') setPrefs({ email, emailVerified: true })
    else setPrefs({ mobile, mobileVerified: true })
    logAudit('settings-changed', `Verified ${channel === 'email' ? 'email address' : 'mobile number'} for alerts`)
    setCode(null)
  }
  const test = (ch: AlertChannel) => {
    const r = blankRule(user?.id ?? 'demo-agent', { name: 'Channel test', tag: 'Test', channels: [ch] })
    const d = deliver(r, [{ alertId: 'TEST', kind: 'Distress signal', title: 'Test alert from Property Intelligence', detail: 'If you can read this, the channel works.', occurredAt: new Date().toISOString(), severity: 'info', entityType: 'business', entityId: 'B0001', read: false }], { test: true })
    alert(d[0]?.status === 'suppressed' ? `Not sent: ${d[0].note}` : `Test ${CHANNEL_LABEL[ch].toLowerCase()} written to the delivery log.`)
  }
  const digestNext = nextDigestAt('daily', prefs)
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title={<span className="flex items-center gap-2"><Mail size={15} /> Email</span>} actions={prefs.emailVerified ? <Badge tone="good"><CheckCircle2 size={11} /> verified</Badge> : <Badge tone="warning">not verified</Badge>}>
        <div className="flex gap-2"><Input type="email" value={email} onChange={(e) => { setEmail(e.target.value); if (e.target.value !== prefs.email) setPrefs({ email: e.target.value, emailVerified: false }) }} placeholder="you@christie.com" aria-label="Email address" /><Button onClick={() => verify('email')} disabled={!email}>{code?.channel === 'email' ? 'Confirm' : prefs.emailVerified ? 'Re-verify' : 'Verify'}</Button></div>
        {code?.channel === 'email' && <div className="mt-2 flex items-center gap-2 text-xs"><Input value={code.value} onChange={(e) => setCode({ channel: 'email', value: e.target.value })} placeholder="6-digit code" className="w-32" aria-label="Email code" /><span className="text-ink-500">We emailed a code to {email}. On the demo build any six digits work.</span></div>}
        <p className="mt-2 text-[11px] text-ink-500">Used by {usedBy('email')} of your {rules.length} alerts. Messages come from alerts@property-intelligence (internal relay); replies are not monitored.</p>
        <Button size="sm" className="mt-2" onClick={() => test('email')} disabled={!prefs.emailVerified}><Send size={12} /> Send test email</Button>
      </Card>

      <Card title={<span className="flex items-center gap-2"><Smartphone size={15} /> Text messages</span>} actions={prefs.mobileVerified ? <Badge tone="good"><CheckCircle2 size={11} /> verified</Badge> : <Badge tone="warning">not verified</Badge>}>
        <div className="flex gap-2"><Input type="tel" value={mobile} onChange={(e) => { setMobile(e.target.value); if (e.target.value !== prefs.mobile) setPrefs({ mobile: e.target.value, mobileVerified: false }) }} placeholder="+44 7700 900000" aria-label="Mobile number" /><Button onClick={() => verify('sms')} disabled={!mobile}>{code?.channel === 'sms' ? 'Confirm' : prefs.mobileVerified ? 'Re-verify' : 'Verify'}</Button></div>
        {code?.channel === 'sms' && <div className="mt-2 flex items-center gap-2 text-xs"><Input value={code.value} onChange={(e) => setCode({ channel: 'sms', value: e.target.value })} placeholder="6-digit code" className="w-32" aria-label="SMS code" /><span className="text-ink-500">We texted a code to {mobile}. On the demo build any six digits work.</span></div>}
        <p className="mt-2 text-[11px] text-ink-500">Used by {usedBy('sms')} alerts. Texts are kept to one or two segments and only carry the event headline; the detail stays in the app. Critical events only is a good default for texts.</p>
        <Button size="sm" className="mt-2" onClick={() => test('sms')} disabled={!prefs.mobileVerified}><Send size={12} /> Send test text</Button>
      </Card>

      <Card title={<span className="flex items-center gap-2"><MessageSquare size={15} /> Microsoft Teams</span>} actions={prefs.teamsWebhook ? <Badge tone="good">channel set</Badge> : <Badge>optional</Badge>}>
        <Input value={webhook} onChange={(e) => { setWebhook(e.target.value); setPrefs({ teamsWebhook: e.target.value.trim() }) }} placeholder="https://christieco.webhook.office.com/webhookb2/…" aria-label="Teams webhook" />
        <p className="mt-2 text-[11px] text-ink-500">In Teams: channel → Manage channel → Connectors → Incoming Webhook, then paste the URL here. Every alert that selects Teams posts an adaptive card to that channel. Good for a team "dirty deals" channel; add colleagues on the rule itself for their own emails and texts.</p>
        <Button size="sm" className="mt-2" onClick={() => test('teams')} disabled={!prefs.teamsWebhook}><Send size={12} /> Post test card</Button>
      </Card>

      <Card title={<span className="flex items-center gap-2"><Moon size={15} /> Quiet hours and digests</span>}>
        <Toggle checked={prefs.quietHours.enabled} onChange={(v) => setPrefs({ quietHours: { ...prefs.quietHours, enabled: v } })} label="Quiet hours" hint="Instant emails and texts wait until quiet hours end. Critical events still go through if the rule says so." />
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
          <label><span className="label">From</span><Input type="time" value={prefs.quietHours.from} onChange={(e) => setPrefs({ quietHours: { ...prefs.quietHours, from: e.target.value } })} disabled={!prefs.quietHours.enabled} /></label>
          <label><span className="label">To</span><Input type="time" value={prefs.quietHours.to} onChange={(e) => setPrefs({ quietHours: { ...prefs.quietHours, to: e.target.value } })} disabled={!prefs.quietHours.enabled} /></label>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
          <label><span className="label"><Clock size={11} className="mr-1 inline" />Daily digest at</span><Select value={prefs.digestHour} onChange={(e) => setPrefs({ digestHour: Number(e.target.value) })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</Select></label>
          <label><span className="label">Weekly digest on</span><Select value={prefs.weeklyDay} onChange={(e) => setPrefs({ weeklyDay: Number(e.target.value) })}>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => <option key={d} value={i}>{d}</option>)}</Select></label>
        </div>
        <p className="mt-2 text-[11px] text-ink-500">Next daily digest: {digestNext.toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })} ({prefs.timezone}). Each digest groups events by alert and sector, worst first, and skips anything you have already read in the app.</p>
      </Card>
    </div>
  )
}
