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

  it("colors both legs around a shared boundary stop when both days' arrays include it", () => {
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

    // "b" is deduped to its first (day 1) occurrence, then overridden back to
    // the departing day regardless — see the real-world case below, where it
    // only ever appears in day 2's array in the first place.
    expect(points.map((p) => p.id)).toEqual(["a", "b", "c"])
    expect(points.find((p) => p.id === "b")?.dayNumber).toBe(1)
    expect(legs.map((l) => l.properties.dayNum)).toEqual([1, 2])
    expect(legs[0].properties.color).toBe(getDayColor(1))
    expect(legs[1].properties.color).toBe(getDayColor(2))
  })

  it("colors the leg approaching a shared boundary stop even when only the arriving day's array contains it", () => {
    // Matches the real backend shape: apply_boundaries assigns a point's day_id
    // per boundary range, processed in day-number order, so a point that's both
    // day N's endPointId and day N+1's startPointId ends up owned by day N+1 (the
    // later range wins) — day N's own `points` array never includes it at all.
    const days: Day[] = [
      {
        id: "day-1",
        dayNumber: 1,
        startPointId: "a",
        endPointId: "b",
        points: [point("a", 0, 0)],
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

    expect(points.map((p) => p.id)).toEqual(["a", "b", "c"])
    expect(points.find((p) => p.id === "b")?.dayNumber).toBe(1)
    expect(legs.map((l) => l.properties.dayNum)).toEqual([1, 2])
    expect(legs[0].properties.color).toBe(getDayColor(1))
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

  // M34 WP4: mid-route insertion (tap near an existing leg) needs to know which
  // point the new one would be inserted after.
  it("tags each leg with the id of its predecessor point", () => {
    const days: Day[] = [
      {
        id: "day-1",
        dayNumber: 1,
        points: [point("a", 0, 0, "b"), point("b", 0, 1, "c"), point("c", 0, 2)],
      },
    ]

    const { legs } = buildDayColoredRoute(days)

    expect(legs.map((l) => l.properties.afterId)).toEqual(["a", "b"])
  })
})
