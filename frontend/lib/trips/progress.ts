import { daysBetween } from "./format"

export interface ExpeditionProgress {
  /** 1-based, clamped into the trip's own range. */
  dayNumber: number
  totalDays: number
  /** Whole percent, 0–100 — what the progress bar is sized from. */
  percent: number
}

/**
 * How far into a running expedition today is.
 *
 * Dates are plain calendar days (`YYYY-MM-DD`) and are compared as strings, never parsed
 * into instants. Turning them into `Date`s invites the UTC-vs-local drift that put M8's
 * beat tasks a day out; nothing here needs a time of day.
 *
 * `today` is a parameter so callers in tests can pin it. It defaults to the local
 * calendar date, which is the paddler's own day — the trip is where they are, not in UTC.
 *
 * Returns null when the trip cannot place itself on a timeline (either date missing, or a
 * range that ends before it starts). Callers omit the bar rather than draw a broken one.
 */
export function expeditionProgress(
  dateFrom: string | null | undefined,
  dateTo: string | null | undefined,
  options: { today?: string } = {},
): ExpeditionProgress | null {
  if (!dateFrom || !dateTo) return null
  if (dateTo < dateFrom) return null

  const today = options.today ?? localCalendarDate()

  // `daysBetween` already counts both endpoints — 1st→5th is 5 paddling days, and
  // from→from is 1 — so neither of these adds its own +1.
  const totalDays = daysBetween(dateFrom, dateTo)

  // `happening` is a state the leader sets, so today can fall outside the planned range
  // in either direction — a trip that started early, or one still running past its end.
  const elapsed = daysBetween(dateFrom, today)
  const dayNumber = Math.min(Math.max(elapsed, 1), totalDays)

  return { dayNumber, totalDays, percent: Math.round((dayNumber / totalDays) * 100) }
}

/** Today in the viewer's own timezone, as `YYYY-MM-DD`. */
function localCalendarDate(): string {
  const now = new Date()
  const month = String(now.getMonth() + 1).padStart(2, "0")
  const day = String(now.getDate()).padStart(2, "0")
  return `${now.getFullYear()}-${month}-${day}`
}
