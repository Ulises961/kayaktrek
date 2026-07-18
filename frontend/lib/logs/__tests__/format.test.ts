import { describe, it, expect } from "vitest"
import { modalSeaState } from "../format"

describe("modalSeaState", () => {
  it("returns null for an empty distribution", () => {
    expect(modalSeaState({})).toBeNull()
  })

  it("returns the value itself for a single-bucket distribution", () => {
    expect(modalSeaState({ "3": 5 })).toBe(3)
  })

  it("returns the most frequently logged Beaufort value, not a mean of the buckets", () => {
    // Mean would be (2*1 + 4*9) / 10 = 3.8 — the paddler's actual typical
    // conditions are B4, logged 9 times against B2's single occurrence.
    expect(modalSeaState({ "2": 1, "4": 9 })).toBe(4)
  })

  it("breaks a tie between equally-frequent buckets by picking the lower Beaufort value", () => {
    expect(modalSeaState({ "2": 3, "6": 3 })).toBe(2)
  })
})
