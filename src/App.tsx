import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { MapPage } from '@/pages/MapPage'
import { DashboardPage } from '@/pages/DashboardPage'

// Every page except the dashboard and the map loads on first visit, so the first screen downloads only what it needs.
const SourcingPage = lazy(() => import('@/pages/SourcingPage').then((m) => ({ default: m.SourcingPage })))
const WatchlistPage = lazy(() => import('@/pages/WatchlistPage').then((m) => ({ default: m.WatchlistPage })))
const AlertsPage = lazy(() => import('@/pages/alerts/AlertsPage').then((m) => ({ default: m.AlertsPage })))
const RuleEditorPage = lazy(() => import('@/pages/alerts/RuleEditorPage').then((m) => ({ default: m.RuleEditorPage })))
const CrmPage = lazy(() => import('@/pages/CrmPage').then((m) => ({ default: m.CrmPage })))
const CrmExportPage = lazy(() => import('@/pages/CrmExportPage').then((m) => ({ default: m.CrmExportPage })))
const AuditPage = lazy(() => import('@/pages/AuditPage').then((m) => ({ default: m.AuditPage })))
const CompanyPage = lazy(() => import('@/pages/CompanyPage').then((m) => ({ default: m.CompanyPage })))
const ReportPage = lazy(() => import('@/pages/ReportPage').then((m) => ({ default: m.ReportPage })))
const DocumentsPage = lazy(() => import('@/pages/DocumentsPage').then((m) => ({ default: m.DocumentsPage })))
const AdminPage = lazy(() => import('@/pages/AdminPage').then((m) => ({ default: m.AdminPage })))
const LeaseEventsPage = lazy(() => import('@/pages/LeaseEventsPage').then((m) => ({ default: m.LeaseEventsPage })))
const PipelinePage = lazy(() => import('@/pages/PipelinePage').then((m) => ({ default: m.PipelinePage })))
const ComparablesPage = lazy(() => import('@/pages/ComparablesPage').then((m) => ({ default: m.ComparablesPage })))
const CatchmentPage = lazy(() => import('@/pages/CatchmentPage').then((m) => ({ default: m.CatchmentPage })))
const CampaignsPage = lazy(() => import('@/pages/CampaignsPage').then((m) => ({ default: m.CampaignsPage })))
const AppraisalPage = lazy(() => import('@/pages/AppraisalPage').then((m) => ({ default: m.AppraisalPage })))
const StageReportPage = lazy(() => import('@/pages/PrintPages').then((m) => ({ default: m.StageReportPage })))
const CampaignLettersPage = lazy(() => import('@/pages/PrintPages').then((m) => ({ default: m.CampaignLettersPage })))

const PageLoading = () => <div className="p-8 text-sm text-ink-500">Loading…</div>

export default function App() {
  return (
    <Suspense fallback={<PageLoading />}>
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
    </Suspense>
  )
}
