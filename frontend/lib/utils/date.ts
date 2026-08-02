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

/** Compact "x min ago" label for a live-position timestamp (M8). Stays minute-granular
 * at every age: on a live trip, a position an hour old is a fact worth reading as 60
 * minutes, not softening into "1 hour ago". Use formatTimeAgo for anything else. */
export function formatMinutesAgo(iso: string, now: Date = new Date()): string {
  const minutes = minutesSince(iso, now)
  return minutes < 1 ? "just now" : `${minutes} min ago`
}

/** Elapsed-time label that scales with age ("just now", "45 min ago", "3 hours ago",
 * "2 days ago"), falling back to an absolute date past a week — beyond that, "37 days
 * ago" is harder to place than the date itself. Returns "—" when unset or unparseable. */
export function formatTimeAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso || !isValid(parseISO(iso))) return "—"

  const minutes = minutesSince(iso, now)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} min ago`

  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`

  const days = Math.floor(hours / 24)
  if (days <= 7) return `${days} day${days === 1 ? "" : "s"} ago`

  return formatDayDate(iso.slice(0, 10))
}
