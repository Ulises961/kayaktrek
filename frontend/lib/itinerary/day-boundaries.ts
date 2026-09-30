import { getDayColor } from "@/lib/itinerary/colors"

// Day-boundary colour derivation shared by the authenticated builder
// (components/map/map-core.tsx) and the public/explore renderers
// (lib/itinerary/public-routes.ts → components/map/route-day-layers.tsx),
// so an overnight boundary stop reads as day continuity — a split ring plus
// the next day's leg colour — in every renderer, not just the builder.

export type BoundaryColors = { left: string; right: string }

type BoundaryDayLike = {
  dayNumber: number
  startPointId?: string | null
  endPointId?: string | null
}

// Shared with mobile (@shared/itinerary/day-boundaries, M34): what a day boundary IS, expressed
// over "each point knows its own day" (the sync protocol's own shape) rather than boundaries.ts's
// index-range DaySlice/DraftBoundary, which is drag-gesture UI state coupled to MapState and has
// no equivalent on mobile. A day starts at its own first point and ends where the next day
// starts (the shared overnight stop, which belongs to the arriving day); the last numbered day
// ends at its own last point. Day 0 (unassigned staging points) never gets boundaries.
export type NumberedDayLike = { id: string; dayNumber: number }
export type DayPointRef = { id: string; dayId: string }

export function deriveDayBoundaries(
  days: NumberedDayLike[],
  orderedPoints: DayPointRef[],
): Record<string, { startPointId: string | null; endPointId: string | null }> {
  const numbered = days.filter((day) => day.dayNumber > 0).sort((a, b) => a.dayNumber - b.dayNumber)

  const firstOfDay = new Map<string, string>()
  const lastOfDay = new Map<string, string>()
  for (const point of orderedPoints) {
    if (!firstOfDay.has(point.dayId)) firstOfDay.set(point.dayId, point.id)
    lastOfDay.set(point.dayId, point.id)
  }

  const result: Record<string, { startPointId: string | null; endPointId: string | null }> = {}
  numbered.forEach((day, index) => {
    const nextDay = numbered[index + 1]
    const nextStart = nextDay ? firstOfDay.get(nextDay.id) : undefined
    result[day.id] = {
      startPointId: firstOfDay.get(day.id) ?? null,
      endPointId: nextStart ?? lastOfDay.get(day.id) ?? null,
    }
  })
  return result
}

// Point id → { left, right } day colours for split-ring boundary markers.
// A boundary point is the startPointId of a numbered day after day 1 *that
// actually matches Day N-1's own endPointId* — i.e. a genuine shared
// overnight stop, not just "some day after the first." A day can legitimately
// start at a point with no relation to the previous day's end (no overnight
// stop shared, e.g. seed/imported data, or a day never boundary-linked at
// all) — treating that as a split-ring boundary drew a marker with the wrong
// colour on one half and no incoming leg from the "previous" day to match it.
//
// Plain rings (no split) for:
//   • Day 1's start — no previous numbered day, left half would be grey
//   • The trip's final endpoint — it is endPointId of the last day only,
//     never anyone's startPointId, so it never enters this map
//
// Returned as a plain Record (not a Map) so it can cross a "use server"
// serialization boundary unchanged.
export function buildBoundaryColorMap(days: BoundaryDayLike[]): Record<string, BoundaryColors> {
  const byDayNumber = new Map(days.map((day) => [day.dayNumber, day]))
  const map: Record<string, BoundaryColors> = {}
  for (const day of days) {
    if (day.dayNumber <= 1 || !day.startPointId) continue
    const previous = byDayNumber.get(day.dayNumber - 1)
    if (!previous?.endPointId || previous.endPointId !== day.startPointId) continue
    map[day.startPointId] = {
      left: getDayColor(day.dayNumber - 1),
      right: getDayColor(day.dayNumber),
    }
  }
  return map
}

// A leg takes the colour of the day both endpoints agree on:
//   • either endpoint unassigned → grey (day 0)
//   • same day → that day's colour
//   • A is a split-ring boundary stop and B is the immediately following day
//     → B's colour (the matching right-half of the split ring)
//   • otherwise (cross-day discontinuity, no shared colour) → grey
export function resolveLegDayNumber(
  dayNumA: number,
  dayNumB: number,
  aIsBoundary: boolean,
): number {
  if (dayNumA === 0 || dayNumB === 0) return 0
  if (dayNumA === dayNumB) return dayNumA
  if (aIsBoundary && dayNumB === dayNumA + 1) return dayNumB
  return 0
}
