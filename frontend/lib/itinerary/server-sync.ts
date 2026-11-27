import type { Itinerary } from "@/lib/dtos/itinerary"
import { initialMapState, type MapState } from "./map-reducer"

// What the builder shows, reduced to what a viewer could see change: the numbered days with
// their boundaries, and the points in route order. Both sides of a comparison go through
// here — the server's itinerary (via `initialMapState`, which is how the builder seeds
// itself) and the builder's own reducer state — so a point the user just saved reads the
// same in both, even though the create response and a refetched row carry different fields.
//
// Left out on purpose: `dayId` (derived from the boundaries, which are in here), `nextId`
// (the order is in here) and weather/sea (a forecast is not a route edit).
export function routeSignature({
  days,
  points,
  pointOrder,
}: Pick<MapState, "days" | "points" | "pointOrder">): string {
  const pointsById = new Map(points.map((point) => [point.id, point]))
  return JSON.stringify({
    days: days
      .filter((day) => day.dayNumber > 0)
      .sort((a, b) => a.dayNumber - b.dayNumber)
      .map((day) => [day.id, day.dayNumber, day.date, day.startPointId, day.endPointId]),
    points: pointOrder.map((id) => {
      const point = pointsById.get(id)
      return [
        id,
        point?.type,
        point?.name,
        point?.notes,
        point?.latitude,
        point?.longitude,
        (point?.images ?? []).map((image) => image.id).sort(),
      ]
    }),
  })
}

// What the builder's state would be if it were seeded from this itinerary. The builder
// seeds its reducer once, so after a `router.refresh()` (M36) it has to decide for itself
// whether the new props describe something it does not already show.
export function itinerarySignature(itinerary: Itinerary): string {
  const days = itinerary.days ?? []
  return routeSignature(
    initialMapState(
      days.flatMap((day) => day.points ?? []),
      days.filter((day) => day.dayNumber > 0),
    ),
  )
}
