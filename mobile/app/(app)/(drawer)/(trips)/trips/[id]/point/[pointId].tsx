import { Stack as RouterStack, useLocalSearchParams, useRouter } from "expo-router"
import { ArrowDown, ArrowUp } from "lucide-react-native"
import { useEffect, useState } from "react"
import { ActivityIndicator, Alert, ScrollView } from "react-native"

import { palette } from "@shared/tokens"

import { POINT_TYPE, PointForm, type PointFormValues } from "@mobile/components/trips/point-form"
import { Button } from "@mobile/components/ui/button"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { Text } from "@mobile/components/ui/text"
import { editRoute, loadEditableRoute, pushRouteChanges } from "@mobile/lib/db/route-edit"
import { isTripLeader } from "@mobile/lib/db/trip-role"
import {
  type EditableRoute,
  deletePoint,
  editPoint,
  movePointToDay,
  movePointWithinDay,
} from "@mobile/lib/itinerary/route-edits"

const header = <RouterStack.Screen options={{ title: "Edit point" }} />

// M9d WP3: the leader edits a route point on the phone, with or without signal.
// Every change lands in the local route at once (lib/db/route-edit.ts) and is
// pushed straight away when there is signal, or by the next sweep when there is
// not — so a failed push here is not an error to show.
export default function EditPointScreen() {
  const { id, pointId } = useLocalSearchParams<{ id: string; pointId: string }>()
  const router = useRouter()
  const [route, setRoute] = useState<EditableRoute | null>(null)
  const [isLeader, setIsLeader] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([loadEditableRoute(id), isTripLeader(id)]).then(([loaded, leader]) => {
      if (cancelled) return
      setRoute(loaded)
      setIsLeader(leader)
    })
    return () => {
      cancelled = true
    }
  }, [id])

  async function apply(edit: (current: EditableRoute) => EditableRoute): Promise<boolean> {
    setSubmitting(true)
    setError(null)
    try {
      setRoute(await editRoute(id, edit))
      // Best effort: offline it fails and the sweep pushes later.
      void pushRouteChanges(id).catch(() => undefined)
      return true
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the change.")
      return false
    } finally {
      setSubmitting(false)
    }
  }

  async function handleSave(values: PointFormValues) {
    const saved = await apply((current) => {
      const edited = editPoint(current, pointId, {
        name: values.name.trim() || null,
        notes: values.notes.trim() || null,
        type: values.type,
      })
      return movePointToDay(edited, pointId, values.dayId)
    })
    if (saved) router.back()
  }

  function confirmDelete() {
    Alert.alert("Delete this point?", "It is removed from the route for everyone once sent.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          if (await apply((current) => deletePoint(current, pointId))) router.back()
        },
      },
    ])
  }

  const point = route?.points.find((candidate) => candidate.id === pointId)

  if (!route || isLeader === null) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  if (!isLeader || !point) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center p-6">
        {header}
        <Text className="text-center text-muted-foreground">
          {!isLeader ? "Only the trip leader can change the route." : "This point is no longer on the route."}
        </Text>
      </Screen>
    )
  }

  const days = route.days
    .filter((day) => day.dayNumber > 0)
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((day) => ({ id: day.id, dayNumber: day.dayNumber }))

  return (
    <Screen edges={["bottom"]}>
      {header}
      <ScrollView contentContainerClassName="p-4" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <PointForm
          initial={{
            name: point.name ?? "",
            notes: point.notes ?? "",
            type: point.type === POINT_TYPE.STOP ? POINT_TYPE.STOP : POINT_TYPE.POSITION,
            dayId: point.dayId,
          }}
          days={days}
          submitLabel="Save point"
          submitting={submitting}
          error={error}
          onSubmit={(values) => void handleSave(values)}
        >
          {/* Reordering is a list operation, not a drag (plans/M31.md): one step
              at a time within the point's own day. */}
          <Stack className="gap-2">
            <Text className="text-sm font-medium">Order in the day</Text>
            <Row className="gap-2">
              <Button
                variant="outline"
                onPress={() => void apply((current) => movePointWithinDay(current, pointId, -1))}
                disabled={submitting}
                testID="point-move-earlier"
                icon={<ArrowUp size={14} color={palette.ocean700} />}
              >
                Earlier
              </Button>
              <Button
                variant="outline"
                onPress={() => void apply((current) => movePointWithinDay(current, pointId, 1))}
                disabled={submitting}
                testID="point-move-later"
                icon={<ArrowDown size={14} color={palette.ocean700} />}
              >
                Later
              </Button>
            </Row>
          </Stack>
        </PointForm>

        <Button
          variant="destructive"
          className="mt-6 self-start"
          onPress={confirmDelete}
          disabled={submitting}
          testID="point-delete"
        >
          Delete point
        </Button>
      </ScrollView>
    </Screen>
  )
}
