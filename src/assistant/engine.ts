import { TOOLS, toolByName, type ToolContext, type ToolResult } from './tools'
import { SECTORS } from '@/data/types'
import { RULE_PRESETS } from '@/lib/alerts'

/**
 * Local assistant: turns plain English into a tool call without a model. It covers the asks
 * staff make most (find, show, go to, colour, alert me, who competes, how do I). When the API
 * has an Anthropic key the remote engine takes over and uses the same tools with real reasoning.
 */
export interface Plan { tool: string; input: Record<string, unknown>; say?: string }

const SECTOR_WORDS = 'pubs?|bars?|inns?|restaurants?|caf[eé]s?|hotels?|care homes?|nursing homes?|care|childcare|nurser(?:y|ies)|dentists?|dental|medical|gps?|clinics?|vets?|pharmac(?:y|ies)|chemists?|convenience|retail|shops?|leisure|gyms?|garden centres?'
const LAYER_WORDS: [RegExp, string][] = [
  [/title plans?|titles|ownership/i, 'titles'], [/demo business|demo operators?|synthetic/i, 'businesses'], [/real business|overture|dots/i, 'poi'], [/buildings?|footprints?/i, 'buildings'], [/price paid|sales|sold prices?/i, 'pricePaid'], [/comparables?|comps/i, 'comparables'], [/planning/i, 'planning'], [/traffic/i, 'traffic'], [/footfall/i, 'footfall'], [/constraints?|flood|listed|green belt|conservation/i, 'constraints'],
]

export function interpret(text: string): Plan | null {
  const t = text.trim()
  const l = t.toLowerCase()
  if (!t) return null
  if (/^(hi|hello|hey|thanks|thank you|cheers)\b/.test(l)) return { tool: '__greet', input: {} }
  if (/^(help|what can you do|\?)$/.test(l)) return { tool: '__capabilities', input: {} }
  if (/what('s| is) (on|showing)|what am i looking at|current (map|view)/.test(l)) return { tool: 'whats_on_screen', input: {} }

  // map tools
  if (/street ?view/.test(l)) return { tool: 'map_tool', input: { tool: 'streetview' } }
  if (/measure|distance|how far/.test(l)) return { tool: 'map_tool', input: { tool: 'line' } }
  if (/draw|site area|polygon|acreage|how big is/.test(l)) return { tool: 'map_tool', input: { tool: 'polygon' } }
  if (/drop a pin|what('s| is) here|what is at/.test(l)) return { tool: 'map_tool', input: { tool: 'pin' } }
  if (/location analysis/.test(l)) return { tool: 'location_analysis', input: { open: !/close|hide/.test(l) } }

  // layers and look
  if (/colou?r.*(owner|proprietor)/.test(l)) return { tool: 'colour_titles', input: { mode: 'owner' } }
  if (/colou?r.*tenure|freehold.*leasehold/.test(l)) return { tool: 'colour_titles', input: { mode: 'tenure' } }
  if (/plain titles|remove colou?r|uncolou?r/.test(l)) return { tool: 'colour_titles', input: { mode: 'none' } }
  const bm = l.match(/\b(satellite|aerial|imagery|hybrid|dark|minimal|grey|streets?|os light|os road|light)\b/)
  if (bm && /map|base|view|switch|show|change/.test(l)) { const w = bm[1]; return { tool: 'set_basemap', input: { basemap: /aerial|imagery/.test(w) ? 'satellite' : w === 'grey' ? 'minimal' : /^streets?$/.test(w) ? 'light' : w.replace(' ', '-') } } }
  if (/^(clear|hide|remove|turn off) (all|every|the) (pins?|layers?|dots)/.test(l) || /empty map|pinless/.test(l)) return { tool: 'set_layers', input: { all_off: true } }
  const layerHit = LAYER_WORDS.filter(([re]) => re.test(l)).map(([, k]) => k)
  if (layerHit.length && /\b(show|turn on|enable|add|display|hide|turn off|remove|disable|toggle)\b/.test(l) && !/alert|sourcing|find/.test(l)) {
    const off = /\b(hide|turn off|remove|disable)\b/.test(l)
    return { tool: 'set_layers', input: off ? { off: layerHit } : { on: layerHit } }
  }

  // alerts
  if (/\b(alert|notify|tell me|let me know|watch for|email me|text me)\b/.test(l)) {
    const input: Record<string, unknown> = {}
    const sec = l.match(new RegExp(`\\b(${SECTOR_WORDS})\\b`, 'g'))
    if (sec) input.sectors = sec
    if (/dirty|distress|administrat|gazette|insolven|winding|receiver|liquidat|charge/.test(l)) input.preset = 'dirty-deals'
    else if (/lease/.test(l)) input.preset = 'lease-events'
    else if (/ownership|sold|sale|transfer/.test(l)) input.preset = 'ownership'
    else if (/cqc|ofsted|rating|regulator|enforcement|inspect/.test(l)) input.preset = 'regulator'
    else if (/planning/.test(l)) input.preset = 'planning'
    else if (/competit|open(s|ing) near/.test(l)) input.preset = 'competition'
    else if (/score|likely to transact/.test(l)) input.preset = 'deal-score'
    else if (/my sites|watched/.test(l)) input.preset = 'my-sites'
    if (/\btext|sms\b/.test(l)) input.channels = ['inapp', 'email', 'sms']
    if (/teams/.test(l)) input.channels = ['inapp', 'email', 'teams']
    if (/instant|straight away|immediately|as soon as/.test(l)) input.frequency = 'instant'
    else if (/weekly/.test(l)) input.frequency = 'weekly'
    else if (/daily|digest|each morning/.test(l)) input.frequency = 'daily'
    const pcs = t.match(/\b[A-Z]{1,2}\d[A-Z\d]?\b/g)
    if (pcs) input.postcodes = pcs
    return { tool: 'create_alert', input }
  }

  // competition, watchlist
  const comp = l.match(/(?:competition|competitors?|who competes with|rivals?)(?: for| of| around| near)?\s+(.+)$/)
  if (comp) return { tool: 'show_competition', input: { query: comp[1].replace(/[?.!]$/, '') } }
  const watch = l.match(/(?:add|save|put)\s+(.+?)\s+(?:to|in|into)\s+(?:my sites|watchlist|the pipeline|pipeline)/)
  if (watch) return { tool: 'add_to_my_sites', input: { query: watch[1] } }

  // sector finds
  const secMatch = l.match(new RegExp(`\\b(distressed |struggling |failing )?(${SECTOR_WORDS})\\b(?:\\s+(?:in|near|around|at)\\s+([a-z &']+?))?(?:\\s+(?:that|which|with|for sale|freehold|leasehold)|[?.!]|$)`))
  if (secMatch && /find|show|list|search|source|where|any|which|all|give me|looking for|get me|distressed|freehold|leasehold/.test(l)) {
    const input: Record<string, unknown> = { sector: secMatch[2], distressed_only: !!secMatch[1] || /distress|struggling|administrat|dirty/.test(l) }
    if (secMatch[3]) input.place = secMatch[3].trim()
    if (/freehold/.test(l)) input.tenure = 'Freehold'
    if (/leasehold/.test(l)) input.tenure = 'Leasehold'
    return { tool: 'find_businesses', input }
  }

  // navigation
  const go = l.match(/^(?:go to|take me to|fly to|zoom to|show me|navigate to|open)\s+(.+?)[?.!]?$/)
  if (go) {
    const target = go[1]
    const page = pageFor(target)
    if (page) return { tool: 'open_page', input: { page } }
    if (/leamington|warwick|bristol|birmingham|london|manchester|leeds|^[a-z]{1,2}\d/.test(target) || /\d/.test(target)) return { tool: 'go_to_place', input: { place: target } }
    return { tool: 'search', input: { query: target } }
  }
  const page = pageFor(l)
  if (page && /\b(open|show|go|take|where)\b/.test(l)) return { tool: 'open_page', input: { page } }

  // explicit search / explain
  const find = l.match(/^(?:find|search(?: for)?|look up|lookup|locate|where is)\s+(.+?)[?.!]?$/)
  if (find) return { tool: 'search', input: { query: find[1] } }
  if (/^(what (is|are|does)|explain|how (do|does|can) i|how to|what's|whats|define|meaning of|tell me about)/.test(l)) return { tool: 'help', input: { topic: t.replace(/^(what (is|are|does) (an? |the )?|explain |how (do|does|can) i |how to |what's |whats |define |meaning of |tell me about )/i, '').replace(/[?.!]$/, '') } }
  // title numbers, postcodes, company numbers go straight to search
  if (/^[A-Z]{1,3}\d{3,}$/i.test(t) || /^[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}$/i.test(t) || /^\d{8}$/.test(t)) return { tool: 'search', input: { query: t } }
  // anything with a capitalised name or 2+ words: search
  if (t.split(/\s+/).length >= 2 || /[A-Z]/.test(t)) return { tool: 'search', input: { query: t } }
  return null
}

function pageFor(s: string): string | null {
  const m: [RegExp, string][] = [[/dashboard|home/, 'dashboard'], [/\bmap\b/, 'map'], [/sourcing|site finding/, 'sourcing'], [/my sites|watchlist/, 'my-sites'], [/alert rules|my alerts/, 'alert-rules'], [/channels/, 'channels'], [/alerts?|inbox/, 'alerts'], [/pipeline|deals/, 'pipeline'], [/comparables?|comps/, 'comparables'], [/catchment/, 'catchment'], [/campaigns?|letters/, 'campaigns'], [/lease events?|leases/, 'leases'], [/export.*crm|crm export/, 'crm-export'], [/crm clean|clean-?up|crm/, 'crm-cleanup'], [/documents?/, 'documents'], [/data sources?|admin/, 'data-sources'], [/audit/, 'audit']]
  const hit = m.find(([re]) => re.test(s))
  return hit ? hit[1] : null
}

export const CAPABILITIES = `I can:
• find things: "find The Copper Kettle", "WK595975", "CV32 4AB", a company name
• move the map: "go to Bristol", "satellite view", "colour titles by owner", "show price paid and traffic", "clear all pins"
• source: "distressed care homes in Bristol", "freehold pubs"
• alerts: "alert me when a pub goes into administration", "text me about CQC downgrades"
• analyse: "who competes with The Leam Ferry", "draw a site area", "street view", "what's here"
• explain: "what is CCOD", "how do I export to the CRM", "what does the deal score mean"`

export async function runLocal(text: string, ctx: ToolContext): Promise<ToolResult & { tool?: string }> {
  const plan = interpret(text)
  if (!plan) return { text: `I did not catch that. ${CAPABILITIES}` }
  if (plan.tool === '__greet') return { text: 'Hello. Ask me to find a site, change the map, set up an alert or explain a term.' }
  if (plan.tool === '__capabilities') return { text: CAPABILITIES }
  const tool = toolByName(plan.tool)
  if (!tool) return { text: `I did not catch that. ${CAPABILITIES}` }
  const r = await tool.run(plan.input, ctx)
  return { ...r, tool: plan.tool }
}

export const SUGGESTIONS = ['Distressed care homes in Bristol', 'Alert me when a pub goes into administration', 'Colour titles by owner', 'Who competes with The Leam Ferry?', 'What is CCOD?', 'Draw a site area']
export const sectorList = SECTORS.filter((s) => s !== 'Other')
export const presetIds = RULE_PRESETS.map((p) => p.id)
export { TOOLS }
