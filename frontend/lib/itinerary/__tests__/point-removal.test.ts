import { describe, it, expect } from "vitest"
import { repointDraftAfterPointRemoval } from "../point-removal"
import type { DraftBoundary } from "../boundaries"

const POINT_ORDER = ["p1", "p2", "p3", "p4"]

describe("repointDraftAfterPointRemoval", () => {
  it("re-anchors the boundary that ends on the removed point to its predecessor", () => {
    const draft: DraftBoundary[] = [
      { dayId: "day-1", dayNumber: 1, endPointId: "p2", date: null },
      { dayId: "day-2", dayNumber: 2, endPointId: null, date: null },
    ]
    const result = repointDraftAfterPointRemoval(draft, POINT_ORDER, "p2")
    expect(result).toEqual([
      { dayId: "day-1", dayNumber: 1, endPointId: "p1", date: null },
      { dayId: "day-2", dayNumber: 2, endPointId: null, date: null },
    ])
  })

  it("clamps to null (anchor loss) when the removed point was the first in pointOrder", () => {
    const draft: DraftBoundary[] = [
      { dayId: "day-1", dayNumber: 1, endPointId: "p1", date: null },
      { dayId: "day-2", dayNumber: 2, endPointId: null, date: null },
    ]
    const result = repointDraftAfterPointRemoval(draft, POINT_ORDER, "p1")
    expect(result).toEqual([
      { dayId: "day-1", dayNumber: 1, endPointId: null, date: null },
      { dayId: "day-2", dayNumber: 2, endPointId: null, date: null },
    ])
  })

  it("leaves boundaries that do not end on the removed point untouched", () => {
    const draft: DraftBoundary[] = [
      { dayId: "day-1", dayNumber: 1, endPointId: "p2", date: "2026-07-01" },
      { dayId: "day-2", dayNumber: 2, endPointId: null, date: null },
    ]
    const result = repointDraftAfterPointRemoval(draft, POINT_ORDER, "p4")
    expect(result).toEqual(draft)
    expect(result).not.toBe(draft)
  })

  it("re-anchors the last day's stored (tail-rule-ignored) endPointId too, so it stays correct once the day stops being last", () => {
    // Dropping a point always appends it to the tail of pointOrder, so the only
    // boundary that can ever end on a just-added point is the current last
    // day's — resolveDraft's tail rule ignores that value while it stays last,
    // but it becomes load-bearing again the moment another day is appended.
    const draft: DraftBoundary[] = [{ dayId: "day-1", dayNumber: 1, endPointId: "p4", date: null }]
    const result = repointDraftAfterPointRemoval(draft, POINT_ORDER, "p4")
    expect(result).toEqual([{ dayId: "day-1", dayNumber: 1, endPointId: "p3", date: null }])
  })
})
