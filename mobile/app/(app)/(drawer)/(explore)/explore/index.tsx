import { Stack as RouterStack } from "expo-router"
import { DrawerToggleButton } from "expo-router/drawer"
import { Compass } from "lucide-react-native"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, RefreshControl, ScrollView } from "react-native"

import type { ExploreItem } from "@shared/dtos/itinerary"
import { DISTANCE_UNIT, type DistanceUnit } from "@shared/itinerary/distance"

import { RouteCard } from "@mobile/components/explore/route-card"
import { Button } from "@mobile/components/ui/button"
import { EmptyPanel } from "@mobile/components/ui/empty-panel"
import { Input } from "@mobile/components/ui/input"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { Text } from "@mobile/components/ui/text"
import { searchPublicItineraries } from "@mobile/lib/explore/actions"
import { getMe } from "@mobile/lib/profile/actions"

// headerLeft: see (drawer)/(trips)/index.tsx's comment — this is the "Explore" drawer
// item's root screen, so it supplies its own menu button.
const header = (
  <RouterStack.Screen options={{ title: "Explore", headerLeft: () => <DrawerToggleButton /> }} />
)

export default function ExploreScreen() {
  const [items, setItems] = useState<ExploreItem[]>([])
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)
  // The submitted query, not the field's text: the field updates on every keystroke and
  // the search only reruns when it is submitted.
  const [query, setQuery] = useState("")
  const [draft, setDraft] = useState("")
  const [unit, setUnit] = useState<DistanceUnit>(DISTANCE_UNIT.NM)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const result = await searchPublicItineraries({
        ...(query ? { name: query } : {}),
        page,
      })
      setItems(result.items)
      setPages(result.pages)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [query, page])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  useEffect(() => {
    // The unit preference only affects how distances read, so a failure here must not
    // fail the screen — it falls back to the default rather than showing an error.
    void getMe()
      .then((me) => me.unitPreference && setUnit(me.unitPreference))
      .catch(() => {})
  }, [])

  function submitSearch() {
    // Back to page 1: a search submitted while on page 3 would otherwise ask for page 3
    // of a result set that may only have one, showing an empty list for a query that
    // actually matched.
    setPage(1)
    setQuery(draft.trim())
  }

  return (
    <Screen className="p-4" edges={["bottom"]}>
      {header}

      <Stack className="gap-4 flex-1">
        <Input
          value={draft}
          onChangeText={setDraft}
          onSubmitEditing={submitSearch}
          placeholder="Search published routes"
          autoCapitalize="none"
          returnKeyType="search"
          testID="explore-search"
        />

        {loading ? (
          <ActivityIndicator />
        ) : error ? (
          <Stack className="gap-3">
            <Text className="text-sm text-destructive">{error}</Text>
            <Button
              onPress={() => {
                setLoading(true)
                void load()
              }}
              testID="explore-retry"
            >
              Try again
            </Button>
          </Stack>
        ) : items.length === 0 ? (
          <EmptyPanel
            icon={Compass}
            title={query ? "No routes match that search" : "No published routes yet"}
            description={
              query
                ? "Try a different name, or clear the search to see everything published."
                : "Routes published by paddlers show up here."
            }
          />
        ) : (
          <ScrollView
            contentContainerClassName="gap-3 pb-4"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  void load()
                }}
              />
            }
          >
            {items.map((item) => (
              <RouteCard key={item.id} item={item} unit={unit} />
            ))}

            {pages > 1 && (
              <Row className="items-center justify-between pt-1">
                <Button
                  variant="outline"
                  disabled={page <= 1}
                  onPress={() => setPage((current) => Math.max(1, current - 1))}
                  testID="explore-prev-page"
                >
                  Previous
                </Button>
                <Text className="text-[11px] tabular-nums text-muted-foreground">
                  Page {page} of {pages}
                </Text>
                <Button
                  variant="outline"
                  disabled={page >= pages}
                  onPress={() => setPage((current) => Math.min(pages, current + 1))}
                  testID="explore-next-page"
                >
                  Next
                </Button>
              </Row>
            )}
          </ScrollView>
        )}
      </Stack>
    </Screen>
  )
}
