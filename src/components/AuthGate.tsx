import { useEffect, type ReactNode } from 'react'
import { Building2, LogIn, ShieldCheck, Map as MapIcon, Database, UserRound, ChevronRight, Lock } from 'lucide-react'
import { authConfigured, useAuth, DEMO_PERSONAS, type Role } from '@/auth'
import { Button, Spinner, Badge } from '@/components/ui'
import { logAudit } from '@/lib/audit'

const ROLE_LABEL: Record<Role, string> = { agent: 'Agent', compliance: 'Compliance', admin: 'Admin' }
const VERSION = `${(import.meta.env.MODE as string) === 'production' ? 'build' : import.meta.env.MODE} · ${new Date().getFullYear()}`

/** Signs the user in (OIDC when configured, a chosen demo persona otherwise) before the app renders. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, error, signIn, setDemoPersona } = useAuth()
  useEffect(() => {
    if (status === 'idle') void signIn()
  }, [status, signIn])
  if (user && status === 'signed-in') return <>{children}</>
  const pick = (id: string) => {
    setDemoPersona(id)
    logAudit('sign-in', `Signed in as demo persona ${id}`)
  }
  return (
    <div className="grid h-full min-h-screen bg-ink-50 lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <aside className="relative hidden overflow-hidden bg-[#0f2340] text-white lg:flex lg:flex-col lg:justify-between lg:p-12" aria-hidden>
        <div className="pointer-events-none absolute inset-0 opacity-[0.12]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.5) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.5) 1px, transparent 1px)', backgroundSize: '48px 48px' }} />
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-brand-500/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 left-10 h-96 w-96 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="relative flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/20"><Building2 size={22} /></div>
          <div><div className="text-lg font-semibold leading-tight">Property Intelligence</div><div className="text-xs text-white/60">Christie &amp; Co · internal platform</div></div>
        </div>
        <div className="relative max-w-md">
          <h1 className="text-3xl font-semibold leading-tight">Every trading property, its owner, operator and market, on one map.</h1>
          <ul className="mt-8 space-y-4 text-sm text-white/80">
            <li className="flex gap-3"><MapIcon size={18} className="mt-0.5 shrink-0 text-brand-300" /><span><span className="font-medium text-white">Title plans and ownership</span> from HM Land Registry, coloured by owner type, with the official register one click away.</span></li>
            <li className="flex gap-3"><Database size={18} className="mt-0.5 shrink-0 text-brand-300" /><span><span className="font-medium text-white">Sector registers</span>: CQC, Ofsted, NHSBSA, FSA, premises licences and Companies House joined to each site, plus VOA, EPC, planning, traffic and sales evidence.</span></li>
            <li className="flex gap-3"><ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand-300" /><span><span className="font-medium text-white">Built for compliance</span>: licence gates on every export and campaign, and an audit log of who did what.</span></li>
          </ul>
        </div>
        <div className="relative flex flex-wrap gap-1.5 text-[11px] text-white/60">
          {['HM Land Registry', 'Companies House', 'VOA', 'EPC', 'CQC', 'Ofsted', 'NHSBSA', 'FSA', 'DfT', 'Planning Data', 'Overture Maps'].map((s) => <span key={s} className="rounded-full bg-white/10 px-2 py-0.5">{s}</span>)}
        </div>
      </aside>

      {/* Sign-in card */}
      <main className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-700 text-white"><Building2 size={20} /></div>
            <div><div className="font-semibold leading-tight">Property Intelligence</div><div className="text-xs text-ink-500">Christie &amp; Co · internal</div></div>
          </div>
          <div className="card p-6 sm:p-8">
            <h2 className="text-xl font-semibold">Sign in</h2>
            <p className="mt-1 text-sm text-ink-500">{authConfigured ? 'Use your Christie & Co account. You will be taken to the company sign-in page and back.' : 'Single sign-on is not configured on this build. Choose a demo persona to try the platform with its role gates and audit trail.'}</p>

            {status === 'loading' && <div className="mt-6"><Spinner label={authConfigured ? 'Signing in…' : 'Loading…'} /></div>}
            {status === 'error' && <p className="mt-4 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300">{error}</p>}

            {authConfigured && (status === 'signed-out' || status === 'error') && (
              <Button variant="primary" className="mt-6 w-full justify-center py-2.5" onClick={() => signIn()}><LogIn size={15} /> Continue with your company account</Button>
            )}

            {!authConfigured && status !== 'loading' && (
              <div className="mt-5 space-y-2" role="group" aria-label="Demo persona">
                {DEMO_PERSONAS.map((p) => (
                  <button key={p.id} onClick={() => pick(p.id)} className="group flex w-full items-center gap-3 rounded-md border border-ink-200 px-3 py-2.5 text-left transition-colors hover:border-brand-400 hover:bg-brand-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink-100 text-ink-600 group-hover:bg-brand-100 group-hover:text-brand-700"><UserRound size={16} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-ink-900">{p.name}</span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-ink-500">{p.office} office{p.roles.map((r) => <Badge key={r} tone={r === 'admin' ? 'brand' : r === 'compliance' ? 'violet' : 'neutral'}>{ROLE_LABEL[r]}</Badge>)}</span>
                    </span>
                    <ChevronRight size={16} className="shrink-0 text-ink-400 group-hover:text-brand-700" />
                  </button>
                ))}
                <p className="pt-1 text-[11px] text-ink-500">Set VITE_OIDC_AUTHORITY and VITE_OIDC_CLIENT_ID (Microsoft Entra ID, Okta or any OpenID Connect provider) to replace this with company accounts.</p>
              </div>
            )}

            <div className="mt-6 flex items-start gap-2 border-t border-ink-100 pt-4 text-[11px] text-ink-500">
              <Lock size={13} className="mt-0.5 shrink-0" />
              <span>Access is limited to Christie &amp; Co staff. Every document order, export, CRM transfer and campaign approval is recorded in the audit log. Data is used under the licences listed on the Data sources page.</span>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between text-[11px] text-ink-400"><span>Property Intelligence · {VERSION}</span><span>Problems signing in? Contact IT service desk.</span></div>
        </div>
      </main>
    </div>
  )
}

/** Hides children (or shows a notice) unless the signed-in user has the role. */
export function RequireRole({ role, children, fallback }: { role: Role; children: ReactNode; fallback?: ReactNode }) {
  const has = useAuth((s) => s.hasRole(role))
  if (has) return <>{children}</>
  return <>{fallback ?? <div className="p-8 text-sm text-ink-500">This page needs the {role} role. Ask an administrator, or switch persona in Settings on the demo build.</div>}</>
}
