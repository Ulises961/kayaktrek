import { PlusIcon, Undo2Icon } from "lucide-react-native"

import { legLabel } from "@shared/itinerary/distance"
import { lightTokens } from "@shared/tokens"

import { Button } from "../ui/button"
import { Card, CardContent } from "../ui/card"
import { Row } from "../ui/layout"
import { Text } from "../ui/text"

// M34 WP4: the confirmation step for a tap-placed draft point — distance/time
// from the point it would land after (null when there's nothing to measure
// from, e.g. the very first point of an empty route), plus Add/Undo. Nothing
// exists to delete yet at this stage (the point isn't created until Add is
// pressed) — a bin icon here would have implied a deletion that can't
// actually happen, so the discard action is a plain Undo (a curved
// back-arrow, the conventional undo glyph), not destructive-styled. Sized to
// its own content (`self-start`, no fixed width) rather than a fixed card
// width — the original `w-48` clipped "Confirm"'s label, and a fixed `w-64`
// left dead space once the buttons were just "+ Add" and an icon.
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
    <Card className="self-start gap-3 p-3">
      <CardContent className="gap-1 p-2">
        <Text className="text-sm font-semibold text-card-foreground">Add a point here?</Text>
        <Text className="text-xs text-muted-foreground">
          {distanceNm === null ? "First point of the route" : legLabel(distanceNm, avgSpeedKnots, "nm")}
        </Text>
      </CardContent>
      <Row className="gap-5">
        <Button
          variant="cta"
          size="sm"
          onPress={onConfirm}
          disabled={submitting}
          icon={<PlusIcon size={14} color={lightTokens.ctaForeground} />}
        >
          Add
        </Button>
        <Button
          variant="outline"
          size="sm"
          onPress={onUndo}
          disabled={submitting}
          accessibilityLabel="Undo"
          icon={<Undo2Icon size={16} color={lightTokens.foreground} />}
        >
          Undo
        </Button>
      </Row>
    </Card>
  )
}
