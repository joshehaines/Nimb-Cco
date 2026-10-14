import type { ReactNode } from 'react'
import { useAuth } from '@/auth'
import { canDownload } from '@/lib/env'
import { logAudit } from '@/lib/audit'

/**
 * Shared print layout for every client-facing document: wordmark band, title, meta line, repeating
 * footer with confidentiality and provenance, and a print button that writes to the audit log.
 */
export function ReportFrame({ kind, title, subtitle, meta, children, confidentiality = 'Confidential. Prepared for internal use and for the named client only.', sources, entityType, entityId, maxWidth = 'max-w-4xl' }: {
  kind: string
  title: string
  subtitle?: ReactNode
  meta?: ReactNode
  children: ReactNode
  confidentiality?: string
  sources?: string
  entityType?: string
  entityId?: string
  maxWidth?: string
}) {
  const user = useAuth((s) => s.user)
  const print = () => {
    logAudit('report-printed', `${kind} printed: ${title}`, { entityType, entityId })
    window.print()
  }
  return (
    <div className={`report mx-auto ${maxWidth} bg-surface text-ink-900 print:max-w-none`}>
      <div className="no-print flex items-center justify-between gap-2 px-10 pt-6">
        <div className="text-xs text-ink-500">Prepared by {user?.name ?? 'the platform'} · {new Date().toLocaleString('en-GB')}</div>
        {canDownload ? <button className="btn-primary" onClick={print}>Print / save as PDF</button> : <span className="text-xs text-ink-500">Printing is disabled on this preview host.</span>}
      </div>
      <header className="report-band mx-10 mt-4 flex items-end justify-between gap-6 border-b-2 border-brand-700 pb-4 print:mx-0">
        <div>
          <div className="wordmark text-[13px] font-bold uppercase tracking-[0.22em] text-brand-700">Christie &amp; Co</div>
          <div className="text-[11px] uppercase tracking-widest text-ink-500">Property Intelligence · {kind}</div>
          <h1 className="mt-2 text-2xl font-semibold leading-tight">{title}</h1>
          {subtitle && <div className="mt-0.5 text-sm text-ink-600">{subtitle}</div>}
        </div>
        <div className="shrink-0 text-right text-[11px] text-ink-500">
          <div>{new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
          {user?.name && <div>Prepared by {user.name}</div>}
          {user?.office && <div>{user.office} office</div>}
          {meta}
        </div>
      </header>
      <div className="px-10 py-6 print:px-0">{children}</div>
      <footer className="report-footer mx-10 border-t border-ink-200 pt-3 text-[10px] leading-relaxed text-ink-500 print:mx-0">
        <div>{confidentiality}</div>
        <div>{sources ?? 'Ownership: HM Land Registry © Crown copyright (CCOD licence: not for direct marketing). Rating: VOA under restricted terms. Regulators: CQC, Ofsted, FSA, NHSBSA (OGL). Companies: Companies House (OGL). Transport: DfT (OGL). Mapping: Overture Maps and OpenStreetMap contributors (ODbL).'}</div>
        <div className="mt-1 flex justify-between"><span>Christie &amp; Co · Whitefriars House, 6 Carmelite Street, London EC4Y 0BS</span><span className="page-no" /></div>
      </footer>
    </div>
  )
}
