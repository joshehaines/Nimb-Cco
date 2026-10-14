import { useMemo, useState } from 'react'
import { Download, Trash2, ChevronDown, ChevronRight } from 'lucide-react'
import { useAlerts } from '@/store/alerts'
import { Badge, Button, Card, Empty, Select, cx } from '@/components/ui'
import { CHANNEL_LABEL, type AlertChannel, type Delivery } from '@/lib/alerts'
import { ago } from '@/lib/format'
import { canDownload } from '@/lib/env'

const tone = (s: Delivery['status']) => (s === 'sent' ? 'good' : s === 'failed' ? 'critical' : s === 'suppressed' ? 'warning' : s === 'queued' ? 'info' : 'neutral')

/** Every message the alert system sent, simulated or suppressed, with the exact text. */
export function DeliveriesTab() {
  const { deliveries, clearDeliveries } = useAlerts()
  const [channel, setChannel] = useState<AlertChannel | ''>('')
  const [status, setStatus] = useState<Delivery['status'] | ''>('')
  const [open, setOpen] = useState<string | null>(null)
  const shown = useMemo(() => deliveries.filter((d) => (!channel || d.channel === channel) && (!status || d.status === status)), [deliveries, channel, status])
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = ['at,rule,channel,to,toName,status,subject,alerts', ...shown.map((d) => [d.at, d.ruleName, d.channel, d.to, d.toName, d.status, d.subject, d.alertIds.join('|')].map(esc).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `alert-deliveries-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }
  const counts = { sent: deliveries.filter((d) => d.status === 'sent').length, simulated: deliveries.filter((d) => d.status === 'simulated').length, suppressed: deliveries.filter((d) => d.status === 'suppressed').length }
  return (
    <Card padded={false} title={`Deliveries (${deliveries.length})`} actions={<div className="flex items-center gap-2 text-xs"><span className="text-ink-500">{counts.sent} sent · {counts.simulated} test · {counts.suppressed} suppressed</span><Select value={channel} onChange={(e) => setChannel(e.target.value as AlertChannel | '')} className="w-auto py-1 text-xs" aria-label="Channel"><option value="">All channels</option>{(Object.keys(CHANNEL_LABEL) as AlertChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}</Select><Select value={status} onChange={(e) => setStatus(e.target.value as Delivery['status'] | '')} className="w-auto py-1 text-xs" aria-label="Status"><option value="">All statuses</option>{['sent', 'simulated', 'suppressed', 'queued', 'failed'].map((s) => <option key={s}>{s}</option>)}</Select><Button size="sm" onClick={exportCsv} disabled={!shown.length || !canDownload}><Download size={13} /> CSV</Button><Button size="sm" onClick={() => confirm('Clear the delivery log? Rules will be allowed to resend past events.') && clearDeliveries()} disabled={!deliveries.length}><Trash2 size={13} /> Clear</Button></div>}>
      {!shown.length ? <div className="p-6"><Empty title="Nothing sent yet" hint="Run your rules from the inbox or send a test from a rule, and every message lands here with its exact text and who it went to." /></div> : (
        <table className="w-full text-xs">
          <thead className="bg-ink-50 text-left text-ink-500"><tr><th className="w-6 px-2" /><th className="py-2 font-medium">When</th><th className="font-medium">Rule</th><th className="font-medium">Channel</th><th className="font-medium">To</th><th className="font-medium">Status</th><th className="font-medium">Message</th></tr></thead>
          <tbody>
            {shown.map((d) => (
              <>
                <tr key={d.id} className="cursor-pointer border-t border-ink-100 hover:bg-ink-50" onClick={() => setOpen(open === d.id ? null : d.id)}>
                  <td className="px-2 text-ink-400">{open === d.id ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</td>
                  <td className="whitespace-nowrap py-1.5" title={d.at}>{ago(d.at)}</td>
                  <td className="max-w-[160px] truncate">{d.ruleName}</td>
                  <td>{CHANNEL_LABEL[d.channel]}</td>
                  <td className="max-w-[180px] truncate">{d.toName}<span className="text-ink-500"> · {d.to}</span></td>
                  <td><Badge tone={tone(d.status)}>{d.status}</Badge>{d.note && <span className="ml-1 text-ink-500">{d.note}</span>}</td>
                  <td className="max-w-[260px] truncate">{d.subject}<span className="text-ink-500"> · {d.alertIds.length} event{d.alertIds.length === 1 ? '' : 's'}</span></td>
                </tr>
                {open === d.id && <tr key={`${d.id}-body`} className="border-t border-ink-100 bg-ink-50/60"><td /><td colSpan={6} className="px-3 py-2"><pre className={cx('max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-surface p-3 text-[11px] leading-snug', d.channel === 'teams' && 'font-mono')}>{d.body}</pre></td></tr>}
              </>
            ))}
          </tbody>
        </table>
      )}
    </Card>
  )
}
