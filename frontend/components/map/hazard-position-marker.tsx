"use client"
import { useMemo } from "react"
import { Marker, Popup } from "react-leaflet"
import L from "leaflet"
import type { HazardDiamondPosition } from "@/lib/dtos/hazard-diamond"

// A small, muted, generic pin — position only, ever. This layer never carries
// a name, note, rate, or direction: it exists so a paddler sees "something is
// known here" without the app publishing or vouching for anyone else's
// safety data (docs/adr/features.md "Revision (M27): position-only diamond
// sharing"). No edit/delete affordance — never owned by the viewer's session.
export function hazardPositionIconHtml(): string {
  return `<div style="width:12px;height:12px;border-radius:50%;background:var(--muted-foreground);opacity:0.55;border:1px solid white;box-shadow:0 1px 2px rgba(0,0,0,0.3);"></div>`
}

type HazardPositionMarkerProps = {
  position: HazardDiamondPosition
}

export function HazardPositionMarker({ position }: HazardPositionMarkerProps) {
  const latLng = useMemo<[number, number]>(() => [position.lat, position.lng], [position])

  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: hazardPositionIconHtml(),
        iconSize: [12, 12],
        iconAnchor: [6, 6],
        popupAnchor: [0, -6],
      }),
    [],
  )

  return (
    <Marker position={latLng} icon={icon}>
      <Popup>
        <div className="min-w-44">
          <p className="text-foreground text-xs">
            A hazard marker exists here — details are private to another trip.
          </p>
          <p className="text-muted-foreground mt-1 text-xs">Verify independently.</p>
        </div>
      </Popup>
    </Marker>
  )
}
