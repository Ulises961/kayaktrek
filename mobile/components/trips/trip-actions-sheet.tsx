import { XIcon } from "lucide-react-native"
import { Modal, Pressable, View } from "react-native"

import { TRIP_STATE, type TripState } from "@shared/dtos/trip"
import { palette } from "@shared/tokens"

import type { TripHeaderView } from "../../lib/trips/use-trip-header"
import { Row, Stack } from "../ui/layout"
import { Text } from "../ui/text"
import { StartTripCard } from "./start-trip-card"
import { TripControls } from "./trip-controls"

// Whether there is anything to do to the trip from here, which decides whether the header
// shows the ••• button at all. Only the leader has trip actions today; a trip the leader
// finished on this phone keeps them while the change waits to be sent, because its notice
// lives in the sheet too.
export function offersTripActions({
  isLeader,
  state,
  hasUnsentChange,
}: {
  isLeader: boolean
  state: TripState | null
  hasUnsentChange: boolean
}): boolean {
  if (!isLeader || state === null) return false
  return state === TRIP_STATE.BUILDING || state === TRIP_STATE.HAPPENING || hasUnsentChange
}

type TripActionsSheetProps = {
  visible: boolean
  tripId: string
  trip: TripHeaderView
  onClose: () => void
  /** The server has moved the trip on, so what the header shows is out of date. */
  onStarted: () => void
}

// Everything the leader can do to the trip, folded behind the header's ••• button (M43). The
// cards inside are the ones the hub used to carry, so their confirmations, their offline
// queue and the "not sent yet" notice are unchanged.
export function TripActionsSheet({ visible, tripId, trip, onClose, onStarted }: TripActionsSheetProps) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View className="flex-1 justify-end">
        <Pressable
          className="absolute inset-0 bg-black/40"
          onPress={onClose}
          accessibilityLabel="Close trip actions"
        />
        <Stack className="gap-3 rounded-t-2xl bg-background p-4 pb-8">
          <Row className="items-center justify-between">
            <Text className="text-base font-semibold">Trip actions</Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
              className="h-11 w-11 items-center justify-center"
              testID="trip-actions-close"
            >
              <XIcon size={20} color={palette.ocean700} />
            </Pressable>
          </Row>
          <StartTripCard
            tripId={tripId}
            state={trip.state}
            onStarted={() => {
              onStarted()
              onClose()
            }}
          />
          <TripControls
            tripId={tripId}
            status={{ state: trip.state, isPaused: trip.isPaused, dateTo: trip.dateTo }}
          />
        </Stack>
      </View>
    </Modal>
  )
}
