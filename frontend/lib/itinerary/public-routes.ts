import type { PublicItineraryDetail, PublicPoint } from "@/lib/dtos/itinerary"
import type { Itinerary } from "@/lib/dtos/itinerary"
import type { PointType } from "@/lib/dtos/point"

// A typed waypoint along a route — enough to drop the shared ringIcon marker
// (stop vs position) without exposing private point notes.
export type RoutePoint = {
  lat: number
  lon: number
  type: PointType
  name: string | null
}

export type RouteData = {
  id: string
  name: string
  positions: [number, number][]
  points?: RoutePoint[]
  totalMiles: number | null
  dayCount: number
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
}

type RouteSource = {
  id?: string | null
  name?: string | null
  totalMiles?: number | null
  days: { dayNumber: number; points: ChainPoint[] }[]
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

function buildRouteData(src: RouteSource): RouteData {
  const numberedDays = [...src.days]
    .filter((d) => d.dayNumber > 0)
    .sort((a, b) => a.dayNumber - b.dayNumber)

  const positions: [number, number][] = []
  const points: RoutePoint[] = []
  for (const day of numberedDays) {
    for (const p of walkChain(day.points)) {
      if (p.latitude != null && p.longitude != null) {
        positions.push([p.latitude, p.longitude])
        points.push({
          lat: p.latitude,
          lon: p.longitude,
          type: p.type === "stop" ? "stop" : "position",
          name: p.name ?? null,
        })
      }
    }
  }

  return {
    id: src.id ?? "",
    name: src.name ?? "Untitled",
    positions,
    points,
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
      points: (d.points ?? []) as ChainPoint[],
    })),
  })
}
