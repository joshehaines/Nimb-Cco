/**
 * Record-linkage helpers used by the CRM clean-up module.
 *
 * The production design uses OS Places (UPRN) + Companies House + Splink.
 * These functions provide the same normalisation and scoring in the browser
 * so the workflow is fully usable against the mock reference data today and
 * can be moved server-side unchanged.
 */

const COMPANY_SUFFIXES = [
  'limited',
  'ltd',
  'plc',
  'llp',
  'lp',
  'holdings',
  'group',
  'company',
  'co',
  'uk',
  'the',
  'and',
  '&',
]

const ADDRESS_ABBREVIATIONS: Record<string, string> = {
  rd: 'road',
  st: 'street',
  ave: 'avenue',
  av: 'avenue',
  ln: 'lane',
  dr: 'drive',
  cl: 'close',
  ct: 'court',
  pl: 'place',
  sq: 'square',
  gdns: 'gardens',
  pk: 'park',
  cres: 'crescent',
  ter: 'terrace',
  tce: 'terrace',
  hse: 'house',
  bldg: 'building',
  n: 'north',
  s: 'south',
  e: 'east',
  w: 'west',
  gt: 'great',
  lt: 'little',
  upr: 'upper',
  lwr: 'lower',
  'st.': 'saint',
}

export const UK_POSTCODE_RE = /^(GIR ?0AA|[A-PR-UWYZ][0-9][0-9]?[A-HJKPS-UW]? ?[0-9][ABD-HJLNP-UW-Z]{2}|[A-PR-UWYZ][A-HK-Y][0-9][0-9]?[ABEHMNPRV-Y]? ?[0-9][ABD-HJLNP-UW-Z]{2})$/i

export function normalisePostcode(pc?: string): string | undefined {
  if (!pc) return undefined
  const compact = pc.toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (compact.length < 5 || compact.length > 7) return undefined
  const formatted = `${compact.slice(0, -3)} ${compact.slice(-3)}`
  return UK_POSTCODE_RE.test(formatted) ? formatted : undefined
}

export function extractPostcode(text: string): string | undefined {
  const m = text.toUpperCase().match(/\b([A-PR-UWYZ][A-HK-Y]?[0-9][0-9A-HJKPS-UW]?\s*[0-9][ABD-HJLNP-UW-Z]{2})\b/)
  return m ? normalisePostcode(m[1]) : undefined
}

export function normaliseAddress(addr: string): string {
  const pc = extractPostcode(addr)
  let s = addr.toLowerCase()
  if (pc) s = s.replace(pc.toLowerCase(), '').replace(pc.replace(' ', '').toLowerCase(), '')
  s = s.replace(/[.,;:()'"]/g, ' ').replace(/\s+/g, ' ').trim()
  const tokens = s.split(' ').map((t) => ADDRESS_ABBREVIATIONS[t] ?? t)
  // Collapse "flat 2" / "unit 3" style ordering noise and drop country/county filler.
  const drop = new Set(['england', 'uk', 'united', 'kingdom', 'warwickshire', 'west', 'midlands'])
  return tokens.filter((t) => t && !drop.has(t)).join(' ')
}

export function normaliseCompanyName(name?: string): string {
  if (!name) return ''
  const s = name
    .toLowerCase()
    .replace(/[^a-z0-9& ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return s
    .split(' ')
    .filter((t) => t && !COMPANY_SUFFIXES.includes(t))
    .join(' ')
}

export function normaliseBusinessName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\b(pub|inn|hotel|ltd|limited|nursery|day nursery|care home|nursing home|pharmacy|dental practice|restaurant)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Jaro-Winkler similarity, 0..1. */
export function jaroWinkler(a: string, b: string): number {
  if (a === b) return 1
  if (!a.length || !b.length) return 0
  const matchDistance = Math.floor(Math.max(a.length, b.length) / 2) - 1
  const aMatches = new Array(a.length).fill(false)
  const bMatches = new Array(b.length).fill(false)
  let matches = 0
  for (let i = 0; i < a.length; i++) {
    const start = Math.max(0, i - matchDistance)
    const end = Math.min(i + matchDistance + 1, b.length)
    for (let j = start; j < end; j++) {
      if (bMatches[j] || a[i] !== b[j]) continue
      aMatches[i] = true
      bMatches[j] = true
      matches++
      break
    }
  }
  if (!matches) return 0
  let t = 0
  let k = 0
  for (let i = 0; i < a.length; i++) {
    if (!aMatches[i]) continue
    while (!bMatches[k]) k++
    if (a[i] !== b[k]) t++
    k++
  }
  const m = matches
  const jaro = (m / a.length + m / b.length + (m - t / 2) / m) / 3
  let prefix = 0
  for (let i = 0; i < Math.min(4, a.length, b.length); i++) {
    if (a[i] === b[i]) prefix++
    else break
  }
  return jaro + prefix * 0.1 * (1 - jaro)
}

/** Token set ratio: order-insensitive overlap, 0..1. */
export function tokenSetRatio(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean))
  const tb = new Set(b.split(' ').filter(Boolean))
  if (!ta.size || !tb.size) return 0
  let inter = 0
  for (const t of ta) if (tb.has(t)) inter++
  return (2 * inter) / (ta.size + tb.size)
}

export function similarity(a: string, b: string): number {
  if (!a || !b) return 0
  return Math.max(jaroWinkler(a, b) * 0.6 + tokenSetRatio(a, b) * 0.4, tokenSetRatio(a, b))
}

/** Extract a house number / name token from an address for blocking. */
export function addressKey(addr: string): string {
  const n = normaliseAddress(addr)
  const m = n.match(/^(\d+[a-z]?)\b/)
  return m ? m[1] : n.split(' ')[0] ?? ''
}

export function validCompanyNumber(n?: string): string | undefined {
  if (!n) return undefined
  const s = n.toUpperCase().replace(/\s/g, '')
  if (/^\d{1,8}$/.test(s)) return s.padStart(8, '0')
  if (/^[A-Z]{2}\d{6}$/.test(s)) return s
  return undefined
}
