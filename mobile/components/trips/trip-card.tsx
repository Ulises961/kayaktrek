import { CalendarIcon, ClockIcon, UsersIcon } from "lucide-react-native"
import { Link } from "expo-router"
import { Pressable } from "react-native"

import { daysBetween, formatDateRange } from "@shared/trips/format"
import { lightTokens } from "@shared/tokens"

import type { TripCardData } from "@mobile/lib/db/trip-list-cache"

import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Row } from "../ui/layout"
import { StateBadge } from "../ui/state-badge"
import { Text } from "../ui/text"

// Takes only the fields it renders (TripCardData), not the full Trip DTO —
// the same shape works whether `trip` came from a live fetch or the local
// offline cache (lib/db/trip-list-cache.ts, M9c WP6), which never stores the
// full travellers array, only its count.
//
// Mirrors frontend/components/common/trip-card.tsx's field choices (destination as
// title, state badge, date range, crew count, icon meta row) — not its exact visual
// treatment (no route thumbnail, no hero ring; this is a plain list row, not the web
// dashboard grid — see the M9b2 plan WP3 for why the thumbnail is deliberately out).
// `Link asChild` clones its child and injects onPress/href handling, which only a
// Pressable-like component honors — `Card` is a plain View, so it wraps a Pressable.
export function TripCard({ trip }: { trip: TripCardData }) {
  const { destination, state, dateFrom, dateTo, travellerCount: crewCount } = trip
  const days = dateFrom && dateTo ? daysBetween(dateFrom, dateTo) : null

  return (
    <Link href={{ pathname: "/trips/[id]", params: { id: trip.id ?? "" } }} asChild>
      <Pressable>
        <Card>
          <CardHeader>
            <Row className="justify-between">
              <CardTitle className="flex-1" numberOfLines={1}>
                {destination ?? "Untitled trip"}
              </CardTitle>
              {state && <StateBadge state={state} />}
            </Row>
          </CardHeader>
          <CardContent>
            <Row className="items-center gap-1.5">
              <CalendarIcon size={12} color={lightTokens.mutedForeground} />
              <Text className="text-[11px] text-muted-foreground">
                {formatDateRange(dateFrom, dateTo)}
              </Text>
            </Row>
            <Row className="flex-wrap gap-x-3 gap-y-1">
              {days !== null && (
                <Row className="items-center gap-1">
                  <ClockIcon size={12} color={lightTokens.mutedForeground} />
                  <Text className="text-[11px] tabular-nums text-muted-foreground">
                    {days} {days === 1 ? "day" : "days"}
                  </Text>
                </Row>
              )}
              <Row className="items-center gap-1">
                <UsersIcon size={12} color={lightTokens.mutedForeground} />
                <Text className="text-[11px] tabular-nums text-muted-foreground">
                  {crewCount} {crewCount === 1 ? "member" : "members"}
                </Text>
              </Row>
            </Row>
          </CardContent>
        </Card>
      </Pressable>
    </Link>
  )
}
