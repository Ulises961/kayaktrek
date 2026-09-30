import type { VelocityField } from "./velocity"

// Pure advection math for the mobile velocity overlay (M35 WP2) — no
// platform/frontend dependency, so this can move to @shared later. The
// backend grid is uniform today (one (u, v) stamped over the whole bbox,
// plus a land mask for waves) but nothing here assumes that; it is written
// for a general bilinear field.

export type Particle = {
  latitude: number
  longitude: number
  /** Seconds since this particle was (re)spawned. */
  age: number
}

const METRES_PER_DEGREE_LATITUDE = 111_320
// Windy.js-style stagger default: without it, every particle in a batch
// would hit maxAgeSeconds on the same frame and respawn in unison ("popcorn").
const DEFAULT_MAX_AGE_SECONDS = 60
const MAX_SEED_ATTEMPTS = 50

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function bilerp(v00: number, v10: number, v01: number, v11: number, tx: number, ty: number): number {
  const top = v00 + (v10 - v00) * tx
  const bottom = v01 + (v11 - v01) * tx
  return top + (bottom - top) * ty
}

/**
 * Bilinear sample of (u, v) at a coordinate. `null` outside the field's
 * bounding box, or if any of the four grid points surrounding the
 * coordinate is masked (land, for waves).
 */
export function sampleField(field: VelocityField, latitude: number, longitude: number): [number, number] | null {
  const { north, south, west, east, nx, ny, u, v } = field
  if (latitude > north || latitude < south || longitude < west || longitude > east) return null

  const lonSpan = east - west
  const latSpan = north - south
  const colf = nx > 1 && lonSpan !== 0 ? clamp(((longitude - west) / lonSpan) * (nx - 1), 0, nx - 1) : 0
  // Row 0 is the north edge, so latitude decreases as the row index grows.
  const rowf = ny > 1 && latSpan !== 0 ? clamp(((north - latitude) / latSpan) * (ny - 1), 0, ny - 1) : 0

  const col0 = Math.floor(colf)
  const col1 = Math.min(col0 + 1, nx - 1)
  const row0 = Math.floor(rowf)
  const row1 = Math.min(row0 + 1, ny - 1)
  const tx = colf - col0
  const ty = rowf - row0

  const i00 = row0 * nx + col0
  const i10 = row0 * nx + col1
  const i01 = row1 * nx + col0
  const i11 = row1 * nx + col1

  const u00 = u[i00]
  const u10 = u[i10]
  const u01 = u[i01]
  const u11 = u[i11]
  const v00 = v[i00]
  const v10 = v[i10]
  const v01 = v[i01]
  const v11 = v[i11]
  if (u00 === null || u10 === null || u01 === null || u11 === null) return null
  if (v00 === null || v10 === null || v01 === null || v11 === null) return null

  return [bilerp(u00, u10, u01, u11, tx, ty), bilerp(v00, v10, v01, v11, tx, ty)]
}

/** A random position inside the field's bbox that resolves to a sampleable
 * (unmasked) cell, or `null` if none was found within MAX_SEED_ATTEMPTS —
 * which only happens for a field with no unmasked cells at all. */
function randomSampleablePosition(
  field: VelocityField,
  random: () => number,
): { latitude: number; longitude: number } | null {
  for (let attempt = 0; attempt < MAX_SEED_ATTEMPTS; attempt++) {
    const latitude = field.south + random() * (field.north - field.south)
    const longitude = field.west + random() * (field.east - field.west)
    if (sampleField(field, latitude, longitude) !== null) return { latitude, longitude }
  }
  return null
}

/**
 * Seeds `count` particles at random positions inside the field's bbox,
 * skipping masked cells. Returns fewer than `count` only if the field has
 * no unmasked cells to seed on at all (e.g. entirely land-masked).
 */
export function createParticles(field: VelocityField, count: number, random: () => number = Math.random): Particle[] {
  const particles: Particle[] = []
  for (let i = 0; i < count; i++) {
    const position = randomSampleablePosition(field, random)
    if (position === null) continue
    // Staggered initial age so a whole batch doesn't respawn in lockstep.
    particles.push({ ...position, age: random() * DEFAULT_MAX_AGE_SECONDS })
  }
  return particles
}

export type StepParticlesOptions = {
  maxAgeSeconds?: number
  random?: () => number
}

/**
 * Advances every particle by its sampled (u, v), converted from m/s to
 * degrees (longitude shrinks with cos(latitude)). A particle is respawned
 * — at a fresh random unmasked position, age reset to 0 — once it exceeds
 * `maxAgeSeconds`, leaves the bbox, or drifts onto a masked cell.
 *
 * Mutates `particles` in place (each particle object's own fields, not the
 * array) and returns the same array — this runs every animation frame, and
 * allocating a fresh Particle/array per call is unnecessary.
 */
export function stepParticles(
  particles: Particle[],
  field: VelocityField,
  dtSeconds: number,
  options: StepParticlesOptions = {},
): Particle[] {
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_MAX_AGE_SECONDS
  const random = options.random ?? Math.random

  for (const particle of particles) {
    const sample = sampleField(field, particle.latitude, particle.longitude)
    particle.age += dtSeconds

    if (sample !== null && particle.age < maxAgeSeconds) {
      const [u, v] = sample
      const cosLatitude = Math.cos((particle.latitude * Math.PI) / 180)
      const metresPerDegreeLongitude = METRES_PER_DEGREE_LATITUDE * cosLatitude

      const nextLatitude = particle.latitude + (v * dtSeconds) / METRES_PER_DEGREE_LATITUDE
      const nextLongitude =
        particle.longitude + (metresPerDegreeLongitude !== 0 ? (u * dtSeconds) / metresPerDegreeLongitude : 0)

      // Checked immediately against the stepped-to position, not deferred
      // to the next call's own sample at the top — otherwise a particle
      // that stepped out of bounds or onto a masked cell draws one extra
      // frame off-field before anything notices.
      if (sampleField(field, nextLatitude, nextLongitude) !== null) {
        particle.latitude = nextLatitude
        particle.longitude = nextLongitude
        continue
      }
    }

    const respawn = randomSampleablePosition(field, random)
    if (respawn !== null) {
      particle.latitude = respawn.latitude
      particle.longitude = respawn.longitude
      particle.age = 0
    }
    // Field has no unmasked cells at all: leave the particle where it is
    // (it will simply retry respawning next step) rather than looping here.
  }

  return particles
}

export type SpeedColorStop = { speed: number; color: readonly [number, number, number] }

// A small, ordered wind-speed ramp: calm blue through to gale red. Callers
// pass their own palette (e.g. a different one for swell) if this isn't right.
export const DEFAULT_SPEED_PALETTE: SpeedColorStop[] = [
  { speed: 0, color: [40, 80, 180] },
  { speed: 4, color: [40, 170, 180] },
  { speed: 8, color: [60, 190, 90] },
  { speed: 13, color: [230, 200, 40] },
  { speed: 18, color: [230, 110, 30] },
  { speed: 25, color: [220, 30, 30] },
]

/** Maps a speed to an `rgb(...)` string, linearly interpolated between the
 * palette's ordered stops and clamped at the ends. */
export function speedColor(speedMetresPerSecond: number, palette: SpeedColorStop[] = DEFAULT_SPEED_PALETTE): string {
  const first = palette[0]
  if (speedMetresPerSecond <= first.speed) return rgbString(first.color)

  for (let i = 1; i < palette.length; i++) {
    const stop = palette[i]
    if (speedMetresPerSecond <= stop.speed) {
      const previous = palette[i - 1]
      const t = (speedMetresPerSecond - previous.speed) / (stop.speed - previous.speed)
      return rgbString(lerpColor(previous.color, stop.color, t))
    }
  }

  return rgbString(palette[palette.length - 1].color)
}

function lerpColor(a: readonly [number, number, number], b: readonly [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

function rgbString(color: readonly [number, number, number]): string {
  return `rgb(${Math.round(color[0])}, ${Math.round(color[1])}, ${Math.round(color[2])})`
}
