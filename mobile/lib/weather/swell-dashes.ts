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
// This file is the pure part: which points there are (the lattice, built once the view has
// settled) and which dash is showing at a given moment (per frame). The Skia component only
// owns the clock and the canvas.

/** How many positions a point's dash visits before it starts again from the point itself. */
export const SWELL_STEPS = 3
/** How long one dash takes to fade in and out. */
export const SWELL_STEP_SECONDS = 1.2
/** How far along the flow the next dash appears, in screen pixels. */
export const SWELL_STEP_PIXELS = 18
export const SWELL_DASH_PIXELS = 8

// The lattice keeps its points between 36 and 72 px apart on screen: closer is a crowd, further
// leaves too little in the field to read. Only the maximum is written down: spacing is halved
// or doubled until it is under it, which leaves it above half of it.
const MAX_SPACING_PIXELS = 72
// Points this far (px) outside the screen are kept, so a dash does not pop in at the edge.
const VISIBLE_PADDING_PIXELS = 80
const OFFSCREEN_MARGIN_PIXELS = 16
// Below this a dash is too faint to be worth drawing.
const MIN_ALPHA = 0.02
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
}

export type SwellDash = { from: ScreenPoint; to: ScreenPoint; alpha: number }

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
 */
export function swellLattice(
  field: VelocityField,
  view: MapViewState,
  size: { width: number; height: number },
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
  const refinement = 2 ** Math.ceil(Math.log2(gridSpacingPixels / MAX_SPACING_PIXELS))
  const stepLongitude = gridStepLongitude / refinement
  const stepLatitude = gridStepLatitude / refinement
  const nodeSpacingMetres = gridSpacingMetres / refinement

  const bounds = visibleBounds(view, size, VISIBLE_PADDING_PIXELS)
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

      nodes.push({
        latitude,
        longitude,
        strength: Math.min(1, speed / strongest),
        phase: cycles - Math.floor(cycles),
        direction: flowDirectionOnScreen(view, size, latitude, longitude, u, v),
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
 */
export function swellDashes(
  nodes: SwellNode[],
  view: MapViewState,
  size: { width: number; height: number },
  nowSeconds: number,
): SwellDash[] {
  const cycleSeconds = SWELL_STEPS * SWELL_STEP_SECONDS
  const dashes: SwellDash[] = []

  for (const node of nodes) {
    const position = nowSeconds / cycleSeconds + node.phase
    const cycle = (position - Math.floor(position)) * SWELL_STEPS
    const step = Math.floor(cycle)
    const progress = cycle - step
    const alpha = Math.sin(Math.PI * progress) ** 2 * node.strength
    if (alpha < MIN_ALPHA) continue

    const [x, y] = projectLngLat(view, size, node.longitude, node.latitude)
    const centreX = x + node.direction.x * step * SWELL_STEP_PIXELS
    const centreY = y + node.direction.y * step * SWELL_STEP_PIXELS
    const half = SWELL_DASH_PIXELS / 2
    const from = { x: centreX - node.direction.x * half, y: centreY - node.direction.y * half }
    const to = { x: centreX + node.direction.x * half, y: centreY + node.direction.y * half }
    if (!isOnScreen(from, size) && !isOnScreen(to, size)) continue
    dashes.push({ from, to, alpha })
  }
  return dashes
}
