import { TRIP_STATE, type TripState } from "@/lib/dtos/trip"
import type { TripMember } from "@/lib/dtos/trip-member"

/**
 * Whether the member's inReach switch (M29) is offered for this trip.
 *
 * Offered while the trip is being planned or under way, to a member still aboard: a
 * finished trip has nothing left to receive a position, and a member who left no longer
 * shares one (the backend refuses a switch-on in both cases). The layout reads this to
 * decide whether to look up the feed, the header to decide whether to render the switch,
 * so the two cannot disagree.
 */
export function canShareSatellitePosition(
  tripState: TripState | null | undefined,
  currentMember: TripMember | undefined,
): boolean {
  if (!currentMember || currentMember.leftAt) return false
  return tripState === TRIP_STATE.BUILDING || tripState === TRIP_STATE.HAPPENING
}
