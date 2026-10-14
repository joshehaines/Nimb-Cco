import { useEffect, type ReactNode } from 'react'
import { Building2, LogIn } from 'lucide-react'
import { authConfigured, useAuth, type Role } from '@/auth'
import { Button, Spinner } from '@/components/ui'

/** Signs the user in (OIDC when configured, demo persona otherwise) before the app renders. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { status, user, error, signIn } = useAuth()
  useEffect(() => {
    if (status === 'idle') void signIn()
  }, [status, signIn])
  if (user && status === 'signed-in') return <>{children}</>
  return (
    <div className="flex h-full items-center justify-center bg-ink-50 p-6">
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-700 text-white"><Building2 size={24} /></div>
        <h1 className="text-lg font-semibold">Property Intelligence</h1>
        <p className="mt-1 text-sm text-ink-500">Christie &amp; Co internal platform</p>
        {status === 'loading' && <div className="mt-6"><Spinner label={authConfigured ? 'Signing in…' : 'Loading…'} /></div>}
        {status === 'error' && <p className="mt-4 text-sm text-rose-700 dark:text-rose-300">{error}</p>}
        {(status === 'signed-out' || status === 'error') && (
          <Button variant="primary" className="mt-6 w-full justify-center" onClick={() => signIn()}><LogIn size={14} /> Sign in with your company account</Button>
        )}
        {authConfigured && <p className="mt-4 text-[11px] text-ink-500">Access is limited to Christie &amp; Co staff. Every document order, export and campaign approval is recorded in the audit log.</p>}
      </div>
    </div>
  )
}

/** Hides children (or shows a notice) unless the signed-in user has the role. */
export function RequireRole({ role, children, fallback }: { role: Role; children: ReactNode; fallback?: ReactNode }) {
  const has = useAuth((s) => s.hasRole(role))
  if (has) return <>{children}</>
  return <>{fallback ?? <div className="p-8 text-sm text-ink-500">This page needs the {role} role. Ask an administrator, or switch persona in Settings on the demo build.</div>}</>
}
