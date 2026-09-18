import { POINT_TYPE } from "@/lib/dtos/point"

const EARTH_RADIUS_NM = 3440.065

export const DISTANCE_UNIT = {
  NM: "nm",
  KM: "km",
} as const
export type DistanceUnit = (typeof DISTANCE_UNIT)[keyof typeof DISTANCE_UNIT]

export function haversineNm(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const sinLat = Math.sin(dLat / 2)
  const sinLon = Math.sin(dLon / 2)
  const h =
    sinLat * sinLat + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * sinLon * sinLon
  return 2 * EARTH_RADIUS_NM * Math.asin(Math.sqrt(h))
}

export function totalDistanceNm(points: { latitude: number; longitude: number }[]): number {
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    total += haversineNm(points[i], points[i + 1])
  }
  return total
}

export function toKm(nm: number): number {
  return nm * 1.852
}

export function toNm(km: number): number {
  return km / 1.852
}

export function formatDistance(nm: number, unit: DistanceUnit): string {
  const value = unit === DISTANCE_UNIT.NM ? nm : toKm(nm)
  return value.toFixed(1)
}

/**
 * A distance for an editable field, already in the caller's display unit.
 *
 * Distinct from `formatDistance`, which is for reading: that pads to a fixed
 * width, which is right in a card and wrong in an input a person edits and saves
 * back. Two decimals keeps 10-metre resolution — enough for a short paddle, where
 * one decimal would round 0.65 to 0.7 — and trailing zeros are dropped so a whole
 * number stays "12".
 *
 * The value it replaces is the raw float a computed log carries (an expedition
 * log's haversine sum), which rendered in the field as "0.6568740073199207".
 * Saving persists what is shown, so a distance the user did not touch settles at
 * the precision they were shown rather than silently keeping digits they never saw.
 */
export function formatDistanceForInput(value: number): string {
  return String(Number(value.toFixed(2)))
}

export function estimatedTime(
  distanceNm: number,
  speedKnots: number,
): { hours: number; minutes: number } {
  const totalHours = distanceNm / speedKnots
  const hours = Math.floor(totalHours)
  const minutes = Math.round((totalHours - hours) * 60)
  return { hours, minutes }
}

export function formatTime({ hours, minutes }: { hours: number; minutes: number }): string {
  if (hours === 0) return `${minutes}min`
  return `${hours}h ${minutes}min`
}

export function legLabel(distanceNm: number, speedKnots: number, unit: DistanceUnit): string {
  const dist = formatDistance(distanceNm, unit)
  const time = formatTime(estimatedTime(distanceNm, speedKnots))
  return `${dist} ${unit} · ${time}`
}

type DayPoint = { latitude?: number | null; longitude?: number | null; type?: string | null }

export type RouteLeg<T extends DayPoint> = {
  point: T
  // An anchor ends a leg: a stop, or the day's first/last placed point (so the
  // destination always shows and no distance is dropped). Positions are not anchors.
  isAnchor: boolean
  isStart: boolean
  // Distance since the previous anchor, aggregating pass-through positions. At an
  // anchor this is the full leg from the previous anchor; at a position it is the
  // running distance from the last anchor up to that position.
  legNm: number
  cumulativeNm: number // distance from the day's first point
}

/**
 * Walk a day's ordered points and reckon paddle distance stop-to-stop. Positions
 * are pass-through geometry — their distance aggregates into the leg toward the
 * next anchor rather than forming a leg of their own. Points without coordinates
 * are skipped. See `docs/adr/itinerary-frontend.md` (Paddle-time legs).
 */
export function routeLegs<T extends DayPoint>(dayPoints: T[]): RouteLeg<T>[] {
  const placed = dayPoints.filter(
    (p): p is T & { latitude: number; longitude: number } =>
      p.latitude != null && p.longitude != null,
  )
  const legs: RouteLeg<T>[] = []
  let running = 0
  let cumulative = 0
  for (let i = 0; i < placed.length; i++) {
    if (i > 0) {
      const d = haversineNm(placed[i - 1], placed[i])
      running += d
      cumulative += d
    }
    const isAnchor = i === 0 || i === placed.length - 1 || placed[i].type === POINT_TYPE.STOP
    legs.push({
      point: placed[i],
      isAnchor,
      isStart: i === 0,
      legNm: running,
      cumulativeNm: cumulative,
    })
    if (isAnchor) running = 0 // reset after emitting so an anchor reports its full leg
  }
  return legs
}

/**
 * `routeLegs` for one day, measured from the point the day is paddled from.
 *
 * `seed` (see `dayRouteGroups`) is walked as the day's opening anchor and then
 * dropped from the result: it belongs to the previous day and already reported
 * its own leg there. What it buys is the day's first point reporting the crossing
 * from the overnight stop rather than `isStart` with a leg of zero, and a
 * `cumulativeNm` that starts where the day's paddling actually started — the same
 * figure `getSliceDistance` totals for the day.
 *
 * A seed without coordinates is ignored; it can contribute no distance and
 * dropping it blindly would take the day's first point with it.
 */
export function dayRouteLegs<T extends DayPoint>(seed: T | null, dayPoints: T[]): RouteLeg<T>[] {
  const usable = seed != null && seed.latitude != null && seed.longitude != null
  if (!usable) return routeLegs(dayPoints)
  return routeLegs([seed, ...dayPoints]).filter((leg) => leg.point !== seed)
}

export type StopGroup<T extends DayPoint> = {
  point: T
  isStart: boolean
  legNm: number // from the previous stop; 0 for the day's first point
  cumulativeNm: number
  // The pass-through positions this stop's leg aggregated, each carrying its own
  // running `legNm`/`cumulativeNm` from `routeLegs` — the figures a waypoint
  // accordion shows on request (distance/time from the *last stop*, not the whole
  // route). Empty when the previous stop is adjacent with nothing between.
  via: RouteLeg<T>[]
}

/**
 * Collapse `routeLegs` to one entry per stop, carrying the positions it
 * aggregated rather than just a count — the shape both the builder's Route tab
 * and the public route detail page need to render a stop list with an
 * expand-on-request waypoint accordion underneath each one.
 */
export function groupStopsWithVia<T extends DayPoint>(dayPoints: T[]): StopGroup<T>[] {
  const groups: StopGroup<T>[] = []
  let via: RouteLeg<T>[] = []
  for (const leg of routeLegs(dayPoints)) {
    if (!leg.isAnchor) {
      via.push(leg)
      continue
    }
    groups.push({
      point: leg.point,
      isStart: leg.isStart,
      legNm: leg.legNm,
      cumulativeNm: leg.cumulativeNm,
      via,
    })
    via = []
  }
  return groups
}
