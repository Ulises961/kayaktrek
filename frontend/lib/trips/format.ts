import { format, parseISO } from "date-fns"
import { TRIP_STATE, type Trip } from "@/lib/dtos/trip"
import { formatDayDate } from "@/lib/utils/date"

// Inclusive: paddlers plan by calendar days spent, not nights between two dates.
// Aug 10 -> Aug 14 is 5 paddling days (4 nights)
export function daysBetween(from: string, to: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay) + 1
}

// Canonical date-range formatter (M12 §C/§10.1). Nullable inputs cover the
// "only one date set yet" and "no dates yet" states
export function formatDateRange(
  from: string | null | undefined,
  to: string | null | undefined,
): string {
  if (from && to) {
    const f = parseISO(from)
    const t = parseISO(to)
    const sameYear = f.getFullYear() === t.getFullYear()
    return sameYear
      ? `${format(f, "d MMM")} – ${format(t, "d MMM yyyy")}`
      : `${format(f, "d MMM yyyy")} – ${format(t, "d MMM yyyy")}`
  }
  if (from) return formatDayDate(from)
  if (to) return formatDayDate(to)
  return "Dates not set"
}

/**
 * Where a happening trip is in its dates: "Day 3 of 7", or "Paused on day 3" while paused.
 *
 * Null whenever no day number is true: the trip is not happening, has no dates, or today
 * (or the pause) falls outside them, as when a leader begins early or overruns. The caller
 * then shows the plain day count instead. `today` is passed in so the same string renders
 * on the server and in the browser.
 */
export function tripDayLabel(
  trip: Pick<Trip, "state" | "dateFrom" | "dateTo" | "isPaused" | "pausedAt">,
  today: string,
): string | null {
  const { state, dateFrom, dateTo, isPaused, pausedAt } = trip
  if (state !== TRIP_STATE.HAPPENING || !dateFrom || !dateTo) return null

  const paused = !!isPaused && !!pausedAt
  // A pause is stored as a timestamp; the trip's days are whole dates.
  const day = daysBetween(dateFrom, paused ? pausedAt.slice(0, 10) : today)
  const total = daysBetween(dateFrom, dateTo)
  if (day < 1 || day > total) return null

  return paused ? `Paused on day ${day}` : `Day ${day} of ${total}`
}
