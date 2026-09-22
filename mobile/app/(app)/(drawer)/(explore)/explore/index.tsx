import { Stack as RouterStack } from "expo-router"
import { DrawerToggleButton } from "expo-router/drawer"
import { Compass, SlidersHorizontalIcon } from "lucide-react-native"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, Pressable, RefreshControl, ScrollView } from "react-native"

import type { ExploreItem, ExploreFilters, ExploreSort } from "@shared/dtos/itinerary"
import { DISTANCE_UNIT, type DistanceUnit } from "@shared/itinerary/distance"
import { palette } from "@shared/tokens"

import {
  ExploreFilterSheet,
  type Bounds,
} from "@mobile/components/explore/explore-filter-sheet"
import { RouteCard } from "@mobile/components/explore/route-card"
import { Badge } from "@mobile/components/ui/badge"
import { Button } from "@mobile/components/ui/button"
import { Chip } from "@mobile/components/ui/chip"
import { EmptyPanel } from "@mobile/components/ui/empty-panel"
import { Input } from "@mobile/components/ui/input"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { NeedsConnectionNotice } from "@mobile/components/ui/offline-notice"
import { Text } from "@mobile/components/ui/text"
import { isOfflineError } from "@mobile/lib/api/client"
import { searchPublicItineraries } from "@mobile/lib/explore/actions"
import { useIsOffline } from "@mobile/lib/network/use-is-offline"
import { getMe } from "@mobile/lib/profile/actions"

// headerLeft: see (drawer)/(trips)/index.tsx's comment — this is the "Explore" drawer
// item's root screen, so it supplies its own menu button.
const header = (
  <RouterStack.Screen options={{ title: "Explore", headerLeft: () => <DrawerToggleButton /> }} />
)

const SORTS: { value: ExploreSort; label: string }[] = [
  { value: "recent", label: "Recent" },
  { value: "distance", label: "Distance" },
  { value: "duration", label: "Duration" },
  { value: "name", label: "Name" },
]

const PER_PAGE = 20
const SEARCH_DEBOUNCE_MS = 300

const NO_BOUNDS: Bounds = { minMiles: "", maxMiles: "", minDays: "", maxDays: "" }

// "" -> undefined, not 0: an empty field means "no bound", and a 0-mile minimum is a
// different query. A non-numeric value is dropped rather than sent as NaN.
function toNumber(value: string): number | undefined {
  if (value.trim() === "") return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

export default function ExploreScreen() {
  const [items, setItems] = useState<ExploreItem[]>([])
  const [total, setTotal] = useState(0)
  const [pages, setPages] = useState(1)
  const [page, setPage] = useState(1)

  const [name, setName] = useState("")
  const [debouncedName, setDebouncedName] = useState("")
  const [seasons, setSeasons] = useState<string[]>([])
  const [bounds, setBounds] = useState<Bounds>(NO_BOUNDS)
  const [sort, setSort] = useState<ExploreSort>("recent")
  const [filtersOpen, setFiltersOpen] = useState(false)

  const [unit, setUnit] = useState<DistanceUnit>(DISTANCE_UNIT.NM)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedName(name.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [name])

  const filters = useMemo<ExploreFilters>(
    () => ({
      ...(debouncedName ? { name: debouncedName } : {}),
      seasons,
      minMiles: toNumber(bounds.minMiles),
      maxMiles: toNumber(bounds.maxMiles),
      minDays: toNumber(bounds.minDays),
      maxDays: toNumber(bounds.maxDays),
      sort,
      perPage: PER_PAGE,
    }),
    [debouncedName, seasons, bounds, sort],
  )

  // A slower earlier request must not overwrite a newer one's results — typing produces
  // overlapping searches, and the one that resolves last is not the one that was asked
  // for last.
  const latestRequest = useRef(0)

  const runSearch = useCallback(
    async (targetPage: number, { append }: { append: boolean }) => {
      const requestId = ++latestRequest.current
      setError(null)
      try {
        const result = await searchPublicItineraries({ ...filters, page: targetPage })
        if (requestId !== latestRequest.current) return
        setItems((current) => (append ? [...current, ...result.items] : result.items))
        setTotal(result.total)
        setPages(result.pages)
        setPage(result.page)
      } catch (err) {
        if (requestId !== latestRequest.current) return
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      } finally {
        if (requestId === latestRequest.current) {
          setLoading(false)
          setRefreshing(false)
          setLoadingMore(false)
        }
      }
    },
    [filters],
  )

  // Any filter change restarts at page 1 — asking for page 3 of a freshly-filtered set
  // shows nothing for a query that matched.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void runSearch(1, { append: false })
  }, [runSearch])

  // Offline, the screen offers no retry — it could only fail again — so the
  // search re-runs by itself on the transition back to connected. Only on that
  // transition, and only if the last search failed for want of a connection.
  const isDeviceOffline = useIsOffline()
  const wasDeviceOffline = useRef(isDeviceOffline)
  useEffect(() => {
    const reconnected = wasDeviceOffline.current && !isDeviceOffline
    wasDeviceOffline.current = isDeviceOffline
    if (reconnected && isOfflineError(error)) {
      setLoading(true)
      void runSearch(1, { append: false })
    }
  }, [isDeviceOffline, error, runSearch])

  useEffect(() => {
    // The unit preference only changes how distances read, so a failure here must not
    // fail the screen — it falls back to the default rather than showing an error.
    void getMe()
      .then((me) => me.unitPreference && setUnit(me.unitPreference))
      .catch(() => {})
  }, [])

  // Grouped the way web's activeFilterCount groups them: a min/max pair is one filter,
  // not two, so the badge counts the same as the panel reads.
  const activeFilterCount =
    (seasons.length > 0 ? 1 : 0) +
    (bounds.minMiles.trim() !== "" || bounds.maxMiles.trim() !== "" ? 1 : 0) +
    (bounds.minDays.trim() !== "" || bounds.maxDays.trim() !== "" ? 1 : 0)

  const isFiltered = activeFilterCount > 0 || debouncedName !== ""

  function toggleSeason(season: string) {
    setSeasons((current) =>
      current.includes(season)
        ? current.filter((entry) => entry !== season)
        : [...current, season],
    )
  }

  function clearFilters() {
    setSeasons([])
    setBounds(NO_BOUNDS)
  }

  return (
    <Screen className="p-4" edges={["bottom"]}>
      {header}

      <Stack className="flex-1 gap-3">
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Search routes by name…"
          autoCapitalize="none"
          returnKeyType="search"
          testID="explore-search"
        />

        <Row className="justify-between gap-2">
          <Pressable
            onPress={() => setFiltersOpen(true)}
            testID="explore-filters-open"
            hitSlop={8}
          >
            <Row className="items-center gap-1.5">
              <SlidersHorizontalIcon size={16} color={palette.ocean700} />
              <Text className="text-sm">Filters</Text>
              {activeFilterCount > 0 && <Badge>{activeFilterCount}</Badge>}
            </Row>
          </Pressable>
        </Row>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerClassName="gap-2 pr-4"
          className="max-h-11 grow-0"
        >
          {SORTS.map((option) => (
            <Chip
              key={option.value}
              active={sort === option.value}
              onPress={() => setSort(option.value)}
              testID={`explore-sort-${option.value}`}
            >
              {option.label}
            </Chip>
          ))}
        </ScrollView>

        {loading ? (
          <ActivityIndicator />
        ) : error ? (
          <Stack className="gap-3">
            {/* Explore is deliberately not cached: it is a discovery surface acted
                on while connected. Offline is therefore expected, and the banner
                says so; only a genuine server error is shown here. */}
            <NeedsConnectionNotice visible={isOfflineError(error)}>
              Explore needs a connection.
            </NeedsConnectionNotice>
            {/* No retry offline: it could only fail again, and the search re-runs
                by itself on reconnect (see the effect above). */}
            {!isOfflineError(error) && (
              <>
                <Text className="text-sm text-destructive">{error}</Text>
                <Button
                  onPress={() => {
                    setLoading(true)
                    void runSearch(1, { append: false })
                  }}
                  testID="explore-retry"
                >
                  Try again
                </Button>
              </>
            )}
          </Stack>
        ) : (
          <ScrollView
            contentContainerClassName="gap-3 pb-4"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => {
                  setRefreshing(true)
                  void runSearch(1, { append: false })
                }}
              />
            }
          >
            <Text className="text-[11px] tabular-nums text-muted-foreground">
              {total === 0 ? "No routes match" : `${total} ${total === 1 ? "route" : "routes"}`}
            </Text>

            {items.length === 0 ? (
              // Two different emptinesses. "Widen the search" is actively misleading
              // when the library itself is empty and no filter is on — there is nothing
              // to widen towards. Cold start gets an invitation instead.
              <EmptyPanel
                icon={Compass}
                title={
                  isFiltered
                    ? "No public routes match these filters."
                    : "No routes have been shared yet."
                }
                description={
                  isFiltered
                    ? "Widen the search, or clear a filter to see the full library."
                    : "This library is built by the people who paddle it. Publish a route you know and it will show up here."
                }
              />
            ) : (
              <>
                {items.map((item) => (
                  <RouteCard key={item.id} item={item} unit={unit} />
                ))}

                {page < pages && (
                  <Button
                    variant="outline"
                    disabled={loadingMore}
                    onPress={() => {
                      setLoadingMore(true)
                      void runSearch(page + 1, { append: true })
                    }}
                    testID="explore-load-more"
                  >
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                )}
              </>
            )}
          </ScrollView>
        )}
      </Stack>

      <ExploreFilterSheet
        visible={filtersOpen}
        seasons={seasons}
        bounds={bounds}
        onToggleSeason={toggleSeason}
        onChangeBound={(key, value) => setBounds((current) => ({ ...current, [key]: value }))}
        onClear={clearFilters}
        onClose={() => setFiltersOpen(false)}
      />
    </Screen>
  )
}
