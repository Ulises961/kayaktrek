import { describe, it, expect } from "vitest"
import { monthSeries, ACTIVITY_MONTH_WINDOW } from "../activity"

const bucket = (month: string, distance: number) => ({ month, distance, hours: 1, count: 1 })

describe("monthSeries", () => {
  it("fills the gap months the backend never emits", () => {
    // stats_for_user only buckets months that have logs, so April/May/July come
    // back adjacent and the axis silently stops being a timeline.
    const series = monthSeries([
      bucket("2026-04", 18),
      bucket("2026-05", 12),
      bucket("2026-07", 30),
    ])

    expect(series.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07"])
  })

  it("marks a filled gap as having no data, distinct from a month of zero distance", () => {
    const series = monthSeries([bucket("2026-04", 18), bucket("2026-06", 30)])
    const may = series.find((m) => m.month === "2026-05")!

    expect(may.hasData).toBe(false)
    expect(may.distance).toBe(0)
    expect(series.find((m) => m.month === "2026-04")!.hasData).toBe(true)
  })

  it("rolls over the year boundary", () => {
    const series = monthSeries([bucket("2025-11", 5), bucket("2026-02", 9)])

    expect(series.map((m) => m.month)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"])
  })

  it("keeps only the most recent window when the history is long", () => {
    // Without a cap, three years of paddling is 36 rows in a summary block.
    const series = monthSeries([bucket("2020-01", 5), bucket("2026-01", 9)])

    expect(series).toHaveLength(ACTIVITY_MONTH_WINDOW)
    expect(series.at(-1)!.month).toBe("2026-01")
    expect(series.at(0)!.hasData).toBe(false)
  })

  it("drops buckets that fall outside the window rather than misplacing them", () => {
    const series = monthSeries([bucket("2020-01", 5), bucket("2026-01", 9)])

    expect(series.some((m) => m.month === "2020-01")).toBe(false)
    expect(series.reduce((sum, m) => sum + m.distance, 0)).toBe(9)
  })

  it("returns a single month as-is — the caller decides that is not a chart", () => {
    expect(monthSeries([bucket("2026-07", 20)]).map((m) => m.month)).toEqual(["2026-07"])
  })

  it("returns nothing for no buckets", () => {
    expect(monthSeries([])).toEqual([])
  })

  it("sorts unordered input before filling", () => {
    const series = monthSeries([bucket("2026-07", 30), bucket("2026-04", 18)])

    expect(series.map((m) => m.month)).toEqual(["2026-04", "2026-05", "2026-06", "2026-07"])
  })
})
