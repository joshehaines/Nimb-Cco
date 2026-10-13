import { format, formatDistanceToNowStrict, parseISO, differenceInMonths } from 'date-fns'

export const gbp = (n?: number, opts: { compact?: boolean } = {}) => {
  if (n === undefined || n === null || Number.isNaN(n)) return '—'
  if (opts.compact) {
    if (Math.abs(n) >= 1_000_000) return `£${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}m`
    if (Math.abs(n) >= 1_000) return `£${Math.round(n / 1_000)}k`
  }
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 0 }).format(n)
}

export const num = (n?: number, dp = 0) =>
  n === undefined || n === null || Number.isNaN(n) ? '—' : new Intl.NumberFormat('en-GB', { maximumFractionDigits: dp }).format(n)

export const sqm = (n?: number) => (n === undefined ? '—' : `${num(n)} m²`)
export const sqft = (n?: number) => (n === undefined ? '—' : `${num(n * 10.7639)} sq ft`)

export const dateShort = (iso?: string) => {
  if (!iso) return '—'
  try {
    return format(parseISO(iso), 'd MMM yyyy')
  } catch {
    return iso
  }
}

export const ago = (iso?: string) => {
  if (!iso) return '—'
  try {
    return `${formatDistanceToNowStrict(parseISO(iso))} ago`
  } catch {
    return iso
  }
}

export const monthsUntil = (iso?: string) => {
  if (!iso) return undefined
  try {
    return differenceInMonths(parseISO(iso), new Date())
  } catch {
    return undefined
  }
}

export const pct = (n?: number, dp = 0) => (n === undefined ? '—' : `${(n * 100).toFixed(dp)}%`)

export const titleCase = (s: string) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => (w.length > 2 || ['st', 'rd'].includes(w) ? w[0]?.toUpperCase() + w.slice(1) : w))
    .join(' ')

export const truncate = (s: string, n = 80) => (s.length > n ? s.slice(0, n - 1) + '…' : s)
