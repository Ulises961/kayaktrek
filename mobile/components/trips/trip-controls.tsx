import { Alert } from "react-native"

import { TRIP_STATE } from "@shared/dtos/trip"

import { MUTATION_ENTITY, MUTATION_OPERATION, enqueueMutation, pushQueuedMutations } from "../../lib/db/mutation-queue"
import { describeChange, useQueuedChanges } from "../../lib/network/queued-changes"
import {
  TRIP_ACTION,
  type TripAction,
  type TripStatus,
  applyPendingTripChanges,
  nextDay,
  pendingTripChanges,
} from "../../lib/trips/pending-trip-changes"
import { Button } from "../ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card"
import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"

const CONFIRMATIONS: Record<TripAction, { title: string; message: string; button: string }> = {
  [TRIP_ACTION.PAUSE]: {
    title: "Pause the trip?",
    message: "For a storm day or an injury wait. Resume when you set off again.",
    button: "Pause",
  },
  [TRIP_ACTION.RESUME]: {
    title: "Resume the trip?",
    message: "The remaining days move on by the time you were paused.",
    button: "Resume",
  },
  [TRIP_ACTION.ABORT]: {
    title: "Abort the trip?",
    message: "It ends here, recorded as interrupted. This can't be undone.",
    button: "Abort",
  },
  [TRIP_ACTION.FINISH]: {
    title: "Finish the trip?",
    message: "Mark the trip as done. This can't be undone.",
    button: "Finish",
  },
}

// M9d WP5: the leader's changes to a trip under way — pause, resume, abort,
// finish, one more day — made on the phone with or without signal. Each goes
// through the queue and is sent at once when there is signal. Until the server
// has it, this card says so, and says what it means: the server still expects
// the old plan, and the shore contact's missed-checkpoint alert runs off it.
export function TripControls({ tripId, status }: { tripId: string; status: TripStatus }) {
  const { pending } = useQueuedChanges()
  const unsent = pendingTripChanges(tripId, pending)
  const current = applyPendingTripChanges(tripId, status, pending)

  if (current.state !== TRIP_STATE.HAPPENING && unsent.length === 0) return null

  async function queue(payload: Record<string, unknown>) {
    await enqueueMutation({
      entityType: MUTATION_ENTITY.TRIP,
      operation: MUTATION_OPERATION.UPDATE,
      entityId: tripId,
      payload,
    })
    // Best effort: offline it fails, and the next sweep sends it.
    void pushQueuedMutations().catch(() => undefined)
  }

  function confirmAction(action: TripAction) {
    const { title, message, button } = CONFIRMATIONS[action]
    const destructive = action === TRIP_ACTION.ABORT || action === TRIP_ACTION.FINISH
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel" },
      { text: button, style: destructive ? "destructive" : "default", onPress: () => queue({ action }) },
    ])
  }

  function confirmExtend(dateTo: string) {
    const newEnd = nextDay(dateTo)
    Alert.alert("Add a day to the trip?", `The trip will end on ${newEnd}.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Add a day", onPress: () => queue({ dateTo: newEnd }) },
    ])
  }

  const underWay = current.state === TRIP_STATE.HAPPENING

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{underWay ? "Trip under way" : "Trip ended on this phone"}</CardTitle>
      </CardHeader>
      <CardContent className="gap-3">
        {unsent.length > 0 && (
          <Stack className="gap-1 rounded-lg bg-sunset-100 p-3">
            <Text className="text-xs font-medium text-sunset-600">
              {`Recorded on this phone, not sent yet: ${unsent.map(describeChange).join(", ")}.`}
            </Text>
            <Text className="text-xs text-sunset-600">
              {"Until it's sent, the server still expects the old plan, so a missed checkpoint can still alert your shore contact."}
            </Text>
          </Stack>
        )}
        {underWay && (
          <Row className="flex-wrap gap-2">
            {current.isPaused ? (
              <>
                <Button variant="outline" onPress={() => confirmAction(TRIP_ACTION.RESUME)} testID="trip-resume">
                  Resume
                </Button>
                <Button variant="destructive" onPress={() => confirmAction(TRIP_ACTION.ABORT)} testID="trip-abort">
                  Abort
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onPress={() => confirmAction(TRIP_ACTION.PAUSE)} testID="trip-pause">
                  Pause
                </Button>
                <Button variant="outline" onPress={() => confirmAction(TRIP_ACTION.FINISH)} testID="trip-finish">
                  Finish
                </Button>
              </>
            )}
            {current.dateTo && (
              <Button variant="outline" onPress={() => confirmExtend(current.dateTo as string)} testID="trip-extend">
                Add a day
              </Button>
            )}
          </Row>
        )}
      </CardContent>
    </Card>
  )
}
