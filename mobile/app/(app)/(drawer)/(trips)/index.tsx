import { Stack as RouterStack } from "expo-router"
import { DrawerToggleButton } from "expo-router/drawer"
import { Kayak } from "lucide-react-native"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, RefreshControl, ScrollView } from "react-native"

import type { Trip } from "@shared/dtos/trip"

import { TripCard } from "../../../../components/trips/trip-card"
import { Button } from "../../../../components/ui/button"
import { EmptyPanel } from "../../../../components/ui/empty-panel"
import { Screen } from "../../../../components/ui/layout"
import { Text } from "../../../../components/ui/text"
import { getTrips } from "../../../../lib/trips/actions"

// Sets this screen's title on its group's Stack navigator — see (trips)/_layout.tsx's
// comment on why the title is declared here rather than in the parent layout.
// headerLeft: the drawer's own header is hidden ((drawer)/_layout.tsx), so this root
// screen of the "Trips" drawer item supplies its own menu button; a screen pushed
// deeper in this stack (trip detail, float plan) gets a back button instead and needs
// no drawer toggle of its own.
const header = (
  <RouterStack.Screen
    options={{ title: "Your trips", headerLeft: () => <DrawerToggleButton /> }}
  />
)

// WP2 (plans/M9b.md): page 1 only, no offline fallback (that's M9c) — validates the
// real backend round trip (auth -> trip/<user_id>/all -> TripSchema) rather than
// building out pagination for a milestone whose whole point is proving the stack works.
export default function TripListScreen() {
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
      <Screen edges={["bottom"]} className="items-center p-6">
        {header}
        <EmptyPanel
          className="mt-4"
          icon={Kayak}
          title="No trips yet"
          description="Trips you plan on the web appear here — the itinerary builder is desktop-only for now."
          action={
            // Disabled rather than wired to a stand-in destination: the mobile
            // itinerary builder (create-a-trip) doesn't exist yet, and a CTA that
            // silently no-ops on tap reads as broken. Web parity for "create/explore
            // itineraries" is real, separate work (M9's own scope note on map-based
            // building staying web-only, and the still-unbuilt Explore screen); this
            // is a placeholder for the day either lands, not a stand-in for one.
            <Button variant="cta" disabled>
              Create a trip
            </Button>
          }
        />
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
      </ScrollView>
    </Screen>
  )
}
