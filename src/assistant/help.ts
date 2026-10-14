import guide from '../../docs/USER-GUIDE.md?raw'

/** The user guide, split into sections, plus a glossary, searched by keyword for the assistant's help tool. */
interface Section { title: string; body: string; to?: string }

const ROUTE_FOR: Record<string, string> = {
  'finding a property or operator': '/map', 'reading the map': '/map', 'the info panel': '/map', sourcing: '/sourcing', 'my sites and alerts': '/alerts', pipeline: '/pipeline', comparables: '/comparables', catchment: '/catchment', campaigns: '/campaigns', appraisal: '/pipeline',
  'signing in, roles and settings': '/', 'export to crm': '/crm/export', 'audit log': '/audit', 'lease events': '/leases', 'crm clean-up': '/crm', 'company pages': '/sourcing', 'documents and data sources': '/documents', 'licences in one line each': '/admin',
}

const sections: Section[] = guide
  .split(/\n## /)
  .slice(1)
  .map((chunk) => {
    const [title, ...rest] = chunk.split('\n')
    return { title: title.trim(), body: rest.join('\n').replace(/\*\*/g, '').trim(), to: ROUTE_FOR[title.trim().toLowerCase()] }
  })

export const GLOSSARY: Record<string, string> = {
  ccod: 'CCOD is HM Land Registry\'s Commercial and Corporate Ownership Data: every title owned by a UK company, free to download monthly. Its licence forbids using it to market goods or services to the owner, so the platform blocks CCOD-only recipients from campaigns and CRM export until the official register is bought.',
  ocod: 'OCOD is the Overseas Companies Ownership Data set from HM Land Registry: titles owned by companies registered outside the UK. Same licence terms as CCOD.',
  inspire: 'INSPIRE polygons are the free title extents HM Land Registry publishes for England and Wales. They show the shape of each registered freehold title but not the owner; the owner comes from CCOD, OCOD or the purchased register.',
  'use class': 'Use classes are the planning categories for how a building may be used in England. Since September 2020 shops, cafés, offices, clinics, nurseries and gyms sit in Class E; pubs, hot-food takeaways and cinemas are sui generis; hotels are C1 and care homes C2. The info panel shows the class before and after 2020.',
  mees: 'MEES is the Minimum Energy Efficiency Standard: a non-domestic property needs an EPC of E or better to be let, with a proposed rise to C by 2030. The EPC row flags F and G ratings.',
  'rateable value': 'Rateable value (RV) is the VOA\'s estimate of a property\'s annual rental value, the basis for business rates. Christie uses it as a quick proxy for trading size; the RV multiple is one of the comparable metrics.',
  gazette: 'The Gazette is the official public record. Notices of intention to appoint administrators, winding-up petitions, liquidations and strike-offs appear there first, which is why Gazette notices are a core dirty-deal signal.',
  'deal score': 'The likely-to-transact score (0 to 100) adds up signals that precede a sale: distress on the operator, late accounts, a lease event within 12 months, a regulator downgrade, a recent ownership change nearby, high RV against a weak EPC. High is 55 and above. Every point is listed in the reasons.',
  catchment: 'Catchment counts people and competitors within a radius of a site: population, households, age bands, affluence, deprivation decile, same-sector supply and the ratios that matter per sector, such as care beds per 100 people aged 85 and over.',
  'dirty deal': 'A dirty deal is a distressed opportunity: an operator in administration, with a winding-up petition, late accounts, a regulator enforcement notice or a lender charge. The Alerts page tracks them; the Dirty deals preset catches the signals as they land.',
  overture: 'Overture Maps is an open data set of places, buildings and roads built from Meta, Microsoft and OpenStreetMap contributions. The real-business dots and building footprints come from it under the CDLA-Permissive licence.',
  'price paid': 'Price Paid Data is HM Land Registry\'s record of every sale in England and Wales since 1995: price, date, address, tenure and whether the property is residential or other (non-residential and mixed). Positions are approximate until an address gazetteer is licensed.',
  'street view': 'Pick the yellow person on the map toolbar, then click a road: Google Street View opens at that spot in a new tab.',
  measure: 'Pick the ruler on the map toolbar to measure a distance, or the pentagon to draw a site and read its area in square metres, square feet, acres and hectares. Double-click to finish; Esc cancels.',
}

export function searchHelp(topic: string): { text: string; links?: { label: string; to: string }[] } | null {
  const q = topic.toLowerCase().trim()
  const g = Object.keys(GLOSSARY).find((k) => q.includes(k) || k.includes(q))
  if (g) return { text: GLOSSARY[g] }
  const words = q.split(/\W+/).filter((w) => w.length > 2)
  let best: { s: Section; score: number } | null = null
  for (const s of sections) {
    const hay = `${s.title} ${s.body}`.toLowerCase()
    const score = words.reduce((n, w) => n + (s.title.toLowerCase().includes(w) ? 3 : 0) + (hay.split(w).length - 1), 0)
    if (score > 0 && (!best || score > best.score)) best = { s, score }
  }
  if (!best) return null
  const para = best.s.body.split('\n\n').find((p) => words.some((w) => p.toLowerCase().includes(w))) ?? best.s.body.split('\n\n')[0]
  return { text: `${best.s.title}: ${para.replace(/^- /gm, '• ').slice(0, 900)}`, links: best.s.to ? [{ label: best.s.title, to: best.s.to }] : undefined }
}
