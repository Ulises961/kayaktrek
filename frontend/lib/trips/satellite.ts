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

/**
 * Whether the header should warn that the member's inReach is not sharing.
 *
 * Only for a happening trip, for a member who registered a feed and left the switch off:
 * that is a paddler who can share and is not. Without the feed condition every paddler
 * with no inReach would carry a permanent warning they cannot act on.
 */
export function satelliteTrackingIsOff(
  tripState: TripState | null | undefined,
  currentMember: TripMember | undefined,
  hasFeed: boolean,
): boolean {
  return (
    tripState === TRIP_STATE.HAPPENING &&
    hasFeed &&
    canShareSatellitePosition(tripState, currentMember) &&
    !currentMember?.sharesSatellitePosition
  )
}
