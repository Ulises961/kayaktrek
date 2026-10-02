import { pixelsPerMetre, projectLngLat, visibleBounds, type MapViewState } from "../map/project-lng-lat"
import { sampleField } from "./advection"
import type { ScreenPoint } from "./velocity-frame"
import type { VelocityField } from "./velocity"

// Swell is not drawn as moving particles. Each data point shows ONE dash at a time; the
// dash fades in and out where it is, and the next one appears a fixed distance further along
// the direction the swell runs, so crests seem to march across the field while nothing slides.
// Neighbouring points are a little out of step with each other, so the pattern ripples
// through the field as a wave would rather than blinking in unison.
//
// A regular lattice blinking in step reads as a grid of lights, not as a sea, so it is
// deliberately irregular (see "Chaos" below): points are nudged off their grid positions, run a
// little fast or slow, and each cycle every dash lands, sizes and angles itself a little
// differently, or is skipped. None of it uses Math.random: it is a hash of the point and the
// cycle, so every frame agrees with the last and a pan does not reshuffle the pattern.
//
// This file is the pure part: which points there are (the lattice, built once the view has
// settled) and which dash is showing at a given moment (per frame). The Skia component only
// owns the clock and the canvas.

// There is no right value for the look constants below: they are a matter of how it reads on a
// sea chart, tuned by eye, and the chaos below makes the result forgiving of them.
/** How many positions a point's dash visits before it starts again from the point itself. */
export const SWELL_STEPS = 4
/** How long one dash takes to fade in and out. */
export const SWELL_STEP_SECONDS = 1.2
/** How far along the flow the next dash appears, in screen pixels. */
export const SWELL_STEP_PIXELS = 16
export const SWELL_DASH_PIXELS = 9

// Chaos. SWELL_CHAOS scales every kind of irregularity below at once: 0 is the regular lattice
// marching in step, 1 is as irregular as these limits allow. The limits are how far each
// thing may stray.
export const SWELL_CHAOS = 1
/** How far a point may be moved off its grid position, each way, as a fraction of the node spacing. */
export const SWELL_POSITION_JITTER = 0.5
/** How far a point's phase may be put out, each way, in cycles — on top of the ripple along the flow. */
export const SWELL_PHASE_JITTER = 0.25
/** How much faster or slower than the others a point may run, as a fraction. Drifts them apart over time. */
export const SWELL_RATE_VARIATION = 0.15
/** How much the step between a cycle's dashes may vary from one cycle to the next, as a fraction. */
export const SWELL_STEP_VARIATION = 0.4
/** How far a cycle's dashes may sit to the side of their point, each way, in pixels. */
export const SWELL_LATERAL_WOBBLE_PIXELS = 4
/** How much a cycle's dash length may vary, as a fraction. */
export const SWELL_LENGTH_VARIATION = 0.35
/** How far a cycle's dashes may turn off the flow's direction, each way, in degrees. */
export const SWELL_DIRECTION_WOBBLE_DEGREES = 14
/** The chance that a point sits out a whole cycle. */
export const SWELL_SKIP_PROBABILITY = 0.2

// The lattice keeps its points between these on screen: closer is a crowd, further leaves too
// little in the field to read. Spacing is halved or doubled until it is under the maximum,
// which leaves it above half of it — so the minimum follows from the maximum.
export const SWELL_MAX_SPACING_PIXELS = 72
export const SWELL_MIN_SPACING_PIXELS = SWELL_MAX_SPACING_PIXELS / 2
// Points this far (px) outside the screen are kept, so a dash does not pop in at the edge.
export const SWELL_VISIBLE_PADDING_PIXELS = 80
const OFFSCREEN_MARGIN_PIXELS = 16
/** Below this a dash is too faint to be worth drawing. */
export const SWELL_MIN_ALPHA = 0.02
const METRES_PER_DEGREE_LATITUDE = 111_320
// How far (m) to look along the flow to find its direction on screen.
const DIRECTION_PROBE_METRES = 50
// A point's phase moves on by one full cycle every this many node spacings along the flow.
const PHASE_NODE_SPACINGS = SWELL_STEPS
const GRID_POINT_TOLERANCE = 1e-6

export type SwellNode = {
  latitude: number
  longitude: number
  /** 0..1: how strong the flow is here compared with the strongest in the field; fades at the disc's rim. */
  strength: number
  /** 0..1: where in its cycle this point is at time zero, offset along the flow so dashes ripple. */
  phase: number
  /** The direction the swell runs on screen, as a unit vector. */
  direction: { x: number; y: number }
  /** What the point's randomness is a hash of: unique to the point, and the same wherever the map is panned. */
  seed: number
  /** How fast this point runs through its cycle compared with a regular one (1). */
  rate: number
}

export type SwellDash = { from: ScreenPoint; to: ScreenPoint; alpha: number }

// A deterministic stand-in for Math.random: the same (seed, salt) always gives the same number in
// [0, 1), and different ones give numbers that look unrelated. An integer hash (the murmur3
// finaliser), so a pan or a re-render never reshuffles anything.
function unit(seed: number, salt: number): number {
  let hash = (seed ^ Math.imul(salt + 1, 0x9e3779b1)) >>> 0
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b)
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35)
  return ((hash ^ (hash >>> 16)) >>> 0) / 4294967296
}

/** A number in [-1, 1) from the same hash. */
function signed(seed: number, salt: number): number {
  return unit(seed, salt) * 2 - 1
}

// What each thing a point's randomness decides is hashed with, so they are unrelated to each other.
const SALT_POSITION_LATITUDE = 1
const SALT_POSITION_LONGITUDE = 2
const SALT_PHASE = 3
const SALT_RATE = 4
// Per cycle: these are added to the cycle number (times CYCLE_SALTS) so every cycle differs.
const CYCLE_SALTS = 8
const CYCLE_SKIP = 0
const CYCLE_STEP = 1
const CYCLE_LATERAL = 2
const CYCLE_LENGTH = 3
const CYCLE_ANGLE = 4
const CYCLE_SALT_BASE = 100

function strongestSpeed(field: VelocityField): number {
  let strongest = 0
  for (let i = 0; i < field.u.length; i++) {
    const u = field.u[i]
    const v = field.v[i]
    if (u !== null && v !== null) strongest = Math.max(strongest, Math.hypot(u, v))
  }
  return strongest
}

// A node that sits exactly on a data point takes that point's own value. The bilinear
// sampler refuses to answer if any of the four cells around a position is masked — even one
// with no weight — which would drop a node just because a neighbouring point is land.
function valueAt(field: VelocityField, latitude: number, longitude: number): [number, number] | null {
  const column = ((longitude - field.west) / (field.east - field.west)) * (field.nx - 1)
  const row = ((field.north - latitude) / (field.north - field.south)) * (field.ny - 1)
  const nearestColumn = Math.round(column)
  const nearestRow = Math.round(row)
  const onGridPoint =
    Math.abs(column - nearestColumn) < GRID_POINT_TOLERANCE &&
    Math.abs(row - nearestRow) < GRID_POINT_TOLERANCE &&
    nearestColumn >= 0 &&
    nearestColumn < field.nx &&
    nearestRow >= 0 &&
    nearestRow < field.ny
  if (onGridPoint) {
    const index = nearestRow * field.nx + nearestColumn
    const u = field.u[index]
    const v = field.v[index]
    return u === null || v === null ? null : [u, v]
  }
  return sampleField(field, latitude, longitude)
}

function flowDirectionOnScreen(
  view: MapViewState,
  size: { width: number; height: number },
  latitude: number,
  longitude: number,
  u: number,
  v: number,
): { x: number; y: number } {
  const speed = Math.hypot(u, v)
  const probeLatitude = latitude + ((v / speed) * DIRECTION_PROBE_METRES) / METRES_PER_DEGREE_LATITUDE
  const probeLongitude =
    longitude +
    ((u / speed) * DIRECTION_PROBE_METRES) / (METRES_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180))
  const [x0, y0] = projectLngLat(view, size, longitude, latitude)
  const [x1, y1] = projectLngLat(view, size, probeLongitude, probeLatitude)
  const length = Math.hypot(x1 - x0, y1 - y0)
  return { x: (x1 - x0) / length, y: (y1 - y0) / length }
}

/**
 * The points a swell dash is drawn at. They are the field's own data points when those are a
 * comfortable distance apart on screen; zoomed far in they are filled in between (the field
 * is interpolated), and zoomed far out they are thinned, so they are always between 36 and
 * 72 px apart. The lattice is anchored to the field's corner, so it does not shift when the
 * map is panned, and only points on or near the screen are kept.
 *
 * With `chaos` above 0 the points are not on that lattice exactly: each is nudged by up to
 * SWELL_POSITION_JITTER of the spacing (never out of the field), put out of step by up to
 * SWELL_PHASE_JITTER, and given a rate a little off 1. What each point does is a hash of its
 * lattice position, so it is the same every time and unchanged by panning.
 */
export function swellLattice(
  field: VelocityField,
  view: MapViewState,
  size: { width: number; height: number },
  chaos: number = SWELL_CHAOS,
): SwellNode[] {
  if (field.nx < 2 || field.ny < 2) return []

  const centreLatitude = (field.north + field.south) / 2
  const metresPerDegreeLongitude = METRES_PER_DEGREE_LATITUDE * Math.cos((centreLatitude * Math.PI) / 180)
  const gridStepLongitude = (field.east - field.west) / (field.nx - 1)
  const gridStepLatitude = (field.north - field.south) / (field.ny - 1)
  const gridSpacingMetres = Math.min(
    gridStepLongitude * metresPerDegreeLongitude,
    gridStepLatitude * METRES_PER_DEGREE_LATITUDE,
  )
  const gridSpacingPixels = gridSpacingMetres * pixelsPerMetre(view.zoom, centreLatitude)

  // Nodes per data-point spacing, a power of two: >1 fills in, <1 thins out.
  const refinementExponent = Math.ceil(Math.log2(gridSpacingPixels / SWELL_MAX_SPACING_PIXELS))
  const refinement = 2 ** refinementExponent
  const stepLongitude = gridStepLongitude / refinement
  const stepLatitude = gridStepLatitude / refinement
  const nodeSpacingMetres = gridSpacingMetres / refinement

  const bounds = visibleBounds(view, size, SWELL_VISIBLE_PADDING_PIXELS)
  const lastColumn = Math.floor((field.east - field.west) / stepLongitude + GRID_POINT_TOLERANCE)
  const lastRow = Math.floor((field.north - field.south) / stepLatitude + GRID_POINT_TOLERANCE)
  const firstColumn = Math.max(0, Math.ceil((bounds.west - field.west) / stepLongitude - GRID_POINT_TOLERANCE))
  const endColumn = Math.min(lastColumn, Math.floor((bounds.east - field.west) / stepLongitude + GRID_POINT_TOLERANCE))
  const firstRow = Math.max(0, Math.ceil((field.north - bounds.north) / stepLatitude - GRID_POINT_TOLERANCE))
  const endRow = Math.min(lastRow, Math.floor((field.north - bounds.south) / stepLatitude + GRID_POINT_TOLERANCE))

  const strongest = strongestSpeed(field)
  if (strongest === 0) return []

  const nodes: SwellNode[] = []
  for (let row = firstRow; row <= endRow; row++) {
    const latitude = field.north - row * stepLatitude
    for (let column = firstColumn; column <= endColumn; column++) {
      const longitude = field.west + column * stepLongitude
      const flow = valueAt(field, latitude, longitude)
      if (flow === null) continue
      const [u, v] = flow
      const speed = Math.hypot(u, v)
      if (speed < 1e-6) continue

      // How far along the flow this point is, in metres from the field's south-west corner.
      const eastMetres = (longitude - field.west) * metresPerDegreeLongitude
      const northMetres = (latitude - field.south) * METRES_PER_DEGREE_LATITUDE
      const alongMetres = (eastMetres * u + northMetres * v) / speed
      const cycles = alongMetres / (PHASE_NODE_SPACINGS * nodeSpacingMetres)

      // Unique to this lattice position (and refinement, which changes what a position is), and
      // the same wherever the map is panned, so nothing about a point shifts under a pan.
      const seed =
        (Math.imul(row + 1, 73856093) ^ Math.imul(column + 1, 19349663) ^ Math.imul(refinementExponent + 32, 83492791)) >>> 0

      // The flow, strength and direction are those of the grid position; only where the dash is
      // drawn, when it is, and how fast it runs are nudged. Kept inside the field.
      const jitteredLatitude = Math.min(
        field.north,
        Math.max(field.south, latitude + signed(seed, SALT_POSITION_LATITUDE) * SWELL_POSITION_JITTER * chaos * stepLatitude),
      )
      const jitteredLongitude = Math.min(
        field.east,
        Math.max(field.west, longitude + signed(seed, SALT_POSITION_LONGITUDE) * SWELL_POSITION_JITTER * chaos * stepLongitude),
      )
      const phase = cycles + signed(seed, SALT_PHASE) * SWELL_PHASE_JITTER * chaos

      nodes.push({
        latitude: jitteredLatitude,
        longitude: jitteredLongitude,
        strength: Math.min(1, speed / strongest),
        phase: phase - Math.floor(phase),
        direction: flowDirectionOnScreen(view, size, latitude, longitude, u, v),
        seed,
        rate: 1 + signed(seed, SALT_RATE) * SWELL_RATE_VARIATION * chaos,
      })
    }
  }
  return nodes
}

function isOnScreen(point: ScreenPoint, size: { width: number; height: number }): boolean {
  return (
    point.x >= -OFFSCREEN_MARGIN_PIXELS &&
    point.x <= size.width + OFFSCREEN_MARGIN_PIXELS &&
    point.y >= -OFFSCREEN_MARGIN_PIXELS &&
    point.y <= size.height + OFFSCREEN_MARGIN_PIXELS
  )
}

/**
 * The dashes showing at `nowSeconds`: one per node at most. A node's cycle is SWELL_STEPS steps
 * long; in each step its dash fades in and out in place, at a position one SWELL_STEP_PIXELS
 * further along the flow than the last step's, and after the last step it starts again at the
 * node. Projected afresh on every call, so the dashes follow the map.
 *
 * With `chaos` above 0 each cycle is its own: the point's rate sets its pace, and a hash of the
 * point and the cycle number decides whether the cycle is skipped altogether (the whole cycle,
 * never a dash here and there), how far apart its dashes step, how far to the side of the point
 * they sit, how long they are, and how far they turn off the flow. Within a cycle those are
 * fixed, so a cycle is still a regular march.
 */
export function swellDashes(
  nodes: SwellNode[],
  view: MapViewState,
  size: { width: number; height: number },
  nowSeconds: number,
  chaos: number = SWELL_CHAOS,
): SwellDash[] {
  const cycleSeconds = SWELL_STEPS * SWELL_STEP_SECONDS
  const dashes: SwellDash[] = []

  for (const node of nodes) {
    const position = (nowSeconds / cycleSeconds) * node.rate + node.phase
    const cycleIndex = Math.floor(position)
    const cycle = (position - cycleIndex) * SWELL_STEPS
    const step = Math.floor(cycle)
    const progress = cycle - step
    const alpha = Math.sin(Math.PI * progress) ** 2 * node.strength
    if (alpha < SWELL_MIN_ALPHA) continue

    // This cycle's own randomness: the same for every dash in it, different from the next cycle's.
    const salt = (what: number) => CYCLE_SALT_BASE + cycleIndex * CYCLE_SALTS + what
    if (unit(node.seed, salt(CYCLE_SKIP)) < SWELL_SKIP_PROBABILITY * chaos) continue
    const stepPixels = SWELL_STEP_PIXELS * (1 + signed(node.seed, salt(CYCLE_STEP)) * SWELL_STEP_VARIATION * chaos)
    const lateralPixels = signed(node.seed, salt(CYCLE_LATERAL)) * SWELL_LATERAL_WOBBLE_PIXELS * chaos
    const lengthPixels = SWELL_DASH_PIXELS * (1 + signed(node.seed, salt(CYCLE_LENGTH)) * SWELL_LENGTH_VARIATION * chaos)
    const angle = (signed(node.seed, salt(CYCLE_ANGLE)) * SWELL_DIRECTION_WOBBLE_DEGREES * chaos * Math.PI) / 180

    // The flow's direction, turned by this cycle's wobble, and the line across it.
    const directionX = node.direction.x * Math.cos(angle) - node.direction.y * Math.sin(angle)
    const directionY = node.direction.x * Math.sin(angle) + node.direction.y * Math.cos(angle)
    const [x, y] = projectLngLat(view, size, node.longitude, node.latitude)
    const centreX = x + directionX * step * stepPixels - directionY * lateralPixels
    const centreY = y + directionY * step * stepPixels + directionX * lateralPixels
    const half = lengthPixels / 2
    const from = { x: centreX - directionX * half, y: centreY - directionY * half }
    const to = { x: centreX + directionX * half, y: centreY + directionY * half }
    if (!isOnScreen(from, size) && !isOnScreen(to, size)) continue
    dashes.push({ from, to, alpha })
  }
  return dashes
}
