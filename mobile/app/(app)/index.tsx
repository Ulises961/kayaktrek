import { Stack as RouterStack } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, RefreshControl, ScrollView } from "react-native"

import type { Trip } from "../../../frontend/lib/dtos/trip"

import { TripCard } from "../../components/trips/trip-card"
import { Button } from "../../components/ui/button"
import { Screen, Stack } from "../../components/ui/layout"
import { Text } from "../../components/ui/text"
import { useAuth } from "../../lib/auth/auth-context"
import { getTrips } from "../../lib/trips/actions"

// Sets this screen's title on the (app) Stack navigator — see (app)/_layout.tsx's
// comment on why the title is declared here rather than in the parent layout.
const header = <RouterStack.Screen options={{ title: "Your trips" }} />

// WP2 (plans/M9b.md): page 1 only, no offline fallback (that's M9c) — validates the
// real backend round trip (auth -> trip/<user_id>/all -> TripSchema) rather than
// building out pagination for a milestone whose whole point is proving the stack works.
export default function TripListScreen() {
  const { signOut } = useAuth()
  const [trips, setTrips] = useState<Trip[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setIsRefreshing(true)
    setError(null)
    try {
      const page = await getTrips()
      setTrips(page.items)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      if (isRefresh) setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    // Fetching on mount is exactly the "sync with an external system" case the rule's
    // own docs carve out — the setState calls just happen inside `load`'s async body
    // rather than the effect body itself, which the lint rule can't see through.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  if (trips === null && !error) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  if (error) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center gap-4 p-6">
        {header}
        <Text className="text-center text-muted-foreground">{error}</Text>
        <Button onPress={() => void load()}>Try again</Button>
      </Screen>
    )
  }

  if (trips && trips.length === 0) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center gap-4 p-6">
        {header}
        <Text className="text-center text-muted-foreground">No trips yet.</Text>
        <Button variant="outline" onPress={signOut} testID="sign-out">
          Sign out
        </Button>
      </Screen>
    )
  }

  return (
    <Screen edges={["bottom"]}>
      {header}
      {/* Plain ScrollView + map, not FlatList — WP2's trip counts are small and this is
          the read-only "validate the stack" milestone, not the place to chase a
          FlatList/VirtualizedList context crash under this RN/jest pairing. Revisit if
          a real trip list ever grows large enough to need virtualization. */}
      <ScrollView
        contentContainerClassName="gap-3 p-4"
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => void load(true)} />
        }
      >
        {(trips ?? []).map((trip, index) => (
          <TripCard key={trip.id ?? String(index)} trip={trip} />
        ))}
        <Stack className="items-center py-4">
          <Button variant="outline" onPress={signOut} testID="sign-out">
            Sign out
          </Button>
        </Stack>
      </ScrollView>
    </Screen>
  )
}
