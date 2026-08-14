import { describe, it, expect } from "vitest"
import { expeditionProgress } from "../progress"

// `today` is injected rather than read from the clock so these assertions do not drift
// into failing overnight — the same UTC-vs-local `date.today()` bug M8's beat tasks hit.
const on = (today: string) => ({ today })

describe("expeditionProgress", () => {
  it("reports the first day as day 1, not day 0", () => {
    // Off-by-one here would greet a paddler with "Day 0 of 5" on launch morning.
    const progress = expeditionProgress("2026-07-01", "2026-07-05", on("2026-07-01"))

    expect(progress).toEqual({ dayNumber: 1, totalDays: 5, percent: 20 })
  })

  it("counts both endpoints, so a single-day trip is day 1 of 1 at 100%", () => {
    expect(expeditionProgress("2026-07-01", "2026-07-01", on("2026-07-01"))).toEqual({
      dayNumber: 1,
      totalDays: 1,
      percent: 100,
    })
  })

  it("tracks the middle of a trip", () => {
    expect(expeditionProgress("2026-07-01", "2026-07-14", on("2026-07-03"))).toEqual({
      dayNumber: 3,
      totalDays: 14,
      percent: 21,
    })
  })

  it("clamps a trip still running past its planned end to the final day", () => {
    // A trip that overruns must not render "Day 20 of 14" or a bar past 100%.
    expect(expeditionProgress("2026-07-01", "2026-07-05", on("2026-07-20"))).toEqual({
      dayNumber: 5,
      totalDays: 5,
      percent: 100,
    })
  })

  it("clamps a trip whose start is still in the future to day 1", () => {
    // `happening` is set by the leader, not by the calendar, so it can precede dateFrom.
    expect(expeditionProgress("2026-07-10", "2026-07-14", on("2026-07-01"))).toEqual({
      dayNumber: 1,
      totalDays: 5,
      percent: 20,
    })
  })

  it("returns null when either date is missing, so the caller can omit the bar", () => {
    expect(expeditionProgress(null, "2026-07-05", on("2026-07-01"))).toBeNull()
    expect(expeditionProgress("2026-07-01", null, on("2026-07-01"))).toBeNull()
    expect(expeditionProgress(null, null, on("2026-07-01"))).toBeNull()
  })

  it("returns null when the range is inverted rather than reporting negative progress", () => {
    // The create/edit schema rejects this, but a trip predating that validation could
    // still carry it, and a negative-width bar is worse than no bar.
    expect(expeditionProgress("2026-07-05", "2026-07-01", on("2026-07-03"))).toBeNull()
  })

  it("reads dates as calendar days, not instants, so late-evening local time is not day+1", () => {
    // Parsing "2026-07-01" as UTC midnight and comparing against a local clock is how
    // the M8 beat tasks drifted a day. All three inputs are plain dates here.
    expect(expeditionProgress("2026-07-01", "2026-07-05", on("2026-07-02"))).toEqual({
      dayNumber: 2,
      totalDays: 5,
      percent: 40,
    })
  })
})
