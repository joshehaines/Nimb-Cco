import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import JSZip from 'jszip'
import { Download, Users, ShieldCheck } from 'lucide-react'
import { provider, type Business, type EPC, type Hereditament, type MatchCandidate, type Title, PIPELINE_STAGES, type PipelineStage } from '@/data'
import { Badge, Button, Card, Select, Stat, Spinner, Empty, Tabs, Toggle, Input } from '@/components/ui'
import { useUi } from '@/store/ui'
import { useShallow } from 'zustand/react/shallow'
import { useAuth } from '@/auth'
import { logAudit } from '@/lib/audit'
import { canDownload } from '@/lib/env'
import { buildExport, headerFor, PRESET_LABEL, readme, toCsv, VOA_FIELDS, type CrmObject, type CrmPreset, type ExportInput, type ExportResult } from '@/lib/crmExport'
import { gbp } from '@/lib/format'

type Source = 'sourcing' | 'pipeline' | 'watchlist' | 'campaign'
const OBJECTS: { id: CrmObject; label: string; hint: string }[] = [
  { id: 'accounts', label: 'Accounts (companies)', hint: 'Operators and freeholding companies' },
  { id: 'contacts', label: 'Contacts', hint: 'Business contacts at the trading address; named freeholders only when the register was bought' },
  { id: 'sites', label: 'Sites (properties)', hint: 'One row per trading business with identifiers, registers and the transact score' },
  { id: 'deals', label: 'Deals (pipeline)', hint: 'One row per pipeline card with stage, fee and next action' },
]

/** Export clean, licence-checked records into the CRM: pick a source list, a CRM preset and the objects, preview, download. */
export function CrmExportPage() {
  const [params] = useSearchParams()
  const nav = useNavigate()
  const user = useAuth((s) => s.user)
  const { watchlist, filters, campaigns, crmRecords, crmRecordsName, crmTemplates, setCrmTemplate } = useUi(useShallow((s) => ({ watchlist: s.watchlist, filters: s.filters, campaigns: s.campaigns, crmRecords: s.crmRecords, crmRecordsName: s.crmRecordsName, crmTemplates: s.crmTemplates, setCrmTemplate: s.setCrmTemplate })))
  const [source, setSource] = useState<Source>((params.get('source') as Source) || (watchlist.length ? 'pipeline' : 'sourcing'))
  const [stage, setStage] = useState<PipelineStage | ''>('')
  const [campaignId, setCampaignId] = useState(params.get('id') ?? campaigns[0]?.campaignId ?? '')
  const [preset, setPreset] = useState<CrmPreset>('generic')
  const [objects, setObjects] = useState<Record<CrmObject, boolean>>({ accounts: true, contacts: true, sites: true, deals: true })
  const [excludeCcodOnly, setExcludeCcodOnly] = useState(true)
  const [excludeVoa, setExcludeVoa] = useState(true)
  const [onlyNewToCrm, setOnlyNewToCrm] = useState(false)
  const [office, setOffice] = useState(user?.office ?? '')
  const [owner, setOwner] = useState(user?.name ?? '')
  const [inputs, setInputs] = useState<ExportInput[] | null>(null)
  const [matches, setMatches] = useState<MatchCandidate[]>([])
  const [tab, setTab] = useState<CrmObject | 'excluded'>('sites')

  // Load the source list and everything the export needs for each business.
  useEffect(() => {
    let cancelled = false
    setInputs(null)
    ;(async () => {
      let businesses: Business[] = []
      if (source === 'sourcing') businesses = await provider.sourceBusinesses(filters)
      else if (source === 'campaign') {
        const c = campaigns.find((x) => x.campaignId === campaignId)
        const ids = Array.from(new Set((c?.recipients ?? []).filter((r) => r.included).map((r) => r.businessId).filter((x): x is string => !!x)))
        businesses = (await Promise.all(ids.map((id) => provider.getBusiness(id)))).filter((b): b is Business => !!b)
      } else {
        const items = watchlist.filter((w) => !stage || (w.stage ?? 'Prospect') === stage)
        const bs = await Promise.all(items.map(async (w) => (w.entityType === 'business' ? await provider.getBusiness(w.entityId) : (await provider.getBusinessesForTitle(w.entityId))[0])))
        businesses = bs.filter((b): b is Business => !!b)
      }
      const rows: ExportInput[] = await Promise.all(
        businesses.map(async (b) => {
          const [t, h, e]: [Title | undefined, Hereditament | undefined, EPC | undefined] = await Promise.all([
            b.titleNumber ? provider.getTitle(b.titleNumber) : Promise.resolve(undefined),
            b.hereditamentUarn ? provider.getHereditament(b.hereditamentUarn) : Promise.resolve(undefined),
            b.epcCertificateId ? provider.getEpc(b.epcCertificateId) : Promise.resolve(undefined),
          ])
          const w = watchlist.find((x) => (x.entityType === 'business' && x.entityId === b.businessId) || (x.entityType === 'title' && x.entityId === b.titleNumber))
          return { b, t, h, e, w }
        }),
      )
      if (!cancelled) setInputs(rows)
    })()
    return () => {
      cancelled = true
    }
  }, [source, stage, campaignId, filters, watchlist, campaigns])

  // De-duplicate against the CRM export uploaded on the CRM page, if any.
  useEffect(() => {
    if (!crmRecords.length) return setMatches([])
    provider.matchCrmRecords(crmRecords).then(setMatches)
  }, [crmRecords])

  const result: ExportResult | null = useMemo(() => {
    if (!inputs) return null
    const campaign = source === 'campaign' ? campaigns.find((x) => x.campaignId === campaignId) : undefined
    const sourceLabel = source === 'sourcing' ? 'sourcing filters' : source === 'campaign' ? `campaign ${campaign?.name ?? ''}` : stage ? `pipeline stage ${stage}` : 'My Sites'
    return buildExport(inputs, { preset, objects, excludeCcodOnly, excludeVoa, onlyNewToCrm, office: office || undefined, owner: owner || undefined, sourceLabel, existingMatches: matches, existingRecords: crmRecords, campaign })
  }, [inputs, preset, objects, excludeCcodOnly, excludeVoa, onlyNewToCrm, office, owner, matches, crmRecords, source, stage, campaignId, campaigns])

  const overrides = (o: CrmObject) => crmTemplates[preset]?.[o]
  const drop = excludeVoa ? VOA_FIELDS : new Set<string>()
  const files = (r: ExportResult) => ({
    'accounts.csv': toCsv(r.accounts as unknown as Record<string, unknown>[], preset, 'accounts', overrides('accounts')),
    'contacts.csv': toCsv(r.contacts as unknown as Record<string, unknown>[], preset, 'contacts', overrides('contacts')),
    'sites.csv': toCsv(r.sites as unknown as Record<string, unknown>[], preset, 'sites', overrides('sites'), drop),
    'deals.csv': toCsv(r.deals as unknown as Record<string, unknown>[], preset, 'deals', overrides('deals')),
    'excluded.csv': ['object,name,reason', ...r.excluded.map((x) => `${x.object},"${x.name.replace(/"/g, '""')}","${x.reason.replace(/"/g, '""')}"`)].join('\n'),
    'README.txt': readme(r, { preset, objects, excludeCcodOnly, excludeVoa, onlyNewToCrm, sourceLabel: '' }),
  })
  const download = async (name: string, content: string | Blob, type = 'text/csv') => {
    const a = document.createElement('a')
    a.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }))
    a.download = name
    a.click()
  }
  const downloadZip = async () => {
    if (!result) return
    const zip = new JSZip()
    for (const [name, content] of Object.entries(files(result))) zip.file(name, content)
    const blob = await zip.generateAsync({ type: 'blob' })
    const total = result.accounts.length + result.contacts.length + result.sites.length + result.deals.length
    logAudit('crm-export', `CRM export (${PRESET_LABEL[preset]}): ${result.accounts.length} accounts, ${result.contacts.length} contacts, ${result.sites.length} sites, ${result.deals.length} deals; ${result.excluded.length} excluded`, { licences: result.licences, count: total })
    download(`crm-export-${preset}-${new Date().toISOString().slice(0, 10)}.zip`, blob, 'application/zip')
  }

  const counts = result ? { accounts: result.accounts.length, contacts: result.contacts.length, sites: result.sites.length, deals: result.deals.length } : undefined
  const preview = (o: CrmObject) => {
    if (!result) return []
    return (result[o] as unknown as Record<string, unknown>[]).slice(0, 12)
  }
  const fieldsOf = (o: CrmObject) => {
    const rows = result?.[o] as unknown as Record<string, unknown>[] | undefined
    return rows?.length ? Object.keys(rows[0]).filter((f) => !drop.has(f)) : []
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Export to CRM</h1>
          <p className="max-w-3xl text-sm text-ink-500">Clean, de-duplicated records out of the platform and into the CRM. Stable external IDs mean a re-export updates rather than duplicates; the licence gate decides what may carry a marketing flag.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => nav('/crm')}><Users size={14} /> Clean an existing export</Button>
          <Button variant="primary" onClick={downloadZip} disabled={!result || !canDownload || !counts || Object.values(counts).every((n) => !n)} title={canDownload ? 'Download all files as a zip' : 'Downloads are disabled on this preview host'}><Download size={14} /> Download zip</Button>
        </div>
      </div>

      <Card title="What to export">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-xs"><span className="label">Source list</span>
            <Select value={source} onChange={(e) => setSource(e.target.value as Source)} aria-label="Source list">
              <option value="sourcing">Sourcing results (current filters)</option>
              <option value="pipeline">Pipeline (all stages)</option>
              <option value="watchlist">My Sites</option>
              <option value="campaign">Campaign recipients</option>
            </Select>
          </label>
          {source === 'pipeline' && <label className="text-xs"><span className="label">Stage</span><Select value={stage} onChange={(e) => setStage(e.target.value as PipelineStage | '')} aria-label="Stage"><option value="">All stages</option>{PIPELINE_STAGES.map((s) => <option key={s} value={s}>{s}</option>)}</Select></label>}
          {source === 'campaign' && <label className="text-xs"><span className="label">Campaign</span><Select value={campaignId} onChange={(e) => setCampaignId(e.target.value)} aria-label="Campaign">{campaigns.map((c) => <option key={c.campaignId} value={c.campaignId}>{c.name} ({c.status})</option>)}</Select></label>}
          <label className="text-xs"><span className="label">CRM preset</span><Select value={preset} onChange={(e) => setPreset(e.target.value as CrmPreset)} aria-label="CRM preset">{(Object.keys(PRESET_LABEL) as CrmPreset[]).map((p) => <option key={p} value={p}>{PRESET_LABEL[p]}</option>)}</Select></label>
          <label className="text-xs"><span className="label">Default office</span><Input value={office} onChange={(e) => setOffice(e.target.value)} placeholder="e.g. Birmingham" /></label>
          <label className="text-xs"><span className="label">Default owner</span><Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="CRM user" /></label>
        </div>
        <div className="mt-4 grid gap-x-8 gap-y-1 md:grid-cols-2">
          {OBJECTS.map((o) => <Toggle key={o.id} checked={objects[o.id]} onChange={(v) => setObjects({ ...objects, [o.id]: v })} label={o.label} hint={o.hint} />)}
        </div>
        <div className="mt-3 grid gap-x-8 gap-y-1 md:grid-cols-2">
          <Toggle checked={excludeCcodOnly} onChange={setExcludeCcodOnly} label="Exclude accounts known only from HM Land Registry CCOD/OCOD" hint="Those names cannot be used for marketing. Untick to export them with Marketing Allowed = FALSE." />
          <Toggle checked={excludeVoa} onChange={setExcludeVoa} label="Exclude VOA fields (rateable value, floor area)" hint="VOA rating list terms restrict onward supply; keep them in the platform." />
          <Toggle checked={onlyNewToCrm} onChange={setOnlyNewToCrm} label={`Only records not already in the CRM${crmRecordsName ? ` (${crmRecordsName})` : ''}`} hint={crmRecords.length ? `${crmRecords.length} CRM records uploaded; matched ones carry their existing record ID` : 'Upload a CRM export on the clean-up page to de-duplicate against it'} />
        </div>
      </Card>

      {!result ? <Spinner label="Assembling records…" /> : !inputs?.length ? <Empty title="Nothing to export" hint="The source list is empty. Run a sourcing search, add sites to the pipeline or pick a campaign with included recipients." /> : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat label="Accounts" value={counts!.accounts} />
            <Stat label="Contacts" value={counts!.contacts} />
            <Stat label="Sites" value={counts!.sites} />
            <Stat label="Deals" value={counts!.deals} sub={result.deals.length ? `fees ${gbp(result.deals.reduce((s, d) => s + (d.amount ?? 0), 0), { compact: true })}` : undefined} />
            <Stat label="Excluded" value={result.excluded.length} tone={result.excluded.length ? 'warning' : undefined} sub={<span className="flex items-center gap-1"><ShieldCheck size={12} /> licence gate</span>} />
          </div>
          <Card padded={false} title="Preview" actions={<div className="flex flex-wrap gap-1">{result.licences.map((l) => <Badge key={l} tone={l === 'OGL' ? 'good' : l === 'HMLR-CCOD' || l === 'VOA-Restricted' ? 'warning' : 'neutral'}>{l}</Badge>)}</div>}>
            <div className="px-4 pt-3"><Tabs tabs={[...OBJECTS.filter((o) => objects[o.id]).map((o) => ({ id: o.id as CrmObject | 'excluded', label: o.label.split(' (')[0], count: counts![o.id] })), { id: 'excluded' as const, label: 'Excluded', count: result.excluded.length }]} value={tab} onChange={setTab} /></div>
            {tab === 'excluded' ? (
              <table className="w-full text-xs"><thead className="bg-ink-50 text-left text-ink-500"><tr><th className="px-4 py-2 font-medium">Object</th><th className="font-medium">Name</th><th className="font-medium">Reason</th></tr></thead><tbody>{result.excluded.map((x, i) => <tr key={i} className="border-t border-ink-100"><td className="px-4 py-1.5">{x.object}</td><td>{x.name}</td><td className="text-ink-600">{x.reason}</td></tr>)}{!result.excluded.length && <tr><td colSpan={3} className="px-4 py-3 text-ink-500">Nothing excluded.</td></tr>}</tbody></table>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-xs">
                  <thead className="bg-ink-50 text-left text-ink-500"><tr>{fieldsOf(tab).map((f) => <th key={f} className="whitespace-nowrap px-3 py-2 font-medium"><input aria-label={`Header for ${f}`} className="w-36 rounded border border-transparent bg-transparent px-1 py-0.5 font-medium hover:border-ink-300 focus:border-brand-500 focus:outline-none" value={headerFor(preset, tab, f, overrides(tab))} onChange={(e) => setCrmTemplate(preset, tab, f, e.target.value)} title={`Platform field: ${f}. Edit to match your CRM import column; saved per preset.`} /></th>)}</tr></thead>
                  <tbody>{preview(tab).map((r, i) => <tr key={i} className="border-t border-ink-100">{fieldsOf(tab).map((f) => <td key={f} className="whitespace-nowrap px-3 py-1.5">{r[f] === undefined || r[f] === null ? '' : typeof r[f] === 'boolean' ? (r[f] ? 'TRUE' : 'FALSE') : String(r[f]).slice(0, 48)}</td>)}</tr>)}</tbody>
                </table>
                <div className="flex items-center justify-between px-4 py-2 text-[11px] text-ink-500"><span>Showing {Math.min(12, counts![tab])} of {counts![tab]}. Column headers are editable and saved as your {PRESET_LABEL[preset]} template.</span><Button size="sm" onClick={() => { download(`${tab}.csv`, files(result)[`${tab}.csv` as keyof ReturnType<typeof files>]); logAudit('crm-export', `CRM export ${tab}.csv (${PRESET_LABEL[preset]}): ${counts![tab]} rows`, { licences: result.licences, count: counts![tab] }) }} disabled={!canDownload || !counts![tab]}><Download size={12} /> {tab}.csv</Button></div>
              </div>
            )}
          </Card>
          <div className="text-[11px] text-ink-500">Import order: accounts, then contacts and sites, then deals. Marketing Allowed = FALSE rows and their data licence column travel with the data so the CRM can enforce the same rule. Every download is written to the audit log with the licence classes it contained.</div>
        </>
      )}
    </div>
  )
}
