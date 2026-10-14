import { useUi } from '@/store/ui'
import { useAuth } from '@/auth'
import { provider } from '@/data'

export type { AuditEvent, AuditKind } from '@/data/types'
import type { AuditEvent, AuditKind } from '@/data/types'

/** Record who did what. Kept locally (last 1,000 events) and, when the API is in use, posted to the audit log. */
export function logAudit(kind: AuditKind, summary: string, extra: Partial<Omit<AuditEvent, 'id' | 'at' | 'userId' | 'userName' | 'kind' | 'summary'>> = {}) {
  const u = useAuth.getState().user
  const e: AuditEvent = { id: `A${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`, at: new Date().toISOString(), userId: u?.id ?? 'anonymous', userName: u?.name ?? 'Anonymous', kind, summary, ...extra }
  useUi.getState().pushAudit(e)
  provider.recordAudit?.(e).catch(() => undefined)
  return e
}
