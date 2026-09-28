import { legLabel } from "@shared/itinerary/distance"

import { Button } from "../ui/button"
import { Card, CardContent } from "../ui/card"
import { Row } from "../ui/layout"
import { Text } from "../ui/text"

// M34 WP4: the confirmation step for a tap-placed draft point — distance/time
// from the point it would land after (null when there's nothing to measure
// from, e.g. the very first point of an empty route), plus Undo/Confirm.
export function AddPointTooltip({
  distanceNm,
  avgSpeedKnots,
  submitting,
  onUndo,
  onConfirm,
}: {
  distanceNm: number | null
  avgSpeedKnots: number
  submitting: boolean
  onUndo: () => void
  onConfirm: () => void
}) {
  return (
    <Card className="w-48 gap-3 p-3">
      <CardContent className="gap-1 p-0">
        <Text className="text-sm font-semibold text-card-foreground">Add a point here?</Text>
        <Text className="text-xs text-muted-foreground">
          {distanceNm === null ? "First point of the route" : legLabel(distanceNm, avgSpeedKnots, "nm")}
        </Text>
      </CardContent>
      <Row className="gap-2">
        <Button variant="outline" size="sm" className="flex-1" onPress={onUndo} disabled={submitting}>
          Undo
        </Button>
        <Button variant="cta" size="sm" className="flex-1" onPress={onConfirm} disabled={submitting}>
          Confirm
        </Button>
      </Row>
    </Card>
  )
}
