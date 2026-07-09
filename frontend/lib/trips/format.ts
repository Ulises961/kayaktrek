import { format, parseISO } from "date-fns"

export function daysBetween(from: string, to: string): number {
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / msPerDay)
}

export function formatDateRange(from: string, to: string): string {
  const f = parseISO(from)
  const t = parseISO(to)
  const sameYear = f.getFullYear() === t.getFullYear()
  return sameYear
    ? `${format(f, "d MMM")} – ${format(t, "d MMM yyyy")}`
    : `${format(f, "d MMM yyyy")} – ${format(t, "d MMM yyyy")}`
}
