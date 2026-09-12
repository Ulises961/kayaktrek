import type { Stats } from "@shared/dtos/public-profile"

import { Card } from "../ui/card"
import { Row } from "../ui/layout"
import { Text } from "../ui/text"

// Shared by the own-profile and public-profile screens — same StatsSchema
// aggregate either way (backend/Services/log_service.py's stats_for_user).
export function StatsPanel({ stats }: { stats: Stats }) {
  if (stats.logCount === 0) return null

  return (
    <Row className="gap-3">
      {/* min-h + numberOfLines={1}: DISTANCE's value ("2708.3 km") is long enough
          to wrap onto a second line while HOURS/TRIPS stay on one, which left the
          row visibly uneven — a fixed floor plus a hard line cap keeps all three
          boxes the same height regardless of which value is longest. */}
      <Card className="min-h-[72px] flex-1 items-center justify-center py-3">
        <Text className="text-xs uppercase text-muted-foreground">Hours</Text>
        <Text className="text-lg font-semibold tabular-nums" numberOfLines={1}>
          {stats.totalHours.toFixed(1)}
        </Text>
      </Card>
      <Card className="min-h-[72px] flex-1 items-center justify-center py-3">
        <Text className="text-xs uppercase text-muted-foreground">Distance</Text>
        <Text className="text-lg font-semibold tabular-nums" numberOfLines={1}>
          {stats.totalDistance.toFixed(1)} km
        </Text>
      </Card>
      <Card className="min-h-[72px] flex-1 items-center justify-center py-3">
        <Text className="text-xs uppercase text-muted-foreground">Trips</Text>
        <Text className="text-lg font-semibold tabular-nums" numberOfLines={1}>
          {stats.tripCount}
        </Text>
      </Card>
    </Row>
  )
}
