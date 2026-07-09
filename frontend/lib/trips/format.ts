import { format, parseISO } from "date-fns"

// Inclusive: paddlers plan by calendar days spent, not nights between two dates.
// Aug 10 -> Aug 14 is 5 paddling days (4 nights), not the exclusive 4 (review 2.2).
export function daysBetween(from: string, to: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay) + 1
}

export function formatDateRange(from: string, to: string): string {
  const f = parseISO(from)
  const t = parseISO(to)
  const sameYear = f.getFullYear() === t.getFullYear()
  return sameYear
    ? `${format(f, "d MMM")} – ${format(t, "d MMM yyyy")}`
    : `${format(f, "d MMM yyyy")} – ${format(t, "d MMM yyyy")}`
}
