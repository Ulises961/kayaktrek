import { describe, it, expect } from "vitest"
import { buildBoundaryColorMap, deriveDayBoundaries, resolveLegDayNumber } from "../day-boundaries"
import { getDayColor, UNASSIGNED_COLOR } from "../colors"

describe("buildBoundaryColorMap", () => {
  it("maps a day's startPointId (day > 1) to the adjacent days' colours when it actually matches the previous day's endPointId", () => {
    const map = buildBoundaryColorMap([
      { dayNumber: 1, startPointId: "a", endPointId: "b" },
      { dayNumber: 2, startPointId: "b", endPointId: "c" },
      { dayNumber: 3, startPointId: "c", endPointId: "d" },
    ])
    expect(map).toEqual({
      b: { left: getDayColor(1), right: getDayColor(2) },
      c: { left: getDayColor(2), right: getDayColor(3) },
    })
  })

  it("does NOT mark a day's start as a boundary when it doesn't match the previous day's end — two genuinely separate points, not an overnight stop", () => {
    // Reproduces a real bug: a day's own startPointId was always treated as a
    // shared boundary whenever dayNumber > 1, even when that day's route
    // simply starts somewhere else entirely (no shared overnight stop) —
    // rendering a false split-ring marker with no incoming leg to match it.
    const map = buildBoundaryColorMap([
      { dayNumber: 1, startPointId: "a", endPointId: "cala-montjoi" },
      { dayNumber: 2, startPointId: "cap-norfeu", endPointId: "cadaques" },
    ])
    expect(map).toEqual({})
  })

  it("never keys day 1's start — there is no previous day to split against", () => {
    const map = buildBoundaryColorMap([{ dayNumber: 1, startPointId: "a", endPointId: "b" }])
    expect(map).toEqual({})
  })

  it("skips unnumbered days and days without boundary metadata", () => {
    const map = buildBoundaryColorMap([
      { dayNumber: 0, startPointId: "z", endPointId: "z2" },
      { dayNumber: 2, startPointId: null, endPointId: "y" },
      { dayNumber: 3 },
    ])
    expect(map).toEqual({})
  })

  it("skips a day whose previous day has no endPointId recorded yet", () => {
    const map = buildBoundaryColorMap([
      { dayNumber: 1, startPointId: "a" },
      { dayNumber: 2, startPointId: "b" },
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

describe("deriveDayBoundaries", () => {
  const days = [
    { id: "d0", dayNumber: 0 },
    { id: "d1", dayNumber: 1 },
    { id: "d2", dayNumber: 2 },
  ]

  it("starts a day at its own first point and ends it where the next day starts", () => {
    const points = [
      { id: "putin", dayId: "d1" },
      { id: "cape", dayId: "d1" },
      { id: "camp", dayId: "d2" },
      { id: "takeout", dayId: "d2" },
    ]

    expect(deriveDayBoundaries(days, points)).toEqual({
      d1: { startPointId: "putin", endPointId: "camp" },
      d2: { startPointId: "camp", endPointId: "takeout" },
    })
  })

  it("ends the last numbered day at its own last point", () => {
    const points = [
      { id: "putin", dayId: "d1" },
      { id: "takeout", dayId: "d1" },
    ]

    expect(deriveDayBoundaries([days[0], days[1]], points)).toEqual({
      d1: { startPointId: "putin", endPointId: "takeout" },
    })
  })

  it("never assigns boundaries to day 0's unassigned staging points", () => {
    const points = [{ id: "loose", dayId: "d0" }]

    expect(deriveDayBoundaries(days, points).d0).toBeUndefined()
  })

  it("gives a day with no points at all a null start and end", () => {
    const points = [{ id: "putin", dayId: "d1" }]

    expect(deriveDayBoundaries(days, points).d2).toEqual({ startPointId: null, endPointId: null })
  })
})
