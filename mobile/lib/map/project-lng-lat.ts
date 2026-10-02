// A synchronous longitude/latitude -> screen pixel projection for a MapLibre view,
// for drawing things in step with the map that change every frame (the M35 velocity
// particles). `mapRef.project()` is correct but asynchronous — a native round trip
// per call — so it cannot place a thousand particles sixty times a second. This does
// the same Web Mercator arithmetic locally from the view state MapLibre reports in
// its region events.
//
// Assumes pitch 0: a tilted map's perspective is not modelled, so callers hide
// whatever they draw while `pitch` is above zero rather than draw it in the wrong place.

export type MapViewState = {
  /** [longitude, latitude] of the screen centre. */
  center: [number, number]
  zoom: number
  /** Compass bearing, in degrees, of the direction pointing up the screen. */
  bearing: number
  pitch: number
}

// MapLibre's world is 512 logical pixels wide at zoom 0.
const TILE_SIZE = 512

function mercatorX(longitude: number, worldSize: number): number {
  return ((longitude + 180) / 360) * worldSize
}

function mercatorY(latitude: number, worldSize: number): number {
  const sine = Math.sin((latitude * Math.PI) / 180)
  // Clamped just inside the poles, where Mercator runs off to infinity.
  const clamped = Math.min(Math.max(sine, -0.9999), 0.9999)
  return (0.5 - Math.log((1 + clamped) / (1 - clamped)) / (4 * Math.PI)) * worldSize
}

/** The screen position, in pixels from the top-left, of a coordinate. */
export function projectLngLat(
  view: MapViewState,
  size: { width: number; height: number },
  longitude: number,
  latitude: number,
): [number, number] {
  const worldSize = TILE_SIZE * 2 ** view.zoom
  const dx = mercatorX(longitude, worldSize) - mercatorX(view.center[0], worldSize)
  const dy = mercatorY(latitude, worldSize) - mercatorY(view.center[1], worldSize)

  // Turn the world anticlockwise by the bearing, so the bearing direction ends up on top.
  const radians = (view.bearing * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const x = dx * cos + dy * sin
  const y = -dx * sin + dy * cos

  return [size.width / 2 + x, size.height / 2 + y]
}
