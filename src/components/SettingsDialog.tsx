import { useState } from 'react'
import { X, Settings as SettingsIcon, MapPinned, KeyRound, UserRound, Compass, LogOut } from 'lucide-react'
import { useUi } from '@/store/ui'
import { authConfigured, DEMO_PERSONAS, useAuth } from '@/auth'
import { Button, Input, Select } from '@/components/ui'
import { logAudit } from '@/lib/audit'
import { DEMO_AREAS } from '@/data/real'

/** User settings: persona (demo), Ordnance Survey key, theme, demo areas, tour, sign out. */
export function SettingsDialog({ open, onClose, onStartTour }: { open: boolean; onClose: () => void; onStartTour: () => void }) {
  const { osKey, setOsKey, theme, setTheme, requestFlyTo } = useUi()
  const { user, signOut, setDemoPersona } = useAuth()
  const [key, setKey] = useState(osKey ?? '')
  if (!open) return null
  const saveKey = () => {
    setOsKey(key.trim() || undefined)
    logAudit('settings-changed', key.trim() ? 'Ordnance Survey API key set for this browser' : 'Ordnance Survey API key cleared')
    window.location.reload()
  }
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4" onClick={onClose} role="dialog" aria-modal="true" aria-label="Settings">
      <div className="card w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-ink-200 px-5 py-3"><div className="flex items-center gap-2 text-sm font-semibold"><SettingsIcon size={16} /> Settings</div><button className="btn-ghost btn-sm" onClick={onClose} aria-label="Close settings"><X size={16} /></button></div>
        <div className="max-h-[70vh] space-y-5 overflow-y-auto px-5 py-4 text-sm">
          <section>
            <div className="mb-1 flex items-center gap-2 font-medium"><UserRound size={14} /> Signed in</div>
            <div className="text-ink-700">{user?.name}{user?.email ? ` · ${user.email}` : ''}</div>
            <div className="text-xs text-ink-500">Roles: {user?.roles.join(', ')}{user?.office ? ` · ${user.office} office` : ''}</div>
            {!authConfigured && (
              <label className="mt-2 block text-xs"><span className="label">Demo persona (no single sign-on configured)</span>
                <Select value={user?.id} onChange={(e) => { setDemoPersona(e.target.value); logAudit('sign-in', `Switched demo persona to ${e.target.value}`) }} aria-label="Demo persona">{DEMO_PERSONAS.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.roles.join(', ')})</option>)}</Select>
                <span className="mt-1 block text-ink-500">Campaign approval needs the compliance role; the audit log needs compliance or admin. Set VITE_OIDC_AUTHORITY and VITE_OIDC_CLIENT_ID to use company accounts instead.</span>
              </label>
            )}
            <Button size="sm" className="mt-2" onClick={() => { logAudit('sign-in', 'Signed out'); signOut() }}><LogOut size={13} /> Sign out</Button>
          </section>
          <section>
            <div className="mb-1 flex items-center gap-2 font-medium"><KeyRound size={14} /> Ordnance Survey basemap</div>
            <p className="mb-2 text-xs text-ink-500">Paste an OS Data Hub API key (free tier covers OS Maps API) to replace the OpenStreetMap basemap with OS Light and Road styles. Stored in this browser only.</p>
            <div className="flex gap-2"><Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="OS Data Hub project API key" aria-label="OS API key" /><Button variant="primary" onClick={saveKey}>Apply</Button></div>
          </section>
          <section>
            <div className="mb-1 flex items-center gap-2 font-medium"><MapPinned size={14} /> Demo areas</div>
            <p className="mb-2 text-xs text-ink-500">Synthetic ownership and operators are seated on the real street network in these areas. Everywhere else shows the real national layers only.</p>
            <div className="flex flex-wrap gap-1.5">{DEMO_AREAS.map((a) => <Button key={a.id} size="sm" onClick={() => { requestFlyTo(a.centre[0], a.centre[1], 15); onClose() }}>{a.name}</Button>)}</div>
          </section>
          <section>
            <div className="mb-1 font-medium">Appearance</div>
            <Select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark' | 'system')} aria-label="Theme" className="w-auto"><option value="system">Follow system</option><option value="light">Light</option><option value="dark">Dark</option></Select>
          </section>
          <section>
            <div className="mb-1 flex items-center gap-2 font-medium"><Compass size={14} /> Guided tour</div>
            <Button size="sm" onClick={() => { onClose(); onStartTour() }}>Take the tour again</Button>
          </section>
        </div>
      </div>
    </div>
  )
}
