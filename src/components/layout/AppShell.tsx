import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Map as MapIcon, LayoutDashboard, Crosshair, Bookmark, Bell, Users, FileText, Database, CalendarClock, Building2, Menu, X, ChevronsLeft, ChevronsRight } from 'lucide-react'
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

const PREVIEW_HOST = import.meta.env.VITE_PREVIEW_HOST as string | undefined

export function AppShell() {
  const loc = useLocation()
  const [unread, setUnread] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try {
      const v = localStorage.getItem('cpi-nav-collapsed')
      return v ? v === '1' : window.innerWidth < 1280
    } catch {
      return false
    }
  })
  useEffect(() => {
    provider.getAlerts().then((a) => setUnread(a.filter((x) => !x.read).length))
    setMobileOpen(false)
  }, [loc.pathname])
  useEffect(() => {
    try {
      localStorage.setItem('cpi-nav-collapsed', collapsed ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [collapsed])
  const isMap = loc.pathname.startsWith('/map')

  const navList = (compact: boolean) => (
    <ul className="flex-1 space-y-0.5 p-2">
      {NAV.map((n) => (
        <li key={n.to}>
          <NavLink to={n.to} end={n.end} title={n.label} className={({ isActive }) => cx('relative flex items-center gap-2.5 rounded-md py-2 text-sm font-medium transition-colors', compact ? 'justify-center px-0' : 'px-2.5', isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-700 hover:bg-ink-100')}>
            <n.icon size={18} />
            {!compact && <span className="flex-1">{n.label}</span>}
            {n.to === '/alerts' && unread > 0 && <span className={cx('rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white', compact && 'absolute right-1 top-1')}>{unread}</span>}
          </NavLink>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="flex h-full flex-col">
      {PREVIEW_HOST && (
        <div className="no-print flex items-center gap-2 bg-amber-100 px-4 py-1.5 text-xs text-amber-900">
          <span className="font-semibold">Preview build.</span>
          <span>This host blocks outside connections, so map tiles, CSV downloads and printing are unavailable here. All data is synthetic. Use the GitHub Pages or internal deployment for the full experience.</span>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {/* Desktop / tablet rail */}
        <nav className={cx('no-print hidden shrink-0 flex-col border-r border-ink-200 bg-white md:flex', collapsed ? 'w-[60px]' : 'w-[196px]')}>
          <div className={cx('flex items-center gap-2 border-b border-ink-200 py-3', collapsed ? 'justify-center px-0' : 'px-4')}>
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand-700 text-white">
              <Building2 size={18} />
            </div>
            {!collapsed && (
              <div className="leading-tight">
                <div className="text-sm font-semibold text-ink-900">Property Intelligence</div>
                <div className="text-[11px] text-ink-500">Christie &amp; Co · internal</div>
              </div>
            )}
          </div>
          {navList(collapsed)}
          <div className="border-t border-ink-200 p-2">
            {!collapsed && (
              <div className="px-1 pb-2 text-[11px] text-ink-500">
                <div className="font-medium text-ink-700">Data provider: {provider.name}</div>
                <div>Demo area: Leamington Spa &amp; Warwick (synthetic)</div>
              </div>
            )}
            <button className="btn-ghost btn-sm w-full justify-center" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Expand navigation' : 'Collapse navigation'}>
              {collapsed ? <ChevronsRight size={16} /> : <><ChevronsLeft size={16} /> Collapse</>}
            </button>
          </div>
        </nav>
        {/* Mobile drawer */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <nav className="flex w-[260px] flex-col bg-white shadow-2xl">
              <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-700 text-white"><Building2 size={18} /></div>
                  <div className="text-sm font-semibold">Property Intelligence</div>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={16} /></button>
              </div>
              {navList(false)}
            </nav>
            <div className="flex-1 bg-black/30" onClick={() => setMobileOpen(false)} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print flex h-12 shrink-0 items-center gap-2 border-b border-ink-200 bg-white px-3 md:px-4">
            <button className="btn-ghost btn-sm md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
            <SearchBox />
            <div className="ml-auto hidden items-center gap-2 text-xs text-ink-500 xl:flex">
              <span>England &amp; Wales · HMLR, VOA, EPC, DfT, CQC, Ofsted, FSA, NHSBSA, Companies House</span>
            </div>
          </header>
          <main className={cx('min-h-0 flex-1', isMap ? 'overflow-hidden' : 'overflow-y-auto')}>
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  )
}
