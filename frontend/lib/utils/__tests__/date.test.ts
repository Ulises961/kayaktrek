import { describe, it, expect } from "vitest"
import { formatDayDate, addDaysIso } from "../date"

describe("formatDayDate", () => {
  it("formats an ISO date as 'd MMM yyyy'", () => {
    expect(formatDayDate("2026-07-02")).toBe("2 Jul 2026")
  })

  it("returns '—' for null", () => {
    expect(formatDayDate(null)).toBe("—")
  })

  it("returns '—' for undefined", () => {
    expect(formatDayDate(undefined)).toBe("—")
  })

  it("returns '—' for an invalid date string", () => {
    expect(formatDayDate("not-a-date")).toBe("—")
  })
})

describe("addDaysIso", () => {
  it("adds days within a month", () => {
    expect(addDaysIso("2026-06-15", 1)).toBe("2026-06-16")
  })

  it("rolls over into the next month", () => {
    expect(addDaysIso("2026-06-30", 1)).toBe("2026-07-01")
  })

  it("rolls over into the next year", () => {
    expect(addDaysIso("2026-12-31", 1)).toBe("2027-01-01")
  })

  it("subtracts days with a negative count", () => {
    expect(addDaysIso("2026-06-15", -7)).toBe("2026-06-08")
  })

  it("subtracts across a month boundary", () => {
    expect(addDaysIso("2026-07-01", -1)).toBe("2026-06-30")
  })
})
