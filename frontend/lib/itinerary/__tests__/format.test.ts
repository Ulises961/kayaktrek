import { describe, it, expect } from "vitest"
import { formatRouteRange, computeRestGaps } from "../format"

describe("formatRouteRange", () => {
  it("joins two distinct names with 'to'", () => {
    expect(formatRouteRange("Henningsvær", "Nusfjord")).toBe("Henningsvær to Nusfjord")
  })

  it("returns just the start name when start and end are the same", () => {
    expect(formatRouteRange("Kabelvåg", "Kabelvåg")).toBe("Kabelvåg")
  })

  it("returns just the start name when there is no end name", () => {
    expect(formatRouteRange("Kabelvåg", null)).toBe("Kabelvåg")
  })

  it("returns an empty string when there is no start name", () => {
    expect(formatRouteRange(null, "Nusfjord")).toBe("")
  })

  it("returns an empty string when both names are absent", () => {
    expect(formatRouteRange(null, null)).toBe("")
  })
})

describe("computeRestGaps", () => {
  it("returns no gaps when consecutive dated days are back-to-back", () => {
    const gaps = computeRestGaps([
      { dayNumber: 1, date: "2026-07-01" },
      { dayNumber: 2, date: "2026-07-02" },
    ])
    expect(gaps).toEqual([])
  })

  it("emits one gap entry for a single undated calendar day between two dated days", () => {
    const gaps = computeRestGaps([
      { dayNumber: 1, date: "2026-07-01" },
      { dayNumber: 2, date: "2026-07-03" },
    ])
    expect(gaps).toEqual([{ afterDayNumber: 1, date: "2026-07-02" }])
  })

  it("emits one entry per undated calendar day for a multi-day gap", () => {
    const gaps = computeRestGaps([
      { dayNumber: 1, date: "2026-07-01" },
      { dayNumber: 2, date: "2026-07-05" },
    ])
    expect(gaps).toEqual([
      { afterDayNumber: 1, date: "2026-07-02" },
      { afterDayNumber: 1, date: "2026-07-03" },
      { afterDayNumber: 1, date: "2026-07-04" },
    ])
  })

  it("detects gaps across more than one pair of consecutive days", () => {
    const gaps = computeRestGaps([
      { dayNumber: 1, date: "2026-07-01" },
      { dayNumber: 2, date: "2026-07-03" },
      { dayNumber: 3, date: "2026-07-06" },
    ])
    expect(gaps).toEqual([
      { afterDayNumber: 1, date: "2026-07-02" },
      { afterDayNumber: 2, date: "2026-07-04" },
      { afterDayNumber: 2, date: "2026-07-05" },
    ])
  })

  it("ignores days with no date at all — they can't anchor a gap on either side", () => {
    const gaps = computeRestGaps([
      { dayNumber: 1, date: "2026-07-01" },
      { dayNumber: 2, date: null },
      { dayNumber: 3, date: "2026-07-03" },
    ])
    // Day 2 has no date, so the only dated pair is day 1 -> day 3, a 1-day gap.
    expect(gaps).toEqual([{ afterDayNumber: 1, date: "2026-07-02" }])
  })

  it("sorts by dayNumber regardless of input order", () => {
    const gaps = computeRestGaps([
      { dayNumber: 2, date: "2026-07-03" },
      { dayNumber: 1, date: "2026-07-01" },
    ])
    expect(gaps).toEqual([{ afterDayNumber: 1, date: "2026-07-02" }])
  })

  it("returns no gaps for a single day or an empty list", () => {
    expect(computeRestGaps([{ dayNumber: 1, date: "2026-07-01" }])).toEqual([])
    expect(computeRestGaps([])).toEqual([])
  })
})
