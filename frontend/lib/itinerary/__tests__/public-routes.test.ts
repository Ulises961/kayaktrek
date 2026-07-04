import { describe, it, expect } from "vitest"
import { extractDaySummaries, extractRouteData, extractItineraryRoute } from "../public-routes"
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

describe("extractDaySummaries", () => {
  it("excludes day 0 and returns numbered days sorted", () => {
    const summaries = extractDaySummaries(
      detail([
        { dayNumber: 2, points: [point("b", 44.1, 8.6)] },
        { dayNumber: 0, points: [point("z", 44.0, 8.5)] },
        { dayNumber: 1, points: [point("a", 44.0, 8.5)] },
      ]),
    )
    expect(summaries.map((s) => s.dayNumber)).toEqual([1, 2])
  })

  it("sums per-day distance from the ordered points", () => {
    const a = point("a", 44.0, 8.5, "b")
    const b = point("b", 44.2, 8.7)
    const summaries = extractDaySummaries(
      detail([{ dayNumber: 1, date: "2026-07-01", points: [a, b] }]),
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
    const ordered = extractDaySummaries(detail([{ dayNumber: 1, points: [a, b] }]))
    const reversed = extractDaySummaries(detail([{ dayNumber: 1, points: [b, a] }]))
    expect(reversed[0].distanceNm).toBeCloseTo(ordered[0].distanceNm, 5)
  })

  it("treats a single-point day as zero distance", () => {
    const summaries = extractDaySummaries(detail([{ dayNumber: 1, points: [point("a", 44, 8.5)] }]))
    expect(summaries[0].distanceNm).toBe(0)
  })

  it("returns an empty list when there are no numbered days", () => {
    expect(extractDaySummaries(detail([{ dayNumber: 0, points: [] }]))).toEqual([])
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

  it("carries each day's own distance, matching extractDaySummaries", () => {
    const a = point("a", 44.0, 8.5, "b")
    const b = point("b", 44.2, 8.7)
    const days = detail([{ dayNumber: 1, points: [a, b] }]).days
    const route = extractRouteData(detail(days))
    const [summary] = extractDaySummaries(detail(days))
    expect(route.days[0].distanceNm).toBeCloseTo(summary.distanceNm, 5)
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
