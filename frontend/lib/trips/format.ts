import { format, parseISO } from "date-fns"
import { formatDayDate } from "@/lib/utils/date"

// Inclusive: paddlers plan by calendar days spent, not nights between two dates.
// Aug 10 -> Aug 14 is 5 paddling days (4 nights), not the exclusive 4 (review 2.2).
export function daysBetween(from: string, to: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay) + 1
}

// The one canonical date-range formatter (M12 §C/§10.1). Nullable inputs cover the
// "only one date set yet" and "no dates yet" states so call sites don't hand-roll
// their own dateRange/dateLabel fallback (was duplicated verbatim across both
// float-plan pages).
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
