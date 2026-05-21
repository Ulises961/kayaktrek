"use client"
import { MapContainer, TileLayer } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { Itinerary } from "@/lib/dtos/itinerary"
import type { MapMode } from "./map-top-bar"

type MapCoreProps = {
  itinerary: Itinerary
  mode: MapMode
  distanceUnit: "nm" | "km"
}

export default function MapCore({ itinerary: _itinerary, mode: _mode, distanceUnit: _distanceUnit }: MapCoreProps) {
  return (
    <MapContainer
      center={[43, 13]}
      zoom={6}
      className="w-full h-full"
      zoomControl={true}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
    </MapContainer>
  )
}
