import { useEffect, useState } from 'react'
import { UserPlus, RotateCcw, Ban, CheckCircle2, Copy, ShieldCheck } from 'lucide-react'
import { authHeaders, localAuth, useAuth, type Role } from '@/auth'
import { Badge, Button, Card, Input, Select, cx } from '@/components/ui'
import { ago } from '@/lib/format'

interface Account { id: string; email: string; name: string; roles: Role[]; office?: string | null; mustReset: boolean; disabled: boolean; createdAt?: string | null; lastLoginAt?: string | null }
const API = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'
const OFFICES = ['Birmingham', 'Bristol', 'Cardiff', 'Edinburgh', 'Exeter', 'Glasgow', 'Leeds', 'London', 'Manchester', 'Newcastle', 'Nottingham']

/**
 * Admin: create, reset and disable the email-and-password accounts (local sign-in mode). A
 * temporary password is shown once at creation or reset; the user must change it on first sign-in.
 */
export function UsersCard() {
  const isAdmin = useAuth((s) => s.hasRole('admin'))
  const me = useAuth((s) => s.user)
  const [users, setUsers] = useState<Account[]>([])
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', email: '', office: '', roles: ['agent'] as Role[] })
  const [issued, setIssued] = useState<{ email: string; password: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const call = async (path: string, init?: RequestInit) => {
    const r = await fetch(`${API}${path}`, { ...init, headers: { 'content-type': 'application/json', ...authHeaders(), ...(init?.headers ?? {}) } })
    if (!r.ok) throw new Error((await r.json().catch(() => ({ detail: r.statusText })) as { detail?: string; error?: string }).detail ?? `HTTP ${r.status}`)
    return r.json()
  }
  const load = () => call('/admin/users').then(setUsers).catch((e: Error) => setError(e.message))
  useEffect(() => { if (localAuth && isAdmin) void load() }, [isAdmin]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!localAuth || !isAdmin) return null
  const create = async () => {
    setBusy(true); setError(null)
    try {
      const r = (await call('/admin/users', { method: 'POST', body: JSON.stringify(form) })) as { temporaryPassword: string; user: Account }
      setIssued({ email: form.email, password: r.temporaryPassword })
      setForm({ name: '', email: '', office: '', roles: ['agent'] })
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const reset = async (u: Account) => {
    if (!confirm(`Reset the password for ${u.name}? Their current sessions end.`)) return
    try { const r = (await call(`/admin/users/${u.id}/reset`, { method: 'POST' })) as { temporaryPassword: string }; setIssued({ email: u.email, password: r.temporaryPassword }); await load() } catch (e) { setError((e as Error).message) }
  }
  const toggleDisabled = async (u: Account) => {
    try { await call(`/admin/users/${u.id}/disabled`, { method: 'POST', body: JSON.stringify({ disabled: !u.disabled }) }); await load() } catch (e) { setError((e as Error).message) }
  }
  const setRole = async (u: Account, roles: Role[]) => {
    try { await call(`/admin/users/${u.id}`, { method: 'PUT', body: JSON.stringify({ roles }) }); await load() } catch (e) { setError((e as Error).message) }
  }
  const roleToggle = (roles: Role[], r: Role) => (roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])
  return (
    <Card title={<span className="flex items-center gap-2"><ShieldCheck size={15} /> Users and sign-in</span>} actions={<span className="text-xs text-ink-500">{users.length} account{users.length === 1 ? '' : 's'} · email and password mode</span>}>
      <div className="grid gap-2 rounded-md border border-ink-200 p-3 md:grid-cols-[1fr_1fr_160px_auto_auto]">
        <Input placeholder="Full name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Name" />
        <Input type="email" placeholder="name@christie.com" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} aria-label="Email" />
        <Select value={form.office} onChange={(e) => setForm({ ...form, office: e.target.value })} aria-label="Office"><option value="">Office</option>{OFFICES.map((o) => <option key={o}>{o}</option>)}</Select>
        <div className="flex items-center gap-1">{(['compliance', 'admin'] as Role[]).map((r) => <button key={r} type="button" className={cx('rounded-full border px-2 py-0.5 text-[11px]', form.roles.includes(r) ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 text-ink-700')} onClick={() => setForm({ ...form, roles: roleToggle(form.roles, r) })}>{r}</button>)}</div>
        <Button variant="primary" onClick={create} disabled={busy || !form.name.trim() || !/@/.test(form.email)}><UserPlus size={14} /> Create</Button>
      </div>
      <p className="mt-1 text-[11px] text-ink-500">Everyone is an agent. Compliance can approve campaigns and read the audit log; admin can also manage users and see data sources.</p>
      {issued && (
        <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm dark:border-amber-900/60 dark:bg-amber-950/40">
          <div className="font-medium">Temporary password for {issued.email}</div>
          <div className="mt-1 flex items-center gap-2"><code className="rounded bg-surface px-2 py-1 font-mono text-base tracking-wide">{issued.password}</code><Button size="sm" onClick={() => navigator.clipboard?.writeText(issued.password)}><Copy size={13} /> Copy</Button><button className="text-xs text-ink-500 hover:underline" onClick={() => setIssued(null)}>dismiss</button></div>
          <div className="mt-1 text-xs text-ink-600">Shown once. Pass it on by phone or in person, not by email. They will be asked to choose their own password when they first sign in.</div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-rose-700">{error}</p>}
      <table className="mt-3 w-full text-xs">
        <thead className="text-left text-ink-500"><tr><th className="py-1 font-medium">Name</th><th className="font-medium">Email</th><th className="font-medium">Office</th><th className="font-medium">Roles</th><th className="font-medium">Last sign-in</th><th className="font-medium">Status</th><th /></tr></thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} className={cx('border-t border-ink-100', u.disabled && 'opacity-60')}>
              <td className="py-1.5 font-medium">{u.name}{u.id === me?.id ? <span className="text-ink-400"> (you)</span> : ''}</td>
              <td>{u.email}</td>
              <td>{u.office ?? '—'}</td>
              <td><div className="flex gap-1">{(['compliance', 'admin'] as Role[]).map((r) => <button key={r} type="button" disabled={u.id === me?.id && r === 'admin'} className={cx('rounded-full border px-1.5 py-0.5 text-[10px] disabled:opacity-50', u.roles.includes(r) ? 'border-brand-600 bg-brand-600 text-white' : 'border-ink-200 text-ink-600')} onClick={() => setRole(u, roleToggle(u.roles, r))}>{r}</button>)}</div></td>
              <td>{u.lastLoginAt ? ago(u.lastLoginAt) : 'never'}</td>
              <td>{u.disabled ? <Badge tone="critical">disabled</Badge> : u.mustReset ? <Badge tone="warning">temporary password</Badge> : <Badge tone="good"><CheckCircle2 size={10} /> active</Badge>}</td>
              <td className="text-right"><div className="flex justify-end gap-1"><Button size="sm" onClick={() => reset(u)} title="Issue a new temporary password"><RotateCcw size={12} /> Reset</Button><Button size="sm" onClick={() => toggleDisabled(u)} disabled={u.id === me?.id} title={u.disabled ? 'Re-enable' : 'Disable: signs them out everywhere'}><Ban size={12} /> {u.disabled ? 'Enable' : 'Disable'}</Button></div></td>
            </tr>
          ))}
          {!users.length && <tr><td colSpan={7} className="py-3 text-ink-500">No accounts yet besides the bootstrap administrator. Create the first colleague above.</td></tr>}
        </tbody>
      </table>
    </Card>
  )
}
