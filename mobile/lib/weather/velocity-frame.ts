import { projectLngLat, type MapViewState } from "../map/project-lng-lat"
import { stepParticles, type Particle } from "./advection"
import type { VelocityField } from "./velocity"

// One animation frame of the velocity overlay, as pure functions — the Skia component
// only owns the clock and the canvas. Positions are projected locally (see
// project-lng-lat.ts) because this runs for every particle on every frame.

const EARTH_CIRCUMFERENCE_METRES = 40_075_016.686
// MapLibre's world is 512 logical pixels wide at zoom 0.
const WORLD_PIXELS_AT_ZOOM_0 = 512
// How long a particle lives, in real seconds, before it respawns elsewhere.
const DEFAULT_LIFE_SECONDS = 8
// Particles this far (px) outside the screen are still drawn, so a streak does not pop in at the edge.
const OFFSCREEN_MARGIN_PX = 16

export type ScreenPoint = { x: number; y: number }
export type Segment = [from: ScreenPoint, to: ScreenPoint]

/** Mean wind (or wave) magnitude in m/s over the unmasked cells, 0 if there are none. */
export function meanSpeed(field: VelocityField): number {
  let total = 0
  let cells = 0
  for (let i = 0; i < field.u.length; i++) {
    const u = field.u[i]
    const v = field.v[i]
    if (u === null || v === null) continue
    total += Math.hypot(u, v)
    cells++
  }
  return cells === 0 ? 0 : total / cells
}

/**
 * Seconds of simulated drift per real second. Real wind drift is invisible on a map
 * (5 m/s is a fraction of a pixel per frame), so the simulation is sped up until a
 * 1 m/s flow crosses `pixelsPerSecondPerMetreSecond` screen pixels per second — and
 * that, not the zoom level, stays constant: zooming in slows the simulation to match.
 */
export function simulationTimeScale(zoom: number, latitude: number, pixelsPerSecondPerMetreSecond: number): number {
  const worldPixels = WORLD_PIXELS_AT_ZOOM_0 * 2 ** zoom
  const pixelsPerMetre = worldPixels / (EARTH_CIRCUMFERENCE_METRES * Math.cos((latitude * Math.PI) / 180))
  return pixelsPerSecondPerMetreSecond / pixelsPerMetre
}

export type AdvanceFrameOptions = {
  pixelsPerSecondPerMetreSecond: number
  lifeSeconds?: number
  random?: () => number
}

function isOnScreen(point: ScreenPoint, size: { width: number; height: number }): boolean {
  return (
    point.x >= -OFFSCREEN_MARGIN_PX &&
    point.x <= size.width + OFFSCREEN_MARGIN_PX &&
    point.y >= -OFFSCREEN_MARGIN_PX &&
    point.y <= size.height + OFFSCREEN_MARGIN_PX
  )
}

/**
 * Moves every particle forward by `realDtSeconds` and returns the streak each one drew
 * this frame, in screen pixels. A particle that respawned this frame, or is off the
 * screen, contributes no streak: a respawn is a jump, not a movement.
 */
export function advanceFrame(
  particles: Particle[],
  field: VelocityField,
  view: MapViewState,
  size: { width: number; height: number },
  realDtSeconds: number,
  options: AdvanceFrameOptions,
): Segment[] {
  const scale = simulationTimeScale(view.zoom, view.center[1], options.pixelsPerSecondPerMetreSecond)
  const before = particles.map((particle) => ({
    age: particle.age,
    ...projectPoint(view, size, particle),
  }))

  stepParticles(particles, field, realDtSeconds * scale, {
    maxAgeSeconds: (options.lifeSeconds ?? DEFAULT_LIFE_SECONDS) * scale,
    random: options.random,
  })

  const segments: Segment[] = []
  for (let i = 0; i < particles.length; i++) {
    const particle = particles[i]
    // stepParticles resets a respawned particle's age to 0, so the age going down is the tell.
    if (particle.age < before[i].age) continue
    const from = { x: before[i].x, y: before[i].y }
    const to = projectPoint(view, size, particle)
    if (!isOnScreen(from, size) && !isOnScreen(to, size)) continue
    segments.push([from, to])
  }
  return segments
}

function projectPoint(view: MapViewState, size: { width: number; height: number }, particle: Particle): ScreenPoint {
  const [x, y] = projectLngLat(view, size, particle.longitude, particle.latitude)
  return { x, y }
}
