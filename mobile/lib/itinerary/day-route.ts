import type { Day } from "@shared/dtos/day"
import type { Point } from "@shared/dtos/point"
import { getDayColor } from "@shared/itinerary/colors"
import { buildBoundaryColorMap, resolveLegDayNumber } from "@shared/itinerary/day-boundaries"
import { walkPoints } from "@shared/itinerary/linked-list"

export type LocatedRoutePoint = Point & {
  latitude: number
  longitude: number
  dayNumber: number
}

export type RouteLegFeature = {
  type: "Feature"
  properties: { dayNum: number; color: string }
  geometry: { type: "LineString"; coordinates: [number, number][] }
}

function isLocated(point: Point): point is Point & { latitude: number; longitude: number } {
  return typeof point.latitude === "number" && typeof point.longitude === "number"
}

// Mobile has no client-held pointOrder the way web's MapBuilder does (map-core.tsx
// gets one flat, pre-ordered list for the whole trip) — each Day arrives with its
// own points array, so this walks days in dayNumber order and each day's points via
// walkPoints, tagging every point with its owning day's number. Legs are colored the
// same way map-core.tsx's buildSegments does: same-day legs take that day's color, a
// leg crossing a shared overnight-stop boundary takes the *next* day's color (so the
// boundary reads as continuity, not a hard break), anything else (discontinuous or
// imported data) falls back to the unassigned/grey color.
export function buildDayColoredRoute(days: Day[]): {
  points: LocatedRoutePoint[]
  legs: RouteLegFeature[]
} {
  const orderedDays = [...days].sort((a, b) => a.dayNumber - b.dayNumber)

  const points: LocatedRoutePoint[] = []
  for (const day of orderedDays) {
    for (const point of walkPoints(day.points ?? [])) {
      if (isLocated(point)) points.push({ ...point, dayNumber: day.dayNumber })
    }
  }

  const boundaryPointIds = new Set(Object.keys(buildBoundaryColorMap(orderedDays)))

  const legs: RouteLegFeature[] = []
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i]
    const b = points[i + 1]
    const dayNum = resolveLegDayNumber(
      a.dayNumber,
      b.dayNumber,
      a.id != null && boundaryPointIds.has(a.id),
    )
    legs.push({
      type: "Feature",
      properties: { dayNum, color: getDayColor(dayNum) },
      geometry: {
        type: "LineString",
        coordinates: [
          [a.longitude, a.latitude],
          [b.longitude, b.latitude],
        ],
      },
    })
  }

  return { points, legs }
}
