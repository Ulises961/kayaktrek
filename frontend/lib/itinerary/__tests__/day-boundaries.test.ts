import { describe, it, expect } from "vitest"
import { buildBoundaryColorMap, resolveLegDayNumber } from "../day-boundaries"
import { getDayColor, UNASSIGNED_COLOR } from "../colors"

describe("buildBoundaryColorMap", () => {
  it("maps each numbered day's startPointId (day > 1) to the adjacent days' colours", () => {
    const map = buildBoundaryColorMap([
      { dayNumber: 1, startPointId: "a" },
      { dayNumber: 2, startPointId: "b" },
      { dayNumber: 3, startPointId: "c" },
    ])
    expect(map).toEqual({
      b: { left: getDayColor(1), right: getDayColor(2) },
      c: { left: getDayColor(2), right: getDayColor(3) },
    })
  })

  it("never keys day 1's start — there is no previous day to split against", () => {
    const map = buildBoundaryColorMap([{ dayNumber: 1, startPointId: "a" }])
    expect(map).toEqual({})
  })

  it("skips unnumbered days and days without boundary metadata", () => {
    const map = buildBoundaryColorMap([
      { dayNumber: 0, startPointId: "z" },
      { dayNumber: 2, startPointId: null },
      { dayNumber: 3 },
    ])
    expect(map).toEqual({})
  })
})

describe("resolveLegDayNumber", () => {
  it("greys a leg touching an unassigned point", () => {
    expect(resolveLegDayNumber(0, 1, false)).toBe(0)
    expect(resolveLegDayNumber(1, 0, false)).toBe(0)
    expect(getDayColor(resolveLegDayNumber(0, 1, false))).toBe(UNASSIGNED_COLOR)
  })

  it("keeps a same-day leg on that day", () => {
    expect(resolveLegDayNumber(2, 2, false)).toBe(2)
  })

  it("colours the leg leaving a boundary stop with the following day", () => {
    expect(resolveLegDayNumber(1, 2, true)).toBe(2)
  })

  it("greys a cross-day leg when the start is not a boundary stop", () => {
    expect(resolveLegDayNumber(1, 2, false)).toBe(0)
  })

  it("greys a boundary leg that skips a day", () => {
    expect(resolveLegDayNumber(1, 3, true)).toBe(0)
  })
})
