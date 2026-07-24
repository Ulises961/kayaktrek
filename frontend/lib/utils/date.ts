import { format, parseISO, isValid } from "date-fns"

/**
 * Format an ISO date (YYYY-MM-DD) for display as an unambiguous,
 * locale-independent string, e.g. "2 Jun 2026". Returns "—" when unset.
 */
export function formatDayDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = parseISO(iso)
  return isValid(d) ? format(d, "d MMM yyyy") : "—"
}

/** Add (or subtract, with a negative `days`) days to an ISO date (YYYY-MM-DD),
 * returning an ISO date. Uses UTC internally to avoid DST/timezone drift. */
export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** Whole minutes elapsed between an ISO timestamp and `now` (defaults to the
 * current time). Never negative — a future or invalid timestamp reads as 0. */
export function minutesSince(iso: string, now: Date = new Date()): number {
  const then = parseISO(iso)
  if (!isValid(then)) return 0
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / 60000))
}

/** Compact "x min ago" label for a live-position timestamp (M8). */
export function formatMinutesAgo(iso: string, now: Date = new Date()): string {
  const minutes = minutesSince(iso, now)
  return minutes < 1 ? "just now" : `${minutes} min ago`
}
