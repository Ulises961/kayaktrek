"use client"
import { useMemo } from "react"
import { Circle, Marker, Popup } from "react-leaflet"
import L from "leaflet"
import type { HazardDiamondPosition } from "@/lib/dtos/hazard-diamond"

// A fixed, non-diamond-specific radius for the halo drawn around every
// position-only pin — not a real zone-of-validity (the endpoint never
// returns one, see the comment on hazardPositionIconHtml below), just a
// visual cue that the flagged area is approximate, not a pinpoint.
export const HAZARD_HALO_RADIUS_M = 500

// A small, muted diamond — position AND type only, ever. This layer never
// carries a name, note, rate, or direction: it exists so a paddler sees
// "something is known here, and it's a wind/tidal hazard" without the app
// publishing or vouching for anyone else's safety data (docs/adr/features.md
// "Revision (M27): position-only diamond sharing"). The kind is not private —
// it's already the only field this endpoint returns — so it gets the same
// glyph language as the owning trip's own diamonds (a wind glyph for "wind",
// a plain diamond for "tidal"), just muted instead of colour-coded, and with
// no rate/direction/name content layered on. No edit/delete affordance —
// never owned by the viewer's session.
// Same 22x22 footprint AND same per-kind colour language as WindDiamondMarker/
// TidalDiamondMarker's own glyphs — --notice-bg/--notice-border for wind (the
// same amber a katabatic marker gets when it's yours), the same slate
// (#94a3b8) TidalDiamondMarker already uses for a diamond with no rate data
// for tidal, so this pin reads as "the same kind of thing, elsewhere" rather
// than a flat grey placeholder. Only the whole glyph's opacity is dropped, so
// it still visibly recedes behind a diamond this trip owns.
function hazardBorderColor(kind: HazardDiamondPosition["kind"]): string {
  return kind === "wind" ? "var(--notice-border)" : "#94a3b8"
}

export function hazardPositionIconHtml(kind: HazardDiamondPosition["kind"]): string {
  const fill = kind === "wind" ? "var(--notice-bg)" : "white"
  const border = hazardBorderColor(kind)
  const glyph =
    kind === "wind"
      ? `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="${border}" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
        <path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" />
        <path d="M12.8 19.6A2 2 0 1 0 14 16H2" />
      </svg>
    </div>`
      : ""
  return `<div style="position:relative;width:22px;height:22px;opacity:0.6;">
    <div style="position:absolute;top:1px;left:1px;width:20px;height:20px;transform:rotate(45deg);background:${fill};border:2px solid ${border};box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>
    ${glyph}
  </div>`
}

const HAZARD_TYPE_TITLE: Record<HazardDiamondPosition["kind"], string> = {
  wind: "Wind hazard — Unverified",
  tidal: "Tidal race hazard — Unverified",
}

const HAZARD_TYPE_FLAG: Record<HazardDiamondPosition["kind"], string> = {
  wind: "A paddler flagged the area for possible katabatic winds.",
  tidal: "A paddler flagged the area for possible tidal races.",
}

const VERIFY_CAPTION = "Exercise caution and verify independently."

type HazardPositionMarkerProps = {
  position: HazardDiamondPosition
}

export function HazardPositionMarker({ position }: HazardPositionMarkerProps) {
  const latLng = useMemo<[number, number]>(() => [position.lat, position.lng], [position])

  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: hazardPositionIconHtml(position.kind),
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -11],
      }),
    [position.kind],
  )

  return (
    <>
      <Circle
        center={latLng}
        radius={HAZARD_HALO_RADIUS_M}
        pathOptions={{
          color: hazardBorderColor(position.kind),
          weight: 1,
          opacity: 0.35,
          fillOpacity: 0.05,
        }}
        interactive={false}
      />
      <Marker position={latLng} icon={icon}>
        <Popup>
          <div className="min-w-44">
            <p className="text-foreground text-sm font-semibold">
              {HAZARD_TYPE_TITLE[position.kind]}
            </p>
            <p className="text-muted-foreground mt-1 text-[11px]">
              {HAZARD_TYPE_FLAG[position.kind]}
            </p>
            <p className="text-muted-foreground text-[11px]">{VERIFY_CAPTION}</p>
          </div>
        </Popup>
      </Marker>
    </>
  )
}
