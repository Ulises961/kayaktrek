import { TRIP_STATE, type Trip } from "@/lib/dtos/trip"

/**
 * Where "go to the live map" points: the trip's itinerary, deep-linked into Navigate mode.
 *
 * Navigate is an overlay state on the itinerary builder rather than a page of its own
 * (M8) — `map-builder.tsx` reads `navigate=1` once on mount and turns it on. So there is
 * no `/live` route to link to, and a link to the trip's own tabs lands on the plan rather
 * than the map.
 *
 * Returns null when there is nothing live to show: a trip not under way, or one with no
 * itinerary to navigate. Callers add their own authorization — membership is the caller's
 * to know, not this helper's.
 */
export function liveMapHref(trip: Pick<Trip, "state" | "itinerary">): string | null {
  if (trip.state !== TRIP_STATE.HAPPENING) return null
  const itineraryId = trip.itinerary?.id
  return itineraryId ? `/itinerary/${itineraryId}?navigate=1` : null
}
