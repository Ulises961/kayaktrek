import { describe, it, expect } from "vitest"
import { formatDayDate, addDaysIso, formatMinutesAgo, minutesSince } from "../date"

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

describe("minutesSince", () => {
  const now = new Date("2026-07-20T10:10:00Z")

  it("returns 0 for a timestamp under a minute old", () => {
    expect(minutesSince("2026-07-20T10:09:30Z", now)).toBe(0)
  })

  it("returns the whole number of elapsed minutes", () => {
    expect(minutesSince("2026-07-20T10:05:00Z", now)).toBe(5)
  })

  it("never goes negative for a timestamp in the future", () => {
    expect(minutesSince("2026-07-20T10:20:00Z", now)).toBe(0)
  })

  it("returns 0 for an invalid timestamp", () => {
    expect(minutesSince("not-a-date", now)).toBe(0)
  })
})

describe("formatMinutesAgo", () => {
  const now = new Date("2026-07-20T10:10:00Z")

  it("says 'just now' under a minute", () => {
    expect(formatMinutesAgo("2026-07-20T10:09:45Z", now)).toBe("just now")
  })

  it("formats elapsed minutes as 'x min ago'", () => {
    expect(formatMinutesAgo("2026-07-20T10:03:00Z", now)).toBe("7 min ago")
  })
})
