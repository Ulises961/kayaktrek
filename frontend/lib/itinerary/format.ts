import { format, parseISO, isValid } from "date-fns"

/**
 * Format a day's ISO date (YYYY-MM-DD) for display as an unambiguous,
 * locale-independent string, e.g. "2 Jun 2026". Returns "—" when unset.
 */
export function formatDayDate(iso: string | null | undefined): string {
  if (!iso) return "—"
  const d = parseISO(iso)
  return isValid(d) ? format(d, "d MMM yyyy") : "—"
}
