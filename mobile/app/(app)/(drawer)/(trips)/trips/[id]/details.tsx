import { Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator } from "react-native"

import { DIFFICULTY_LABELS } from "@shared/dtos/difficulty"
import type { Trip } from "@shared/dtos/trip"
import { formatDateRange } from "@shared/trips/format"

import { Card, CardContent } from "../../../../../../components/ui/card"
import { Screen, Stack } from "../../../../../../components/ui/layout"
import { SectionLabel } from "../../../../../../components/ui/section-label"
import { StateBadge } from "../../../../../../components/ui/state-badge"
import { Text } from "../../../../../../components/ui/text"
import { getTrip } from "../../../../../../lib/trips/actions"

const header = <RouterStack.Screen options={{ title: "Trip details" }} />

// Read-only trip metadata (frontend's identity card, minus its progression/pause
// controls — those are leader mutations out of scope for this milestone, M9's own
// network-mutate-first read-only-first sequencing). Re-fetches rather than taking
// the hub's trip as a route param: the hub doesn't hold state across navigation and
// a param can't carry a full Trip object cleanly through expo-router.
export default function TripDetailsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    getTrip(id)
      .then((t) => {
        if (cancelled) return
        setTrip(t)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      })
    return () => {
      cancelled = true
    }
  }, [id])

  if (error) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center gap-4 p-6">
        {header}
        <Text className="text-center text-muted-foreground">{error}</Text>
      </Screen>
    )
  }

  if (!trip) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  return (
    <Screen edges={["bottom"]}>
      {header}
      <Stack className="gap-4 p-4">
        <Card>
          <CardContent className="gap-4">
            <Stack className="gap-1">
              <SectionLabel>Destination</SectionLabel>
              <Text className="text-base font-medium">{trip.destination ?? "Untitled trip"}</Text>
            </Stack>

            <Stack className="gap-1">
              <SectionLabel>Dates</SectionLabel>
              <Text className="text-base">{formatDateRange(trip.dateFrom, trip.dateTo)}</Text>
            </Stack>

            <Stack className="gap-1">
              <SectionLabel>State</SectionLabel>
              {trip.state ? <StateBadge state={trip.state} /> : <Text>—</Text>}
            </Stack>

            {trip.difficulty && (
              <Stack className="gap-1">
                <SectionLabel>Difficulty</SectionLabel>
                <Text className="text-base">{DIFFICULTY_LABELS[trip.difficulty]}</Text>
              </Stack>
            )}

            {trip.description && (
              <Stack className="gap-1">
                <SectionLabel>Description</SectionLabel>
                <Text className="text-base text-muted-foreground">{trip.description}</Text>
              </Stack>
            )}
          </CardContent>
        </Card>
      </Stack>
    </Screen>
  )
}
