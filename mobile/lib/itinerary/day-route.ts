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
//
// A shared overnight-stop boundary point's actual `day_id` isn't reliably the
// departing day: backend/Services/itinerary_service.py's apply_boundaries assigns
// day_id per boundary's *inclusive* [startPointId, endPointId] range, processed in
// day-number order, so a point that's both day N's endPointId and day N+1's
// startPointId gets overwritten to N+1 (the arriving day) — the later range wins.
// Walking each day's own `points` array therefore finds that point only under the
// arriving day, which breaks the leg *approaching* it (still entirely within day
// N's own points): resolveLegDayNumber only special-cases when the *earlier* point
// of a pair is the boundary, so a same-day match is what colors that leg, and the
// point's arriving-day tag defeats it, falling through to grey instead of day N's
// color. Overriding it back to the departing day fixes both legs at once — see
// day-route.test.ts's "colors the leg approaching a shared boundary stop" case,
// which reproduces this without needing a duplicate point in both days' arrays.
export function buildDayColoredRoute(days: Day[]): {
  points: LocatedRoutePoint[]
  legs: RouteLegFeature[]
} {
  const orderedDays = [...days].sort((a, b) => a.dayNumber - b.dayNumber)
  const boundaryPointIds = new Set(Object.keys(buildBoundaryColorMap(orderedDays)))

  const dayByStartPointId = new Map(
    orderedDays.filter((d) => d.startPointId).map((d) => [d.startPointId as string, d]),
  )
  const departingDayNumber = new Map<string, number>()
  for (const pointId of boundaryPointIds) {
    const arrivingDay = dayByStartPointId.get(pointId)
    if (arrivingDay) departingDayNumber.set(pointId, arrivingDay.dayNumber - 1)
  }

  const seen = new Set<string>()
  const points: LocatedRoutePoint[] = []
  for (const day of orderedDays) {
    for (const point of walkPoints(day.points ?? [])) {
      if (!isLocated(point)) continue
      if (point.id != null) {
        if (seen.has(point.id)) continue
        seen.add(point.id)
      }
      const dayNumber =
        (point.id != null ? departingDayNumber.get(point.id) : undefined) ?? day.dayNumber
      points.push({ ...point, dayNumber })
    }
  }

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
