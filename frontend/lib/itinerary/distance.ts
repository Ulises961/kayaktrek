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

export function segmentMidpoint(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): { latitude: number; longitude: number } {
  return {
    latitude: (a.latitude + b.latitude) / 2,
    longitude: (a.longitude + b.longitude) / 2,
  }
}

export function toKm(nm: number): number {
  return nm * 1.852
}

export function formatDistance(nm: number, unit: DistanceUnit): string {
  const value = unit === DISTANCE_UNIT.NM ? nm : toKm(nm)
  return value.toFixed(1)
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
