import {
  AnchorIcon,
  ClipboardListIcon,
  MapPinIcon,
  PackageIcon,
  UsersIcon,
} from "lucide-react-native"
import { Link, Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { useEffect } from "react"
import { ActivityIndicator, Pressable } from "react-native"

import { DIFFICULTY_LABELS, type Difficulty } from "@shared/dtos/difficulty"
import type { Trip, TripState } from "@shared/dtos/trip"
import { palette } from "@shared/tokens"
import { formatDateRange } from "@shared/trips/format"

import { Card, CardContent } from "@mobile/components/ui/card"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { OfflineNotice } from "@mobile/components/ui/offline-notice"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { StateBadge } from "@mobile/components/ui/state-badge"
import { Text } from "@mobile/components/ui/text"
import { CACHE_KEY } from "@mobile/lib/db/cache-freshness"
import { loadTripListCache } from "@mobile/lib/db/trip-list-cache"
import { useLiveCache } from "@mobile/lib/db/use-live-cache"
import { getTrip } from "@mobile/lib/trips/actions"

const header = <RouterStack.Screen options={{ title: "Trip" }} />

// The trip list's actual tap target (docs/adr/mobile-offline.md "Screen structure",
// decided 2026-09-06) — mirrors the role web's TripDetailNav tabs play. M30 WP2
// brought this to full parity with web's tab set (Logistics, Crew added to the
// original Itinerary/Float plan/Items) — but "Details" is deliberately NOT one of
// these link rows: web never has a Details tab either, it shows this same trip
// metadata inline in the identity card at the top of the page, which is what the
// card below this comment now does instead of a separate details.tsx screen this
// hub used to link out to. The itinerary map is still a destination FROM here, not
// the trip list's direct target the way M9b/M9b2 built it.
// The fields the identity card renders. Both the live Trip DTO and the trip-list
// cache's TripCardData map into this shape, so the card below doesn't branch on
// source — same idiom as float-plan.tsx's CrewMemberView. `difficulty` and
// `description` are null offline: the trip-list cache is card data and carries
// neither, the same deliberate trim as LogCardData and RequirementCardData.
type TripHeaderView = {
  destination: string | null
  state: TripState | null
  dateFrom: string | null
  dateTo: string | null
  difficulty: Difficulty | null
  description: string | null
}

function toHeaderView(trip: Trip): TripHeaderView {
  return {
    destination: trip.destination ?? null,
    state: trip.state ?? null,
    dateFrom: trip.dateFrom ?? null,
    dateTo: trip.dateTo ?? null,
    difficulty: trip.difficulty ?? null,
    description: trip.description ?? null,
  }
}

export default function TripDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()

  // This hub is the only route to Itinerary/Crew/Logistics/Float plan/Items, so
  // failing to an error screen here stranded every cache those screens already
  // had — offline, a trip became a dead end at its own front door. It reads the
  // trip-list cache rather than one of its own: the summary it needs is exactly
  // TripCardData, and float-plan.tsx already reaches for the same rows.
  const {
    data: trip,
    error,
    isOffline,
    cachedAt,
    reload,
  } = useLiveCache<TripHeaderView | null>({
    fetchLive: async () => toHeaderView(await getTrip(id)),
    loadCache: async () => {
      const cached = await loadTripListCache()
      const row = cached.find((entry) => entry.id === id)
      return row ? { ...row, difficulty: null, description: null } : null
    },
    // Deliberately a no-op: saveTripListCache replaces the whole table, so
    // writing this one trip back would destroy every other trip's cached row.
    // The trip list owns populating that cache, and M9c WP7's sweep will take
    // the job over from it entirely.
    saveCache: async () => undefined,
    isCacheEmpty: (cached) => cached === null,
    // The trip-list cache's key, because that is the cache this reads — the
    // age shown here is the age of the row it actually rendered.
    cacheKey: CACHE_KEY.tripList,
  })

  useEffect(() => {
    void reload()
  }, [reload])

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

  const links: {
    href: string
    label: string
    icon: typeof MapPinIcon
  }[] = [
    { href: `/trips/${id}/itinerary`, label: "Itinerary", icon: MapPinIcon },
    { href: `/trips/${id}/crew`, label: "Crew", icon: UsersIcon },
    { href: `/trips/${id}/logistics`, label: "Logistics", icon: ClipboardListIcon },
    { href: `/trips/${id}/float-plan`, label: "Float plan", icon: AnchorIcon },
    { href: `/trips/${id}/items`, label: "Items", icon: PackageIcon },
  ]

  return (
    <Screen edges={["bottom"]}>
      {header}
      <Stack className="gap-4 p-4">
        <OfflineNotice visible={isOffline} cachedAt={cachedAt}>
          Offline — showing your last synced trip summary. Each screen below shows whatever it
          last synced.
        </OfflineNotice>
        <Card>
          <CardContent className="gap-3">
            <Row className="justify-between">
              <Text className="flex-1 text-xl font-semibold" numberOfLines={1}>
                {trip.destination ?? "Untitled trip"}
              </Text>
              {trip.state && <StateBadge state={trip.state} />}
            </Row>

            <Text className="text-sm text-muted-foreground">
              {formatDateRange(trip.dateFrom, trip.dateTo)}
            </Text>

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

        <Stack className="gap-3">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} asChild>
              <Pressable>
                <Card>
                  <CardContent>
                    <Row className="items-center gap-3">
                      {/* Matches the drawer's inactive icon color (ocean900) — this
                          list has no "current tab" state to distinguish (every row
                          is just a link, none is "active" the way a nav tab is), so
                          it reads as the drawer's default resting color rather than
                          the accent blue a genuinely interactive/live element would
                          use. */}
                      <Icon size={18} color={palette.ocean900} />
                      <Text className="flex-1 font-medium">{label}</Text>
                    </Row>
                  </CardContent>
                </Card>
              </Pressable>
            </Link>
          ))}
        </Stack>
      </Stack>
    </Screen>
  )
}
