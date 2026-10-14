import type { Business, Company, EPC, Hereditament, Title } from '../data/types'
import { monthsUntil } from './format'

export interface DealScore {
  /** 0 to 100: how likely the site is to transact or need advice in the next 12 to 24 months. */
  score: number
  band: 'High' | 'Medium' | 'Low'
  reasons: string[]
}

/**
 * Transparent, additive "likely to transact" score over the signals the platform already holds.
 * It is a triage aid for agents, not a model: every point is attributable to a reason shown in the UI.
 * Weights are a starting point to be tuned against Christie & Co deal history once real data is loaded.
 */
export function dealScore(b: Business, t?: Title, h?: Hereditament, e?: EPC, operator?: Company, planningOnTitle = 0, now = new Date()): DealScore {
  let score = 0
  const reasons: string[] = []
  const add = (pts: number, why: string) => {
    score += pts
    reasons.push(`${pts > 0 ? '+' : ''}${pts} ${why}`)
  }
  const flags = b.distressFlags
  if (flags.some((f) => /insolven|administr|liquidat|receiver/i.test(f))) add(30, 'insolvency event on the operator')
  if (flags.some((f) => /late accounts|overdue/i.test(f))) add(8, 'accounts overdue at Companies House')
  if (flags.some((f) => /charge/i.test(f))) add(6, 'new charge registered')
  if (flags.some((f) => /regulator|inadequate|requires improvement|fhrs|rating/i.test(f))) add(10, 'adverse regulator or hygiene rating')
  const other = flags.length - reasons.length
  if (other > 0) add(Math.min(12, other * 6), `${other} further distress signal${other > 1 ? 's' : ''}`)
  if (operator && ['administration', 'liquidation', 'receivership'].includes(operator.status)) add(25, `operator company in ${operator.status}`)
  const lease = t?.leases[0]
  if (lease) {
    const m = monthsUntil(lease.expiryDate)
    if (m !== undefined && m <= 24) add(20, `lease expires in ${m} months`)
    else if (m !== undefined && m <= 60) add(10, `lease expires in ${Math.round(m / 12)} years`)
    const brk = lease.parsed?.breakDates?.map((d) => monthsUntil(d)).filter((x): x is number => x !== undefined && x >= 0 && x <= 12)
    if (brk?.length) add(10, 'tenant break within 12 months')
    const review = lease.parsed?.rentReviewDates?.map((d) => monthsUntil(d)).filter((x): x is number => x !== undefined && x >= 0 && x <= 12)
    if (review?.length) add(4, 'rent review within 12 months')
  }
  if (e && ['F', 'G'].includes(e.rating)) add(12, `EPC ${e.rating}: cannot be let without works (MEES)`)
  else if (e && e.rating === 'E') add(4, 'EPC E: at risk under the proposed MEES tightening')
  if (t?.dateProprietorAdded) {
    const years = (now.getTime() - new Date(t.dateProprietorAdded).getTime()) / (365.25 * 86400000)
    if (years >= 20) add(12, `freehold held ${Math.round(years)} years`)
    else if (years >= 12) add(6, `freehold held ${Math.round(years)} years`)
  }
  if (t?.charges?.some((c) => (now.getTime() - new Date(c.date).getTime()) / (365.25 * 86400000) <= 2)) add(5, 'charge registered in the last 2 years')
  if (planningOnTitle > 0) add(5, `${planningOnTitle} planning application${planningOnTitle > 1 ? 's' : ''} on the title`)
  if (h && h.rateableValue > 0 && b.sector === 'Pub' && h.rateableValue < 12000) add(4, 'rateable value under small business threshold (marginal trade)')
  if (t?.pricePaidDate) {
    const years = (now.getTime() - new Date(t.pricePaidDate).getTime()) / (365.25 * 86400000)
    if (years <= 2) add(-15, `sold ${years < 1 ? 'in the last year' : `${Math.round(years)} years ago`}`)
  }
  score = Math.max(0, Math.min(100, Math.round(score)))
  return { score, band: score >= 55 ? 'High' : score >= 30 ? 'Medium' : 'Low', reasons }
}
