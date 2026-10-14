import { create } from 'zustand'

/**
 * Sign-in. When VITE_OIDC_AUTHORITY and VITE_OIDC_CLIENT_ID are set (Microsoft Entra ID, Okta or
 * any OpenID Connect provider) the app runs the Authorization Code flow with PKCE in the browser,
 * keeps tokens in sessionStorage and sends the access token to the API. Without them the app runs
 * in demo mode with a local persona, so the audit trail and role gates can still be exercised.
 */
export type Role = 'agent' | 'admin' | 'compliance'
export interface User { id: string; name: string; email?: string; office?: string; roles: Role[]; demo: boolean; mustReset?: boolean }

const AUTHORITY = (import.meta.env.VITE_OIDC_AUTHORITY as string | undefined)?.replace(/\/$/, '')
const CLIENT_ID = import.meta.env.VITE_OIDC_CLIENT_ID as string | undefined
const SCOPE = (import.meta.env.VITE_OIDC_SCOPE as string | undefined) ?? 'openid profile email'
const ADMIN_EMAILS = ((import.meta.env.VITE_ADMIN_EMAILS as string | undefined) ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
export const authConfigured = !!(AUTHORITY && CLIENT_ID)
/** Email and password accounts managed inside the platform (VITE_AUTH=local; the API needs LOCAL_AUTH_SECRET). */
export const localAuth = !authConfigured && (import.meta.env.VITE_AUTH as string | undefined) === 'local'
const API_BASE = (import.meta.env.VITE_API_BASE as string | undefined) ?? '/api'

const DEMO_PERSONAS: User[] = [
  { id: 'demo-agent', name: 'Demo agent', email: 'agent@example.internal', office: 'Birmingham', roles: ['agent'], demo: true },
  { id: 'demo-compliance', name: 'Demo compliance officer', email: 'compliance@example.internal', office: 'London', roles: ['agent', 'compliance'], demo: true },
  { id: 'demo-admin', name: 'Demo administrator', email: 'admin@example.internal', office: 'London', roles: ['agent', 'compliance', 'admin'], demo: true },
]
export { DEMO_PERSONAS }

interface AuthState {
  user: User | null
  accessToken?: string
  status: 'idle' | 'loading' | 'signed-in' | 'signed-out' | 'error'
  error?: string
  signIn: () => Promise<void>
  /** Local accounts: returns an error message or null. */
  signInLocal: (email: string, password: string) => Promise<string | null>
  changePassword: (current: string, next: string) => Promise<string | null>
  signOut: () => void
  setDemoPersona: (id: string) => void
  hasRole: (r: Role) => boolean
}

const SS = { verifier: 'cpi-pkce-verifier', tokens: 'cpi-tokens', persona: 'cpi-demo-persona', local: 'cpi-local-session' }

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}
async function pkce() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)))
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  return { verifier, challenge }
}
let discovery: Promise<{ authorization_endpoint: string; token_endpoint: string; end_session_endpoint?: string }> | undefined
const discover = () => (discovery ??= fetch(`${AUTHORITY}/.well-known/openid-configuration`).then((r) => r.json()))

function claimsOf(idToken: string): Record<string, unknown> {
  try {
    return JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}
function userFromClaims(c: Record<string, unknown>): User {
  const email = String(c.email ?? c.preferred_username ?? c.upn ?? '').toLowerCase()
  const claimRoles = ([] as string[]).concat((c.roles as string[]) ?? [], (c.groups as string[]) ?? []).map((r) => r.toLowerCase())
  const roles: Role[] = ['agent']
  if (claimRoles.includes('compliance') || claimRoles.includes('cpi.compliance')) roles.push('compliance')
  if (claimRoles.includes('admin') || claimRoles.includes('cpi.admin') || ADMIN_EMAILS.includes(email)) roles.push('compliance', 'admin')
  return { id: String(c.sub ?? c.oid ?? email), name: String(c.name ?? email), email, office: typeof c.office === 'string' ? c.office : undefined, roles: Array.from(new Set(roles)), demo: false }
}

export const useAuth = create<AuthState>()((set, get) => ({
  user: null,
  status: 'idle',
  hasRole: (r) => !!get().user?.roles.includes(r),
  setDemoPersona: (id) => {
    const u = DEMO_PERSONAS.find((p) => p.id === id) ?? DEMO_PERSONAS[0]
    try {
      sessionStorage.setItem(SS.persona, u.id)
    } catch {
      /* ignore */
    }
    set({ user: u, status: 'signed-in' })
  },
  signInLocal: async (email, password) => {
    set({ status: 'loading', error: undefined })
    try {
      const r = await fetch(`${API_BASE}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) })
      if (!r.ok) {
        const msg = r.status === 401 ? 'Email or password not recognised.' : `Sign-in failed (${r.status}).`
        set({ status: 'signed-out', error: msg })
        return msg
      }
      const { token, user } = (await r.json()) as { token: string; user: { id: string; name: string; email: string; roles: Role[]; office?: string; mustReset: boolean } }
      sessionStorage.setItem(SS.local, JSON.stringify({ token, user }))
      set({ accessToken: token, user: { ...user, demo: false }, status: 'signed-in', error: undefined })
      return null
    } catch (e) {
      const msg = `Cannot reach the sign-in service: ${(e as Error).message}`
      set({ status: 'signed-out', error: msg })
      return msg
    }
  },
  changePassword: async (current, next) => {
    const r = await fetch(`${API_BASE}/auth/password`, { method: 'POST', headers: { 'content-type': 'application/json', ...authHeaders() }, body: JSON.stringify({ current, new: next }) })
    if (!r.ok) return r.status === 401 ? 'Current password not recognised.' : r.status === 400 ? 'Use at least 10 characters.' : `Could not change the password (${r.status}).`
    const { token } = (await r.json()) as { token: string }
    const u = { ...get().user!, mustReset: false }
    sessionStorage.setItem(SS.local, JSON.stringify({ token, user: u }))
    set({ accessToken: token, user: u })
    return null
  },
  signIn: async () => {
    if (localAuth) {
      try {
        const saved = sessionStorage.getItem(SS.local)
        if (saved) {
          const { token, user } = JSON.parse(saved) as { token: string; user: User }
          set({ accessToken: token, user: { ...user, demo: false }, status: 'signed-in' })
          return
        }
      } catch {
        /* ignore */
      }
      set({ user: null, status: 'signed-out' })
      return
    }
    if (!authConfigured) {
      // A persona chosen earlier in this browser signs straight in; otherwise the sign-in page offers the choice.
      // Demo builds always open on the sign-in page: the persona lives in sessionStorage, so a
      // refresh keeps you signed in but a new tab or visit asks again.
      let id: string | null = null
      try {
        id = sessionStorage.getItem(SS.persona)
        localStorage.removeItem(SS.persona)
      } catch {
        /* ignore */
      }
      if (id && DEMO_PERSONAS.some((p) => p.id === id)) get().setDemoPersona(id)
      else set({ user: null, status: 'signed-out' })
      return
    }
    set({ status: 'loading' })
    try {
      const saved = sessionStorage.getItem(SS.tokens)
      if (saved) {
        const t = JSON.parse(saved) as { access_token: string; id_token: string; expires_at: number }
        if (t.expires_at > Date.now() + 30_000) {
          set({ user: userFromClaims(claimsOf(t.id_token)), accessToken: t.access_token, status: 'signed-in' })
          return
        }
      }
      const d = await discover()
      const url = new URL(window.location.href)
      const code = url.searchParams.get('code')
      const redirectUri = `${window.location.origin}${import.meta.env.BASE_URL}`
      if (code) {
        const verifier = sessionStorage.getItem(SS.verifier) ?? ''
        const body = new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirectUri, client_id: CLIENT_ID!, code_verifier: verifier })
        const res = await fetch(d.token_endpoint, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body })
        if (!res.ok) throw new Error(`token exchange failed: ${res.status}`)
        const t = (await res.json()) as { access_token: string; id_token: string; expires_in: number }
        sessionStorage.setItem(SS.tokens, JSON.stringify({ ...t, expires_at: Date.now() + t.expires_in * 1000 }))
        url.searchParams.delete('code')
        url.searchParams.delete('state')
        url.searchParams.delete('session_state')
        window.history.replaceState({}, '', url.toString())
        set({ user: userFromClaims(claimsOf(t.id_token)), accessToken: t.access_token, status: 'signed-in' })
        return
      }
      const { verifier, challenge } = await pkce()
      sessionStorage.setItem(SS.verifier, verifier)
      const auth = new URL(d.authorization_endpoint)
      auth.search = new URLSearchParams({ response_type: 'code', client_id: CLIENT_ID!, redirect_uri: redirectUri, scope: SCOPE, code_challenge: challenge, code_challenge_method: 'S256', state: b64url(crypto.getRandomValues(new Uint8Array(8))) }).toString()
      window.location.assign(auth.toString())
    } catch (e) {
      set({ status: 'error', error: (e as Error).message })
    }
  },
  signOut: () => {
    sessionStorage.removeItem(SS.tokens)
    sessionStorage.removeItem(SS.local)
    try {
      sessionStorage.removeItem(SS.persona)
    } catch {
      /* ignore */
    }
    set({ user: null, accessToken: undefined, status: 'signed-out' })
    if (authConfigured) discover().then((d) => d.end_session_endpoint && window.location.assign(`${d.end_session_endpoint}?post_logout_redirect_uri=${encodeURIComponent(window.location.origin + import.meta.env.BASE_URL)}`))
  },
}))

/** Authorization header for API calls, when signed in through OIDC. */
export function authHeaders(): Record<string, string> {
  const { accessToken, user } = useAuth.getState()
  if (accessToken) return { Authorization: `Bearer ${accessToken}` }
  if (user?.demo) return { 'X-Demo-User': user.id }
  return {}
}
