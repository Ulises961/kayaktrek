import { daysBetween } from "@/lib/trips/format"

// The one canonical place-to-place range label. Falls back to just the start name
// when there's no distinct end name to show.
export function formatRouteRange(
  startName: string | null | undefined,
  endName: string | null | undefined,
): string {
  if (startName && endName && endName !== startName) return `${startName} to ${endName}`
  return startName ?? ""
}

export type RestGap = {
  /** The gap sits right after this dayNumber, before the next dated day. */
  afterDayNumber: number
  date: string
}

export function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

// A calendar-date gap between two consecutive *dated* real Days, with no Day
// entity of its own for any date in between — a paddler who just moves a
// later day's date forward rather than opening the builder for the days in
// between. Purely a display/detection derivation: emits one entry per
// undated calendar day so the day list can show a "Rest" placeholder, never
// a real Day row (M12 §I — deliberately no promotion/insertion action).
export function computeRestGaps(days: { dayNumber: number; date?: string | null }[]): RestGap[] {
  const dated = days
    .filter((d): d is { dayNumber: number; date: string } => !!d.date)
    .sort((a, b) => a.dayNumber - b.dayNumber)

  const gaps: RestGap[] = []
  // The anchor is the last dayNumber-ordered day whose date is chronologically
  // valid (at or after the previous anchor) — a day with an out-of-order date
  // (a data-entry mistake: earlier than the day before it) is skipped when
  // choosing what the *next* day compares against, instead of poisoning it.
  let anchor: { dayNumber: number; date: string } | null = null
  for (const day of dated) {
    if (anchor) {
      const gapLength = daysBetween(anchor.date, day.date) - 2 // exclude both endpoints
      if (gapLength >= 1) {
        for (let g = 1; g <= gapLength; g++) {
          gaps.push({ afterDayNumber: anchor.dayNumber, date: addDaysIso(anchor.date, g) })
        }
      }
    }
    if (!anchor || day.date >= anchor.date) {
      anchor = day
    }
  }
  return gaps
}
