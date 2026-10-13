import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from '@/components/layout/AppShell'
import { MapPage } from '@/pages/MapPage'
import { DashboardPage } from '@/pages/DashboardPage'
import { SourcingPage } from '@/pages/SourcingPage'
import { WatchlistPage } from '@/pages/WatchlistPage'
import { AlertsPage } from '@/pages/AlertsPage'
import { CrmPage } from '@/pages/CrmPage'
import { CompanyPage } from '@/pages/CompanyPage'
import { ReportPage } from '@/pages/ReportPage'
import { DocumentsPage } from '@/pages/DocumentsPage'
import { AdminPage } from '@/pages/AdminPage'
import { LeaseEventsPage } from '@/pages/LeaseEventsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/report/:titleNumber" element={<ReportPage />} />
      <Route element={<AppShell />}>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/map" element={<MapPage />} />
        <Route path="/map/:entityType/:entityId" element={<MapPage />} />
        <Route path="/sourcing" element={<SourcingPage />} />
        <Route path="/watchlist" element={<WatchlistPage />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/leases" element={<LeaseEventsPage />} />
        <Route path="/crm" element={<CrmPage />} />
        <Route path="/companies/:companyNumber" element={<CompanyPage />} />
        <Route path="/documents" element={<DocumentsPage />} />
        <Route path="/admin" element={<AdminPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
