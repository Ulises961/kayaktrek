import { describe, it, expect } from "vitest"
import { daysBetween, formatDateRange } from "../format"

describe("daysBetween", () => {
  it("counts inclusive calendar days between two ISO dates", () => {
    // Paddlers plan by inclusive days: Jul 1 -> Jul 5 is 5 paddling days / 4 nights
    // (M12 §A / review 2.2 — was exclusive, read "4 days" for this exact range).
    expect(daysBetween("2026-07-01", "2026-07-05")).toBe(5)
  })

  it("returns 1 for the same date (a single-day trip)", () => {
    expect(daysBetween("2026-07-01", "2026-07-01")).toBe(1)
  })
})

describe("formatDateRange", () => {
  it("omits the year on the start date when both dates share a year", () => {
    expect(formatDateRange("2026-07-01", "2026-07-05")).toBe("1 Jul – 5 Jul 2026")
  })

  it("includes the year on both dates when they span a year boundary", () => {
    expect(formatDateRange("2026-12-30", "2027-01-02")).toBe("30 Dec 2026 – 2 Jan 2027")
  })

  it("falls back to 'Dates not set' when both dates are absent", () => {
    expect(formatDateRange(null, undefined)).toBe("Dates not set")
  })

  it("formats just the one date present when only dateFrom is set", () => {
    expect(formatDateRange("2026-07-01", null)).toBe("1 Jul 2026")
  })

  it("formats just the one date present when only dateTo is set", () => {
    expect(formatDateRange(undefined, "2026-07-05")).toBe("5 Jul 2026")
  })
})
