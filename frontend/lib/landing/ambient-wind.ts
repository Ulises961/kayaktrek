/**
 * Ambient wind field for the landing hero — SYNTHESIZED, decorative only.
 *
 * This is not real forecast data. It exists to give the landing map gentle
 * motion and carry the palette via leaflet-velocity's colour ramp. It must
 * never be shown with a legend, scale, or timestamp (that would imply a
 * trustable forecast). Real velocity data lives in the M5 planner overlays.
 * Being wind (not current) it is free to drift over land and sea alike.
 *
 * Output matches the leaflet-velocity GRIB-style shape: two layers (u, v),
 * each a row-major grid from la1/lo1 (top-left) to la2/lo2 (bottom-right).
 */
import type { VelocityGridLayer } from "@/lib/types/ui"
import { palette } from "@/lib/tokens"

type Bounds = { la1: number; la2: number; lo1: number; lo2: number }

// Costa Brava / Balearic corridor — generous water, a little coast.
export const MED_BOUNDS: Bounds = { la1: 43.4, la2: 39.2, lo1: 0.4, lo2: 5.2 }

// ── Flow field ───────────────────────────────────────────────────────────────
// A COHERENT flow, not chaotic noise. Real wind belongs to a larger
// atmospheric pattern: mostly uniform in direction, at most gently steered by
// topography. So this is a dominant drift direction plus ONE low-frequency
// meander (well under a full cycle across the field) — the whole patch reads as
// a single body gently bending. The old two-eddy field used high spatial
// frequencies (several sign flips across the small disc) which is what made it
// look like chaotic, unrelated particles.
// Magnitudes are REAL wind speed in m/s so the colour ramp encodes strength
// honestly (see WIND_COLOR_SCALE). ~2.5–6.5 m/s is a Beaufort 2–4 "gentle to
// moderate breeze" — a believable calm Mediterranean summer afternoon, and the
// reason the field stays in the blue→teal calm band, never the warm/strong end.
const FLOW_ANGLE = 0.6 // radians from east (CCW), +v = north → a calm ENE drift
const FLOW_MEANDER = 0.4 // radians of gentle large-scale deflection (±~23°)
const FLOW_SPEED = 4.5 // base wind speed (m/s); a gentle breeze, not a gale
const FLOW_SPEED_VAR = 0.45 // ± fraction the speed varies across the field

// px, py ∈ [0,1] across the field. Returns [u (eastward), v (northward)], pre-fade.
function flowVector(px: number, py: number): [number, number] {
  const angle = FLOW_ANGLE + FLOW_MEANDER * Math.sin((px * 0.7 + py * 0.5 - 0.2) * Math.PI)
  const speed = FLOW_SPEED * (1 + FLOW_SPEED_VAR * Math.sin((px * 0.6 - py * 0.4 + 0.1) * Math.PI))
  return [speed * Math.cos(angle), speed * Math.sin(angle)]
}

/**
 * A coherent, slow drift (see flowVector). Magnitudes stay low so particles
 * drift like a calm summer breeze, not a gale.
 */
export function ambientWind(bounds: Bounds = MED_BOUNDS, nx = 28, ny = 24): VelocityGridLayer[] {
  const { la1, la2, lo1, lo2 } = bounds
  const dx = (lo2 - lo1) / (nx - 1)
  const dy = (la1 - la2) / (ny - 1)

  const u: number[] = []
  const v: number[] = []

  for (let j = 0; j < ny; j++) {
    // row 0 = la1 (north), increasing j moves south
    const lat = la1 - j * dy
    for (let i = 0; i < nx; i++) {
      const lon = lo1 + i * dx
      // Normalised coords 0..1 across the field.
      const px = (lon - lo1) / (lo2 - lo1)
      const py = (lat - la2) / (la1 - la2)

      const [uu, vv] = flowVector(px, py)
      u.push(Number(uu.toFixed(3)))
      v.push(Number(vv.toFixed(3)))
    }
  }

  const header = {
    parameterUnit: "m.s-1",
    parameterCategory: 2,
    nx,
    ny,
    lo1,
    la1,
    lo2,
    la2,
    dx,
    dy,
    refTime: new Date().toISOString(),
  }

  return [
    { header: { ...header, parameterNumber: 2, parameterNumberName: "eastward_wind" }, data: u },
    {
      header: { ...header, parameterNumber: 3, parameterNumberName: "northward_wind" },
      data: v,
    },
  ]
}

// ── Forecast cell ──────────────────────────────────────────────────────────
// A field clipped to a DISC rather than a rectangle. The rectangular bbox is the
// bug: zoomed out it reads as a dislocated animated square with hard edges. A
// disc with a soft rim + a drawn contour ring reads as an intentional chart
// annotation ("conditions over this passage"), not a full-coverage forecast.
// Same primitive will move into the shared VelocityLayer for the M5 planner.

export type ForecastCell = {
  center: [number, number] // [lat, lon]
  radiusKm: number
  grid: VelocityGridLayer[]
}

const KM_PER_DEG_LAT = 111

// smoothstep(0→1) — used to fade magnitude toward the rim so particles thin out
// instead of stopping at a hard circular edge.
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

/**
 * Synthesized wind clipped to a disc centred on `center`. Cells outside the
 * radius are `null` (no particles); cells in the outer ~30% fade to zero so the
 * boundary is soft. Grid is generated over the disc's bbox at full resolution,
 * so the patch stays dense regardless of how small the disc is on the page.
 */
export function ambientWindCell(
  center: [number, number],
  radiusKm: number,
  nx = 26,
  ny = 26,
): ForecastCell {
  const [clat, clon] = center
  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((clat * Math.PI) / 180)
  const latPad = radiusKm / KM_PER_DEG_LAT
  const lonPad = radiusKm / kmPerDegLon

  const bounds: Bounds = {
    la1: clat + latPad,
    la2: clat - latPad,
    lo1: clon - lonPad,
    lo2: clon + lonPad,
  }
  const { la1, la2, lo1, lo2 } = bounds
  const dx = (lo2 - lo1) / (nx - 1)
  const dy = (la1 - la2) / (ny - 1)

  const u: (number | null)[] = []
  const v: (number | null)[] = []

  for (let j = 0; j < ny; j++) {
    const lat = la1 - j * dy
    for (let i = 0; i < nx; i++) {
      const lon = lo1 + i * dx
      const px = (lon - lo1) / (lo2 - lo1)
      const py = (lat - la2) / (la1 - la2)

      // Distance from cell centre, in km, then normalised to the radius.
      const ekm = (lon - clon) * kmPerDegLon
      const nkm = (lat - clat) * KM_PER_DEG_LAT
      const t = Math.hypot(ekm, nkm) / radiusKm

      if (t > 1) {
        u.push(null)
        v.push(null)
        continue
      }

      // Soft rim: full strength to 70% radius, fading to 0 at the edge.
      const fade = 1 - smoothstep(0.7, 1, t)
      const [fu, fv] = flowVector(px, py)

      u.push(Number((fu * fade).toFixed(3)))
      v.push(Number((fv * fade).toFixed(3)))
    }
  }

  const header = {
    parameterUnit: "m.s-1",
    parameterCategory: 2,
    nx,
    ny,
    lo1,
    la1,
    lo2,
    la2,
    dx,
    dy,
    refTime: new Date().toISOString(),
  }

  return {
    center,
    radiusKm,
    grid: [
      {
        header: { ...header, parameterNumber: 2, parameterNumberName: "eastward_wind" },
        data: u,
      },
      {
        header: { ...header, parameterNumber: 3, parameterNumberName: "northward_wind" },
        data: v,
      },
    ],
  }
}

/**
 * Derive a forecast cell from one or more routes: centred on the combined
 * bounding-box centre, radius sized to comfortably contain the passage (with a
 * floor so a tiny/empty route still gets a sensible disc).
 */
export function cellForRoutes(positions: [number, number][], minRadiusKm = 38): ForecastCell {
  if (positions.length === 0) {
    const c = MED_BOUNDS
    return ambientWindCell([(c.la1 + c.la2) / 2, (c.lo1 + c.lo2) / 2], 70)
  }
  let minLat = Infinity,
    maxLat = -Infinity,
    minLon = Infinity,
    maxLon = -Infinity
  for (const [lat, lon] of positions) {
    minLat = Math.min(minLat, lat)
    maxLat = Math.max(maxLat, lat)
    minLon = Math.min(minLon, lon)
    maxLon = Math.max(maxLon, lon)
  }
  const clat = (minLat + maxLat) / 2
  const clon = (minLon + maxLon) / 2
  const kmPerDegLon = KM_PER_DEG_LAT * Math.cos((clat * Math.PI) / 180)
  const halfDiagKm =
    Math.hypot((maxLat - minLat) * KM_PER_DEG_LAT, (maxLon - minLon) * kmPerDegLon) / 2
  const radiusKm = Math.max(minRadiusKm, halfDiagKm * 1.55)
  return ambientWindCell([clat, clon], radiusKm)
}

// Wind-strength ramp — the CALM SLICE of the canonical wind-map scale
// (deep-blue → blue → cyan → teal). Colour encodes speed, mapped across
// [minVelocity, maxVelocity] ≈ [0, 10 m/s] in landing-map's VELOCITY_BASE.
// Deliberately NO warm colours: yellow/amber/red/violet mean strong wind on a
// real wind map, and this is a gentle Beaufort 2–4 breeze. A real forecast
// (M5) would use the full scale; the decorative landing only ever shows the
// calm band, so it can never imply strength it doesn't depict.
export const WIND_COLOR_SCALE = [
  palette.ocean800, // ~0 m/s — near calm
  palette.ocean600,
  palette.ocean500,
  palette.ocean400,
  palette.ocean300,
  palette.foam300, // brisker, still gentle
  palette.foam400, // ~10 m/s top of the depicted band — teal, never warm
]
