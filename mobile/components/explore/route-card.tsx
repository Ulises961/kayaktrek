import { Link } from "expo-router"
import { CalendarIcon, RouteIcon, TrendingUpIcon, UserIcon } from "lucide-react-native"
import { Pressable } from "react-native"

import { DIFFICULTY_LABELS } from "@shared/dtos/difficulty"
import type { ExploreItem } from "@shared/dtos/itinerary"
import { formatDistance, type DistanceUnit } from "@shared/itinerary/distance"
import { lightTokens, palette } from "@shared/tokens"

import { Badge } from "@mobile/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@mobile/components/ui/card"
import { Row } from "@mobile/components/ui/layout"
import { Text } from "@mobile/components/ui/text"

import { RoutePreview } from "./route-preview"

// Mirrors the field choices of web's explore card plus RouteSignals
// (frontend/components/explore/route-signals.tsx): the signals the backend derives from
// the route itself, because `description` and `difficulty` are null on the library's
// real routes and a card leaning on them says nothing (M23 §3).
export function RouteCard({ item, unit }: { item: ExploreItem; unit: DistanceUnit }) {
  // A single-day route's longest day IS its total — repeating the number reads as a bug.
  const showLongestDay =
    item.longestDayMiles != null && item.dayCount > 1 && item.longestDayMiles > 0

  const counts = [
    item.pointCount > 0 && `${item.pointCount} ${item.pointCount === 1 ? "point" : "points"}`,
    item.placeCount > 0 && `${item.placeCount} ${item.placeCount === 1 ? "place" : "places"}`,
    item.photoCount > 0 && `${item.photoCount} ${item.photoCount === 1 ? "photo" : "photos"}`,
  ].filter((entry): entry is string => Boolean(entry))

  return (
    <Link href={{ pathname: "/explore/[id]", params: { id: item.id } }} asChild>
      <Pressable>
        <Card>
          <CardHeader>
            <Row className="justify-between gap-2">
              <CardTitle className="flex-1" numberOfLines={1}>
                {item.name ?? "Untitled route"}
              </CardTitle>
              {item.difficulty && <Badge>{DIFFICULTY_LABELS[item.difficulty]}</Badge>}
            </Row>
          </CardHeader>

          <CardContent>
            <RoutePreview positions={item.previewPositions} />

            {item.description && (
              <Text className="text-sm text-muted-foreground" numberOfLines={2}>
                {item.description}
              </Text>
            )}

            <Row className="flex-wrap gap-x-3 gap-y-1">
              {item.totalMiles != null && (
                <Row className="items-center gap-1">
                  <RouteIcon size={12} color={palette.ocean500} />
                  <Text className="text-[11px] tabular-nums text-muted-foreground">
                    {formatDistance(item.totalMiles, unit)} {unit}
                  </Text>
                </Row>
              )}
              {item.dayCount > 0 && (
                <Row className="items-center gap-1">
                  <CalendarIcon size={12} color={palette.ocean500} />
                  <Text className="text-[11px] tabular-nums text-muted-foreground">
                    {item.dayCount} {item.dayCount === 1 ? "day" : "days"}
                  </Text>
                </Row>
              )}
            </Row>

            {showLongestDay && (
              <Row className="items-center gap-1">
                <TrendingUpIcon size={12} color={palette.ocean500} />
                <Text className="text-[11px] tabular-nums text-muted-foreground">
                  Longest day {formatDistance(item.longestDayMiles as number, unit)} {unit}
                </Text>
              </Row>
            )}

            {counts.length > 0 && (
              <Text className="text-[11px] text-muted-foreground">{counts.join(" · ")}</Text>
            )}

            {/* Web links a linkable author through to their public profile. Here the
                whole card is already a Pressable, and nesting a second pressable inside
                it makes which one a tap hits depend on hit-slop rather than intent — so
                the author is plain text and the profile is reached from the route's own
                detail screen. */}
            {item.author && (
              <Row className="items-center gap-1">
                <UserIcon size={12} color={lightTokens.mutedForeground} />
                <Text className="text-[11px] text-muted-foreground">
                  By {item.author.username}
                </Text>
              </Row>
            )}
          </CardContent>
        </Card>
      </Pressable>
    </Link>
  )
}
