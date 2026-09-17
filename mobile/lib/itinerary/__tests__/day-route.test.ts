import type { Day } from "@shared/dtos/day"
import { getDayColor, UNASSIGNED_COLOR } from "@shared/itinerary/colors"

import { buildDayColoredRoute } from "../day-route"

function point(id: string, lat: number, lng: number, nextId?: string) {
  return { id, latitude: lat, longitude: lng, type: "stop" as const, nextId: nextId ?? null }
}

describe("buildDayColoredRoute", () => {
  it("colors a single day's legs with that day's color", () => {
    const days: Day[] = [
      {
        id: "day-1",
        dayNumber: 1,
        points: [point("a", 0, 0, "b"), point("b", 0, 1, "c"), point("c", 0, 2)],
      },
    ]

    const { points, legs } = buildDayColoredRoute(days)

    expect(points.map((p) => p.id)).toEqual(["a", "b", "c"])
    expect(points.every((p) => p.dayNumber === 1)).toBe(true)
    expect(legs).toHaveLength(2)
    for (const leg of legs) {
      expect(leg.properties.dayNum).toBe(1)
      expect(leg.properties.color).toBe(getDayColor(1))
    }
  })

  it("colors the connecting leg with the arriving day's color at a shared boundary stop", () => {
    const days: Day[] = [
      {
        id: "day-1",
        dayNumber: 1,
        startPointId: "a",
        endPointId: "b",
        points: [point("a", 0, 0, "b"), point("b", 0, 1)],
      },
      {
        id: "day-2",
        dayNumber: 2,
        startPointId: "b",
        endPointId: "c",
        points: [point("b", 0, 1, "c"), point("c", 0, 2)],
      },
    ]

    const { points, legs } = buildDayColoredRoute(days)

    // "b" is shared — walked once per day it belongs to as each day's own
    // points are walked independently, so it appears twice in the flat list
    // (once ending day 1, once starting day 2) — this is what lets the
    // connecting leg exist at all.
    expect(points.map((p) => p.id)).toEqual(["a", "b", "b", "c"])
    expect(legs.map((l) => l.properties.dayNum)).toEqual([1, 2, 2])
    expect(legs[1].properties.color).toBe(getDayColor(2))
  })

  it("falls back to the unassigned color for a cross-day leg with no shared boundary", () => {
    const days: Day[] = [
      { id: "day-1", dayNumber: 1, points: [point("a", 0, 0)] },
      { id: "day-2", dayNumber: 2, points: [point("b", 0, 1)] },
    ]

    const { legs } = buildDayColoredRoute(days)

    expect(legs).toHaveLength(1)
    expect(legs[0].properties.dayNum).toBe(0)
    expect(legs[0].properties.color).toBe(UNASSIGNED_COLOR)
  })

  it("drops points with no coordinates and orders days by dayNumber, not array order", () => {
    const days: Day[] = [
      { id: "day-2", dayNumber: 2, points: [point("c", 0, 2)] },
      {
        id: "day-1",
        dayNumber: 1,
        points: [
          point("a", 0, 0, "unlocated"),
          { id: "unlocated", type: "stop", nextId: "b" },
          point("b", 0, 1),
        ],
      },
    ]

    const { points } = buildDayColoredRoute(days)

    expect(points.map((p) => p.id)).toEqual(["a", "b", "c"])
  })

  it("returns no points or legs for an empty trip", () => {
    expect(buildDayColoredRoute([])).toEqual({ points: [], legs: [] })
  })
})
