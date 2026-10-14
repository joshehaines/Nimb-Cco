import { useEffect, useMemo, useState } from 'react'
import { Download, ShieldCheck } from 'lucide-react'
import { provider, type AuditEvent, type AuditKind } from '@/data'
import { Badge, Button, Card, Input, Select, Stat, Empty } from '@/components/ui'
import { useUi } from '@/store/ui'
import { canDownload } from '@/lib/env'
import { ago } from '@/lib/format'
import { RequireRole } from '@/components/AuthGate'

const KIND_LABEL: Record<AuditKind, string> = {
  'sign-in': 'Sign-in', 'document-order': 'Document order', export: 'Export', 'crm-export': 'CRM export', 'crm-upload': 'CRM upload', 'campaign-created': 'Campaign created', 'campaign-approved': 'Campaign approved', 'campaign-sent': 'Campaign sent', 'report-printed': 'Report printed', 'settings-changed': 'Settings changed', 'watch-added': 'Site watched', 'watch-removed': 'Site unwatched',
}
const tone = (k: AuditKind) => (k === 'campaign-approved' || k === 'campaign-sent' ? 'critical' : k === 'document-order' || k.includes('export') ? 'warning' : 'neutral')

/** Who did what: document orders, exports, campaign approvals. Local events plus the server log when an API is configured. */
export function AuditPage() {
  return (
    <RequireRole role="compliance">
      <AuditInner />
    </RequireRole>
  )
}

function AuditInner() {
  const local = useUi((s) => s.audit)
  const [remote, setRemote] = useState<AuditEvent[]>([])
  const [kind, setKind] = useState<AuditKind | ''>('')
  const [q, setQ] = useState('')
  useEffect(() => {
    provider.getAudit?.().then((r) => setRemote(r ?? [])).catch(() => undefined)
  }, [])
  const events = useMemo(() => {
    const seen = new Set<string>()
    return [...remote, ...local].filter((e) => !seen.has(e.id) && seen.add(e.id)).filter((e) => (!kind || e.kind === kind) && (!q || `${e.userName} ${e.summary} ${e.entityId ?? ''}`.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => b.at.localeCompare(a.at))
  }, [local, remote, kind, q])
  const exportCsv = () => {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
    const csv = ['at,user,kind,summary,entityType,entityId,licences,count', ...events.map((e) => [e.at, e.userName, e.kind, e.summary, e.entityType, e.entityId, (e.licences ?? []).join('|'), e.count].map(esc).join(','))].join('\n')
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }
  const count = (k: AuditKind) => events.filter((e) => e.kind === k).length
  return (
    <div className="mx-auto max-w-6xl space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="flex items-center gap-2 text-xl font-semibold"><ShieldCheck size={20} /> Audit log</h1><p className="text-sm text-ink-500">Every document order, export, CRM transfer and campaign decision, with the licence classes it touched. Append-only; the server copy is the record when the API is in use.</p></div>
        <Button onClick={exportCsv} disabled={!events.length || !canDownload}><Download size={14} /> CSV</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Events" value={events.length} />
        <Stat label="Document orders" value={count('document-order')} />
        <Stat label="Exports" value={count('export') + count('crm-export')} />
        <Stat label="Campaign approvals" value={count('campaign-approved')} tone={count('campaign-approved') ? 'warning' : undefined} />
      </div>
      <Card padded={false} title="Events" actions={<div className="flex gap-2"><Input placeholder="Search user, summary, entity" value={q} onChange={(e) => setQ(e.target.value)} className="w-56 py-1 text-xs" aria-label="Search audit" /><Select value={kind} onChange={(e) => setKind(e.target.value as AuditKind | '')} className="w-auto py-1 text-xs" aria-label="Filter by kind"><option value="">All kinds</option>{(Object.keys(KIND_LABEL) as AuditKind[]).map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</Select></div>}>
        {!events.length ? <div className="p-6"><Empty title="No events yet" hint="Order a document, export a list or approve a campaign and it will appear here." /></div> : (
          <table className="w-full text-xs">
            <thead className="bg-ink-50 text-left text-ink-500"><tr><th className="px-4 py-2 font-medium">When</th><th className="font-medium">User</th><th className="font-medium">Kind</th><th className="font-medium">What</th><th className="font-medium">Licences</th></tr></thead>
            <tbody>{events.map((e) => <tr key={e.id} className="border-t border-ink-100"><td className="whitespace-nowrap px-4 py-1.5" title={e.at}>{ago(e.at)}</td><td className="whitespace-nowrap">{e.userName}</td><td><Badge tone={tone(e.kind)}>{KIND_LABEL[e.kind] ?? e.kind}</Badge></td><td>{e.summary}{e.entityId ? <span className="text-ink-500"> · {e.entityType} {e.entityId}</span> : ''}</td><td className="whitespace-nowrap">{(e.licences ?? []).join(', ')}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
    </div>
  )
}
