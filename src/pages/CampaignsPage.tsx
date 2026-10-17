import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Mail, Plus, Printer, ShieldCheck, ShieldAlert, Trash2, Download, Upload } from 'lucide-react'
import { provider, SECTORS, type Business, type Campaign, type CampaignRecipient, type LetterTemplate, type RecipientBasis, type Sector, type Title } from '@/data'
import { useUi } from '@/store/ui'
import { useShallow } from 'zustand/react/shallow'
import { useAuth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { Badge, Button, Card, Input, Select, Stat, Empty, Toggle, cx } from '@/components/ui'
import { SECTOR_COLOURS } from '@/lib/sectors'
import { dateShort } from '@/lib/format'
import { canDownload } from '@/lib/env'

export const TEMPLATES: LetterTemplate[] = [
  { templateId: 'care-owner', name: 'Care home: confidential approach to freeholder', sector: 'Care Home', subject: 'Confidential enquiry regarding {{businessName}}', body: 'Dear {{salutation}},\n\nI am writing in confidence regarding {{businessName}}, {{address}}. Christie & Co is currently acting for a number of established care providers seeking additional registered capacity in {{area}}, and your home, with its {{capacity}} registered beds, is of particular interest.\n\nIf you would welcome an informal and entirely confidential conversation about the current market value of the business and property, or about your longer-term plans, I would be pleased to visit at a time that suits you.\n\nYours sincerely,\n{{agentName}}\n{{agentTitle}}, Christie & Co\n{{agentPhone}} · {{agentEmail}}' },
  { templateId: 'pub-tenant', name: 'Pub: lease expiry approach to operator', sector: 'Pub', subject: 'Your lease at {{businessName}}', body: 'Dear {{salutation}},\n\nOur records indicate that the lease of {{businessName}}, {{address}}, is due to expire on {{leaseExpiry}}. Many operators in this position are exploring renewal terms, a sale of the leasehold interest, or a move to freehold ownership.\n\nChristie & Co has completed more pub transactions than any other agent in the past year. If a confidential discussion about your options would be useful, I would be glad to help.\n\nYours sincerely,\n{{agentName}}\n{{agentTitle}}, Christie & Co\n{{agentPhone}} · {{agentEmail}}' },
  { templateId: 'nursery-owner', name: 'Day nursery: retirement or sale conversation', sector: 'Childcare', subject: 'A confidential conversation about {{businessName}}', body: 'Dear {{salutation}},\n\nDemand for well-run day nurseries in {{area}} has rarely been stronger, with group operators and first-time buyers competing for settings of {{capacity}} places or more. {{businessName}} would attract considerable interest.\n\nIf you are considering your options over the next few years, a confidential, no-obligation appraisal can help you plan. I would be pleased to arrange one at your convenience.\n\nYours sincerely,\n{{agentName}}\n{{agentTitle}}, Christie & Co\n{{agentPhone}} · {{agentEmail}}' },
  { templateId: 'generic-freeholder', name: 'General: freeholder introduction', subject: 'Regarding your property at {{address}}', body: 'Dear {{salutation}},\n\nI am writing regarding your property at {{address}}, currently trading as {{businessName}}. Christie & Co advises owners across the {{sector}} sector on sales, lettings, valuation and finance, and we have active buyer requirements in {{area}}.\n\nShould you wish to discuss the property in confidence, please contact me directly.\n\nYours sincerely,\n{{agentName}}\n{{agentTitle}}, Christie & Co\n{{agentPhone}} · {{agentEmail}}' },
]

const AGENT = { agentName: 'Your name', agentTitle: 'Associate Director', agentPhone: '020 7227 0700', agentEmail: 'firstname.lastname@christie.com' }

export function mergeLetter(tpl: string, fields: Record<string, string>) {
  return tpl.replace(/{{(\w+)}}/g, (_, k) => fields[k] ?? `[${k}]`)
}

function basisFor(role: 'Freeholder' | 'Operator', b: Business, t?: Title, suppressed?: boolean): RecipientBasis {
  if (suppressed) return 'Blocked: suppressed'
  if (role === 'Operator') return 'Business contact'
  const p = t?.proprietors[0]
  if (!p) return 'Blocked: no address'
  if (p.category === 'Private Individual') return t?.registerPurchased ? 'Register purchased' : 'Blocked: CCOD only'
  // Company proprietor: CCOD data may not be used for marketing; a purchased register or an existing relationship is needed.
  if (t?.registerPurchased) return 'Register purchased'
  if (b.crm) return 'Existing relationship'
  return 'Blocked: CCOD only'
}

/** Direct-to-owner letter campaigns with a compliance gate on every recipient. */
export function CampaignsPage() {
  const { campaigns, upsertCampaign, removeCampaign, watchlist } = useUi(useShallow((s) => ({ campaigns: s.campaigns, upsertCampaign: s.upsertCampaign, removeCampaign: s.removeCampaign, watchlist: s.watchlist })))
  const [openId, setOpenId] = useState<string | null>(campaigns[0]?.campaignId ?? null)
  const [creating, setCreating] = useState(false)
  const [name, setName] = useState('')
  const [sector, setSector] = useState<Sector | ''>('')
  const [templateId, setTemplateId] = useState(TEMPLATES[0].templateId)
  const [role, setRole] = useState<'Freeholder' | 'Operator'>('Freeholder')
  const [source, setSource] = useState<'watchlist' | 'sourcing'>('watchlist')
  const [building, setBuilding] = useState(false)
  const suppressed = useMemo(() => new Set<string>(['B0007']), [])

  const open = campaigns.find((c) => c.campaignId === openId) ?? null

  const build = async () => {
    setBuilding(true)
    let businesses: Business[] = []
    if (source === 'watchlist') businesses = (await Promise.all(watchlist.filter((w) => w.entityType === 'business').map((w) => provider.getBusiness(w.entityId)))).filter((b): b is Business => !!b)
    else businesses = await provider.sourceBusinesses({ ...useUi.getState().filters, sectors: sector ? [sector] : useUi.getState().filters.sectors })
    if (sector) businesses = businesses.filter((b) => b.sector === sector)
    const recipients: CampaignRecipient[] = []
    for (const b of businesses.slice(0, 150)) {
      const t = b.titleNumber ? await provider.getTitle(b.titleNumber) : undefined
      const basis = basisFor(role, b, t, suppressed.has(b.businessId))
      const p = t?.proprietors[0]
      const recipientName = role === 'Operator' ? b.operatorName ?? b.name : p?.redacted ? 'The Owner' : p?.name ?? 'The Owner'
      const lease = t?.leases[0]
      recipients.push({
        id: `${b.businessId}-${role}`,
        businessId: b.businessId,
        titleNumber: b.titleNumber,
        recipientName,
        role,
        address: role === 'Operator' || !p?.address ? b.address : p.address,
        postcode: b.postcode,
        sector: b.sector,
        basis,
        included: !basis.startsWith('Blocked'),
        mergeFields: {
          salutation: recipientName.startsWith('The ') ? 'Sir or Madam' : recipientName.split(' ').length > 2 ? recipientName : `Mr/Ms ${recipientName.split(' ').slice(-1)[0]}`,
          businessName: b.name,
          address: `${b.address}, ${b.postcode}`,
          area: b.address.split(', ').pop() ?? 'the area',
          sector: b.sector.toLowerCase(),
          capacity: String(b.registers.find((r) => r.capacity)?.capacity ?? ''),
          leaseExpiry: lease ? dateShort(lease.expiryDate) : 'a date in the near future',
          ...AGENT,
        },
      })
    }
    const c: Campaign = { campaignId: `CMP-${Date.now().toString(36).toUpperCase()}`, name: name || `${sector || 'Mixed'} ${role.toLowerCase()} letters ${new Date().toISOString().slice(0, 10)}`, sector: sector || undefined, templateId, createdAt: new Date().toISOString(), status: 'Draft', recipients, liaCompleted: false, responses: 0 }
    upsertCampaign(c)
    logAudit('campaign-created', `Campaign created: ${c.name} (${c.recipients.filter((r) => r.included).length} eligible of ${c.recipients.length})`, { entityType: 'campaign', entityId: c.campaignId, licences: ['HMLR-CCOD', 'OGL'] })
    setOpenId(c.campaignId)
    setCreating(false)
    setBuilding(false)
    setName('')
  }

  const exportMerge = (c: Campaign) => {
    const inc = c.recipients.filter((r) => r.included)
    const cols = ['recipient', 'role', 'address', 'postcode', 'basis', ...Object.keys(inc[0]?.mergeFields ?? {})]
    const lines = inc.map((r) => [r.recipientName, r.role, r.address, r.postcode, r.basis, ...Object.values(r.mergeFields)].map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(','))
    const blob = new Blob([`${cols.join(',')}\n${lines.join('\n')}`], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${c.campaignId}-mailmerge.csv`
    a.click()
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Letter campaigns</h1>
          <p className="max-w-3xl text-sm text-ink-500">Direct-to-owner outreach built from My Sites or a sourcing result. Every recipient passes a compliance gate: HM Land Registry company-ownership data alone cannot be used for marketing, private owners need a purchased register, and a legitimate-interests assessment is recorded before anything is sent.</p>
        </div>
        <Button variant="primary" onClick={() => setCreating(!creating)}><Plus size={14} /> New campaign</Button>
      </div>

      {creating && (
        <Card title="New campaign">
          <div className="grid gap-3 md:grid-cols-5">
            <label className="text-xs md:col-span-2"><span className="label">Name</span><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Midlands care freeholders Q4" /></label>
            <label className="text-xs"><span className="label">Sector</span><Select value={sector} onChange={(e) => { setSector(e.target.value as Sector | ''); const t = TEMPLATES.find((x) => x.sector === e.target.value); if (t) setTemplateId(t.templateId) }}><option value="">Any</option>{SECTORS.filter((s) => s !== 'Other').map((s) => <option key={s}>{s}</option>)}</Select></label>
            <label className="text-xs"><span className="label">Recipients</span><Select value={role} onChange={(e) => setRole(e.target.value as never)}><option>Freeholder</option><option>Operator</option></Select></label>
            <label className="text-xs"><span className="label">Source</span><Select value={source} onChange={(e) => setSource(e.target.value as never)}><option value="watchlist">My Sites / pipeline</option><option value="sourcing">Current sourcing filters</option></Select></label>
            <label className="text-xs md:col-span-5"><span className="label">Template</span><Select value={templateId} onChange={(e) => setTemplateId(e.target.value)}>{TEMPLATES.map((t) => <option key={t.templateId} value={t.templateId}>{t.name}</option>)}</Select></label>
          </div>
          <div className="mt-3 flex justify-end gap-2"><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" onClick={build} loading={building}>Build recipient list</Button></div>
        </Card>
      )}

      {!campaigns.length && !creating ? <Empty title="No campaigns yet" hint="Build one from your pipeline or a sourcing result. The compliance gate will show you who can lawfully be written to." action={<Button variant="primary" onClick={() => setCreating(true)}>New campaign</Button>} /> : (
        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          <Card title={`Campaigns · ${campaigns.length}`} padded={false}>
            <ul className="divide-y divide-ink-100">{campaigns.map((c) => <li key={c.campaignId}><button className={cx('w-full px-4 py-2.5 text-left hover:bg-ink-50', openId === c.campaignId && 'bg-brand-50')} onClick={() => setOpenId(c.campaignId)}><div className="flex items-center justify-between"><span className="truncate text-sm font-medium">{c.name}</span><Badge tone={c.status === 'Sent' ? 'good' : c.status === 'Approved' ? 'info' : 'neutral'}>{c.status}</Badge></div><div className="text-[11px] text-ink-500">{c.recipients.filter((r) => r.included).length} of {c.recipients.length} eligible · {dateShort(c.createdAt)}{c.sector ? ` · ${c.sector}` : ''}</div></button></li>)}</ul>
          </Card>
          {open && <CampaignDetail c={open} onChange={upsertCampaign} onDelete={() => { removeCampaign(open.campaignId); setOpenId(null) }} onExport={() => exportMerge(open)} />}
        </div>
      )}
    </div>
  )
}

function CampaignDetail({ c, onChange, onDelete, onExport }: { c: Campaign; onChange: (c: Campaign) => void; onDelete: () => void; onExport: () => void }) {
  const nav = useNavigate()
  const tpl = TEMPLATES.find((t) => t.templateId === c.templateId) ?? TEMPLATES[0]
  const [preview, setPreview] = useState<CampaignRecipient | null>(c.recipients.find((r) => r.included) ?? null)
  const [tab, setTab] = useState<'all' | 'eligible' | 'blocked'>('all')
  useEffect(() => setPreview(c.recipients.find((r) => r.included) ?? null), [c.campaignId, c.recipients])
  const eligible = c.recipients.filter((r) => r.included)
  const blocked = c.recipients.filter((r) => r.basis.startsWith('Blocked'))
  const shown = tab === 'all' ? c.recipients : tab === 'eligible' ? eligible : blocked
  const mayApprove = useAuth((s) => s.hasRole('compliance') || s.hasRole('admin'))
  const canApprove = c.liaCompleted && eligible.length > 0 && mayApprove
  const basisTone = (b: RecipientBasis) => (b.startsWith('Blocked') ? 'critical' : b === 'Register purchased' ? 'good' : 'info')
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Recipients" value={c.recipients.length} />
        <Stat label="Eligible to send" value={eligible.length} tone="good" />
        <Stat label="Blocked by compliance" value={blocked.length} tone={blocked.length ? 'warning' : 'neutral'} sub="buy registers or remove" />
        <Stat label="Status" value={c.status} sub={c.sentAt ? `sent ${dateShort(c.sentAt)}` : undefined} />
      </div>
      <Card title="Compliance gate" actions={c.liaCompleted ? <Badge tone="good"><ShieldCheck size={11} /> LIA recorded</Badge> : <Badge tone="warning"><ShieldAlert size={11} /> LIA required</Badge>}>
        <ul className="mb-3 space-y-1 text-xs text-ink-700">
          <li>• <strong>Register purchased</strong>: proprietor name and address come from a purchased HM Land Registry official copy. Lawful under legitimate interests with the assessment below.</li>
          <li>• <strong>Business contact / existing relationship</strong>: operator trading address or a CRM relationship. Lawful for B2B postal marketing.</li>
          <li>• <strong>Blocked: CCOD only</strong>: the only source is the free company-ownership file, whose licence prohibits marketing to proprietors. Order the £7 register from the site's Ownership tab to unblock.</li>
          <li>• <strong>Blocked: suppressed</strong>: recipient previously objected. Never re-included.</li>
        </ul>
        <Toggle checked={c.liaCompleted} onChange={(v) => onChange({ ...c, liaCompleted: v })} label="Legitimate interests assessment completed and filed" hint="Purpose, necessity and balancing test recorded for this campaign" />
        <Input placeholder="LIA reference or notes (e.g. LIA-2026-014, reviewed by Compliance)" value={c.liaNotes ?? ''} onChange={(e) => onChange({ ...c, liaNotes: e.target.value })} className="mt-2" />
      </Card>
      <Card title={`Recipients · ${shown.length}`} padded={false} actions={<div className="flex gap-1">{(['all', 'eligible', 'blocked'] as const).map((t) => <button key={t} className={cx('rounded px-2 py-0.5 text-xs', tab === t ? 'bg-brand-50 text-brand-800' : 'text-ink-500')} onClick={() => setTab(t)}>{t}</button>)}</div>} className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-xs">
          <thead className="bg-ink-50 text-left text-ink-500"><tr><th className="font-medium">Send</th><th className="font-medium">Recipient</th><th className="font-medium">Business</th><th className="font-medium">Address</th><th className="font-medium">Basis</th><th></th></tr></thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className={cx('border-t border-ink-100', preview?.id === r.id && 'bg-brand-50/60')}>
                <td><input type="checkbox" checked={r.included} disabled={r.basis.startsWith('Blocked')} onChange={(e) => onChange({ ...c, recipients: c.recipients.map((x) => (x.id === r.id ? { ...x, included: e.target.checked } : x)) })} /></td>
                <td className="font-medium">{r.recipientName}<div className="font-normal text-ink-500">{r.role}</div></td>
                <td><span className="flex items-center gap-1.5">{r.sector && <span className="h-2 w-2 rounded-full" style={{ background: SECTOR_COLOURS[r.sector] }} />}{r.mergeFields.businessName}</span></td>
                <td className="text-ink-600">{r.address}, {r.postcode}</td>
                <td><Badge tone={basisTone(r.basis)}>{r.basis}</Badge>{r.basis === 'Blocked: CCOD only' && r.titleNumber && <Link to={`/map/title/${r.titleNumber}`} className="ml-1 text-brand-700 hover:underline">buy register</Link>}</td>
                <td><button className="text-brand-700 hover:underline" onClick={() => setPreview(r)}>preview</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title={`Template · ${tpl.name}`}>
          <div className="text-xs text-ink-500">Merge fields: {Array.from(tpl.body.matchAll(/{{(\w+)}}/g)).map((m) => m[1]).filter((v, i, a) => a.indexOf(v) === i).join(', ')}</div>
          <pre className="mt-2 whitespace-pre-wrap rounded-md border border-ink-200 bg-ink-50 p-3 text-xs">{tpl.body}</pre>
        </Card>
        <Card title={preview ? `Preview · ${preview.recipientName}` : 'Preview'}>
          {preview ? <div className="rounded-md border border-ink-200 bg-surface p-4 text-sm"><div className="mb-3 text-xs text-ink-500">{preview.recipientName}<br />{preview.address}<br />{preview.postcode}</div><div className="mb-2 font-semibold">{mergeLetter(tpl.subject, preview.mergeFields)}</div><div className="whitespace-pre-wrap">{mergeLetter(tpl.body, preview.mergeFields)}</div></div> : <div className="text-xs text-ink-500">Select a recipient to preview.</div>}
        </Card>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onExport} disabled={!eligible.length || !canDownload}><Download size={14} /> Mail-merge CSV</Button>
        <Link to={`/print/campaign/${c.campaignId}`} target="_blank" className={cx('btn-secondary', !eligible.length && 'pointer-events-none opacity-50')}><Printer size={14} /> Print letters</Link>
        {c.status === 'Draft' && <Button variant="primary" disabled={!canApprove} title={canApprove ? '' : !mayApprove ? 'Approval needs the compliance or admin role' : 'Complete the LIA and include at least one eligible recipient'} onClick={() => { onChange({ ...c, status: 'Approved' }); logAudit('campaign-approved', `Campaign approved: ${c.name}, ${eligible.length} recipients, LIA: ${c.liaNotes || 'recorded'}`, { entityType: 'campaign', entityId: c.campaignId, count: eligible.length, licences: Array.from(new Set(eligible.map((r) => (r.basis === 'Register purchased' ? 'HMLR-Doc' : 'OGL')))) }) }}><ShieldCheck size={14} /> Approve for sending</Button>}
        {c.status === 'Approved' && <Button variant="primary" onClick={() => { onChange({ ...c, status: 'Sent', sentAt: new Date().toISOString() }); logAudit('campaign-sent', `Campaign marked as sent: ${c.name}, ${eligible.length} letters`, { entityType: 'campaign', entityId: c.campaignId, count: eligible.length }) }}><Mail size={14} /> Mark as sent ({eligible.length})</Button>}
        <Button onClick={() => nav(`/crm/export?source=campaign&id=${c.campaignId}`)} title="Export the eligible recipients as CRM accounts and contacts"><Upload size={14} /> Export to CRM</Button>
        {c.status === 'Sent' && <label className="flex items-center gap-2 text-sm">Responses <Input type="number" className="w-20 py-1" value={c.responses} onChange={(e) => onChange({ ...c, responses: Number(e.target.value) })} /><Button size="sm" onClick={() => onChange({ ...c, status: 'Closed' })}>Close</Button></label>}
        <button className="ml-auto flex items-center gap-1 text-xs text-rose-700 dark:text-rose-300 hover:underline" onClick={onDelete}><Trash2 size={12} /> Delete campaign</button>
      </div>
      <p className="text-[11px] text-ink-500">In production, "Mark as sent" hands the eligible list to the print-and-post provider (Nimbus uses Stannp; any provider with an API works) and logs each letter against the CRM record with its lawful basis. Objections received add the recipient to the suppression list automatically.</p>
    </div>
  )
}
