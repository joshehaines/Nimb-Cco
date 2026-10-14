import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { MapPage } from '@/pages/MapPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SourcingPage } from '@/pages/SourcingPage'
import { WatchlistPage } from '@/pages/WatchlistPage'
import { AlertsPage } from '@/pages/alerts/AlertsPage'
import { RuleEditorPage } from '@/pages/alerts/RuleEditorPage'
import { CrmPage } from '@/pages/CrmPage'
import { CrmExportPage } from '@/pages/CrmExportPage'
import { AuditPage } from '@/pages/AuditPage'
import { CompanyPage } from '@/pages/CompanyPage'
import { ReportPage } from '@/pages/ReportPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { AdminPage } from '@/pages/AdminPage'
import { LeaseEventsPage } from '@/pages/LeaseEventsPage'
import { PipelinePage } from '@/pages/PipelinePage'
import { ComparablesPage } from '@/pages/ComparablesPage'
import { CatchmentPage } from '@/pages/CatchmentPage'
import { CampaignsPage } from '@/pages/CampaignsPage'
import { AppraisalPage } from '@/pages/AppraisalPage'
import { StageReportPage, CampaignLettersPage } from '@/pages/PrintPages'

export default function App() {
  return (
    <Routes>
      <Route path="/report/:titleNumber" element={<ReportPage />} />
      <Route path="/print/stage/:stage" element={<StageReportPage />} />
      <Route path="/print/campaign/:campaignId" element={<CampaignLettersPage />} />
      <Route path="/appraisal/:businessId" element={<AppraisalPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/map/:entityType/:entityId" element={<MapPage />} />
        <Route path="/sourcing" element={<SourcingPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/alerts/rules/:id" element={<RuleEditorPage />} />
        <Route path="/alerts/:tab" element={<AlertsPage />} />
        <Route path="/leases" element={<LeaseEventsPage />} />
        <Route path="/pipeline" element={<PipelinePage />} />
        <Route path="/comparables" element={<ComparablesPage />} />
        <Route path="/catchment" element={<CatchmentPage />} />
        <Route path="/campaigns" element={<CampaignsPage />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/crm/export" element={<CrmExportPage />} />
        <Route path="/companies/:companyNumber" element={<CompanyPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
