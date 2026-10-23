import { describe, it, expect } from "vitest"
import { daysBetween, formatDateRange, tripDayLabel } from "../format"
import { TRIP_STATE } from "@/lib/dtos/trip"
import { addDaysIso, todayIso } from "@/lib/utils/date"

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

describe("tripDayLabel", () => {
  const today = todayIso()
  // Seven days, today being the third: dates are relative so the test cannot rot.
  const underway = {
    state: TRIP_STATE.HAPPENING,
    dateFrom: addDaysIso(today, -2),
    dateTo: addDaysIso(today, 4),
  }

  it("says which day of the trip it is while the trip is happening", () => {
    expect(tripDayLabel(underway, today)).toBe("Day 3 of 7")
  })

  it("counts the first and the last day", () => {
    expect(tripDayLabel({ ...underway, dateFrom: today }, today)).toBe("Day 1 of 5")
    expect(tripDayLabel({ ...underway, dateTo: today }, today)).toBe("Day 3 of 3")
  })

  it("says nothing before the start date or after the end date, where no day number is true", () => {
    expect(tripDayLabel({ ...underway, dateFrom: addDaysIso(today, 1) }, today)).toBeNull()
    expect(tripDayLabel({ ...underway, dateTo: addDaysIso(today, -1) }, today)).toBeNull()
  })

  it("says nothing for a trip that is not happening", () => {
    expect(tripDayLabel({ ...underway, state: TRIP_STATE.BUILDING }, today)).toBeNull()
    expect(tripDayLabel({ ...underway, state: TRIP_STATE.PAST }, today)).toBeNull()
    expect(tripDayLabel({ ...underway, state: null }, today)).toBeNull()
  })

  it("says nothing when the trip has no dates", () => {
    expect(tripDayLabel({ ...underway, dateFrom: null }, today)).toBeNull()
    expect(tripDayLabel({ ...underway, dateTo: undefined }, today)).toBeNull()
  })

  it("names the day the trip was paused on, not today's, while it is paused", () => {
    const pausedAt = `${addDaysIso(today, -1)}T09:30:00`
    expect(tripDayLabel({ ...underway, isPaused: true, pausedAt }, today)).toBe("Paused on day 2")
  })

  it("says nothing for a pause that falls outside the trip's dates", () => {
    const pausedAt = `${addDaysIso(today, -9)}T09:30:00`
    expect(tripDayLabel({ ...underway, isPaused: true, pausedAt }, today)).toBeNull()
  })
})
