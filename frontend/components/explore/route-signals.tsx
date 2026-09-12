import Link from "next/link"
import { formatDistance, type DistanceUnit } from "@/lib/itinerary/distance"
import type { ExploreItem } from "@/lib/dtos/itinerary"

interface RouteSignalsProps {
  item: ExploreItem
  unit: DistanceUnit
}

// Everything here is derived server-side from the route's own points, places, photos and
// owner (M23 §3). None of it depends on an author writing a pitch or grading a route,
// which is the point: those two fields are null on the library's actual routes, so a card
// that leans on them says nothing at all.
export function RouteSignals({ item, unit }: RouteSignalsProps) {
  // A single-day route's longest day IS its total — repeating the number reads as a bug.
  const showLongestDay =
    item.longestDayMiles != null && item.dayCount > 1 && item.longestDayMiles > 0

  const counts = [
    item.pointCount > 0 && `${item.pointCount} ${item.pointCount === 1 ? "point" : "points"}`,
    item.placeCount > 0 && `${item.placeCount} ${item.placeCount === 1 ? "place" : "places"}`,
    item.photoCount > 0 && `${item.photoCount} ${item.photoCount === 1 ? "photo" : "photos"}`,
  ].filter((entry): entry is string => Boolean(entry))

  return (
    <>
      {showLongestDay && (
        <p className="text-muted-foreground text-xs">
          Longest day {formatDistance(item.longestDayMiles as number, unit)} {unit}
        </p>
      )}

      {counts.length > 0 && <p className="text-muted-foreground text-xs">{counts.join(" · ")}</p>}

      {item.author && (
        <p className="text-muted-foreground text-xs">
          By{" "}
          {item.author.linkable ? (
            <Link
              href={`/paddlers/${item.author.username}`}
              className="font-medium hover:underline"
            >
              {item.author.username}
            </Link>
          ) : (
            <span className="font-medium">{item.author.username}</span>
          )}
        </p>
      )}
    </>
  )
}
