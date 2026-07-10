import type { Itinerary, PublicItineraryDetail, PublicPoint } from "@/lib/dtos/itinerary"
import { POINT_TYPE, type PointType } from "@/lib/dtos/point"
import { totalDistanceNm } from "@/lib/itinerary/distance"
import { getDayColor } from "@/lib/itinerary/colors"
import { numberByOrder } from "@/lib/itinerary/linked-list"

// A typed waypoint along a route — enough to drop the shared ringIcon marker
// (stop vs position) without exposing private point notes.
export type RoutePoint = {
  lat: number
  lon: number
  type: PointType
  name: string | null
  images: { url: string }[]
  // The point's 1-based ordinal position across the *whole* route (e.g. 3 of 14),
  // regardless of which day it falls in — computed once via the same
  // `numberByOrder` the authenticated builder (map-core.tsx) uses on its own full
  // point order, so numbering can't silently reset at a day boundary in one
  // renderer but not the other. Null only when the source point had no id.
  pointNumber: number | null
}

// One day's route segment, points already walked in order and coloured via the
// builder's own day-colour palette — so the public map speaks the same visual
// language as the authenticated itinerary builder.
export type RouteDaySegment = {
  dayNumber: number
  date: string | null
  color: string
  points: RoutePoint[]
  distanceNm: number
}

export type RouteData = {
  id: string
  name: string
  // Flattened across all days — kept for consumers that only need overall extent
  // (landing chart framing, forecast cell, thumbnails), not day colour.
  positions: [number, number][]
  points?: RoutePoint[]
  days: RouteDaySegment[]
  totalMiles: number | null
  dayCount: number
}

// One numbered day's at-a-glance summary for the public route breakdown.
export type DaySummary = {
  dayNumber: number
  date: string | null
  distanceNm: number
}

// The minimal point shape both the public and authed DTOs satisfy — a linked-list
// node with coordinates. Lets the route extraction run over either source.
type ChainPoint = {
  id?: string | null
  nextId?: string | null
  latitude?: number | null
  longitude?: number | null
  type?: string | null
  name?: string | null
  images?: { url?: string | null; location?: string | null }[] | null
}

type RouteSource = {
  id?: string | null
  name?: string | null
  totalMiles?: number | null
  days: { dayNumber: number; date?: string | null; points: ChainPoint[] }[]
}

// Walk the nextId linked list (no nested `next` property): start from heads (nodes
// not referenced as anyone's next) and chain forward, guarding against cycles.
function walkChain<T extends ChainPoint>(points: T[]): T[] {
  if (points.length === 0) return []
  const byId = new Map(points.filter((p) => p.id).map((p) => [p.id!, p]))
  const referencedAsNext = new Set(points.filter((p) => p.nextId).map((p) => p.nextId!))
  const heads = points.filter((p) => p.id && !referencedAsNext.has(p.id))
  if (heads.length === 0) return [...points]
  const ordered: T[] = []
  const visited = new Set<string>()
  for (const head of heads) {
    let cur: T | undefined = head
    while (cur) {
      if (cur.id) {
        if (visited.has(cur.id)) break
        visited.add(cur.id)
      }
      ordered.push(cur)
      cur = cur.nextId ? byId.get(cur.nextId) : undefined
    }
  }
  return ordered
}

function toRoutePoint(
  p: ChainPoint & { latitude: number; longitude: number },
  pointNumber: number | null,
): RoutePoint {
  return {
    lat: p.latitude,
    lon: p.longitude,
    type: p.type === POINT_TYPE.STOP ? POINT_TYPE.STOP : POINT_TYPE.POSITION,
    name: p.name ?? null,
    images: (p.images ?? [])
      .map((img) => img.url ?? img.location ?? null)
      .filter((url): url is string => !!url)
      .map((url) => ({ url })),
    pointNumber,
  }
}

function buildRouteData(src: RouteSource): RouteData {
  const numberedDays = [...src.days]
    .filter((d) => d.dayNumber > 0)
    .sort((a, b) => a.dayNumber - b.dayNumber)

  // Walk every day's chain up front, in day order, so points can be numbered by
  // their absolute position across the whole route (numberByOrder) before being
  // split back into per-day segments below — the split must not affect numbering.
  const orderedByDay = numberedDays.map((day) =>
    walkChain(day.points).filter(
      (p): p is typeof p & { latitude: number; longitude: number } =>
        p.latitude != null && p.longitude != null,
    ),
  )
  const pointNumbers = numberByOrder(orderedByDay.flat())

  const positions: [number, number][] = []
  const points: RoutePoint[] = []
  const days: RouteDaySegment[] = []

  numberedDays.forEach((day, i) => {
    const ordered = orderedByDay[i]
    const dayPoints = ordered.map((p) =>
      toRoutePoint(p, p.id ? (pointNumbers.get(p.id) ?? null) : null),
    )

    for (const p of ordered) positions.push([p.latitude, p.longitude])
    points.push(...dayPoints)
    days.push({
      dayNumber: day.dayNumber,
      date: day.date ?? null,
      color: getDayColor(day.dayNumber),
      points: dayPoints,
      distanceNm: totalDistanceNm(ordered),
    })
  })

  return {
    id: src.id ?? "",
    name: src.name ?? "Untitled",
    positions,
    points,
    days,
    totalMiles: src.totalMiles ?? null,
    dayCount: numberedDays.length,
  }
}

// Public explore detail → chart route (landing + auth backdrop). Drops private
// point notes; only coordinates, type and name survive.
export function extractRouteData(itinerary: PublicItineraryDetail): RouteData {
  return buildRouteData({
    id: itinerary.id,
    name: itinerary.name,
    totalMiles: itinerary.totalMiles,
    days: itinerary.days.map((d) => ({
      dayNumber: d.dayNumber,
      date: d.date ?? null,
      points: d.points as PublicPoint[],
    })),
  })
}

// Authed itinerary (the owner's own trip) → chart route, for the dashboard chart
// header. Same shape as the public extractor, sourced from the full DTO.
export function extractItineraryRoute(itinerary: Itinerary): RouteData {
  return buildRouteData({
    id: itinerary.id,
    name: itinerary.name,
    totalMiles: itinerary.totalMiles,
    days: (itinerary.days ?? []).map((d) => ({
      dayNumber: d.dayNumber,
      date: d.date ?? null,
      points: (d.points ?? []) as ChainPoint[],
    })),
  })
}

// Per-day distances for the public detail breakdown. Derived straight from a route's
// own day segments (§5's buildRouteData already walked each day once) rather than
// re-walking the raw itinerary — see daySummariesFromRoute.
export function daySummariesFromRoute(route: RouteData): DaySummary[] {
  return route.days.map((d) => ({
    dayNumber: d.dayNumber,
    date: d.date,
    distanceNm: d.distanceNm,
  }))
}
