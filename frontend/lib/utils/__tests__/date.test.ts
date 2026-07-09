import { describe, it, expect } from "vitest"
import { formatDayDate } from "../date"

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
