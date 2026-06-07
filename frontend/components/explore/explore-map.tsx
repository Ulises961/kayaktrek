"use client"

import { MapContainer, TileLayer, Polyline } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { RouteData } from "@/lib/itinerary/public-routes"

const ROUTE_COLORS = [
  "#0ea5e9", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444",
  "#06b6d4", "#84cc16", "#f97316", "#ec4899", "#6366f1",
]

type Props = {
  routes: RouteData[]
  selectedId: string | null
}

export default function ExploreMap({ routes, selectedId }: Props) {
  const hasRoutes = routes.some((r) => r.positions.length > 0)
  const center: [number, number] = hasRoutes
    ? routes[0].positions[0]
    : [43, 13]

  return (
    <MapContainer
      center={center}
      zoom={5}
      className="w-full h-full"
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {routes.map((route, i) => {
        if (route.positions.length === 0) return null
        const isSelected = selectedId === route.id
        const isOther = selectedId !== null && !isSelected
        return (
          <Polyline
            key={route.id}
            positions={route.positions}
            pathOptions={{
              color: ROUTE_COLORS[i % ROUTE_COLORS.length],
              weight: isSelected ? 5 : 3,
              opacity: isOther ? 0.25 : 0.8,
            }}
          />
        )
      })}
    </MapContainer>
  )
}
