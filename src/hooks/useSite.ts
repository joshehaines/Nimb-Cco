import { useEffect, useState } from 'react'
import type { Polygon } from 'geojson'
import { provider, type Business, type Company, type Constraint, type EPC, type FootfallCell, type Hereditament, type LeaseSummary, type PlanningApplication, type Title, type TrafficCount } from '@/data'
import { centroid } from '@/lib/geo'
import type { PricePaidRow } from '@/data/real'

export interface SiteBundle {
  title: Title
  businesses: Business[]
  hereditaments: Hereditament[]
  epcs: EPC[]
  planning: PlanningApplication[]
  nearbyPlanning: PlanningApplication[]
  constraints: Constraint[]
  traffic: TrafficCount[]
  footfall: FootfallCell[]
  leases: LeaseSummary[]
  /** HM Land Registry price paid rows within 150 m (real where collected). */
  pricePaidNear: (PricePaidRow & { distanceM: number })[]
  proprietorCompanies: Company[]
  operatorCompanies: Company[]
  centre: [number, number]
}

/** Loads everything the info panel and the report need for one title. */
export function useSite(titleNumber?: string, refreshKey = 0) {
  const [bundle, setBundle] = useState<SiteBundle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!titleNumber) {
      setBundle(null)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    ;(async () => {
      try {
        const title = await provider.getTitle(titleNumber)
        if (!title) throw new Error(`Title ${titleNumber} not found`)
        const c = centroid(title.geometry as Polygon) as [number, number]
        const [businesses, hereditaments, epcs, planning, nearbyPlanning, constraints, traffic, footfall, leases, pricePaidNear] = await Promise.all([
          provider.getBusinessesForTitle(titleNumber),
          provider.getHereditamentsForTitle(titleNumber),
          provider.getEpcsForTitle(titleNumber),
          provider.getPlanningForTitle(titleNumber),
          provider.getPlanningForTitle(titleNumber, 250),
          provider.getConstraintsForTitle(titleNumber),
          provider.getTrafficNear(c[0], c[1], 600),
          provider.getFootfallNear(c[0], c[1], 220),
          provider.getLeasesForTitle(titleNumber),
          provider.getPricePaidNear(c[0], c[1], 150, { limit: 12 }).catch(() => []),
        ])
        const propNums = title.proprietors.map((p) => p.companyNumber).filter((x): x is string => !!x)
        const opNums = businesses.map((b) => b.operatorCompanyNumber).filter((x): x is string => !!x)
        const [proprietorCompanies, operatorCompanies] = await Promise.all([
          Promise.all(propNums.map((n) => provider.getCompany(n))).then((xs) => xs.filter((x): x is Company => !!x)),
          Promise.all(opNums.map((n) => provider.getCompany(n))).then((xs) => xs.filter((x): x is Company => !!x)),
        ])
        if (!cancelled) setBundle({ title, businesses, hereditaments, epcs, planning, nearbyPlanning: nearbyPlanning.filter((p) => !p.titleNumbers.includes(titleNumber)), constraints, traffic, footfall, leases, pricePaidNear, proprietorCompanies, operatorCompanies, centre: c })
      } catch (e) {
        if (!cancelled) setError((e as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [titleNumber, refreshKey])
  return { bundle, loading, error }
}
