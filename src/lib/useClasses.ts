import type { Sector } from '@/data/types'

/**
 * Planning use classes for a trading business, England (Use Classes Order 1987 as amended
 * 1 September 2020). "Old" is the class the premises would have carried before September 2020,
 * "new" is today's class. Several Christie sectors fall into Class E; pubs, hot-food takeaways,
 * cinemas, live-music venues and the like are sui generis.
 */
export interface UseClass { description: string; oldClass: string; newClass: string }

const BY_SECTOR: Record<Sector, UseClass> = {
  Pub: { description: 'Drinking establishment (public house, wine bar)', oldClass: 'A4', newClass: 'Sui Generis' },
  Restaurant: { description: 'Restaurant / café (sale of food and drink for consumption on the premises)', oldClass: 'A3', newClass: 'E(b)' },
  Hotel: { description: 'Hotel, boarding or guest house', oldClass: 'C1', newClass: 'C1' },
  'Care Home': { description: 'Residential institution (care home, nursing home)', oldClass: 'C2', newClass: 'C2' },
  Childcare: { description: 'Creche, day nursery or day centre', oldClass: 'D1', newClass: 'E(f)' },
  Dental: { description: 'Medical or health services (dental practice)', oldClass: 'D1', newClass: 'E(e)' },
  Medical: { description: 'Medical or health services (clinic, GP, veterinary)', oldClass: 'D1', newClass: 'E(e)' },
  Pharmacy: { description: 'Shop / retail (pharmacy)', oldClass: 'A1', newClass: 'E(a)' },
  'Convenience Retail': { description: 'Shop / retail (convenience store, post office)', oldClass: 'A1', newClass: 'E(a)' },
  Leisure: { description: 'Indoor sport, recreation or fitness', oldClass: 'D2', newClass: 'E(d)' },
  'Garden Centre': { description: 'Shop / retail (garden centre)', oldClass: 'A1', newClass: 'E(a)' },
  Other: { description: 'Commercial, business and service', oldClass: '—', newClass: 'E' },
}

/** Sub-sector refinements where the class differs from the sector default. */
const BY_SUB: Record<string, Partial<UseClass>> = {
  'Pub with rooms': { description: 'Drinking establishment with letting bedrooms', oldClass: 'A4 / C1', newClass: 'Sui Generis / C1' },
  'Hot food takeaway': { description: 'Hot food takeaway', oldClass: 'A5', newClass: 'Sui Generis' },
  Cinema: { description: 'Cinema', oldClass: 'D2', newClass: 'Sui Generis' },
  'Outdoor sport': { description: 'Outdoor sport or recreation', oldClass: 'D2', newClass: 'F2(c)' },
}

export function useClassFor(sector: Sector, subSector?: string): UseClass {
  const base = BY_SECTOR[sector] ?? BY_SECTOR.Other
  return subSector && BY_SUB[subSector] ? { ...base, ...BY_SUB[subSector] } : base
}

/** Best-effort class for a VOA hereditament description (e.g. "Shop and premises"). */
export function useClassForDescription(description: string): UseClass {
  const d = description.toLowerCase()
  const pick = (uc: UseClass, label?: string) => ({ ...uc, description: label ?? uc.description })
  if (/public house|pub\b|bar and premises|wine bar/.test(d)) return pick(BY_SECTOR.Pub)
  if (/restaurant|caf[eé]|coffee/.test(d)) return pick(BY_SECTOR.Restaurant)
  if (/hotel|guest house|boarding|inn\b/.test(d)) return pick(BY_SECTOR.Hotel)
  if (/care home|nursing home|residential home/.test(d)) return pick(BY_SECTOR['Care Home'])
  if (/nursery|cr[eè]che|day centre/.test(d)) return pick(BY_SECTOR.Childcare)
  if (/dental|surgery|clinic|health centre|veterinary/.test(d)) return pick(BY_SECTOR.Medical)
  if (/pharmacy|chemist/.test(d)) return pick(BY_SECTOR.Pharmacy)
  if (/garden centre/.test(d)) return pick(BY_SECTOR['Garden Centre'])
  if (/gym|leisure|fitness|sports|swimming|bowling/.test(d)) return pick(BY_SECTOR.Leisure)
  if (/takeaway|hot food/.test(d)) return { description: 'Hot food takeaway', oldClass: 'A5', newClass: 'Sui Generis' }
  if (/office/.test(d)) return { description: 'Office', oldClass: 'B1(a)', newClass: 'E(g)(i)' }
  if (/warehouse|storage|store and premises|depot/.test(d)) return { description: 'Storage or distribution', oldClass: 'B8', newClass: 'B8' }
  if (/workshop|factory|industrial/.test(d)) return { description: 'General industrial', oldClass: 'B2', newClass: 'B2' }
  if (/land\b|car park|yard/.test(d)) return { description: description, oldClass: '—', newClass: '—' }
  if (/shop|retail|showroom|kiosk|salon|hairdress|betting|bank/.test(d)) return { description: description.replace(/ and premises$/i, ''), oldClass: 'A1', newClass: 'E(a)' }
  if (/flat|house|dwelling|maisonette|bungalow/.test(d)) return { description: 'Dwellinghouse', oldClass: 'C3', newClass: 'C3' }
  return { description: description, oldClass: '—', newClass: '—' }
}
