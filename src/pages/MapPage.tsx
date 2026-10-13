import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import type { Polygon } from 'geojson'
import { MapView } from '@/components/map/MapView'
import { LayerPanel } from '@/components/map/LayerPanel'
import { InfoPanel } from '@/components/panels/InfoPanel'
import { SourcingDrawer } from '@/components/panels/SourcingDrawer'
import { useUi, type Selected } from '@/store/ui'
import { provider } from '@/data'
import { centroid, inBounds } from '@/lib/geo'

export function MapPage() {
  const { entityType, entityId } = useParams()
  const select = useUi((s) => s.select)
  const selected = useUi((s) => s.selected)

  // Sync URL -> selection. When the selection comes from the URL (search, dashboard,
  // alerts, deep link) rather than a map click, fly to the entity if it is off-screen.
  useEffect(() => {
    if (entityType && entityId) {
      const id = decodeURIComponent(entityId)
      const current = useUi.getState().selected
      if (current?.type === entityType && current.id === id) return
      select({ type: entityType as NonNullable<Selected>['type'], id } as Selected)
      ;(async () => {
        let pos: [number, number] | undefined
        if (entityType === 'business') pos = (await provider.getBusiness(id))?.location.coordinates as [number, number] | undefined
        else if (entityType === 'title') {
          const t = await provider.getTitle(id)
          if (t) pos = centroid(t.geometry as Polygon) as [number, number]
        } else if (entityType === 'planning') pos = (await provider.getPlanning(id))?.location.coordinates as [number, number] | undefined
        if (!pos) return
        const { bounds, mapView, requestFlyTo } = useUi.getState()
        if (!bounds || !inBounds(pos, bounds) || mapView.zoom < 15.5) requestFlyTo(pos[0], pos[1], Math.max(mapView.zoom, 17))
      })()
    } else if (!entityType && useUi.getState().selected) {
      select(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entityType, entityId])

  return (
    <div className="relative flex h-full">
      <div className="relative min-w-0 flex-1">
        <MapView />
        <LayerPanel />
      </div>
      {selected && <InfoPanel />}
      <SourcingDrawer />
    </div>
  )
}
