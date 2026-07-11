import { describe, it, expect } from "vitest"
import { walkDayRoutePoints } from "../day-points"

type P = { id: string; nextId?: string | null }

function pointsMap(points: P[]): Map<string, P> {
  return new Map(points.map((p) => [p.id, p]))
}

describe("walkDayRoutePoints", () => {
  it("walks startPointId to endPointId via nextId, inclusive of both ends", () => {
    const points: P[] = [
      { id: "a", nextId: "b" },
      { id: "b", nextId: "c" },
      { id: "c", nextId: "d" },
      { id: "d", nextId: null },
    ]
    const result = walkDayRoutePoints({ startPointId: "b", endPointId: "c" }, pointsMap(points))
    expect(result.map((p) => p.id)).toEqual(["b", "c"])
  })

  it("stops exactly at endPointId even if the chain continues further", () => {
    const points: P[] = [
      { id: "a", nextId: "b" },
      { id: "b", nextId: "c" },
      { id: "c", nextId: "d" },
      { id: "d", nextId: null },
    ]
    const result = walkDayRoutePoints({ startPointId: "a", endPointId: "b" }, pointsMap(points))
    expect(result.map((p) => p.id)).toEqual(["a", "b"])
  })

  it("a rest day (start === end) resolves to a single-element array", () => {
    const points: P[] = [
      { id: "a", nextId: "b" },
      { id: "b", nextId: null },
    ]
    const result = walkDayRoutePoints({ startPointId: "a", endPointId: "a" }, pointsMap(points))
    expect(result.map((p) => p.id)).toEqual(["a"])
  })

  it("resolves the shared boundary point even when it belongs to a different day's chain in storage", () => {
    // Simulates single-owner storage: the shared stop "b" isn't reachable by
    // walking day 1's *own* points alone in the old model, but the global
    // pointsById map (spanning every day's points) always has it.
    const points: P[] = [
      { id: "a", nextId: "b" },
      { id: "b", nextId: "c" },
      { id: "c", nextId: null },
    ]
    const result = walkDayRoutePoints({ startPointId: "a", endPointId: "b" }, pointsMap(points))
    expect(result.map((p) => p.id)).toEqual(["a", "b"])
  })

  it("returns an empty array when there is no boundary metadata and no fallback", () => {
    const result = walkDayRoutePoints({ startPointId: null, endPointId: null }, pointsMap([]))
    expect(result).toEqual([])
  })

  it("falls back to the fallbackPoints chain-head heuristic when there is no boundary metadata", () => {
    const fallback: P[] = [
      { id: "x", nextId: "y" },
      { id: "y", nextId: "z" },
      { id: "z", nextId: null },
    ]
    const result = walkDayRoutePoints(
      { startPointId: null, endPointId: null },
      pointsMap([]),
      fallback,
    )
    expect(result.map((p) => p.id)).toEqual(["x", "y", "z"])
  })

  it("falls back when startPointId is set but does not resolve in pointsById", () => {
    const fallback: P[] = [{ id: "x", nextId: null }]
    const result = walkDayRoutePoints(
      { startPointId: "missing", endPointId: "missing" },
      pointsMap([]),
      fallback,
    )
    expect(result.map((p) => p.id)).toEqual(["x"])
  })

  it("prefers the boundary-id walk over the fallback when boundary metadata resolves", () => {
    const points: P[] = [
      { id: "a", nextId: "b" },
      { id: "b", nextId: null },
    ]
    const fallback: P[] = [{ id: "unrelated", nextId: null }]
    const result = walkDayRoutePoints(
      { startPointId: "a", endPointId: "b" },
      pointsMap(points),
      fallback,
    )
    expect(result.map((p) => p.id)).toEqual(["a", "b"])
  })

  it("does not loop forever on a cyclic chain", () => {
    const points: P[] = [
      { id: "a", nextId: "b" },
      { id: "b", nextId: "a" },
    ]
    const result = walkDayRoutePoints(
      { startPointId: "a", endPointId: "does-not-exist" },
      pointsMap(points),
    )
    expect(result.map((p) => p.id)).toEqual(["a", "b"])
  })

  it("returns an empty array when fallbackPoints is empty and there is no boundary metadata", () => {
    const result = walkDayRoutePoints({ startPointId: null, endPointId: null }, pointsMap([]), [])
    expect(result).toEqual([])
  })
})
