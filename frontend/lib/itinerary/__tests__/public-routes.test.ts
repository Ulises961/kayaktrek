import { describe, it, expect } from "vitest"
import { daySummariesFromRoute, extractRouteData, extractItineraryRoute } from "../public-routes"
import { haversineNm } from "../distance"
import { getDayColor } from "../colors"
import type { PublicItineraryDetail, PublicPoint } from "@/lib/dtos/itinerary"
import type { Itinerary } from "@/lib/dtos/itinerary"

function point(
  id: string,
  latitude: number,
  longitude: number,
  nextId?: string,
  images: { url: string }[] = [],
): PublicPoint {
  return { id, latitude, longitude, type: "position", nextId, images }
}

function detail(days: PublicItineraryDetail["days"]): PublicItineraryDetail {
  return { id: "it-1", name: "Route", isPublic: true, totalMiles: 0, days }
}

describe("daySummariesFromRoute", () => {
  it("excludes day 0 and returns numbered days sorted", () => {
    const summaries = daySummariesFromRoute(
      extractRouteData(
        detail([
          { dayNumber: 2, points: [point("b", 44.1, 8.6)] },
          { dayNumber: 0, points: [point("z", 44.0, 8.5)] },
          { dayNumber: 1, points: [point("a", 44.0, 8.5)] },
        ]),
      ),
    )
    expect(summaries.map((s) => s.dayNumber)).toEqual([1, 2])
  })

  it("sums per-day distance from the ordered points", () => {
    const a = point("a", 44.0, 8.5, "b")
    const b = point("b", 44.2, 8.7)
    const summaries = daySummariesFromRoute(
      extractRouteData(detail([{ dayNumber: 1, date: "2026-07-01", points: [a, b] }])),
    )
    const expected = haversineNm(
      { latitude: 44.0, longitude: 8.5 },
      { latitude: 44.2, longitude: 8.7 },
    )
    expect(summaries[0].distanceNm).toBeCloseTo(expected, 5)
    expect(summaries[0].date).toBe("2026-07-01")
  })

  it("walks the nextId linked list regardless of array order", () => {
    const a = point("a", 44.0, 8.5, "b")
    const b = point("b", 44.2, 8.7)
    const ordered = daySummariesFromRoute(
      extractRouteData(detail([{ dayNumber: 1, points: [a, b] }])),
    )
    const reversed = daySummariesFromRoute(
      extractRouteData(detail([{ dayNumber: 1, points: [b, a] }])),
    )
    expect(reversed[0].distanceNm).toBeCloseTo(ordered[0].distanceNm, 5)
  })

  it("treats a single-point day as zero distance", () => {
    const summaries = daySummariesFromRoute(
      extractRouteData(detail([{ dayNumber: 1, points: [point("a", 44, 8.5)] }])),
    )
    expect(summaries[0].distanceNm).toBe(0)
  })

  it("returns an empty list when there are no numbered days", () => {
    expect(daySummariesFromRoute(extractRouteData(detail([{ dayNumber: 0, points: [] }])))).toEqual(
      [],
    )
  })
})

describe("extractRouteData — day segments", () => {
  it("groups points into per-day segments, excluding day 0", () => {
    const route = extractRouteData(
      detail([
        { dayNumber: 1, date: "2026-07-01", points: [point("a", 44.0, 8.5)] },
        { dayNumber: 2, date: "2026-07-02", points: [point("b", 44.1, 8.6)] },
        { dayNumber: 0, points: [point("z", 44.0, 8.5)] },
      ]),
    )
    expect(route.days.map((d) => d.dayNumber)).toEqual([1, 2])
    expect(route.days[0].date).toBe("2026-07-01")
  })

  it("colours each day segment via getDayColor", () => {
    const route = extractRouteData(
      detail([
        { dayNumber: 1, points: [point("a", 44.0, 8.5)] },
        { dayNumber: 2, points: [point("b", 44.1, 8.6)] },
      ]),
    )
    expect(route.days[0].color).toBe(getDayColor(1))
    expect(route.days[1].color).toBe(getDayColor(2))
  })

  it("carries each day's own distance", () => {
    const a = point("a", 44.0, 8.5, "b")
    const b = point("b", 44.2, 8.7)
    const route = extractRouteData(detail([{ dayNumber: 1, points: [a, b] }]))
    const expected = haversineNm(
      { latitude: 44.0, longitude: 8.5 },
      { latitude: 44.2, longitude: 8.7 },
    )
    expect(route.days[0].distanceNm).toBeCloseTo(expected, 5)
  })

  it("carries opted-in photo URLs on each point", () => {
    const withPhoto = point("a", 44.0, 8.5, undefined, [{ url: "https://example.com/a.jpg" }])
    const route = extractRouteData(detail([{ dayNumber: 1, points: [withPhoto] }]))
    expect(route.days[0].points[0].images).toEqual([{ url: "https://example.com/a.jpg" }])
  })

  it("still returns the flattened positions/points for non-day-aware consumers", () => {
    const route = extractRouteData(
      detail([
        { dayNumber: 1, points: [point("a", 44.0, 8.5)] },
        { dayNumber: 2, points: [point("b", 44.1, 8.6)] },
      ]),
    )
    expect(route.positions).toEqual([
      [44.0, 8.5],
      [44.1, 8.6],
    ])
    expect(route.points).toHaveLength(2)
  })
})

describe("extractRouteData — point numbering", () => {
  it("numbers every point by its ordinal position across the whole route, not reset per day", () => {
    // 4 points total across 2 days — expect 1..4 straight through, day 2 continuing from day 1.
    const a = point("a", 44.0, 8.5, "b")
    const b = { ...point("b", 44.1, 8.6), type: "stop" as const }
    const c = point("c", 44.2, 8.7, "d")
    const d = { ...point("d", 44.3, 8.8), type: "stop" as const }
    const route = extractRouteData(
      detail([
        { dayNumber: 1, points: [a, b] },
        { dayNumber: 2, points: [c, d] },
      ]),
    )
    expect(route.days[0].points.map((p) => p.pointNumber)).toEqual([1, 2])
    expect(route.days[1].points.map((p) => p.pointNumber)).toEqual([3, 4])
  })

  it("numbers waypoints (type: position) too, not just overnight stops", () => {
    const route = extractRouteData(detail([{ dayNumber: 1, points: [point("a", 44.0, 8.5)] }]))
    expect(route.days[0].points[0].pointNumber).toBe(1)
  })
})

describe("extractRouteData — §M shared boundary-stop derivation", () => {
  it("includes a day's own end boundary even when the point row is stored under the next day", () => {
    // Simulates single-owner storage: the shared stop "b" is only present in
    // day 2's own `points` array, not day 1's — even though it's day 1's own
    // endPointId. The global point map spans every day, so the walk still
    // resolves it for day 1.
    const a = point("a", 44.0, 8.5, "b")
    const b = point("b", 44.2, 8.7, "c")
    const c = point("c", 44.4, 8.9)
    const route = extractRouteData(
      detail([
        { dayNumber: 1, points: [a], startPointId: "a", endPointId: "b" },
        { dayNumber: 2, points: [b, c], startPointId: "b", endPointId: "c" },
      ]),
    )
    // Without the fix, day 1 would only resolve "a" (its own point row).
    expect(route.days[0].points).toHaveLength(2)
    const expectedDay1Distance = haversineNm(
      { latitude: 44.0, longitude: 8.5 },
      { latitude: 44.2, longitude: 8.7 },
    )
    expect(route.days[0].distanceNm).toBeCloseTo(expectedDay1Distance, 5)
  })

  it("falls back to the existing multi-chain walk when a day has no boundary metadata", () => {
    // No startPointId/endPointId at all — must still walk day.points directly,
    // exactly as before (public routes with organic/fresh days).
    const a = point("a", 44.0, 8.5, "b")
    const b = point("b", 44.2, 8.7)
    const route = extractRouteData(detail([{ dayNumber: 1, points: [a, b] }]))
    const expected = haversineNm(
      { latitude: 44.0, longitude: 8.5 },
      { latitude: 44.2, longitude: 8.7 },
    )
    expect(route.days[0].distanceNm).toBeCloseTo(expected, 5)
  })
})

describe("extractRouteData — boundary colours", () => {
  it("keys a shared boundary stop with the adjacent days' colours and carries point ids", () => {
    // Shared stop "b" is day 2's startPointId (and day 1's endPointId) — it must
    // appear in boundaryColors with day 1 on the left and day 2 on the right.
    const a = point("a", 44.0, 8.5, "b")
    const b = point("b", 44.2, 8.7, "c")
    const c = point("c", 44.4, 8.9)
    const route = extractRouteData(
      detail([
        { dayNumber: 1, points: [a], startPointId: "a", endPointId: "b" },
        { dayNumber: 2, points: [b, c], startPointId: "b", endPointId: "c" },
      ]),
    )
    expect(route.boundaryColors).toEqual({
      b: { left: getDayColor(1), right: getDayColor(2) },
    })
    expect(route.days[0].points.map((p) => p.id)).toEqual(["a", "b"])
    expect(route.days[1].points.map((p) => p.id)).toEqual(["b", "c"])
  })

  it("returns an empty record when no day has boundary metadata", () => {
    const route = extractRouteData(detail([{ dayNumber: 1, points: [point("a", 44, 8.5)] }]))
    expect(route.boundaryColors).toEqual({})
  })
})

describe("extractItineraryRoute — day segments", () => {
  function itinerary(days: NonNullable<Itinerary["days"]>): Itinerary {
    return { id: "it-1", name: "Route", totalMiles: 0, days }
  }

  it("groups the authenticated itinerary's points into day segments too", () => {
    const route = extractItineraryRoute(
      itinerary([
        {
          id: "d1",
          dayNumber: 1,
          date: "2026-07-01",
          points: [{ id: "a", latitude: 44.0, longitude: 8.5, type: "position" }],
        },
      ]),
    )
    expect(route.days).toHaveLength(1)
    expect(route.days[0].color).toBe(getDayColor(1))
  })
})
