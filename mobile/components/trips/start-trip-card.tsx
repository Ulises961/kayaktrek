import { useState } from "react"
import { Alert } from "react-native"

import { TRIP_STATE, type TripState } from "@shared/dtos/trip"

import { startTrip } from "../../lib/trips/actions"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Text } from "../ui/text"

// The leader's "set off" on the phone: building → happening. Online-only, unlike the
// pause/abort/finish controls beside it, because starting is what arms the shore
// contact's missed-checkpoint alert and what opens the Live screen, so the server has
// to have actually heard it. A failure shows the server's own reason instead of
// queueing; the paddler is told to try again with signal.
export function StartTripCard({
  tripId,
  state,
  onStarted,
}: {
  tripId: string
  state: TripState | null
  onStarted: () => void
}) {
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (state !== TRIP_STATE.BUILDING) return null

  async function start() {
    setStarting(true)
    setError(null)
    try {
      await startTrip(tripId)
      onStarted()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the trip. Try again with signal.")
    } finally {
      setStarting(false)
    }
  }

  function confirmStart() {
    Alert.alert(
      "Start the trip?",
      "It moves from planning to under way. Your shore contact's check-in alerts begin, and position sharing becomes available. This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Start", onPress: () => void start() },
      ],
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Ready to set off?</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">
        <Text className="text-sm text-muted-foreground">
          Starting needs a connection, so do it before you leave coverage.
        </Text>
        {error && (
          <Text className="text-sm text-destructive" testID="start-trip-error">
            {error}
          </Text>
        )}
        <Button variant="cta" disabled={starting} onPress={confirmStart} testID="trip-start">
          {starting ? "Starting…" : "Start trip"}
        </Button>
      </CardContent>
    </Card>
  )
}
