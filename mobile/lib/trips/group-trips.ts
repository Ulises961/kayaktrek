import { TRIP_STATE, type TripState } from "@shared/dtos/trip"

import type { TripCardData } from "@mobile/lib/db/trip-list-cache"

export type TripGroup = {
  state: TripState
  /** Heading shown above the group. Not TRIP_STATE_LABELS: those label a badge on one
   *  trip ("Planning"), where these head a list of them. */
  title: string
  trips: TripCardData[]
}

// The order decided for this screen in the 2026-09-07 nav/UX session: a happening trip
// is the hero, then building by soonest departure, then past most recent first. There
// is deliberately no Dashboard screen on mobile — this list absorbs that role, which is
// why the ordering carries the weight it does.
const GROUPS: { state: TripState; title: string }[] = [
  { state: TRIP_STATE.HAPPENING, title: "On the water" },
  { state: TRIP_STATE.BUILDING, title: "Planned" },
  { state: TRIP_STATE.PAST, title: "Past" },
]

// Sorts on the raw ISO date string. `YYYY-MM-DD` compares correctly as text, and every
// date field in this app is that shape by convention, so parsing buys nothing.
function byDeparture(a: TripCardData, b: TripCardData): number {
  return (a.dateFrom ?? "").localeCompare(b.dateFrom ?? "")
}

/**
 * Splits the trip list into its display groups, dropping any group that would be empty.
 *
 * A trip whose `state` the backend left null still has to appear — `state` is nullish on
 * the DTO, and silently dropping a trip is the worst outcome on the screen that is the
 * app's front door. Those fall in with `building`, the state a trip is created in.
 *
 * `archived` never reaches here: it is a terminal state the GDPR erasure task sets on a
 * deleted leader's trip, never something in a normal user's own list.
 */
export function groupTrips(trips: TripCardData[]): TripGroup[] {
  return GROUPS.flatMap(({ state, title }) => {
    const inGroup = trips.filter((trip) =>
      state === TRIP_STATE.BUILDING
        ? trip.state === state || trip.state == null
        : trip.state === state,
    )
    if (inGroup.length === 0) return []

    const ordered = [...inGroup].sort(
      state === TRIP_STATE.PAST ? (a, b) => byDeparture(b, a) : byDeparture,
    )
    return [{ state, title, trips: ordered }]
  })
}
