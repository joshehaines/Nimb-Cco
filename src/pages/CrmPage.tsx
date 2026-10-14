import { useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useUi } from '@/store/ui'
import Papa from 'papaparse'
import { Upload, Download, Play, Check, X, Merge, FileSpreadsheet, MapPin } from 'lucide-react'
import { provider, type CrmRecord, type MatchCandidate, type DuplicateGroup, type CrmIssue } from '@/data'
import { Badge, Button, Card, Stat, Tabs, BarList, Empty, Spinner, Select, cx } from '@/components/ui'
import { dateShort, pct } from '@/lib/format'
import { canDownload } from '@/lib/env'

type Decision = 'accepted' | 'rejected' | undefined
type Tab = 'queue' | 'duplicates' | 'records' | 'pipeline'

const FIELD_GUESSES: Record<keyof Omit<CrmRecord, 'raw'>, string[]> = {
  recordId: ['recordid', 'id', 'record id', 'crm id', 'accountid'],
  office: ['office', 'branch', 'team'],
  businessName: ['businessname', 'business name', 'name', 'trading name', 'property name', 'account name', 'business'],
  address: ['address', 'address1', 'street', 'property address', 'site address', 'address line 1'],
  postcode: ['postcode', 'post code', 'zip', 'postal code'],
  contactName: ['contactname', 'contact', 'contact name', 'primary contact'],
  companyName: ['companyname', 'company', 'company name', 'operator', 'legal entity'],
  companyNumber: ['companynumber', 'company number', 'company no', 'crn', 'companies house number'],
  sector: ['sector', 'category', 'business type', 'type'],
  tenure: ['tenure'],
  capacity: ['capacity', 'beds', 'places', 'bedrooms', 'rooms'],
  lastContact: ['lastcontact', 'last contact', 'last activity', 'last contacted'],
  owner: ['owner', 'landlord', 'freeholder', 'owner name'],
}

function guessMapping(headers: string[]): Partial<Record<keyof Omit<CrmRecord, 'raw'>, string>> {
  const out: Partial<Record<keyof Omit<CrmRecord, 'raw'>, string>> = {}
  const lower = headers.map((h) => h.toLowerCase().trim())
  for (const [field, guesses] of Object.entries(FIELD_GUESSES) as [keyof Omit<CrmRecord, 'raw'>, string[]][]) {
    const idx = lower.findIndex((h) => guesses.includes(h))
    if (idx >= 0) out[field] = headers[idx]
  }
  return out
}

function toRecords(rows: Record<string, string>[], mapping: Partial<Record<keyof Omit<CrmRecord, 'raw'>, string>>): CrmRecord[] {
  return rows.map((raw, i) => {
    const g = (f: keyof typeof mapping) => (mapping[f] ? raw[mapping[f]!]?.trim() : undefined)
    return {
      recordId: g('recordId') || `ROW-${i + 1}`,
      office: g('office'),
      businessName: g('businessName') ?? '',
      address: g('address') ?? '',
      postcode: g('postcode'),
      contactName: g('contactName'),
      companyName: g('companyName'),
      companyNumber: g('companyNumber'),
      sector: g('sector'),
      tenure: g('tenure'),
      capacity: g('capacity') ? Number(g('capacity')) || undefined : undefined,
      lastContact: g('lastContact'),
      owner: g('owner'),
      raw,
    }
  })
}

const ISSUE_TONE: Record<CrmIssue, 'critical' | 'warning' | 'info' | 'neutral'> = {
  Duplicate: 'warning',
  'Address unresolved': 'critical',
  'Company dissolved': 'critical',
  'Company not found': 'warning',
  'Owner changed': 'warning',
  'Business deregistered': 'critical',
  'Capacity mismatch': 'info',
  'Tenure mismatch': 'info',
  'Postcode invalid': 'warning',
  'Stale contact': 'neutral',
}

export function CrmPage() {
  const [records, setRecords] = useState<CrmRecord[]>([])
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Partial<Record<keyof Omit<CrmRecord, 'raw'>, string>>>({})
  const [matches, setMatches] = useState<MatchCandidate[] | null>(null)
  const [dups, setDups] = useState<DuplicateGroup[]>([])
  const [running, setRunning] = useState(false)
  const [decisions, setDecisions] = useState<Record<string, Decision>>({})
  const [merged, setMerged] = useState<Record<string, boolean>>({})
  const [tab, setTab] = useState<Tab>('queue')
  const [sourceName, setSourceName] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const nav = useNavigate()
  const setHighlight = useUi((s) => s.setHighlight)
  const plotMatched = () => {
    const ids = Array.from(new Set((matches ?? []).map((m) => m.businessId).filter((x): x is string => !!x)))
    setHighlight(ids, `CRM ${sourceName}`)
    nav('/map')
  }

  const loadCsv = (text: string, name: string) => {
    const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
    const hs = parsed.meta.fields ?? []
    setHeaders(hs)
    setRawRows(parsed.data)
    const m = guessMapping(hs)
    setMapping(m)
    setRecords(toRecords(parsed.data, m))
    setMatches(null)
    setDups([])
    setDecisions({})
    setMerged({})
    setSourceName(name)
  }
  const onFile = (f: File) => f.text().then((t) => loadCsv(t, f.name))
  const loadSample = async () => loadCsv(await provider.sampleCrmCsv(), 'sample-crm-export.csv')
  const remap = (field: keyof Omit<CrmRecord, 'raw'>, col: string) => {
    const m = { ...mapping, [field]: col || undefined }
    setMapping(m)
    setRecords(toRecords(rawRows, m))
  }
  const run = async () => {
    setRunning(true)
    const [m, d] = await Promise.all([provider.matchCrmRecords(records), provider.findDuplicates(records)])
    setMatches(m)
    setDups(d)
    setRunning(false)
    setTab('queue')
  }

  const matchById = useMemo(() => new Map((matches ?? []).map((m) => [m.recordId, m])), [matches])
  const dupByRecord = useMemo(() => {
    const m = new Map<string, DuplicateGroup>()
    for (const g of dups) for (const id of g.recordIds) m.set(id, g)
    return m
  }, [dups])
  const stats = useMemo(() => {
    if (!matches) return null
    const high = matches.filter((m) => m.businessId && m.confidence >= 0.85).length
    const medium = matches.filter((m) => m.businessId && m.confidence >= 0.62 && m.confidence < 0.85).length
    const unresolved = matches.filter((m) => !m.businessId).length
    const issueCounts = new Map<string, number>()
    for (const m of matches) for (const i of m.issues) issueCounts.set(i, (issueCounts.get(i) ?? 0) + 1)
    for (const g of dups) issueCounts.set('Duplicate', (issueCounts.get('Duplicate') ?? 0) + g.recordIds.length - 1)
    const withIds = matches.filter((m) => m.uprn || m.companyNumber).length
    return { high, medium, unresolved, issueCounts: Array.from(issueCounts.entries()).sort((a, b) => b[1] - a[1]), withIds }
  }, [matches, dups])

  const queue = useMemo(() => (matches ?? []).filter((m) => (m.issues.length || m.confidence < 0.85) && !decisions[m.recordId]).sort((a, b) => b.issues.length - a.issues.length || a.confidence - b.confidence), [matches, decisions])

  const exportCleaned = () => {
    if (!matches) return
    const cols = ['recordId', 'office', 'businessName', 'address', 'postcode', 'companyName', 'companyNumber', 'sector', 'tenure', 'capacity', 'lastContact', 'owner', 'match_businessId', 'match_confidence', 'uprn', 'titleNumber', 'resolved_companyNumber', 'register', 'registerId', 'issues', 'duplicate_group', 'survivor', 'decision']
    const lines = records.map((r) => {
      const m = matchById.get(r.recordId)
      const g = dupByRecord.get(r.recordId)
      const vals = [r.recordId, r.office, r.businessName, r.address, r.postcode, r.companyName, r.companyNumber, r.sector, r.tenure, r.capacity, r.lastContact, r.owner, m?.businessId, m?.confidence, m?.uprn, m?.titleNumber, m?.companyNumber, m?.registerKind, m?.registerId, m?.issues.join('; '), g?.groupId, g ? (g.survivorId === r.recordId ? 'yes' : 'merge into ' + g.survivorId) : '', decisions[r.recordId] ?? (m && m.businessId && m.confidence >= 0.85 && !m.issues.length ? 'auto-accepted' : 'pending')]
      return vals.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')
    })
    const blob = new Blob([`${cols.join(',')}\n${lines.join('\n')}`], { type: 'text/csv' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `crm-cleaned-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
  }

  return (
    <div className="mx-auto max-w-7xl space-y-5 p-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">CRM clean-up</h1>
          <p className="max-w-3xl text-sm text-ink-500">Load a CRM export, match every record to the authoritative property, operator and company identifiers (UPRN, title number, Companies House number, CQC / Ofsted / NHSBSA / FSA IDs), find duplicates, and export corrections for review. Nothing is written back silently.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <Button onClick={() => fileRef.current?.click()}><Upload size={14} /> Upload CSV</Button>
          <Button onClick={loadSample}><FileSpreadsheet size={14} /> Load sample export</Button>
          <Button variant="primary" onClick={run} disabled={!records.length} loading={running}><Play size={14} /> Run matching</Button>
          <Button onClick={plotMatched} disabled={!matches}><MapPin size={14} /> Plot matched on map</Button>
          <Button onClick={exportCleaned} disabled={!matches || !canDownload} title={canDownload ? 'Export cleaned CSV' : 'Downloads are disabled on this preview host'}><Download size={14} /> Export cleaned CSV</Button>
        </div>
      </div>

      {!records.length && (
        <Empty title="No CRM data loaded" hint="Upload a CSV export (accounts, properties or businesses) or load the sample export, which is deliberately dirty: duplicates, abbreviations, missing postcodes, dissolved companies, tenants recorded as owners, and businesses that no longer exist." action={<Button variant="primary" onClick={loadSample}>Load sample export</Button>} />
      )}

      {records.length > 0 && (
        <Card title={`Loaded ${records.length} records from ${sourceName}`} actions={<span className="text-xs text-ink-500">Column mapping (auto-detected, adjust if needed)</span>}>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6">
            {(Object.keys(FIELD_GUESSES) as (keyof Omit<CrmRecord, 'raw'>)[]).map((f) => (
              <label key={f} className="text-[11px]">
                <span className="label">{f}</span>
                <Select value={mapping[f] ?? ''} onChange={(e) => remap(f, e.target.value)} className="py-1 text-xs"><option value="">—</option>{headers.map((h) => <option key={h}>{h}</option>)}</Select>
              </label>
            ))}
          </div>
        </Card>
      )}

      {running && <Spinner label="Normalising addresses, resolving UPRNs, matching companies and registers, scoring duplicates…" />}

      {stats && matches && (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Stat label="Records" value={records.length} />
            <Stat label="Matched (high)" value={stats.high} tone="good" sub="≥ 85% confidence" />
            <Stat label="Matched (review)" value={stats.medium} tone="warning" sub="62–85% confidence" />
            <Stat label="Unresolved" value={stats.unresolved} tone={stats.unresolved ? 'critical' : 'neutral'} sub="no property match" />
            <Stat label="Duplicate groups" value={dups.length} tone="warning" sub={`${dups.reduce((s, g) => s + g.recordIds.length - 1, 0)} records to merge`} />
            <Stat label="Identifiers assigned" value={pct(stats.withIds / records.length)} tone="good" sub="UPRN or company number" />
          </div>
          <div className="grid gap-5 lg:grid-cols-3">
            <Card title="Issues found">
              <BarList rows={stats.issueCounts.map(([label, value]) => ({ label, value, colour: ISSUE_TONE[label as CrmIssue] === 'critical' ? '#be123c' : ISSUE_TONE[label as CrmIssue] === 'warning' ? '#b45309' : '#2563eb' }))} />
            </Card>
            <Card className="lg:col-span-2" padded={false}>
              <Tabs tabs={[{ id: 'queue', label: 'Review queue', count: queue.length }, { id: 'duplicates', label: 'Duplicates', count: dups.length }, { id: 'records', label: 'All records', count: records.length }, { id: 'pipeline', label: 'Pipeline' }]} value={tab} onChange={setTab} />
              {tab === 'queue' && (
                <div className="divide-y divide-ink-100">
                  {!queue.length && <div className="p-6 text-center text-sm text-ink-500">Queue clear. Everything else matched with high confidence and no issues.</div>}
                  {queue.slice(0, 60).map((m) => {
                    const r = records.find((x) => x.recordId === m.recordId)!
                    return (
                      <div key={m.recordId} className="grid gap-3 p-4 md:grid-cols-[1fr_1fr_auto]">
                        <div>
                          <div className="label">CRM record · {r.recordId}{r.office ? ` · ${r.office}` : ''}</div>
                          <div className="text-sm font-medium">{r.businessName}</div>
                          <div className="text-xs text-ink-600">{r.address}{r.postcode ? `, ${r.postcode}` : ''}</div>
                          <div className="text-xs text-ink-500">{[r.companyName, r.companyNumber, r.sector, r.tenure, r.capacity ? `${r.capacity} cap.` : '', r.lastContact ? `last contact ${dateShort(r.lastContact)}` : ''].filter(Boolean).join(' · ')}</div>
                          <div className="mt-1.5 flex flex-wrap gap-1">{m.issues.map((i) => <Badge key={i} tone={ISSUE_TONE[i]}>{i}</Badge>)}{dupByRecord.get(r.recordId) && <Badge tone="warning">Duplicate ({dupByRecord.get(r.recordId)!.groupId})</Badge>}</div>
                        </div>
                        <MatchSide m={m} />
                        <div className="flex flex-col gap-1.5">
                          <Button size="sm" variant="primary" disabled={!m.businessId} onClick={() => setDecisions({ ...decisions, [m.recordId]: 'accepted' })}><Check size={13} /> Accept</Button>
                          <Button size="sm" onClick={() => setDecisions({ ...decisions, [m.recordId]: 'rejected' })}><X size={13} /> Reject</Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {tab === 'duplicates' && (
                <div className="divide-y divide-ink-100">
                  {!dups.length && <div className="p-6 text-center text-sm text-ink-500">No duplicates detected.</div>}
                  {dups.map((g) => (
                    <div key={g.groupId} className={cx('p-4', merged[g.groupId] && 'opacity-60')}>
                      <div className="mb-2 flex items-center justify-between"><div className="text-xs font-semibold text-ink-700">{g.groupId} · {g.recordIds.length} records · {g.reason}</div>{merged[g.groupId] ? <Badge tone="good">Merged</Badge> : <Button size="sm" variant="primary" onClick={() => setMerged({ ...merged, [g.groupId]: true })}><Merge size={13} /> Merge into survivor</Button>}</div>
                      <table className="w-full text-xs">
                        <tbody>{g.recordIds.map((id) => { const r = records.find((x) => x.recordId === id)!; return <tr key={id} className={cx('border-t border-ink-100', id === g.survivorId && 'bg-green-50')}><td className="py-1 pr-2 font-mono">{id}</td><td className="pr-2">{r.businessName}</td><td className="pr-2 text-ink-600">{r.address}{r.postcode ? `, ${r.postcode}` : ''}</td><td className="pr-2 text-ink-500">{r.office}</td><td className="pr-2 text-ink-500">{r.lastContact ? dateShort(r.lastContact) : ''}</td><td>{id === g.survivorId ? <Badge tone="good">survivor</Badge> : <span className="text-ink-400">merge</span>}</td></tr> })}</tbody>
                      </table>
                    </div>
                  ))}
                </div>
              )}
              {tab === 'records' && (
                <div className="max-h-[600px] overflow-auto">
                  <table className="w-full text-xs">
                    <thead className="sticky top-0 bg-ink-50 text-left text-ink-500"><tr><th className="px-3 py-2 font-medium">Record</th><th className="font-medium">Business</th><th className="font-medium">Matched to</th><th className="font-medium">Confidence</th><th className="font-medium">UPRN</th><th className="font-medium">Title</th><th className="font-medium">Company no.</th><th className="font-medium">Register</th><th className="font-medium">Issues</th><th className="font-medium">Decision</th></tr></thead>
                    <tbody>{records.map((r) => { const m = matchById.get(r.recordId); return <tr key={r.recordId} className="border-t border-ink-100"><td className="px-3 py-1 font-mono">{r.recordId}</td><td>{r.businessName}</td><td>{m?.businessId ? <Link className="text-brand-700" to={`/map/business/${m.businessId}`}>{m.businessId}</Link> : <span className="text-ink-400">—</span>}</td><td className="tabular-nums">{m ? pct(m.confidence) : ''}</td><td className="font-mono">{m?.uprn ?? ''}</td><td className="font-mono">{m?.titleNumber ?? ''}</td><td className="font-mono">{m?.companyNumber ?? ''}</td><td>{m?.registerKind ? `${m.registerKind} ${m.registerId}` : ''}</td><td><div className="flex flex-wrap gap-0.5">{m?.issues.map((i) => <Badge key={i} tone={ISSUE_TONE[i]}>{i}</Badge>)}</div></td><td>{decisions[r.recordId] ?? (m && m.businessId && m.confidence >= 0.85 && !m.issues.length ? 'auto' : '')}</td></tr> })}</tbody>
                  </table>
                </div>
              )}
              {tab === 'pipeline' && (
                <ol className="list-decimal space-y-2 p-5 pl-9 text-sm text-ink-700">
                  <li><strong>Normalise.</strong> Postcodes validated and formatted; addresses expanded (Rd→Road, St→Street), punctuation and county filler stripped; company names stripped of Ltd/Limited/plc suffixes.</li>
                  <li><strong>Resolve addresses to UPRN.</strong> Production uses OS Places API (about £0.03 per 100 addresses). The UPRN links to the INSPIRE polygon and freehold title.</li>
                  <li><strong>Match the business.</strong> Blocked by postcode, scored on name (Jaro-Winkler + token overlap), address and postcode. Production adds Splink for probabilistic weights learned from your own accepted matches.</li>
                  <li><strong>Resolve the company.</strong> Exact Companies House number, else normalised name, else fuzzy match ≥ 90%. Status, dissolution and insolvency pulled live.</li>
                  <li><strong>Truth the record.</strong> Freeholder from HMLR CCOD (owner changed?), tenure from the register (tenant recorded as owner?), capacity and status from CQC / Ofsted / NHSBSA / FSA, last contact age.</li>
                  <li><strong>Find duplicates.</strong> Pairwise within the export: same normalised name and postcode or address, or a combined score above 0.85. Survivor = most recently contacted record with a company number.</li>
                  <li><strong>Review and export.</strong> High-confidence clean matches auto-accept; everything else sits in the queue. Export carries the new identifiers and a decision column for the CRM import.</li>
                </ol>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  )
}

function MatchSide({ m }: { m: MatchCandidate }) {
  const [biz, setBiz] = useState<Awaited<ReturnType<typeof provider.getBusiness>>>(undefined)
  useMemo(() => {
    if (m.businessId) provider.getBusiness(m.businessId).then(setBiz)
  }, [m.businessId])
  if (!m.businessId) return <div className="rounded-md border border-dashed border-ink-200 p-3 text-xs text-ink-500"><div className="label mb-1">Best candidate</div>{m.reasons.join(' · ')}<div className="mt-1">No confident match. Check the address or search the map manually.</div></div>
  return (
    <div className="rounded-md border border-brand-100 bg-brand-50/50 p-3 text-xs">
      <div className="label mb-1">Matched · {pct(m.confidence)} · {m.reasons.join(', ')}</div>
      {biz ? (
        <>
          <div className="text-sm font-medium"><Link className="text-brand-700 hover:underline" to={`/map/business/${biz.businessId}`}>{biz.name}</Link> <span className="font-normal text-ink-500">· {biz.sector}</span></div>
          <div className="text-ink-600">{biz.address}, {biz.postcode}</div>
          <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-ink-700">
            <span>UPRN {biz.uprn}</span><span>Title {biz.titleNumber}</span>
            <span>Operator {biz.operatorName}</span><span>Tenure {biz.tenure}</span>
            <span>Freeholder {biz.freeholderName}</span><span>{biz.registers[0] ? `${biz.registers[0].register} ${biz.registers[0].registerId}${biz.registers[0].capacity ? ` · ${biz.registers[0].capacity} ${biz.registers[0].capacityLabel}` : ''}` : ''}</span>
          </div>
        </>
      ) : <Spinner />}
    </div>
  )
}
