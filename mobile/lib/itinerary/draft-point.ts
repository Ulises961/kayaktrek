import { haversineNm } from "@shared/itinerary/distance"

import type { LocatedRoutePoint } from "./day-route"

/**
 * Distance from a draft point's predecessor (M34 WP4's tap-to-place confirm
 * tooltip) to where it would land — null when there is nothing to measure
 * from (inserting before the route's first point, or a stale predecessor id).
 */
export function distanceToPredecessorNm(
  routePoints: LocatedRoutePoint[],
  afterPointId: string | null,
  latitude: number,
  longitude: number,
): number | null {
  const predecessor = afterPointId ? routePoints.find((point) => point.id === afterPointId) : null
  if (!predecessor) return null
  return haversineNm(predecessor, { latitude, longitude })
}
