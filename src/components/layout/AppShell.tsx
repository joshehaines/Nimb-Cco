import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Map as MapIcon, LayoutDashboard, Crosshair, Bookmark, Bell, Users, FileText, Database, CalendarClock, Building2 } from 'lucide-react'
import { SearchBox } from '@/components/SearchBox'
import { useEffect, useState } from 'react'
import { provider } from '@/data'
import { cx } from '@/components/ui'

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/map', label: 'Map', icon: MapIcon },
  { to: '/sourcing', label: 'Sourcing', icon: Crosshair },
  { to: '/watchlist', label: 'My Sites', icon: Bookmark },
  { to: '/alerts', label: 'Alerts', icon: Bell },
  { to: '/leases', label: 'Lease events', icon: CalendarClock },
  { to: '/crm', label: 'CRM clean-up', icon: Users },
  { to: '/documents', label: 'Documents', icon: FileText },
  { to: '/admin', label: 'Data sources', icon: Database },
]

export function AppShell() {
  const loc = useLocation()
  const [unread, setUnread] = useState(0)
  useEffect(() => {
    provider.getAlerts().then((a) => setUnread(a.filter((x) => !x.read).length))
  }, [loc.pathname])
  const isMap = loc.pathname.startsWith('/map')
  return (
    <div className="flex h-full">
      <nav className="no-print flex w-[196px] shrink-0 flex-col border-r border-ink-200 bg-white">
        <div className="flex items-center gap-2 border-b border-ink-200 px-4 py-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-700 text-white">
            <Building2 size={18} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-ink-900">Property Intelligence</div>
            <div className="text-[11px] text-ink-500">Christie &amp; Co · internal</div>
          </div>
        </div>
        <ul className="flex-1 space-y-0.5 p-2">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} end={n.end} className={({ isActive }) => cx('flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors', isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100')}>
                <n.icon size={16} />
                <span className="flex-1">{n.label}</span>
                {n.to === '/alerts' && unread > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white">{unread}</span>}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="border-t border-ink-200 p-3 text-[11px] text-ink-500">
          <div className="font-medium text-ink-700">Data provider: {provider.name}</div>
          <div>Demo area: Leamington Spa &amp; Warwick</div>
          <div className="mt-1">Licence tags enforced in exports.</div>
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print flex h-12 shrink-0 items-center gap-3 border-b border-ink-200 bg-white px-4">
          <SearchBox />
          <div className="ml-auto flex items-center gap-2 text-xs text-ink-500">
            <span className="hidden md:inline">England &amp; Wales · HMLR, VOA, EPC, DfT, CQC, Ofsted, FSA, NHSBSA, Companies House</span>
          </div>
        </header>
        <main className={cx('min-h-0 flex-1', isMap ? 'overflow-hidden' : 'overflow-y-auto')}>
          <Outlet />
        </main>
      </div>
    </div>
  )
}
