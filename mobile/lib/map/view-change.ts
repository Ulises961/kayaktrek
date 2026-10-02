import type { MapViewState } from "./project-lng-lat"

// Shared by everything drawn over the map that has to wait for a gesture to finish: the
// wind particles and the swell dashes both take themselves away while the view moves and
// come back once it has been still for this long.

/** How long the view must stand still before an overlay comes back. Web waits 320 ms. */
export const VIEW_SETTLE_MS = 320

// Smaller than this is the map reporting the same view again, not movement.
const ZOOM_EPSILON = 1e-3
const CENTER_EPSILON_DEGREES = 1e-6
const BEARING_EPSILON_DEGREES = 0.05

/** Whether the map has moved between two reports of its view. */
export function viewChanged(before: MapViewState, after: MapViewState): boolean {
  return (
    Math.abs(before.zoom - after.zoom) > ZOOM_EPSILON ||
    Math.abs(before.center[0] - after.center[0]) > CENTER_EPSILON_DEGREES ||
    Math.abs(before.center[1] - after.center[1]) > CENTER_EPSILON_DEGREES ||
    Math.abs(before.bearing - after.bearing) > BEARING_EPSILON_DEGREES
  )
}
