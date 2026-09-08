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
      <Card className="flex-1 items-center py-3">
        <Text className="text-xs uppercase text-muted-foreground">Hours</Text>
        <Text className="text-lg font-semibold tabular-nums">{stats.totalHours.toFixed(1)}</Text>
      </Card>
      <Card className="flex-1 items-center py-3">
        <Text className="text-xs uppercase text-muted-foreground">Distance</Text>
        <Text className="text-lg font-semibold tabular-nums">
          {stats.totalDistance.toFixed(1)} km
        </Text>
      </Card>
      <Card className="flex-1 items-center py-3">
        <Text className="text-xs uppercase text-muted-foreground">Trips</Text>
        <Text className="text-lg font-semibold tabular-nums">{stats.tripCount}</Text>
      </Card>
    </Row>
  )
}
