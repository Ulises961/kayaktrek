import { pixelsPerMetre, projectLngLat, visibleBounds, type MapViewState } from "../map/project-lng-lat"
import { createParticles, stepParticles, type Particle } from "./advection"
import type { VelocityField } from "./velocity"

// One animation frame of the velocity overlay, as pure functions — the Skia component
// only owns the clock and the canvas. Positions are projected locally (see
// project-lng-lat.ts) because this runs for every particle on every frame.

// How long a particle lives, in real seconds, before it respawns elsewhere.
const DEFAULT_LIFE_SECONDS = 8
// Particles this far (px) outside the screen are still drawn, so a streak does not pop in at the edge.
const OFFSCREEN_MARGIN_PX = 16
// Particles live in the screen's area plus this much all round — a margin for streaks that
// begin just off the edge, not a second screen's worth of particles nobody can see.
export const AREA_PADDING_PX = 24
// Each particle drags a trail this many seconds of its own travel behind it, clamped so a
// light breeze still shows and a gale does not smear across the map.
const DEFAULT_TRAIL_SECONDS = 0.35
const MIN_TRAIL_PX = 4
const MAX_TRAIL_PX = 40

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
  return pixelsPerSecondPerMetreSecond / pixelsPerMetre(zoom, latitude)
}

export type AdvanceFrameOptions = {
  pixelsPerSecondPerMetreSecond: number
  lifeSeconds?: number
  trailSeconds?: number
  random?: () => number
}

/**
 * How many particles a screen of this size gets. Web sizes it the same way —
 * leaflet-velocity draws `viewport pixels * particleMultiplier` — so the density a paddler
 * sees does not depend on how big the day's forecast area is.
 */
export function particleCountFor(size: { width: number; height: number }, particleMultiplier: number): number {
  return Math.round(size.width * size.height * particleMultiplier)
}

/** Seeds particles over the ground the screen is showing, not over the whole field. */
export function seedParticles(
  field: VelocityField,
  view: MapViewState,
  size: { width: number; height: number },
  count: number,
  random: () => number = Math.random,
): Particle[] {
  return createParticles(field, count, random, visibleBounds(view, size, AREA_PADDING_PX))
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
    // Keeps the whole population on the screen: one that drifts off its edge respawns on it.
    area: visibleBounds(view, size, AREA_PADDING_PX),
  })

  const trailSeconds = options.trailSeconds ?? DEFAULT_TRAIL_SECONDS
  const segments: Segment[] = []
  for (let i = 0; i < particles.length; i++) {
    const particle = particles[i]
    // stepParticles resets a respawned particle's age to 0, so the age going down is the tell.
    if (particle.age < before[i].age) continue

    const head = projectPoint(view, size, particle)
    const dx = head.x - before[i].x
    const dy = head.y - before[i].y
    const travelled = Math.hypot(dx, dy)
    // Not moving: there is no direction to trail behind it.
    if (travelled === 0 || realDtSeconds <= 0) continue

    // The trail is `trailSeconds` of the particle's own on-screen speed, laid out behind it.
    const trailLength = Math.min(Math.max((travelled / realDtSeconds) * trailSeconds, MIN_TRAIL_PX), MAX_TRAIL_PX)
    const tail = { x: head.x - (dx / travelled) * trailLength, y: head.y - (dy / travelled) * trailLength }
    if (!isOnScreen(tail, size) && !isOnScreen(head, size)) continue
    segments.push([tail, head])
  }
  return segments
}

function projectPoint(view: MapViewState, size: { width: number; height: number }, particle: Particle): ScreenPoint {
  const [x, y] = projectLngLat(view, size, particle.longitude, particle.latitude)
  return { x, y }
}
