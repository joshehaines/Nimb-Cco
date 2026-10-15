import { provider } from '@/data'
import { SECTORS, type Sector, type Alert } from '@/data/types'
import { useUi, type BasemapId, type LayerKey, type TitleColour, type MapTool } from '@/store/ui'
import { useAlerts } from '@/store/alerts'
import { useAuth } from '@/auth'
import { blankRule, RULE_PRESETS, type AlertChannel, type AlertFrequency } from '@/lib/alerts'
import { searchHelp } from './help'

/**
 * Everything the assistant can do, as tools. The local engine and the Claude-backed engine both
 * call these, so a tool is the single place an action is defined. Each returns short text plus
 * links the chat renders as buttons. Nothing here is destructive: tools open, show, search,
 * draft and highlight; sending, ordering and exporting stay behind their own buttons.
 */
export interface ToolLink { label: string; to: string }
export interface ToolResult { text: string; links?: ToolLink[] }
export interface ToolContext { nav: (to: string) => void }
export interface ToolDef { name: string; description: string; input_schema: Record<string, unknown>; run: (input: Record<string, unknown>, ctx: ToolContext) => Promise<ToolResult> }

const PAGES: Record<string, { to: string; label: string }> = {
  dashboard: { to: '/', label: 'Dashboard' }, map: { to: '/map', label: 'Map' }, sourcing: { to: '/sourcing', label: 'Sourcing' }, 'my-sites': { to: '/watchlist', label: 'My Sites' }, alerts: { to: '/alerts', label: 'Alerts' }, 'alert-rules': { to: '/alerts/rules', label: 'My alerts' }, channels: { to: '/alerts/channels', label: 'My channels' },
  pipeline: { to: '/pipeline', label: 'Pipeline' }, comparables: { to: '/comparables', label: 'Comparables' }, catchment: { to: '/catchment', label: 'Catchment' }, campaigns: { to: '/campaigns', label: 'Campaigns' }, leases: { to: '/leases', label: 'Lease events' }, 'crm-export': { to: '/crm/export', label: 'Export to CRM' }, 'crm-cleanup': { to: '/crm', label: 'CRM clean-up' },
  documents: { to: '/documents', label: 'Documents' }, 'data-sources': { to: '/admin', label: 'Data sources' }, audit: { to: '/audit', label: 'Audit log' },
}
export const LAYER_NAMES: Record<LayerKey, string> = { titles: 'title plans', businesses: 'businesses', poi: 'Overture places', buildings: 'buildings', pricePaid: 'price paid', comparables: 'sold comparables', planning: 'planning applications', traffic: 'traffic counts', footfall: 'footfall', constraints: 'planning constraints', satellite: 'satellite' }

const sectorFrom = (s?: string): Sector | undefined => {
  if (!s) return undefined
  const t = s.toLowerCase().replace(/s$/, '')
  const map: Record<string, Sector> = { pub: 'Pub', bar: 'Pub', inn: 'Pub', restaurant: 'Restaurant', cafe: 'Restaurant', hotel: 'Hotel', 'care home': 'Care Home', care: 'Care Home', nursing: 'Care Home', childcare: 'Childcare', nursery: 'Childcare', dental: 'Dental', dentist: 'Dental', medical: 'Medical', gp: 'Medical', clinic: 'Medical', vet: 'Medical', pharmacy: 'Pharmacy', chemist: 'Pharmacy', convenience: 'Convenience Retail', retail: 'Convenience Retail', shop: 'Convenience Retail', leisure: 'Leisure', gym: 'Leisure', 'garden centre': 'Garden Centre', garden: 'Garden Centre' }
  return map[t] ?? SECTORS.find((x) => x.toLowerCase() === t)
}
const linkFor = (kind: string, id: string) => (kind === 'company' ? `/companies/${id}` : kind === 'postcode' || kind === 'address' ? '/map' : `/map/${kind}/${encodeURIComponent(id)}`)

export const TOOLS: ToolDef[] = [
  {
    name: 'search',
    description: 'Search addresses, postcodes, title numbers, businesses, companies and planning references. Returns the best matches with links.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run: async ({ query }) => {
      const r = await provider.search(String(query), 6)
      if (!r.length) return { text: `Nothing matched "${query}". Try a postcode, a title number such as WK595975, or part of a business or company name.` }
      return { text: `${r.length} match${r.length === 1 ? '' : 'es'} for "${query}":\n` + r.map((x) => `• ${x.label}${x.sublabel ? ` — ${x.sublabel}` : ''} (${x.kind})`).join('\n'), links: r.map((x) => ({ label: x.label.slice(0, 40), to: linkFor(x.kind, x.id) })) }
    },
  },
  {
    name: 'open_page',
    description: 'Open a page of the app.',
    input_schema: { type: 'object', properties: { page: { type: 'string', enum: Object.keys(PAGES) } }, required: ['page'] },
    run: async ({ page }, ctx) => { const p = PAGES[String(page)]; if (!p) return { text: `No page called ${page}.` }; ctx.nav(p.to); return { text: `Opened ${p.label}.`, links: [{ label: p.label, to: p.to }] } },
  },
  {
    name: 'go_to_place',
    description: 'Move the map to a town, postcode or address.',
    input_schema: { type: 'object', properties: { place: { type: 'string' } }, required: ['place'] },
    run: async ({ place }, ctx) => {
      const r = (await provider.search(String(place), 8)).find((x) => x.location)
      if (!r?.location) return { text: `I could not place "${place}". Try a postcode, a town or a street name.` }
      useUi.getState().requestFlyTo(r.location.coordinates[0], r.location.coordinates[1], r.kind === 'area' ? 13.5 : r.kind === 'postcode' ? 15 : 16.5)
      ctx.nav('/map')
      return { text: `Flying to ${r.label}.`, links: [{ label: 'Map', to: '/map' }] }
    },
  },
  {
    name: 'set_layers',
    description: 'Turn map layers on or off. Keys: titles, businesses (registered businesses), poi (Overture places), buildings, pricePaid, comparables, planning, traffic, footfall, constraints. Pass "all_off" to clear every pin layer.',
    input_schema: { type: 'object', properties: { on: { type: 'array', items: { type: 'string' } }, off: { type: 'array', items: { type: 'string' } }, all_off: { type: 'boolean' } } },
    run: async ({ on, off, all_off }, ctx) => {
      const ui = useUi.getState()
      if (all_off) ui.clearPins()
      for (const k of (on as string[]) ?? []) if (k in LAYER_NAMES) ui.setLayer(k as LayerKey, true)
      for (const k of (off as string[]) ?? []) if (k in LAYER_NAMES) ui.setLayer(k as LayerKey, false)
      ctx.nav('/map')
      const onNames = ((on as string[]) ?? []).map((k) => LAYER_NAMES[k as LayerKey]).filter(Boolean)
      const offNames = ((off as string[]) ?? []).map((k) => LAYER_NAMES[k as LayerKey]).filter(Boolean)
      return { text: [all_off ? 'Cleared every pin layer.' : '', onNames.length ? `Showing ${onNames.join(', ')}.` : '', offNames.length ? `Hid ${offNames.join(', ')}.` : ''].filter(Boolean).join(' ') || 'No layer names I recognise.' }
    },
  },
  {
    name: 'colour_titles',
    description: 'Colour the title plans by owner type or tenure, or make them plain.',
    input_schema: { type: 'object', properties: { mode: { type: 'string', enum: ['none', 'owner', 'tenure'] } }, required: ['mode'] },
    run: async ({ mode }, ctx) => { useUi.getState().setLayer('titles', true); useUi.getState().setTitleColour(mode as TitleColour); ctx.nav('/map'); return { text: mode === 'none' ? 'Titles are plain again.' : `Titles coloured by ${mode === 'owner' ? 'owner type (company, private individual, council, housing association, charity, overseas)' : 'tenure (blue freehold, orange leasehold)'}. The key is in the Active layers card.` } },
  },
  {
    name: 'set_basemap',
    description: 'Change the base map: light (streets), minimal, dark, satellite, hybrid (imagery with labels), os-light, os-road.',
    input_schema: { type: 'object', properties: { basemap: { type: 'string', enum: ['light', 'minimal', 'dark', 'satellite', 'hybrid', 'os-light', 'os-road'] } }, required: ['basemap'] },
    run: async ({ basemap }, ctx) => { useUi.getState().setBasemap(basemap as BasemapId); ctx.nav('/map'); return { text: `Base map set to ${basemap}.` } },
  },
  {
    name: 'find_businesses',
    description: 'Open Sourcing filtered to a sector, optionally distressed operators only, optionally near a place, and plot them on the map.',
    input_schema: { type: 'object', properties: { sector: { type: 'string' }, distressed_only: { type: 'boolean' }, place: { type: 'string' }, tenure: { type: 'string', enum: ['Freehold', 'Leasehold'] } } },
    run: async ({ sector, distressed_only, place, tenure }, ctx) => {
      const s = sectorFrom(sector as string | undefined)
      const ui = useUi.getState()
      ui.setFilters({ sectors: s ? [s] : [], distressOnly: !!distressed_only, tenure: tenure as never })
      ui.setSectorFilter(s ? [s] : [])
      if (place) { const r = (await provider.search(String(place), 8)).find((x) => x.location); if (r?.location) ui.requestFlyTo(r.location.coordinates[0], r.location.coordinates[1], 14.5) }
      ctx.nav('/sourcing')
      return { text: `Sourcing now shows ${distressed_only ? 'distressed ' : ''}${s ? s.toLowerCase() + 's' : 'all sectors'}${tenure ? ` (${String(tenure).toLowerCase()})` : ''}${place ? ` around ${place}` : ''}. Use Plot on map to see them, or Export to CRM.`, links: [{ label: 'Sourcing', to: '/sourcing' }, { label: 'Map', to: '/map' }] }
    },
  },
  {
    name: 'create_alert',
    description: 'Draft an alert rule and open it in the editor for the user to confirm. Use a preset id when one fits (dirty-deals, my-sites, ownership, lease-events, regulator, deal-score, planning, competition) or give kinds/sectors directly.',
    input_schema: { type: 'object', properties: { preset: { type: 'string' }, name: { type: 'string' }, kinds: { type: 'array', items: { type: 'string' } }, sectors: { type: 'array', items: { type: 'string' } }, distressed_only: { type: 'boolean' }, frequency: { type: 'string', enum: ['instant', 'hourly', 'daily', 'weekly'] }, channels: { type: 'array', items: { type: 'string', enum: ['inapp', 'email', 'sms', 'teams'] } }, postcodes: { type: 'array', items: { type: 'string' } } } },
    run: async (input, ctx) => {
      const user = useAuth.getState().user?.id ?? 'demo-agent'
      const preset = RULE_PRESETS.find((p) => p.id === input.preset)
      const sectors = ((input.sectors as string[]) ?? []).map(sectorFrom).filter((x): x is Sector => !!x)
      const rule = blankRule(user, { ...(preset?.patch ?? {}), name: (input.name as string) || preset?.name || 'New alert', tag: preset?.tag, description: preset?.description })
      if (input.kinds) rule.conditions.kinds = (input.kinds as Alert['kind'][]).filter(Boolean)
      if (sectors.length) rule.conditions.sectors = sectors
      if (input.distressed_only !== undefined) rule.conditions.distressOnly = !!input.distressed_only
      if (input.frequency) rule.frequency = input.frequency as AlertFrequency
      if (input.channels) rule.channels = input.channels as AlertChannel[]
      if (Array.isArray(input.postcodes) && input.postcodes.length) rule.scope = { ...rule.scope, mode: 'postcodes', postcodes: (input.postcodes as string[]).map((p) => p.toUpperCase()) }
      useAlerts.getState().upsertRule(rule)
      ctx.nav(`/alerts/rules/${rule.id}`)
      return { text: `Drafted the alert "${rule.name}" and opened it so you can check the conditions, add colleagues and save.`, links: [{ label: 'Open alert', to: `/alerts/rules/${rule.id}` }] }
    },
  },
  {
    name: 'add_to_my_sites',
    description: 'Add a business or title to My Sites (the watchlist) by name, address or title number.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run: async ({ query }) => {
      const r = (await provider.search(String(query), 5)).find((x) => x.kind === 'business' || x.kind === 'title')
      if (!r) return { text: `I could not find a business or title matching "${query}".` }
      useUi.getState().addWatch({ entityType: r.kind as 'business' | 'title', entityId: r.id, label: r.label })
      return { text: `Added ${r.label} to My Sites.`, links: [{ label: 'My Sites', to: '/watchlist' }, { label: r.label.slice(0, 40), to: linkFor(r.kind, r.id) }] }
    },
  },
  {
    name: 'company_portfolio',
    description: 'Open a company (or group) and everything it owns or operates: the portfolio page with plot, export and alert actions.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run: async ({ query }, ctx) => {
      const r = (await provider.search(String(query), 6)).find((x) => x.kind === 'company')
      if (!r) return { text: `No company matched "${query}". Try part of the registered name or the company number.` }
      ctx.nav(`/companies/${r.id}`)
      return { text: `Opened ${r.label}. Plot portfolio highlights every site the group owns or operates; CSV and Alert on portfolio are on the same page.`, links: [{ label: r.label.slice(0, 40), to: `/companies/${r.id}` }] }
    },
  },
  {
    name: 'show_competition',
    description: 'Open a business and run the competition analysis for it.',
    input_schema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
    run: async ({ query }, ctx) => {
      const r = (await provider.search(String(query), 5)).find((x) => x.kind === 'business')
      if (!r) return { text: `No business matched "${query}".` }
      useUi.getState().setPanelRequest('competition')
      useUi.getState().select({ type: 'business', id: r.id })
      ctx.nav(`/map/business/${r.id}`)
      return { text: `Opened ${r.label} with Highlight competition expanded. Press Highlight on map to draw the ring.`, links: [{ label: r.label.slice(0, 40), to: `/map/business/${r.id}` }] }
    },
  },
  {
    name: 'map_tool',
    description: 'Start a map tool: polygon (draw a site and measure its area), line (measure a distance), pin (what is here), streetview (open Google Street View on click), or none.',
    input_schema: { type: 'object', properties: { tool: { type: 'string', enum: ['polygon', 'line', 'pin', 'streetview', 'none'] } }, required: ['tool'] },
    run: async ({ tool }, ctx) => { useUi.getState().setTool(tool as MapTool); ctx.nav('/map'); const hints: Record<string, string> = { polygon: 'Click the corners of the site on the map; double-click to finish and the area appears in m², ft², acres and hectares.', line: 'Click along the route; double-click to finish.', pin: 'Click anywhere on the map and the panel shows the title, businesses, sales and traffic there.', streetview: 'Click a road and Street View opens in a new tab.', none: 'Tool cleared.' }; return { text: hints[String(tool)] } },
  },
  {
    name: 'location_analysis',
    description: 'Open or close the Location Analysis drawer of grouped layers (boundaries, planning, constraints, markets, mobility).',
    input_schema: { type: 'object', properties: { open: { type: 'boolean' } }, required: ['open'] },
    run: async ({ open }, ctx) => { useUi.getState().setLocationOpen(!!open); ctx.nav('/map'); return { text: open ? 'Location Analysis is open on the right.' : 'Closed Location Analysis.' } },
  },
  {
    name: 'help',
    description: 'Explain how a feature works or what a term means (CCOD, INSPIRE, use class, MEES, rateable value, Gazette, deal score, catchment, and so on), from the user guide.',
    input_schema: { type: 'object', properties: { topic: { type: 'string' } }, required: ['topic'] },
    run: async ({ topic }) => { const h = searchHelp(String(topic)); return h ? { text: h.text, links: h.links } : { text: `I do not have a guide entry for "${topic}". Ask about the map, sourcing, alerts, pipeline, comparables, catchment, campaigns, CRM export, or terms like CCOD, MEES and use classes.` } },
  },
  {
    name: 'whats_on_screen',
    description: 'Describe the current map state: layers on, colouring, selection, tool, filters.',
    input_schema: { type: 'object', properties: {} },
    run: async () => {
      const ui = useUi.getState()
      const on = (Object.keys(ui.layers) as LayerKey[]).filter((k) => ui.layers[k] && k !== 'satellite').map((k) => LAYER_NAMES[k])
      return { text: `Layers on: ${on.join(', ') || 'none'}. Titles coloured by ${ui.titleColour === 'none' ? 'nothing (plain)' : ui.titleColour}. Base map ${ui.basemap}. ${ui.selected ? `Selected ${ui.selected.type} ${ui.selected.id}.` : 'Nothing selected.'} ${ui.tool !== 'none' ? `Tool: ${ui.tool}.` : ''} ${ui.analysis ? `Analysis drawn: ${ui.analysis.label}.` : ''} ${ui.drawings.length ? `${ui.drawings.length} drawn shape(s).` : ''} ${ui.watchlist.length} sites watched.`.replace(/\s+/g, ' ') }
    },
  },
]

export const toolByName = (n: string) => TOOLS.find((t) => t.name === n)
/** Tool specs in the shape the Claude Messages API expects. */
export const toolSpecs = () => TOOLS.map(({ name, description, input_schema }) => ({ name, description, input_schema }))
