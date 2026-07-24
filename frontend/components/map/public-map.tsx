"use client"

import { useEffect } from "react"
import { MapContainer, TileLayer, useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet/dist/leaflet.css"
import type { RouteData } from "@/lib/itinerary/public-routes"
import { RouteDayLayers } from "@/components/map/route-day-layers"
import { OSM_TILE_URL, OSM_ATTRIBUTION } from "@/lib/map/tiles"
import { LivePositionLayer } from "@/components/map/live-position-layer"
import type { LivePosition } from "@/lib/dtos/live-position"

const MAX_FIT_ZOOM = 14

type Props = {
  routes?: RouteData[]
  livePositions?: LivePosition[]
}

// Without this, the map sits at its fallback center/zoom regardless of where the
// route actually is — the day-coloured polylines/markers above still render
// correctly, just compressed into a handful of pixels at the wrong location.
function FitToRoutes({ routes }: { routes: RouteData[] }) {
  const map = useMap()
  useEffect(() => {
    const positions = routes.flatMap((route) => route.positions)
    if (positions.length === 0) return
    map.fitBounds(L.latLngBounds(positions), { padding: [48, 48], maxZoom: MAX_FIT_ZOOM })
  }, [map, routes])
  return null
}

export default function PublicMap({ routes = [], livePositions = [] }: Props) {
  return (
    <MapContainer center={[43, 13]} zoom={5} className="h-full w-full" zoomControl={false}>
      <FitToRoutes routes={routes} />
      <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
      <RouteDayLayers routes={routes} />
      <LivePositionLayer positions={livePositions} />
    </MapContainer>
  )
}
