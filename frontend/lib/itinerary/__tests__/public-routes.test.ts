import { describe, it, expect } from "vitest"
import { extractDaySummaries } from "../public-routes"
import { haversineNm } from "../distance"
import type { PublicItineraryDetail, PublicPoint } from "@/lib/dtos/itinerary"

function point(id: string, latitude: number, longitude: number, nextId?: string): PublicPoint {
  return { id, latitude, longitude, type: "position", nextId }
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
