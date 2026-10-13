import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Alert, BoundsQuery, Sector, SourcingFilters, WatchItem } from '@/data/types'
import { DEFAULT_FILTERS } from '@/data/types'

export type LayerKey = 'titles' | 'businesses' | 'planning' | 'traffic' | 'footfall' | 'constraints' | 'satellite'
export type Selected =
  | { type: 'title'; id: string }
  | { type: 'business'; id: string }
  | { type: 'planning'; id: string }
  | { type: 'traffic'; id: string }
  | { type: 'company'; id: string }
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
  toggleLayer: (k: LayerKey) => void
  setLayer: (k: LayerKey, v: boolean) => void
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

export const useUi = create<UiState>()(
  persist(
    (set, get) => ({
      layers: { titles: true, businesses: true, planning: false, traffic: false, footfall: false, constraints: false, satellite: false },
      constraintKinds: ['Flood Zone 3', 'Flood Zone 2', 'Conservation Area', 'Listed Building', 'Article 4', 'Green Belt'],
      sectorFilter: [],
      selected: null,
      hovered: null,
      filters: DEFAULT_FILTERS,
      showFilters: false,
      mapView: { lon: -1.5455, lat: 52.287, zoom: 14.2 },
      watchlist: [],
      projects: ['Midlands care disposals', 'Pubco lease expiries 2027'],
      highlightIds: [],
      alertRules: DEFAULT_ALERT_RULES,
      toggleLayer: (k) => set((s) => ({ layers: { ...s.layers, [k]: !s.layers[k] } })),
      setLayer: (k, v) => set((s) => ({ layers: { ...s.layers, [k]: v } })),
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
        set((s) => (s.watchlist.some((x) => x.entityType === w.entityType && x.entityId === w.entityId) ? s : { watchlist: [{ ...w, id: `W${Date.now()}`, addedAt: new Date().toISOString() }, ...s.watchlist] })),
      removeWatch: (id) => set((s) => ({ watchlist: s.watchlist.filter((w) => w.id !== id) })),
      updateWatch: (id, patch) => set((s) => ({ watchlist: s.watchlist.map((w) => (w.id === id ? { ...w, ...patch } : w)) })),
      isWatched: (entityType, entityId) => get().watchlist.some((w) => w.entityType === entityType && w.entityId === entityId),
      addProject: (p) => set((s) => (s.projects.includes(p) ? s : { projects: [...s.projects, p] })),
      setHighlight: (highlightIds, highlightLabel) => set({ highlightIds, highlightLabel }),
      setAlertRules: (patch) => set((s) => ({ alertRules: { ...s.alertRules, ...patch } })),
    }),
    {
      name: 'cpi-ui',
      partialize: (s) => ({ layers: s.layers, constraintKinds: s.constraintKinds, mapView: s.mapView, watchlist: s.watchlist, projects: s.projects, filters: s.filters, alertRules: s.alertRules }),
      // Tolerate older or partial persisted shapes: fill gaps from defaults instead of crashing.
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<UiState>
        return {
          ...current,
          ...p,
          layers: { ...current.layers, ...(p.layers ?? {}) },
          filters: { ...DEFAULT_FILTERS, ...(p.filters ?? {}) },
          watchlist: Array.isArray(p.watchlist) ? p.watchlist : current.watchlist,
          projects: Array.isArray(p.projects) ? p.projects : current.projects,
          constraintKinds: Array.isArray(p.constraintKinds) ? p.constraintKinds : current.constraintKinds,
          mapView: p.mapView && Number.isFinite(p.mapView.lon) ? p.mapView : current.mapView,
          highlightIds: [],
          alertRules: { ...DEFAULT_ALERT_RULES, ...(p.alertRules ?? {}), channels: { ...DEFAULT_ALERT_RULES.channels, ...(p.alertRules?.channels ?? {}) } },
        }
      },
    },
  ),
)
