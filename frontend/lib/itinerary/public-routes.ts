import type { PublicItineraryDetail, PublicPoint } from "@/lib/dtos/itinerary"
import type { PointType } from "@/lib/dtos/point"

// A typed waypoint along a public route — enough to drop the shared ringIcon
// marker (stop vs position) without exposing private point notes.
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

// Walk the nextId linked list for PublicPoint (no nested `next` property).
function walkPublicPoints(points: PublicPoint[]): PublicPoint[] {
  if (points.length === 0) return []
  const byId = new Map(points.filter((p) => p.id).map((p) => [p.id!, p]))
  const referencedAsNext = new Set(points.filter((p) => p.nextId).map((p) => p.nextId!))
  const heads = points.filter((p) => p.id && !referencedAsNext.has(p.id))
  if (heads.length === 0) return [...points]
  const ordered: PublicPoint[] = []
  const visited = new Set<string>()
  for (const head of heads) {
    let cur: PublicPoint | undefined = head
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

export function extractRouteData(itinerary: PublicItineraryDetail): RouteData {
  const numberedDays = [...itinerary.days]
    .filter((d) => d.dayNumber > 0)
    .sort((a, b) => a.dayNumber - b.dayNumber)

  const positions: [number, number][] = []
  const points: RoutePoint[] = []
  for (const day of numberedDays) {
    for (const p of walkPublicPoints(day.points)) {
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
    id: itinerary.id ?? "",
    name: itinerary.name ?? "Untitled",
    positions,
    points,
    totalMiles: itinerary.totalMiles ?? null,
    dayCount: numberedDays.length,
  }
}
