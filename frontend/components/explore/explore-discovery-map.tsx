"use client"

import {
  MapContainer,
  TileLayer,
  Polyline,
  CircleMarker,
  Tooltip,
  useMapEvents,
} from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { ExploreItem, ExploreBounds } from "@/lib/dtos/itinerary"
import type { RouteData } from "@/lib/itinerary/public-routes"

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
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      <BoundsWatcher enabled={boundsEnabled} onChange={onBoundsChange} />
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
        <Polyline
          positions={selectedRoute.positions}
          pathOptions={{ color: "#0ea5e9", weight: 4, opacity: 0.85 }}
        />
      )}
    </MapContainer>
  )
}
