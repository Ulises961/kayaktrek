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
}

// Point id → { left, right } day colours for split-ring boundary markers.
// A boundary point is the startPointId of any numbered day after day 1:
// simultaneously the end of Day N-1 and the start of Day N.
//
// Plain rings (no split) for:
//   • Day 1's start — no previous numbered day, left half would be grey
//   • The trip's final endpoint — it is endPointId of the last day only,
//     never anyone's startPointId, so it never enters this map
//
// Returned as a plain Record (not a Map) so it can cross a "use server"
// serialization boundary unchanged.
export function buildBoundaryColorMap(days: BoundaryDayLike[]): Record<string, BoundaryColors> {
  const map: Record<string, BoundaryColors> = {}
  for (const day of days) {
    if (day.dayNumber > 1 && day.startPointId) {
      map[day.startPointId] = {
        left: getDayColor(day.dayNumber - 1),
        right: getDayColor(day.dayNumber),
      }
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
