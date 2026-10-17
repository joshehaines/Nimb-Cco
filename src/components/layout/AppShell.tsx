import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { HelpCircle, Upload, ShieldCheck, Map as MapIcon, Home, Crosshair, Bookmark, Bell, Users, FileText, Database, CalendarClock, Building2, Menu, X, KanbanSquare, Scale, Radar, Mail, Send, Settings2, type LucideIcon } from 'lucide-react'
import { useUi } from '@/store/ui'
import { useTheme } from '@/hooks/useTheme'
import { SearchBox } from '@/components/SearchBox'
import { useEffect, useRef, useState } from 'react'
import { useStaff } from '@/data/staff'
import { useAuth } from '@/auth'
import { SettingsDialog } from '@/components/SettingsDialog'
import { Tour } from '@/components/Tour'
import { AssistantPanel } from '@/components/AssistantPanel'
import { useAssistant } from '@/assistant/store'
import { provider } from '@/data'
import { useAlerts } from '@/store/alerts'
import { cx } from '@/components/ui'

interface Item { to: string; label: string; hint: string; icon: LucideIcon; end?: boolean; role?: 'compliance' }
interface Group { id: string; label: string; icon: LucideIcon; items: Item[] }

/** Fifteen pages in six groups, so the rail reads as a handful of jobs rather than a long list. */
export const NAV_GROUPS: Group[] = [
  { id: 'home', label: 'Home', icon: Home, items: [{ to: '/', label: 'Home', hint: 'Alerts, distressed operators and pipeline at a glance', icon: Home, end: true }] },
  { id: 'map', label: 'Map', icon: MapIcon, items: [{ to: '/map', label: 'Map', hint: 'Titles, businesses, sales and planning', icon: MapIcon }] },
  {
    id: 'find', label: 'Find', icon: Crosshair, items: [
      { to: '/sourcing', label: 'Sourcing', hint: 'Filter every trading site by sector, owner and distress', icon: Crosshair },
      { to: '/comparables', label: 'Comparables', hint: 'Sold trading businesses and Land Registry sales', icon: Scale },
      { to: '/catchment', label: 'Catchment', hint: 'Population, deprivation and supply around a site', icon: Radar },
    ],
  },
  {
    id: 'track', label: 'Track', icon: Bookmark, items: [
      { to: '/watchlist', label: 'My sites', hint: 'Sites and companies you are watching', icon: Bookmark },
      { to: '/pipeline', label: 'Pipeline', hint: 'Deals by stage with weighted fees', icon: KanbanSquare },
      { to: '/alerts', label: 'Alerts', hint: 'Insolvency, planning and register changes', icon: Bell },
      { to: '/leases', label: 'Lease events', hint: 'Breaks and expiries coming up', icon: CalendarClock },
    ],
  },
  {
    id: 'outreach', label: 'Outreach', icon: Send, items: [
      { to: '/campaigns', label: 'Campaigns', hint: 'Direct-to-owner letters with the licence gate', icon: Mail },
      { to: '/crm/export', label: 'Export to CRM', hint: 'Clean accounts, contacts and sites for import', icon: Upload },
      { to: '/crm', label: 'CRM clean-up', hint: 'Match and de-duplicate CRM records', icon: Users },
    ],
  },
  {
    id: 'admin', label: 'Admin', icon: Settings2, items: [
      { to: '/documents', label: 'Documents', hint: 'Ordered registers, plans and reports', icon: FileText },
      { to: '/admin', label: 'Data sources', hint: 'What is loaded and when it last refreshed', icon: Database },
      { to: '/audit', label: 'Audit log', hint: 'Who exported or viewed what', icon: ShieldCheck, role: 'compliance' },
    ],
  },
]

const PREVIEW_HOST = import.meta.env.VITE_PREVIEW_HOST as string | undefined

/** Which group a path belongs to: the longest matching route wins, so /crm/export is Outreach and / is Home only on its own. */
function groupFor(path: string): string | undefined {
  let best: { id: string; len: number } | undefined
  for (const g of NAV_GROUPS)
    for (const i of g.items) {
      const hit = i.end ? path === i.to : path === i.to || path.startsWith(i.to + '/')
      if (hit && (!best || i.to.length > best.len)) best = { id: g.id, len: i.to.length }
    }
  if (!best && /^\/(company|report|appraisal)/.test(path)) return 'map'
  return best?.id
}

function initials(name?: string) {
  return (name ?? '?').split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '?'
}

export function AppShell() {
  const loc = useLocation()
  const nav = useNavigate()
  useTheme()
  const [unread, setUnread] = useState(0)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [flyout, setFlyout] = useState<string | null>(null)
  const [flyoutTop, setFlyoutTop] = useState(52)
  const railRef = useRef<HTMLElement>(null)
  const hoverTimer = useRef<number>()
  const alertState = useAlerts((s) => s.state)
  useEffect(() => { void useStaff.getState().load() }, [])
  useEffect(() => {
    provider.getAlerts().then((a) => setUnread(a.filter((x) => !(alertState[x.alertId]?.read ?? x.read) && !alertState[x.alertId]?.dismissed).length)).catch(() => {})
  }, [alertState])
  useEffect(() => {
    setMobileOpen(false)
    setFlyout(null)
  }, [loc.pathname])
  useEffect(() => {
    if (!flyout) return
    const onDoc = (e: MouseEvent) => { if (!railRef.current?.contains(e.target as Node)) setFlyout(null) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFlyout(null) }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDoc); document.removeEventListener('keydown', onKey) }
  }, [flyout])
  const isMap = loc.pathname.startsWith('/map')
  const activeGroup = groupFor(loc.pathname)

  const user = useAuth((s) => s.user)
  const hasRole = useAuth((s) => s.hasRole)
  const setTourDone = useUi((s) => s.setTourDone)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tourOpen, setTourOpen] = useState(false)
  const closeTour = () => {
    setTourOpen(false)
    setTourDone(true)
  }
  const visible = (i: Item) => !i.role || hasRole(i.role)
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter(visible) })).filter((g) => g.items.length)

  const openGroup = (g: Group, el: HTMLElement) => {
    if (g.items.length === 1) { nav(g.items[0].to); setFlyout(null); return }
    setFlyoutTop(el.offsetTop)
    setFlyout(flyout === g.id ? null : g.id)
  }
  const hoverGroup = (g: Group | null, el?: HTMLElement) => {
    window.clearTimeout(hoverTimer.current)
    if (!g || !el) return
    // Only slide between flyouts on hover once one is open; the first one opens on click.
    if (flyout && g.items.length > 1) hoverTimer.current = window.setTimeout(() => { setFlyoutTop(el.offsetTop); setFlyout(g.id) }, 120)
  }
  const current = groups.find((g) => g.id === flyout)

  const itemLink = (i: Item, withHint: boolean) => (
    <NavLink key={i.to} to={i.to} end={i.end ?? i.to === '/crm'} data-tour={`nav-${i.to.replace(/^\//, '').replace(/\//g, '-') || 'home'}`} className={({ isActive }) => cx('flex items-start gap-3 rounded-md px-2.5 py-2 transition-colors', isActive ? 'bg-brand-50 text-brand-800' : 'text-ink-800 hover:bg-ink-100')}>
      <i.icon size={17} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-sm font-medium">{i.label}{i.to === '/alerts' && unread > 0 && <span className="rounded-full bg-rose-600 px-1.5 text-[10px] font-semibold text-white">{unread}</span>}</span>
        {withHint && <span className="block text-[11px] leading-snug text-ink-500">{i.hint}</span>}
      </span>
    </NavLink>
  )

  return (
    <div className="flex h-full flex-col">
      {PREVIEW_HOST && (
        <div className="no-print flex items-center gap-2 bg-amber-100 dark:bg-amber-950/40 px-4 py-1.5 text-xs text-amber-900 dark:text-amber-200">
          <span className="font-semibold">Preview build.</span>
          <span>This host blocks outside connections, so map tiles, CSV downloads and printing are unavailable here.</span>
        </div>
      )}
      <div className="flex min-h-0 flex-1">
        {/* Desktop / tablet rail: six jobs, each opening a short menu of its pages. */}
        <nav ref={railRef} className="no-print relative z-40 hidden w-[68px] shrink-0 flex-col items-center border-r border-ink-200 bg-surface py-2 md:flex" aria-label="Main">
          <NavLink to="/" className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-brand-700 text-white" title="Property Intelligence">
            <Building2 size={18} />
          </NavLink>
          <ul className="flex w-full flex-1 flex-col items-center gap-1 px-1.5">
            {groups.map((g) => {
              const active = activeGroup === g.id
              const open = flyout === g.id
              const badge = g.id === 'track' && unread > 0
              return (
                <li key={g.id} className="w-full">
                  <button type="button" onClick={(e) => openGroup(g, e.currentTarget)} onMouseEnter={(e) => hoverGroup(g, e.currentTarget)} onMouseLeave={() => hoverGroup(null)} aria-haspopup={g.items.length > 1 ? 'menu' : undefined} aria-expanded={g.items.length > 1 ? open : undefined} aria-current={active ? 'page' : undefined} data-tour={`nav-${g.id}`}
                    className={cx('relative flex w-full flex-col items-center gap-0.5 rounded-lg py-2 text-[10.5px] font-medium transition-colors', active ? 'bg-brand-50 text-brand-800' : open ? 'bg-ink-100 text-ink-900' : 'text-ink-600 hover:bg-ink-100 hover:text-ink-900')}>
                    <g.icon size={19} />
                    <span>{g.label}</span>
                    {badge && <span className="absolute right-2 top-1 h-2 w-2 rounded-full bg-rose-600" aria-label={`${unread} unread alerts`} />}
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex w-full flex-col items-center gap-1 px-1.5">
            <button data-tour="assistant" className="flex w-full flex-col items-center gap-0.5 rounded-lg py-2 text-[10.5px] font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900" onClick={() => useAssistant.getState().setOpen(!useAssistant.getState().open)} title="Ask the assistant (?)">
              <HelpCircle size={19} /><span>Ask</span>
            </button>
            <button data-tour="settings" className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-ink-100 text-xs font-semibold text-ink-700 hover:bg-ink-200" onClick={() => setSettingsOpen(true)} title={`${user?.name ?? 'Settings'}: settings, theme and sign out`}>
              {initials(user?.name)}
            </button>
          </div>
          {current && (
            <div role="menu" aria-label={current.label} className="card absolute left-[72px] z-50 w-[280px] p-1.5 shadow-xl" style={{ top: Math.max(8, flyoutTop - 8) }} onMouseEnter={() => window.clearTimeout(hoverTimer.current)}>
              <div className="px-2.5 pb-1 pt-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{current.label}</div>
              {current.items.map((i) => itemLink(i, true))}
            </div>
          )}
        </nav>
        {/* Mobile drawer: the same groups as headed lists. */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex md:hidden">
            <nav className="flex w-[280px] flex-col overflow-y-auto bg-surface shadow-2xl">
              <div className="flex items-center justify-between border-b border-ink-200 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-brand-700 text-white"><Building2 size={18} /></div>
                  <div className="text-sm font-semibold">Property Intelligence</div>
                </div>
                <button className="btn-ghost btn-sm" onClick={() => setMobileOpen(false)} aria-label="Close menu"><X size={16} /></button>
              </div>
              <div className="flex-1 space-y-3 p-2">
                {groups.map((g) => (
                  <div key={g.id}>
                    {g.items.length > 1 && <div className="px-2.5 pb-0.5 text-[11px] font-semibold uppercase tracking-wide text-ink-500">{g.label}</div>}
                    {g.items.map((i) => itemLink(i, false))}
                  </div>
                ))}
              </div>
              <div className="border-t border-ink-200 p-2">
                <button className="btn-ghost btn-sm w-full justify-start" onClick={() => { setMobileOpen(false); setSettingsOpen(true) }}>Settings · {user?.name ?? 'account'}</button>
              </div>
            </nav>
            <div className="flex-1 bg-black/30" onClick={() => setMobileOpen(false)} />
          </div>
        )}
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="no-print flex h-14 shrink-0 items-center gap-3 border-b border-ink-200 bg-surface px-3 md:px-5">
            <button className="btn-ghost btn-sm md:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu"><Menu size={18} /></button>
            <div className="mx-auto flex w-full max-w-2xl min-w-0">
              <SearchBox />
            </div>
            <NavLink to="/alerts" className="relative hidden h-9 w-9 items-center justify-center rounded-full text-ink-600 hover:bg-ink-100 sm:flex" title={unread ? `${unread} unread alerts` : 'Alerts'}>
              <Bell size={18} />
              {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-[18px] rounded-full bg-rose-600 px-1 text-center text-[10px] font-semibold leading-[18px] text-white">{unread > 99 ? '99+' : unread}</span>}
            </NavLink>
          </header>
          <main className={cx('min-h-0 flex-1', isMap ? 'overflow-hidden' : 'overflow-y-auto')}>
            <Outlet />
            <SettingsDialog open={settingsOpen} onClose={() => setSettingsOpen(false)} onStartTour={() => setTourOpen(true)} />
            <AssistantPanel />
            <Tour open={tourOpen} onClose={closeTour} />
          </main>
        </div>
      </div>
    </div>
  )
}
