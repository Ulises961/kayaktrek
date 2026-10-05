import { maskGridToDisc } from "@shared/landing/ambient-wind"
import type { VelocityGridLayer } from "@shared/types/ui"

import { pixelsPerMetre, projectLngLat, type MapViewState } from "../map/project-lng-lat"
import type { VelocityField } from "./velocity"

// The forecast cell: the field is shown inside a disc around the day's route, bounded by a
// dashed ring, rather than across the rectangle of the data (docs/adr/itinerary-frontend.md
// "Forecast cell"). The geometry (`discCell`) and the clipping (`maskGridToDisc`) are web's
// own, imported from frontend/lib/landing/ambient-wind.ts, so the two clients draw the same
// disc over the same day. This file is only the adapter between mobile's VelocityField and
// the grid layers those functions take, plus where the ring falls on a phone's screen.

function toGridLayers(field: VelocityField): VelocityGridLayer[] {
  const { north, south, west, east, nx, ny } = field
  const base = {
    parameterUnit: "m.s-1",
    parameterCategory: 2,
    la1: north,
    la2: south,
    lo1: west,
    lo2: east,
    nx,
    ny,
    dx: nx > 1 ? (east - west) / (nx - 1) : 0,
    dy: ny > 1 ? (north - south) / (ny - 1) : 0,
  }
  return [
    { header: { ...base, parameterNumber: 2, parameterNumberName: "eastward_component" }, data: field.u },
    { header: { ...base, parameterNumber: 3, parameterNumberName: "northward_component" }, data: field.v },
  ]
}

/**
 * The field clipped to a disc (`center` is [latitude, longitude], as web's `discCell` gives
 * it): cells outside are masked, so no particle lives there, and flow fades towards the rim.
 * Cells already masked, such as land in the wave field, stay masked.
 */
export function maskFieldToDisc(field: VelocityField, center: [number, number], radiusKm: number): VelocityField {
  const [east, north] = maskGridToDisc(toGridLayers(field), center, radiusKm)
  return { ...field, u: east.data, v: north.data }
}

/** The disc as drawn on screen: its centre and radius in pixels. */
export function discOnScreen(
  view: MapViewState,
  size: { width: number; height: number },
  center: [number, number],
  radiusKm: number,
): { x: number; y: number; radius: number } {
  const [latitude, longitude] = center
  const [x, y] = projectLngLat(view, size, longitude, latitude)
  return { x, y, radius: radiusKm * 1000 * pixelsPerMetre(view.zoom, latitude) }
}
