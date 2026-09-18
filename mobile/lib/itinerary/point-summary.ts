import type { Day } from "@shared/dtos/day";
import type { Point } from "@shared/dtos/point";
import {
  DISTANCE_UNIT,
  dayRouteLegs,
  formatDistance,
  legLabel,
} from "@shared/itinerary/distance";
import { dayRouteGroups } from "@shared/itinerary/day-points";
import { walkPoints } from "@shared/itinerary/linked-list";

export type PointLegSummary = { legText: string; totalText: string };

// Distance-since-the-last-stop and cumulative-since-the-day-started for the
// selected point, mirroring web's legDistance() (point-detail-sheet.tsx). Unlike
// day-route.ts's buildDayColoredRoute, this does NOT override a shared boundary
// stop's day back to the departing day — dayRouteGroups seeds each day's leg
// math from "whatever point precedes it in route order" regardless of which
// day's array structurally contains it, so it's already correct without the
// override WP1's leg *coloring* needed (see that file's own comment for why
// coloring specifically needed one). Mobile has no client-held pointOrder, so
// this walks days in dayNumber order and each day's own points via walkPoints,
// same as buildDayColoredRoute, but keeps each point's real day_id rather than
// tagging by dayNumber.
function buildOrderedPoints(days: Day[]): (Point & { dayId: string | null })[] {
  const orderedDays = [...days].sort((a, b) => a.dayNumber - b.dayNumber);
  const flat: (Point & { dayId: string | null })[] = [];
  for (const day of orderedDays) {
    for (const point of walkPoints(day.points ?? [])) {
      flat.push({ ...point, dayId: day.id ?? null });
    }
  }
  return flat;
}

export function pointLegSummary(
  pointId: string,
  days: Day[],
  avgSpeedKnots: number,
): PointLegSummary | null {
  const ordered = buildOrderedPoints(days);
  const matched = ordered.find((p) => p.id === pointId);
  if (!matched) return null;

  const group = dayRouteGroups(ordered).get(matched.dayId);
  if (!group) return null;

  const leg = dayRouteLegs(group.seed, group.own).find(
    (l) => l.point.id === pointId,
  );
  if (!leg || leg.isStart) return null;

  const unit = DISTANCE_UNIT.KM;
  return {
    legText: legLabel(leg.legNm, avgSpeedKnots, unit),
    totalText: `${formatDistance(leg.cumulativeNm, unit)} ${unit} total`,
  };
}
