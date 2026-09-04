import type { Trip } from "../../../frontend/lib/dtos/trip"
import { TRIP_STATE_LABELS } from "../../../frontend/lib/dtos/trip"
import { daysBetween, formatDateRange } from "../../../frontend/lib/trips/format"

import { Badge } from "../ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

// Mirrors frontend/components/common/trip-card.tsx's field choices (destination as
// title, state badge, date range, crew count) — not its exact visual treatment (no
// route thumbnail, no hero ring; this is a plain list row, not the web dashboard grid).
export function TripCard({ trip }: { trip: Trip }) {
  const { destination, state, dateFrom, dateTo, travellers } = trip
  const crewCount = travellers?.length ?? 0
  const days = dateFrom && dateTo ? daysBetween(dateFrom, dateTo) : null

  return (
    <Card>
      <CardHeader>
        <Row className="justify-between">
          <CardTitle className="flex-1" numberOfLines={1}>
            {destination ?? "Untitled trip"}
          </CardTitle>
          {state && <Badge>{TRIP_STATE_LABELS[state]}</Badge>}
        </Row>
      </CardHeader>
      <CardContent>
        <Text className="text-sm text-muted-foreground">{formatDateRange(dateFrom, dateTo)}</Text>
        <Stack className="flex-row gap-3">
          {days !== null && (
            <Text className="text-sm text-muted-foreground">
              {days} {days === 1 ? "day" : "days"}
            </Text>
          )}
          <Text className="text-sm text-muted-foreground">
            {crewCount} {crewCount === 1 ? "member" : "members"}
          </Text>
        </Stack>
      </CardContent>
    </Card>
  )
}
