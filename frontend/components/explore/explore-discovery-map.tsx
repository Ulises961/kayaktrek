"use client"

import { useEffect } from "react"
import L from "leaflet"
import { MapContainer, TileLayer, CircleMarker, Tooltip, useMap, useMapEvents } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { ExploreItem, ExploreBounds } from "@/lib/dtos/itinerary"
import type { RouteData } from "@/lib/itinerary/public-routes"
import { RouteDayLayers } from "@/components/map/route-day-layers"
import { OSM_TILE_URL, OSM_ATTRIBUTION } from "@/lib/map/tiles"

type Props = {
  items: ExploreItem[]
  selectedId: string | null
  selectedRoute: RouteData | null
  boundsEnabled: boolean
  onSelect: (id: string) => void
  onBoundsChange: (bounds: ExploreBounds) => void
}

// Reports the viewport bounds on every user pan/zoom while "filter to map area"
// is enabled. Kept as a child so it can use the react-leaflet map context.
function BoundsWatcher({
  enabled,
  onChange,
}: {
  enabled: boolean
  onChange: (bounds: ExploreBounds) => void
}) {
  const map = useMapEvents({
    moveend() {
      if (!enabled) return
      const b = map.getBounds()
      onChange({
        minLat: b.getSouth(),
        minLng: b.getWest(),
        maxLat: b.getNorth(),
        maxLng: b.getEast(),
      })
    },
  })
  return null
}

// Navigates the map to whichever route is selected: an immediate fly to the item's
// centroid so the user gets feedback right away, refined into a fly-to-bounds once
// the route's polyline has finished loading (selectedRoute arrives after selectedId).
function SelectionFlyTo({
  selectedId,
  selectedRoute,
  items,
}: {
  selectedId: string | null
  selectedRoute: RouteData | null
  items: ExploreItem[]
}) {
  const map = useMap()

  useEffect(() => {
    if (!selectedId) return
    if (selectedRoute && selectedRoute.positions.length > 0) {
      map.flyToBounds(L.latLngBounds(selectedRoute.positions), { padding: [48, 48], maxZoom: 12 })
      return
    }
    const item = items.find((i) => i.id === selectedId)
    if (item?.centroidLat != null && item?.centroidLng != null) {
      map.flyTo([item.centroidLat, item.centroidLng], Math.max(map.getZoom(), 8))
    }
  }, [selectedId, selectedRoute, items, map])

  return null
}

export default function ExploreDiscoveryMap({
  items,
  selectedId,
  selectedRoute,
  boundsEnabled,
  onSelect,
  onBoundsChange,
}: Props) {
  const located = items.filter((i) => i.centroidLat != null && i.centroidLng != null)
  const center: [number, number] = located.length
    ? [located[0].centroidLat!, located[0].centroidLng!]
    : [43, 13]

  return (
    <MapContainer center={center} zoom={5} className="h-full w-full" zoomControl={false}>
      <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
      <BoundsWatcher enabled={boundsEnabled} onChange={onBoundsChange} />
      <SelectionFlyTo selectedId={selectedId} selectedRoute={selectedRoute} items={items} />
      {located.map((item) => {
        const isSelected = selectedId === item.id
        return (
          <CircleMarker
            key={item.id}
            center={[item.centroidLat!, item.centroidLng!]}
            radius={isSelected ? 9 : 6}
            pathOptions={{
              color: isSelected ? "#0ea5e9" : "#10b981",
              fillColor: isSelected ? "#0ea5e9" : "#10b981",
              fillOpacity: 0.85,
              weight: 1,
            }}
            eventHandlers={{ click: () => onSelect(item.id) }}
          >
            <Tooltip>{item.name ?? "Untitled"}</Tooltip>
          </CircleMarker>
        )
      })}
      {selectedRoute && selectedRoute.positions.length > 0 && (
        <RouteDayLayers routes={[selectedRoute]} showPhotos={false} />
      )}
    </MapContainer>
  )
}
