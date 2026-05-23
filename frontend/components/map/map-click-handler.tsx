"use client"
import { useMapEvents } from "react-leaflet"
import type { MapMode } from "./map-top-bar"

type MapClickHandlerProps = {
  mode: MapMode
  onMapClick: (lat: number, lng: number) => Promise<void>
}

export function MapClickHandler({ mode, onMapClick }: MapClickHandlerProps) {
  useMapEvents({
    click(e) {
      if (mode === "drop") {
        onMapClick(e.latlng.lat, e.latlng.lng)
      }
    },
  })
  return null
}
