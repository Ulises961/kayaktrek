import { describe, it, expect } from "vitest"
import { daysBetween, formatDateRange } from "../format"

describe("daysBetween", () => {
  it("counts calendar days between two ISO dates", () => {
    // NOTE: exclusive count (Jul 1 -> Jul 5 reads "4 days", not the inclusive 5).
    // This is the known bug tracked for M12 §A — preserved here as-is; §L only
    // relocates the helper, it does not change behavior.
    expect(daysBetween("2026-07-01", "2026-07-05")).toBe(4)
  })

  it("returns 0 for the same date", () => {
    expect(daysBetween("2026-07-01", "2026-07-01")).toBe(0)
  })
})

describe("formatDateRange", () => {
  it("omits the year on the start date when both dates share a year", () => {
    expect(formatDateRange("2026-07-01", "2026-07-05")).toBe("1 Jul – 5 Jul 2026")
  })

  it("includes the year on both dates when they span a year boundary", () => {
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027")
  })
})
