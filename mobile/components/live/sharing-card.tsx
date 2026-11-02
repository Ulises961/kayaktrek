import { Button } from "@mobile/components/ui/button"
import { Card, CardContent } from "@mobile/components/ui/card"
import { Stack } from "@mobile/components/ui/layout"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { Text } from "@mobile/components/ui/text"
import { describeStatus } from "@mobile/lib/live/position/sharing-status"
import { useSharing } from "@mobile/lib/live/position/use-sharing"

// Shows whether the paddler's position is being shared, in plain words, and starts or stops it.
// Shown on the trip hub while the trip is under way. The status line is the point of the card: a
// phone that looks like it is sharing and is not is what the missed-checkpoint alert cannot forgive.
export function SharingCard({ tripId }: { tripId: string }) {
  const { status, now, error, start, stop } = useSharing(tripId)
  const idle = status.kind === "off" || status.kind === "ended"

  return (
    <Card>
      <CardContent className="gap-3">
        <Stack className="gap-1">
          <SectionLabel>Share my position</SectionLabel>
          <Text className="text-base">{describeStatus(status, now)}</Text>
          {error && <Text className="text-sm text-destructive">{error}</Text>}
        </Stack>
        <Button variant={idle ? "cta" : "outline"} onPress={idle ? start : stop}>
          {idle ? "Start sharing" : "Stop sharing"}
        </Button>
      </CardContent>
    </Card>
  )
}
