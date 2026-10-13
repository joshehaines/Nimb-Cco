import type { Sector } from '@/data/types'

/**
 * Sector colours. Validated with the dataviz palette validator (light surface):
 * lightness band, chroma floor, CVD separation and normal-vision floor all pass
 * for the eight distinct hues. Leisure, Garden Centre and Other fold into one
 * neutral slot, and Dental/Medical share a hue (distinguished by icon and label).
 */
export const SECTOR_COLOURS: Record<Sector, string> = {
  Pub: '#c2410c',
  Restaurant: '#b45309',
  Hotel: '#2563eb',
  'Care Home': '#7c3aed',
  Childcare: '#db2777',
  Dental: '#0891b2',
  Medical: '#0891b2',
  Pharmacy: '#15803d',
  'Convenience Retail': '#be123c',
  Leisure: '#64748b',
  'Garden Centre': '#64748b',
  Other: '#64748b',
}

export const SECTOR_ICON: Record<Sector, string> = {
  Pub: '🍺',
  Restaurant: '🍽️',
  Hotel: '🛏️',
  'Care Home': '🏥',
  Childcare: '🧸',
  Dental: '🦷',
  Medical: '🩺',
  Pharmacy: '💊',
  'Convenience Retail': '🛒',
  Leisure: '🎳',
  'Garden Centre': '🌿',
  Other: '🏢',
}

export const OWNER_CATEGORY_COLOURS: Record<string, string> = {
  'Limited Company or Public Limited Company': '#2563eb',
  'Private Individual': '#9ca3af',
  'Local Authority': '#15803d',
  'Housing Association': '#0891b2',
  Charity: '#db2777',
  'Overseas Company': '#7c3aed',
  Other: '#64748b',
}

export const STATUS_COLOURS = {
  good: '#15803d',
  warning: '#b45309',
  serious: '#c2410c',
  critical: '#be123c',
  info: '#2563eb',
}
