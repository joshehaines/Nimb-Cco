import { useEffect, useMemo, useState } from 'react'
import type { Polygon } from 'geojson'
import { provider, type Alert, type Business, type Title } from '@/data'
import { useUi } from '@/store/ui'
import { useAlerts } from '@/store/alerts'
import { useAuth } from '@/auth'
import { dealScore } from '@/lib/dealScore'
import { centroid } from '@/lib/geo'
import { matchRule, type AlertRule, type MatchContext, type MatchResult } from '@/lib/alerts'

/**
 * Loads the alert feed with the context the rule matcher needs (business, title, deal score,
 * watched-site centres) and evaluates every rule against every alert. Shared by the inbox, the
 * rules list and the editor's live preview.
 */
export interface FeedAlert extends Alert { business?: Business; titleRec?: Title; score?: number }

export function useAlertFeed() {
  const [alerts, setAlerts] = useState<FeedAlert[]>([])
  const [loading, setLoading] = useState(true)
  const [siteCentres, setSiteCentres] = useState<Record<string, [number, number]>>({})
  const watchlist = useUi((s) => s.watchlist)
  const user = useAuth((s) => s.user)
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      setLoading(true)
      const raw = await provider.getAlerts()
      const bizIds = Array.from(new Set(raw.map((a) => a.businessId ?? (a.entityType === 'business' ? a.entityId : undefined)).filter((x): x is string => !!x)))
      const titleIds = Array.from(new Set(raw.map((a) => a.titleNumber ?? (a.entityType === 'title' ? a.entityId : undefined)).filter((x): x is string => !!x)))
      const [bizs, titles] = await Promise.all([Promise.all(bizIds.map((id) => provider.getBusiness(id))), Promise.all(titleIds.map((id) => provider.getTitle(id)))])
      const bizMap = new Map(bizIds.map((id, i) => [id, bizs[i]]))
      const titleMap = new Map(titleIds.map((id, i) => [id, titles[i]]))
      const enriched: FeedAlert[] = raw.map((a) => {
        const business = bizMap.get(a.businessId ?? a.entityId)
        const title = titleMap.get(a.titleNumber ?? a.entityId)
        const score = business ? dealScore(business, title).score : undefined
        return { ...a, business, titleRec: title, score, location: a.location ?? business?.location.coordinates as [number, number] | undefined, postcode: a.postcode ?? business?.postcode ?? title?.postcode }
      })
      // centres of watched sites, for radius scopes
      const centres: Record<string, [number, number]> = {}
      await Promise.all(watchlist.map(async (w) => {
        if (w.entityType === 'business') { const b = bizMap.get(w.entityId) ?? (await provider.getBusiness(w.entityId)); if (b) centres[w.entityId] = b.location.coordinates as [number, number] }
        else if (w.entityType === 'title') { const t = titleMap.get(w.entityId) ?? (await provider.getTitle(w.entityId)); if (t) centres[w.entityId] = centroid(t.geometry as Polygon) as [number, number] }
      }))
      if (cancelled) return
      setAlerts(enriched)
      setSiteCentres(centres)
      setLoading(false)
    })()
    return () => { cancelled = true }
  }, [watchlist, tick])

  const ctxFor = useMemo(() => (a: FeedAlert): MatchContext => ({ business: a.business, title: a.titleRec, dealScore: a.score, watchlist, siteCentres, userOffice: user?.office }), [watchlist, siteCentres, user])
  const evaluate = useMemo(() => (rule: AlertRule, list: FeedAlert[] = alerts) => list.map((a) => ({ alert: a, result: matchRule(rule, a, ctxFor(a)) })), [alerts, ctxFor])
  return { alerts, loading, ctxFor, evaluate, reload: () => setTick((t) => t + 1) }
}

/** Matches for every enabled rule, keyed by alert id. */
export function useRuleMatches(alerts: FeedAlert[], evaluate: (r: AlertRule, list?: FeedAlert[]) => { alert: FeedAlert; result: MatchResult }[]) {
  const rules = useAlerts((s) => s.rules)
  return useMemo(() => {
    const byAlert: Record<string, { rule: AlertRule; reasons: string[] }[]> = {}
    const byRule: Record<string, FeedAlert[]> = {}
    for (const r of rules) {
      const hits = evaluate({ ...r, enabled: true }, alerts).filter((x) => x.result.match)
      byRule[r.id] = hits.map((h) => h.alert)
      if (!r.enabled) continue
      for (const h of hits) (byAlert[h.alert.alertId] ??= []).push({ rule: r, reasons: h.result.reasons })
    }
    return { byAlert, byRule, rules }
  }, [rules, alerts, evaluate])
}
