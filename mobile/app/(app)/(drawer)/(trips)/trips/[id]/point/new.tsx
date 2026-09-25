import { Stack as RouterStack, useLocalSearchParams, useRouter } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView } from "react-native"

import { POINT_TYPE, PointForm, type PointFormValues } from "@mobile/components/trips/point-form"
import { Screen } from "@mobile/components/ui/layout"
import { Text } from "@mobile/components/ui/text"
import { editRoute, loadEditableRoute, pushRouteChanges } from "@mobile/lib/db/route-edit"
import { isTripLeader } from "@mobile/lib/db/trip-role"
import { type EditableRoute, insertPoint, nearestPointInDay } from "@mobile/lib/itinerary/route-edits"
import { uuidv7 } from "@mobile/lib/uuid"

const header = <RouterStack.Screen options={{ title: "Add point" }} />

// M9d WP3: add a point to the route — from a long press on the map, or "Add stop
// here" at the phone's own position, the emergency stop this milestone is most
// for. It goes into the chosen day after that day's stop nearest to it; the edit
// screen reorders it if that guess is wrong.
export default function NewPointScreen() {
  const params = useLocalSearchParams<{ id: string; dayId: string; latitude: string; longitude: string }>()
  const latitude = Number(params.latitude)
  const longitude = Number(params.longitude)
  const router = useRouter()
  const [route, setRoute] = useState<EditableRoute | null>(null)
  const [isLeader, setIsLeader] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    void Promise.all([loadEditableRoute(params.id), isTripLeader(params.id)]).then(([loaded, leader]) => {
      if (cancelled) return
      setRoute(loaded)
      setIsLeader(leader)
    })
    return () => {
      cancelled = true
    }
  }, [params.id])

  async function handleSave(values: PointFormValues) {
    setSubmitting(true)
    setError(null)
    try {
      await editRoute(params.id, (current) =>
        insertPoint(current, values.dayId, nearestPointInDay(current, values.dayId, latitude, longitude), {
          id: uuidv7(),
          latitude,
          longitude,
          name: values.name.trim() || null,
          notes: values.notes.trim() || null,
          type: values.type,
        }),
      )
      // Best effort: offline it fails and the sweep pushes later.
      void pushRouteChanges(params.id).catch(() => undefined)
      router.back()
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't add the point.")
    } finally {
      setSubmitting(false)
    }
  }

  if (!route || isLeader === null) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  const days = route.days
    .filter((day) => day.dayNumber > 0)
    .sort((a, b) => a.dayNumber - b.dayNumber)
    .map((day) => ({ id: day.id, dayNumber: day.dayNumber }))

  if (!isLeader || days.length === 0 || Number.isNaN(latitude) || Number.isNaN(longitude)) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center p-6">
        {header}
        <Text className="text-center text-muted-foreground">
          {!isLeader
            ? "Only the trip leader can change the route."
            : "This trip has no days to add a point to yet."}
        </Text>
      </Screen>
    )
  }

  const initialDay = days.some((day) => day.id === params.dayId) ? params.dayId : days[0].id

  return (
    <Screen edges={["bottom"]}>
      {header}
      <ScrollView contentContainerClassName="p-4" keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text className="mb-4 text-xs text-muted-foreground tabular-nums">
          {`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`}
        </Text>
        <PointForm
          initial={{ name: "", notes: "", type: POINT_TYPE.STOP, dayId: initialDay }}
          days={days}
          submitLabel="Add point"
          submitting={submitting}
          error={error}
          onSubmit={(values) => void handleSave(values)}
        />
      </ScrollView>
    </Screen>
  )
}
