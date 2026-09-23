// [west, south, east, north] — MapLibre's LngLatBounds order.
export type Bounds = [number, number, number, number]

// The box the itinerary map's camera fits on open. Shared with the offline tile
// download (offline-tiles.ts), which has to cover exactly that view.
export function boundsOf(points: { latitude: number; longitude: number }[]): Bounds | null {
  if (points.length === 0) return null
  let west = points[0].longitude
  let east = points[0].longitude
  let south = points[0].latitude
  let north = points[0].latitude
  for (const point of points) {
    west = Math.min(west, point.longitude)
    east = Math.max(east, point.longitude)
    south = Math.min(south, point.latitude)
    north = Math.max(north, point.latitude)
  }
  // A single point (or a day with no spread) gives MapLibre a zero-area box, which
  // it can't fit a camera to — pad it out to a small neighborhood.
  if (west === east && south === north) {
    const pad = 0.01
    return [west - pad, south - pad, east + pad, north + pad]
  }
  return [west, south, east, north]
}
