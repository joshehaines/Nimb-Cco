import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FileText } from 'lucide-react'
import { provider, type DocumentOrder } from '@/data'
import { Badge, Card, Empty, Stat } from '@/components/ui'
import { ago, gbp } from '@/lib/format'

export function DocumentsPage() {
  const [docs, setDocs] = useState<DocumentOrder[]>([])
  useEffect(() => {
    const load = () => provider.getDocumentOrders().then((d) => setDocs([...d]))
    load()
    const h = setInterval(load, 1000)
    return () => clearInterval(h)
  }, [])
  const spend = docs.reduce((s, d) => s + d.fee, 0)
  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <div>
        <h1 className="text-xl font-semibold">Document store</h1>
        <p className="text-sm text-ink-500">Every HM Land Registry official copy bought by anyone in the firm, stored once and parsed into structured fields. Business Gateway fee £7 per document; no token mark-up.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Stat label="Documents held" value={docs.length} />
        <Stat label="HMLR spend this session" value={gbp(spend)} sub="pass-through at cost" />
        <Stat label="Parsed into data" value={docs.filter((d) => d.status === 'Parsed').length} tone="good" />
      </div>
      <Card title="Orders" padded={false} className="overflow-x-auto">
        {!docs.length ? <div className="p-4"><Empty title="No documents ordered yet" hint="Open a title on the map and order the register, title plan or lease from the Ownership or Leases tab." /></div> : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500"><tr><th className="px-4 py-2 font-medium">Order</th><th className="font-medium">Title</th><th className="font-medium">Document</th><th className="font-medium">Status</th><th className="font-medium">Extracted</th><th className="font-medium">Ordered</th></tr></thead>
            <tbody>{docs.map((d) => <tr key={d.orderId} className="border-t border-ink-100"><td className="px-4 py-2 font-mono text-xs">{d.orderId}</td><td><Link className="text-brand-700 hover:underline" to={`/map/title/${d.titleNumber}`}>{d.titleNumber}</Link></td><td className="flex items-center gap-1.5 text-xs"><FileText size={14} className="text-ink-400" /> {d.kind}{d.fileName ? <span className="text-ink-400"> · {d.fileName}</span> : null}</td><td><Badge tone={d.status === 'Parsed' ? 'good' : d.status === 'Failed' ? 'critical' : 'info'}>{d.status}</Badge></td><td className="max-w-md text-xs text-ink-700">{d.parsedSummary ?? '—'}</td><td className="text-xs text-ink-500">{ago(d.orderedAt)}</td></tr>)}</tbody>
          </table>
        )}
      </Card>
      <Card title="How this works in production">
        <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-700">
          <li>Order goes to HMLR Business Gateway (OC1 for register and plan, OC2 for lease and referred deeds) using the firm's client certificate.</li>
          <li>The PDF is stored against the title in the document store, deduplicated so a second request for the same document returns the stored copy at no cost.</li>
          <li>An extraction job (Claude) reads the register or lease and writes structured fields: proprietors, charges, schedule of leases, rent, term, breaks, reviews, repairing terms, permitted use and alienation, each with a confidence score.</li>
          <li>Fields feed the Leases &amp; docs tab, the lease-events calendar and the CRM record for the business.</li>
        </ol>
      </Card>
    </div>
  )
}
