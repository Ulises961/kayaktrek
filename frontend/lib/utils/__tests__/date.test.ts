import { describe, it, expect } from "vitest"
import {
  formatDayDate,
  addDaysIso,
  todayIso,
  formatMinutesAgo,
  formatTimeAgo,
  minutesSince,
} from "../date"

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

describe("formatTimeAgo", () => {
  const now = new Date("2026-08-02T12:00:00Z")

  it("reads as 'just now' under a minute", () => {
    expect(formatTimeAgo("2026-08-02T11:59:30Z", now)).toBe("just now")
  })

  it("scales from minutes to hours to days", () => {
    expect(formatTimeAgo("2026-08-02T11:15:00Z", now)).toBe("45 min ago")
    expect(formatTimeAgo("2026-08-02T09:00:00Z", now)).toBe("3 hours ago")
    expect(formatTimeAgo("2026-08-02T11:00:00Z", now)).toBe("1 hour ago")
    expect(formatTimeAgo("2026-07-31T12:00:00Z", now)).toBe("2 days ago")
    expect(formatTimeAgo("2026-08-01T12:00:00Z", now)).toBe("1 day ago")
  })

  it("falls back to a date once the elapsed time stops being useful", () => {
    expect(formatTimeAgo("2026-06-02T12:00:00Z", now)).toBe("2 Jun 2026")
  })

  it("returns a dash for a missing or unparseable timestamp", () => {
    expect(formatTimeAgo("", now)).toBe("—")
    expect(formatTimeAgo("not-a-date", now)).toBe("—")
  })
})

describe("todayIso", () => {
  it("is the local calendar date, not the UTC one", () => {
    // 23:30 local on 5 Jul: a UTC conversion would already read 6 Jul east of Greenwich
    // and 5 Jul west of it — the local date must win either way.
    expect(todayIso(new Date(2026, 6, 5, 23, 30))).toBe("2026-07-05")
    expect(todayIso(new Date(2026, 6, 5, 0, 15))).toBe("2026-07-05")
  })
})
