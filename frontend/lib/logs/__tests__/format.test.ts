import { describe, it, expect } from "vitest"
import { averageSeaState } from "../format"

describe("averageSeaState", () => {
  it("returns null for an empty distribution", () => {
    expect(averageSeaState({})).toBeNull()
  })

  it("returns the value itself for a single-bucket distribution", () => {
    expect(averageSeaState({ "3": 5 })).toBe(3)
  })

  it("computes a weighted mean across buckets", () => {
    // (2*1 + 4*1) / 2 = 3
    expect(averageSeaState({ "2": 1, "4": 1 })).toBe(3)
  })

  it("weights by count, not just distinct buckets", () => {
    // (0*3 + 6*1) / 4 = 1.5
    expect(averageSeaState({ "0": 3, "6": 1 })).toBe(1.5)
  })
})
