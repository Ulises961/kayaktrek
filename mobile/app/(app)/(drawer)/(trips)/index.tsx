import { Stack as RouterStack } from "expo-router"
import { DrawerToggleButton } from "expo-router/drawer"
import { Kayak } from "lucide-react-native"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, RefreshControl, ScrollView } from "react-native"

import { TripCard } from "@mobile/components/trips/trip-card"
import { Button } from "@mobile/components/ui/button"
import { EmptyPanel } from "@mobile/components/ui/empty-panel"
import { Screen, Stack } from "@mobile/components/ui/layout"
import { OfflineNotice } from "@mobile/components/ui/offline-notice"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { Text } from "@mobile/components/ui/text"
import { CACHE_KEY, readCachedAt } from "@mobile/lib/db/cache-freshness"
import { type TripCardData, loadTripListCache, saveTripListCache, toTripCardData } from "@mobile/lib/db/trip-list-cache"
import { recheckConnectivity } from "@mobile/lib/network/use-is-offline"
import { groupTrips } from "@mobile/lib/trips/group-trips"
import { getTrips } from "@mobile/lib/trips/actions"

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

// M9c WP6: reads/writes lib/db/trip-list-cache.ts's local NitromelonDB cache
// (wholesale-replaced on every successful fetch — spec §4 never covered a
// top-level Trip aggregate, so this is a simple cache, not delta sync). A
// failed fetch falls back to the cache rather than showing an error, as long
// as the cache has something to show; `isOffline` flags that fallback so the
// list doesn't read as silently authoritative.
export default function TripListScreen() {
  const [trips, setTrips] = useState<TripCardData[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true)
      // A pull-to-refresh means "check again, properly" — NetInfo's own passive
      // state can lag a real reconnect (captive portals, flaky wifi that never
      // fully drops), so force it to re-evaluate before trusting the fetch
      // that follows.
      await recheckConnectivity()
    }
    try {
      const page = await getTrips()
      const cardData = page.items.map(toTripCardData)
      setTrips(cardData)
      setError(null)
      setIsOffline(false)
      setCachedAt(null)
      await saveTripListCache(page.items)
    } catch (err) {
      const cached = await loadTripListCache()
      if (cached.length > 0) {
        setTrips(cached)
        setIsOffline(true)
        setError(null)
        setCachedAt(await readCachedAt(CACHE_KEY.tripList))
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      }
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
      <OfflineNotice visible={isOffline} cachedAt={cachedAt}>
        These are your trips as last synced. Pull down to refresh once you are back online.
      </OfflineNotice>
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
        {groupTrips(trips ?? []).map((group) => (
          <Stack key={group.state} className="gap-3">
            <SectionLabel testID={`group-${group.state}`}>{group.title}</SectionLabel>
            {group.trips.map((trip, index) => (
              <TripCard key={trip.id || String(index)} trip={trip} />
            ))}
          </Stack>
        ))}
      </ScrollView>
    </Screen>
  )
}
