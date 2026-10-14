import { useEffect, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import { provider, type DataSourceStatus } from '@/data'
import { Badge, Card, Stat } from '@/components/ui'
import { ago, num } from '@/lib/format'

const tone = (s: DataSourceStatus['status']) => (s === 'ok' ? 'good' : s === 'stale' ? 'warning' : s === 'error' ? 'critical' : s === 'paid' ? 'violet' : 'neutral')
const LICENCE_NOTE: Record<string, string> = {
  OGL: 'Open Government Licence: commercial reuse with attribution.',
  'HMLR-CCOD': 'HMLR licence: no direct marketing to proprietors, no resale as standalone product, keep end-user records.',
  'HMLR-Doc': 'Official copies at £7; standard terms prohibit marketing to proprietors.',
  'VOA-Restricted': 'VOA restricted terms, not OGL: internal use; pass on only with the terms attached.',
  OS: 'OS Data Hub: attribution required; no redistribution of premium data outside the organisation.',
  Vendor: 'Commercial licence; check seat and area terms.',
  Internal: 'Christie & Co data.',
}

export function AdminPage() {
  const [sources, setSources] = useState<DataSourceStatus[]>([])
  useEffect(() => {
    provider.getDataSources().then(setSources)
  }, [])
  const count = (s: DataSourceStatus['status']) => sources.filter((x) => x.status === s).length
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">Data sources</h1>
        <p className="text-sm text-ink-500">Every upstream feed, its licence class, cadence and last successful run. Ingestion jobs are the phase 2 build; statuses below describe the intended pipeline, with the demo running on synthetic data.</p>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <Stat label="Healthy" value={count('ok')} tone="good" />
        <Stat label="Stale" value={count('stale')} tone="warning" />
        <Stat label="Errors" value={count('error')} tone={count('error') ? 'critical' : 'neutral'} />
        <Stat label="Not configured" value={count('not-configured')} />
        <Stat label="Paid / optional" value={count('paid')} />
      </div>
      <Card padded={false} className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-ink-50 text-left text-xs text-ink-500"><tr><th className="px-4 py-2 font-medium">Source</th><th className="font-medium">Provider</th><th className="font-medium">Licence</th><th className="font-medium">Cadence</th><th className="font-medium">Last run</th><th className="font-medium text-right">Records</th><th className="font-medium">Status</th></tr></thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id} className="border-t border-ink-100 align-top">
                <td className="px-4 py-2"><div className="font-medium">{s.name}</div>{s.note && <div className="text-xs text-ink-500">{s.note}</div>}{s.docsUrl && <a className="inline-flex items-center gap-1 text-xs text-brand-700 hover:underline" href={s.docsUrl} target="_blank" rel="noreferrer">docs <ExternalLink size={11} /></a>}</td>
                <td className="text-xs">{s.provider}</td>
                <td><Badge title={LICENCE_NOTE[s.licence]} tone={s.licence === 'OGL' ? 'good' : s.licence === 'Vendor' ? 'violet' : 'warning'}>{s.licence}</Badge></td>
                <td className="text-xs">{s.cadence}</td>
                <td className="text-xs">{s.lastRun ? ago(s.lastRun) : '—'}{s.nextRun && <div className="text-ink-400">next in {Math.max(0, Math.round((new Date(s.nextRun).getTime() - Date.now()) / 86400000))} d</div>}</td>
                <td className="text-right text-xs tabular-nums">{s.records ? num(s.records) : '—'}</td>
                <td><Badge tone={tone(s.status)}>{s.status}</Badge></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title="Licence classes">
        <ul className="space-y-1 text-sm">{Object.entries(LICENCE_NOTE).map(([k, v]) => <li key={k}><Badge className="mr-2">{k}</Badge>{v}</li>)}</ul>
      </Card>
    </div>
  )
}
