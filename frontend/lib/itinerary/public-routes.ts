import type { Itinerary, PublicItineraryDetail, PublicPoint } from "@/lib/dtos/itinerary"
import { POINT_TYPE, type PointType } from "@/lib/dtos/point"
import { totalDistanceNm } from "@/lib/itinerary/distance"
import { getDayColor } from "@/lib/itinerary/colors"
import { buildBoundaryColorMap, type BoundaryColors } from "@/lib/itinerary/day-boundaries"
import { numberByOrder } from "@/lib/itinerary/linked-list"
import { walkDayRoutePoints } from "@/lib/itinerary/day-points"

// A typed waypoint along a route — enough to drop the shared ringIcon marker
// (stop vs position) without exposing private point notes.
export type RoutePoint = {
  // Source point id — lets renderers look a point up in `boundaryColors`
  // (day-continuity split rings). Null when the source point had no id.
  id: string | null
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
  // Point id → { left, right } day colours at shared overnight-stop
  // boundaries, so public renderers can draw the builder's split-ring
  // continuity marker. A plain Record (not a Map): RouteData crosses the
  // "use server" boundary in fetchPublicRouteData.
  boundaryColors: Record<string, BoundaryColors>
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
  days: {
    dayNumber: number
    date?: string | null
    points: ChainPoint[]
    startPointId?: string | null
    endPointId?: string | null
  }[]
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

// A day's own end boundary may be shared with (and stored under) the next
// day — single-owner storage. Prefer walking by boundary id through a
// *global* point map (spanning every day) so that's still resolved; fall
// back to `walkChain`'s more permissive multi-head walk over the day's own
// points only when there's no boundary metadata yet (an organic/fresh day).
function walkDaySegment<T extends ChainPoint & { id?: string | null }>(
  day: { points: T[]; startPointId?: string | null; endPointId?: string | null },
  pointsById: Map<string, T>,
): T[] {
  if (day.startPointId) {
    const walked = walkDayRoutePoints(day, pointsById)
    if (walked.length > 0) return walked
  }
  return walkChain(day.points)
}

function toRoutePoint(
  p: ChainPoint & { latitude: number; longitude: number },
  pointNumber: number | null,
): RoutePoint {
  return {
    id: p.id ?? null,
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

  const pointsById = new Map(
    numberedDays
      .flatMap((d) => d.points)
      .filter((p) => p.id)
      .map((p) => [p.id!, p]),
  )

  // Walk every day's chain up front, in day order. A day's own segment may
  // repeat the boundary stop shared with the adjacent day (walkDaySegment
  // resolves it via boundary id even when the point row is stored under that
  // other day) — desired for day-level distance/labels below, but the
  // flattened/numbered views must still treat it as a single point.
  const orderedByDay = numberedDays.map((day) =>
    walkDaySegment(day, pointsById).filter(
      (p): p is typeof p & { latitude: number; longitude: number } =>
        p.latitude != null && p.longitude != null,
    ),
  )

  const dedupedFlat: (typeof orderedByDay)[number] = []
  const seenIds = new Set<string>()
  for (const dayPoints of orderedByDay) {
    for (const p of dayPoints) {
      if (p.id && seenIds.has(p.id)) continue
      if (p.id) seenIds.add(p.id)
      dedupedFlat.push(p)
    }
  }
  const pointNumbers = numberByOrder(dedupedFlat)

  const positions: [number, number][] = []
  const points: RoutePoint[] = []
  const days: RouteDaySegment[] = []

  numberedDays.forEach((day, i) => {
    const ordered = orderedByDay[i]
    const dayPoints = ordered.map((p) =>
      toRoutePoint(p, p.id ? (pointNumbers.get(p.id) ?? null) : null),
    )
    days.push({
      dayNumber: day.dayNumber,
      date: day.date ?? null,
      color: getDayColor(day.dayNumber),
      points: dayPoints,
      distanceNm: totalDistanceNm(ordered),
    })
  })

  for (const p of dedupedFlat) {
    positions.push([p.latitude, p.longitude])
    points.push(toRoutePoint(p, p.id ? (pointNumbers.get(p.id) ?? null) : null))
  }

  return {
    id: src.id ?? "",
    name: src.name ?? "Untitled",
    positions,
    points,
    days,
    boundaryColors: buildBoundaryColorMap(numberedDays),
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
      startPointId: d.startPointId ?? null,
      endPointId: d.endPointId ?? null,
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
      startPointId: d.startPointId ?? null,
      endPointId: d.endPointId ?? null,
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
