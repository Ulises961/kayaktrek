import { compareRoutes } from "../route-compare"
import type { EditableRoute } from "../route-edits"

function route(points: [string, string, number, number, string?][]): EditableRoute {
  return {
    days: [
      { id: "d1", dayNumber: 1, date: null, startPointId: null, endPointId: null },
      { id: "d2", dayNumber: 2, date: null, startPointId: null, endPointId: null },
    ],
    points: points.map(([id, dayId, latitude, longitude, name], index) => ({
      id,
      dayId,
      orderKey: String((index + 1) * 1000).padStart(8, "0"),
      latitude,
      longitude,
      name: name ?? id,
      notes: null,
      type: "stop",
    })),
  }
}

const BASE: [string, string, number, number, string?][] = [
  ["a", "d1", 42, 3],
  ["b", "d1", 42.1, 3.1],
  ["c", "d2", 42.2, 3.2],
]

// The leader has to see what differs between the phone's route and the one that
// changed elsewhere before choosing — a guess about route data is a
// safety-relevant guess (sync-protocol-spec.md §8.3).
describe("compareRoutes", () => {
  it("finds nothing between identical routes", () => {
    const comparison = compareRoutes(route(BASE), route(BASE))

    expect(comparison.differences).toEqual([])
  })

  it("finds a point added on the phone", () => {
    const mine = route([...BASE, ["beach", "d2", 42.3, 3.3, "Beach"]])

    const comparison = compareRoutes(mine, route(BASE))

    expect(comparison.differences).toContainEqual(
      expect.objectContaining({ kind: "only-mine", pointId: "beach", name: "Beach" }),
    )
  })

  it("finds a point that exists only in the other version", () => {
    const theirs = route([...BASE, ["island", "d2", 42.3, 3.3, "Island"]])

    const comparison = compareRoutes(route(BASE), theirs)

    expect(comparison.differences).toContainEqual(
      expect.objectContaining({ kind: "only-theirs", pointId: "island", name: "Island" }),
    )
  })

  it("finds a point moved on the map", () => {
    const mine = route([["a", "d1", 42, 3], ["b", "d1", 42.15, 3.1], ["c", "d2", 42.2, 3.2]])

    const comparison = compareRoutes(mine, route(BASE))

    expect(comparison.differences).toContainEqual(expect.objectContaining({ kind: "moved", pointId: "b" }))
  })

  it("finds a point moved to another day", () => {
    const mine = route([["a", "d1", 42, 3], ["b", "d2", 42.1, 3.1], ["c", "d2", 42.2, 3.2]])

    const comparison = compareRoutes(mine, route(BASE))

    expect(comparison.differences).toContainEqual(
      expect.objectContaining({ kind: "day-changed", pointId: "b" }),
    )
  })

  it("finds a point whose details changed", () => {
    const mine = route([["a", "d1", 42, 3], ["b", "d1", 42.1, 3.1, "Renamed"], ["c", "d2", 42.2, 3.2]])

    const comparison = compareRoutes(mine, route(BASE))

    expect(comparison.differences).toContainEqual(
      expect.objectContaining({ kind: "details-changed", pointId: "b" }),
    )
  })

  it("notices when the same points are in a different order", () => {
    const mine = route([["b", "d1", 42.1, 3.1], ["a", "d1", 42, 3], ["c", "d2", 42.2, 3.2]])

    expect(compareRoutes(mine, route(BASE)).orderDiffers).toBe(true)
    expect(compareRoutes(route(BASE), route(BASE)).orderDiffers).toBe(false)
  })
})
