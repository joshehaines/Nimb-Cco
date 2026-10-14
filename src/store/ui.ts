import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Alert, AuditEvent, BoundsQuery, Campaign, CrmRecord, PipelineStage, Sector, SourcingFilters, WatchItem } from '@/data/types'
import { DEFAULT_FILTERS } from '@/data/types'

export type BasemapId = 'light' | 'minimal' | 'dark' | 'satellite' | 'hybrid' | 'os-light' | 'os-road'
export type TitleColour = 'none' | 'owner' | 'tenure'
export type LayerKey = 'titles' | 'businesses' | 'poi' | 'buildings' | 'pricePaid' | 'comparables' | 'planning' | 'traffic' | 'footfall' | 'constraints' | 'satellite'
export type Selected =
  | { type: 'title'; id: string }
  | { type: 'business'; id: string }
  | { type: 'planning'; id: string }
  | { type: 'poi'; id: string }
  | { type: 'sale'; id: string }
  | { type: 'traffic'; id: string }
  | { type: 'company'; id: string }
  | { type: 'comparable'; id: string }
  | null

export interface UiState {
  layers: Record<LayerKey, boolean>
  constraintKinds: string[]
  sectorFilter: Sector[]
  selected: Selected
  hovered: Selected
  filters: SourcingFilters
  showFilters: boolean
  mapView: { lon: number; lat: number; zoom: number }
  bounds?: BoundsQuery
  flyTo?: { lon: number; lat: number; zoom?: number; nonce: number }
  watchlist: WatchItem[]
  projects: string[]
  highlightIds: string[]
  highlightLabel?: string
  alertRules: AlertRules
  campaigns: Campaign[]
  theme: 'light' | 'dark' | 'system'
  /** Who did what, newest first (also posted to the API when one is configured). */
  audit: AuditEvent[]
  /** The last CRM export uploaded on the CRM page, kept in memory for de-duplicating exports back to the CRM. */
  crmRecords: CrmRecord[]
  crmRecordsName?: string
  /** Column header overrides per CRM preset and object, e.g. { hubspot: { accounts: { name: 'Company name' } } }. */
  crmTemplates: Record<string, Record<string, Record<string, string>>>
  tourDone: boolean
  osKey?: string
  basemap: BasemapId
  titleColour: TitleColour
  toggleLayer: (k: LayerKey) => void
  setLayer: (k: LayerKey, v: boolean) => void
  setLayers: (patch: Partial<Record<LayerKey, boolean>>) => void
  clearPins: () => void
  setConstraintKinds: (k: string[]) => void
  setSectorFilter: (s: Sector[]) => void
  select: (s: Selected) => void
  hover: (s: Selected) => void
  setFilters: (f: Partial<SourcingFilters>) => void
  resetFilters: () => void
  setShowFilters: (v: boolean) => void
  setMapView: (v: { lon: number; lat: number; zoom: number }, bounds: BoundsQuery) => void
  requestFlyTo: (lon: number, lat: number, zoom?: number) => void
  addWatch: (w: Omit<WatchItem, 'id' | 'addedAt'>) => void
  removeWatch: (id: string) => void
  updateWatch: (id: string, patch: Partial<WatchItem>) => void
  isWatched: (entityType: WatchItem['entityType'], entityId: string) => boolean
  addProject: (p: string) => void
  setHighlight: (ids: string[], label?: string) => void
  setAlertRules: (patch: Partial<AlertRules>) => void
  setTheme: (t: 'light' | 'dark' | 'system') => void
  setStage: (id: string, stage: PipelineStage) => void
  upsertCampaign: (c: Campaign) => void
  removeCampaign: (id: string) => void
  pushAudit: (e: AuditEvent) => void
  clearAudit: () => void
  setCrmRecords: (records: CrmRecord[], name?: string) => void
  setCrmTemplate: (preset: string, object: string, field: string, header: string) => void
  setTourDone: (v: boolean) => void
  setOsKey: (k?: string) => void
  setBasemap: (b: BasemapId) => void
  setTitleColour: (c: TitleColour) => void
}

export interface AlertRules {
  kinds: Alert['kind'][]
  sectors: Sector[]
  watchedOnly: boolean
  radiusM: number
  digest: 'instant' | 'daily' | 'weekly'
  channels: { email: boolean; teams: boolean }
}

export const DEFAULT_ALERT_RULES: AlertRules = {
  kinds: ['Ownership change', 'Planning submitted', 'Planning decided', 'Rating change', 'Registration change', 'Company status', 'Late accounts', 'Lease event', 'New business', 'EPC lodged', 'VOA change'],
  sectors: [],
  watchedOnly: false,
  radiusM: 500,
  digest: 'daily',
  channels: { email: true, teams: false },
}

const newId = () => `W${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

/** Older builds could assign the same id to items added in one tick; give duplicates fresh ids. */
const repairIds = (items: WatchItem[]) => {
  const seen = new Set<string>()
  return items.map((w) => {
    if (seen.has(w.id)) return { ...w, id: newId() }
    seen.add(w.id)
    return w
  })
}

/** Landing state: title plans only. Every pin layer is opt-in from the layer panel. */
export const DEFAULT_LAYERS: Record<LayerKey, boolean> = { titles: true, businesses: false, poi: false, buildings: false, pricePaid: false, comparables: false, planning: false, traffic: false, footfall: false, constraints: false, satellite: false }
/** Layers that put pins or shading on the map (everything except the title plans). */
export const PIN_LAYERS: LayerKey[] = ['businesses', 'poi', 'buildings', 'pricePaid', 'comparables', 'planning', 'traffic', 'footfall', 'constraints']

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      layers: DEFAULT_LAYERS,
      constraintKinds: ['Flood Zone 3', 'Flood Zone 2', 'Conservation Area', 'Listed Building', 'Article 4', 'Green Belt'],
      sectorFilter: [],
      selected: null,
      hovered: null,
      filters: DEFAULT_FILTERS,
      showFilters: false,
      mapView: { lon: -1.5365, lat: 52.2888, zoom: 15.7 },
      watchlist: [],
      projects: ['Midlands care disposals', 'Pubco lease expiries 2027'],
      highlightIds: [],
      alertRules: DEFAULT_ALERT_RULES,
      campaigns: [],
      theme: 'system',
      audit: [],
      crmRecords: [],
      crmTemplates: {},
      tourDone: false,
      osKey: undefined,
      basemap: 'light',
      titleColour: 'none',
      toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
      setLayer: (k, v) => set((s) => ({ layers: { ...s.layers, [k]: v } })),
      setLayers: (patch) => set((s) => ({ layers: { ...s.layers, ...patch } })),
      clearPins: () => set((s) => ({ layers: { ...s.layers, ...Object.fromEntries(PIN_LAYERS.map((k) => [k, false])) } as Record<LayerKey, boolean>, highlightIds: [], highlightLabel: undefined })),
      setConstraintKinds: (constraintKinds) => set({ constraintKinds }),
      setSectorFilter: (sectorFilter) => set({ sectorFilter }),
      select: (selected) => set({ selected }),
      hover: (hovered) => set({ hovered }),
      setFilters: (f) => set((s) => ({ filters: { ...s.filters, ...f } })),
      resetFilters: () => set({ filters: DEFAULT_FILTERS }),
      setShowFilters: (showFilters) => set({ showFilters }),
      setMapView: (mapView, bounds) => set({ mapView, bounds }),
      requestFlyTo: (lon, lat, zoom) => set({ flyTo: { lon, lat, zoom, nonce: Date.now() } }),
      addWatch: (w) =>
        set((s) => (s.watchlist.some((x) => x.entityType === w.entityType && x.entityId === w.entityId) ? s : { watchlist: [{ ...w, id: newId(), addedAt: new Date().toISOString() }, ...s.watchlist] })),
      removeWatch: (id) => set((s) => ({ watchlist: s.watchlist.filter((w) => w.id !== id) })),
      updateWatch: (id, patch) => set((s) => ({ watchlist: s.watchlist.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
      isWatched: (entityType, entityId) => get().watchlist.some((w) => w.entityType === entityType && w.entityId === entityId),
      addProject: (p) => set((s) => (s.projects.includes(p) ? s : { projects: [...s.projects, p] })),
      // Plotting a list on the map switches the demo-business pins on so the highlight is visible.
      setHighlight: (highlightIds, highlightLabel) => set((s) => ({ highlightIds, highlightLabel, layers: highlightIds.length ? { ...s.layers, businesses: true } : s.layers })),
      setAlertRules: (patch) => set((s) => ({ alertRules: { ...s.alertRules, ...patch } })),
      setTheme: (theme) => set({ theme }),
      setStage: (id, stage) => set((s) => ({ watchlist: s.watchlist.map((w) => (w.id === id ? { ...w, stage, stageChangedAt: new Date().toISOString() } : w)) })),
      upsertCampaign: (c) => set((s) => ({ campaigns: s.campaigns.some((x) => x.campaignId === c.campaignId) ? s.campaigns.map((x) => (x.campaignId === c.campaignId ? c : x)) : [c, ...s.campaigns] })),
      removeCampaign: (id) => set((s) => ({ campaigns: s.campaigns.filter((c) => c.campaignId !== id) })),
      pushAudit: (e) => set((s) => ({ audit: [e, ...s.audit].slice(0, 1000) })),
      clearAudit: () => set({ audit: [] }),
      setCrmRecords: (crmRecords, crmRecordsName) => set({ crmRecords, crmRecordsName }),
      setCrmTemplate: (preset, object, field, header) => set((s) => ({ crmTemplates: { ...s.crmTemplates, [preset]: { ...(s.crmTemplates[preset] ?? {}), [object]: { ...((s.crmTemplates[preset] ?? {})[object] ?? {}), [field]: header } } } })),
      setTourDone: (tourDone) => set({ tourDone }),
      setOsKey: (osKey) => set({ osKey: osKey || undefined }),
      setBasemap: (basemap) => set({ basemap }),
      setTitleColour: (titleColour) => set({ titleColour }),
    }),
    {
      name: 'cpi-ui',
      // v2: the map lands pinless (titles only). Older saved layer choices are dropped once so everyone gets the new landing view.
      version: 2,
      migrate: (persisted, version) => {
        const p = (persisted ?? {}) as Record<string, unknown>
        if (version < 2) delete p.layers
        return p
      },
      partialize: (s) => ({ basemap: s.basemap, titleColour: s.titleColour, audit: s.audit, crmTemplates: s.crmTemplates, tourDone: s.tourDone, osKey: s.osKey, layers: s.layers, constraintKinds: s.constraintKinds, mapView: s.mapView, watchlist: s.watchlist, projects: s.projects, filters: s.filters, alertRules: s.alertRules, theme: s.theme, campaigns: s.campaigns }),
      // Tolerate older or partial persisted shapes: fill gaps from defaults instead of crashing.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>
        return {
          ...current,
          ...p,
          layers: { ...current.layers, ...(p.layers ?? {}) },
          filters: { ...DEFAULT_FILTERS, ...(p.filters ?? {}) },
          watchlist: Array.isArray(p.watchlist) ? repairIds(p.watchlist) : current.watchlist,
          projects: Array.isArray(p.projects) ? p.projects : current.projects,
          constraintKinds: Array.isArray(p.constraintKinds) ? p.constraintKinds : current.constraintKinds,
          mapView: p.mapView && Number.isFinite(p.mapView.lon) ? p.mapView : current.mapView,
          highlightIds: [],
          audit: Array.isArray(p.audit) ? p.audit : [],
          crmTemplates: p.crmTemplates && typeof p.crmTemplates === 'object' ? p.crmTemplates : {},
          crmRecords: [],
          tourDone: !!p.tourDone,
          basemap: p.basemap ?? 'light',
          titleColour: p.titleColour ?? 'none',
          theme: p.theme === 'light' || p.theme === 'dark' ? p.theme : 'system',
          campaigns: Array.isArray(p.campaigns) ? p.campaigns : [],
          alertRules: { ...DEFAULT_ALERT_RULES, ...(p.alertRules ?? {}), channels: { ...DEFAULT_ALERT_RULES.channels, ...(p.alertRules?.channels ?? {}) } },
        }
      },
    },
  ),
)
