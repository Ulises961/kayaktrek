import { useState } from "react"
import { Alert } from "react-native"

import { formatDayDate } from "@shared/utils/date"

import { Button } from "@mobile/components/ui/button"
import { Card, CardContent } from "@mobile/components/ui/card"
import { Stack } from "@mobile/components/ui/layout"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { Text } from "@mobile/components/ui/text"
import { closeDay } from "@mobile/lib/live/actions"

type Outcome = { kind: "closed" | "refused"; text: string }

// The leader's close-day action (M8 on web): turns the day's shared positions into an expedition log
// for every crew member. Needs the server, so it is not queued; a refusal shows the server's own
// reason (the trip is not under way, or has no itinerary day for today).
export function CloseDayCard({ tripId }: { tripId: string }) {
  const [pending, setPending] = useState(false)
  const [outcome, setOutcome] = useState<Outcome | null>(null)

  async function run() {
    setPending(true)
    setOutcome(null)
    try {
      const { date } = await closeDay(tripId)
      setOutcome({ kind: "closed", text: `${formatDayDate(date)} closed. Logs are being generated.` })
    } catch (error) {
      setOutcome({ kind: "refused", text: error instanceof Error ? error.message : "The day could not be closed." })
    } finally {
      setPending(false)
    }
  }

  function confirm() {
    Alert.alert(
      "Close today's day?",
      "Generates an expedition log for every crew member from today's shared positions. Everyone can still fill in the details afterwards.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Close day", onPress: () => void run() },
      ],
    )
  }

  return (
    <Card>
      <CardContent className="gap-3">
        <Stack className="gap-1">
          <SectionLabel>End of day</SectionLabel>
          {outcome && (
            <Text className={outcome.kind === "refused" ? "text-sm text-destructive" : "text-base"}>{outcome.text}</Text>
          )}
        </Stack>
        <Button variant="outline" disabled={pending} onPress={confirm}>
          Close day
        </Button>
      </CardContent>
    </Card>
  )
}
