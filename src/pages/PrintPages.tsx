import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { provider, type Business, type PipelineStage } from '@/data'
import { useUi } from '@/store/ui'
import { Badge } from '@/components/ui'
import { dateShort, gbp } from '@/lib/format'
import { canDownload } from '@/lib/env'
import { TEMPLATES, mergeLetter } from './CampaignsPage'

function PrintBar() {
  return <div className="no-print mb-4 flex justify-end">{canDownload ? <button className="btn-primary" onClick={() => window.print()}>Print / save as PDF</button> : <span className="text-xs text-ink-500">Printing is disabled on this preview host.</span>}</div>
}

/** Client-ready report for one pipeline stage (Nimbus "stage report"). */
export function StageReportPage() {
  const { stage = 'Prospect' } = useParams()
  const items = useUi((s) => s.watchlist).filter((w) => (w.stage ?? 'Prospect') === (decodeURIComponent(stage) as PipelineStage))
  const [biz, setBiz] = useState<Record<string, Business>>({})
  useEffect(() => {
    Promise.all(items.filter((w) => w.entityType === 'business').map(async (w) => [w.entityId, await provider.getBusiness(w.entityId)] as const)).then((es) => {
      const m: Record<string, Business> = {}
      for (const [id, b] of es) if (b) m[id] = b
      setBiz(m)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage])
  const fees = items.reduce((s, w) => s + (w.feeEstimate ?? 0), 0)
  return (
    <div className="mx-auto max-w-4xl bg-surface p-10 text-ink-900 print:p-0">
      <PrintBar />
      <header className="mb-6 border-b-2 border-brand-700 pb-4">
        <div className="text-xs font-semibold uppercase tracking-widest text-brand-700">Christie &amp; Co · Pipeline stage report</div>
        <h1 className="mt-1 text-2xl font-semibold">{decodeURIComponent(stage)}</h1>
        <div className="text-sm text-ink-600">{items.length} sites · fee estimate {gbp(fees)} · generated {new Date().toLocaleDateString('en-GB')}</div>
      </header>
      {items.map((w) => {
        const b = biz[w.entityId]
        return (
          <section key={w.id} className="mb-5 break-inside-avoid border-b border-ink-100 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div><h2 className="text-base font-semibold">{w.label}</h2><div className="text-xs text-ink-500">{b ? `${b.sector} · ${b.tenure} · ${b.address}, ${b.postcode}` : w.entityId}{w.office ? ` · ${w.office} office` : ''}{w.assignee ? ` · ${w.assignee}` : ''}</div></div>
              <div className="text-right text-xs">{w.guidePrice && <div>Guide {gbp(w.guidePrice)}</div>}{w.feeEstimate && <div>Fee {gbp(w.feeEstimate)}</div>}</div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-xs md:grid-cols-4">
              {b && <><div><span className="text-ink-500">Operator</span><br />{b.operatorName}</div><div><span className="text-ink-500">Freeholder</span><br />{b.freeholderName}</div><div><span className="text-ink-500">Register</span><br />{b.registers[0] ? `${b.registers[0].register}${b.registers[0].rating ? ` · ${b.registers[0].rating}` : ''}${b.registers[0].capacity ? ` · ${b.registers[0].capacity} ${b.registers[0].capacityLabel}` : ''}` : '—'}</div></>}
              <div><span className="text-ink-500">Next action</span><br />{w.nextAction ?? '—'}{w.nextActionDate ? ` · ${dateShort(w.nextActionDate)}` : ''}</div>
            </div>
            {b && b.distressFlags.length > 0 && <div className="mt-1.5 flex gap-1">{b.distressFlags.map((f) => <Badge key={f} tone="critical">{f}</Badge>)}</div>}
            {w.notes && <p className="mt-2 text-sm">{w.notes}</p>}
          </section>
        )
      })}
      {!items.length && <p className="text-sm text-ink-500">No sites in this stage.</p>}
      <footer className="mt-8 text-[10px] text-ink-500">Internal and client use. Ownership from HM Land Registry; regulator data from CQC, Ofsted, FSA and NHSBSA; company data from Companies House.</footer>
    </div>
  )
}

/** Print-ready letters for a campaign, one per page. */
export function CampaignLettersPage() {
  const { campaignId = '' } = useParams()
  const c = useUi((s) => s.campaigns).find((x) => x.campaignId === campaignId)
  if (!c) return <div className="p-8">Campaign not found.</div>
  const tpl = TEMPLATES.find((t) => t.templateId === c.templateId) ?? TEMPLATES[0]
  const recipients = c.recipients.filter((r) => r.included)
  return (
    <div className="mx-auto max-w-3xl bg-surface text-ink-900">
      <div className="p-6 print:hidden"><PrintBar /><div className="text-xs text-ink-500">{recipients.length} letters · {c.name} · {c.liaCompleted ? `LIA ${c.liaNotes || 'recorded'}` : 'LIA not recorded: do not send'}</div></div>
      {recipients.map((r) => (
        <article key={r.id} className="break-after-page p-12 text-[13px] leading-relaxed">
          <div className="mb-10 flex justify-between text-xs text-ink-500"><div>Christie &amp; Co<br />Whitefriars House, 6 Carmelite Street<br />London EC4Y 0BS</div><div>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div></div>
          <div className="mb-8">{r.recipientName}<br />{r.address}<br />{r.postcode}</div>
          <div className="mb-4 font-semibold">{mergeLetter(tpl.subject, r.mergeFields)}</div>
          <div className="whitespace-pre-wrap">{mergeLetter(tpl.body, r.mergeFields)}</div>
          <div className="mt-10 text-[9px] text-ink-400">Lawful basis: {r.basis}. You may ask us to stop writing to you at any time by contacting the sender; we will add you to our suppression list immediately.</div>
        </article>
      ))}
    </div>
  )
}
