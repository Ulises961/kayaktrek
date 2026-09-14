import {
  AnchorIcon,
  ClipboardListIcon,
  MapPinIcon,
  PackageIcon,
  UsersIcon,
} from "lucide-react-native"
import { Link, Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, Pressable } from "react-native"

import { DIFFICULTY_LABELS } from "@shared/dtos/difficulty"
import type { Trip } from "@shared/dtos/trip"
import { palette } from "@shared/tokens"
import { formatDateRange } from "@shared/trips/format"

import { Card, CardContent } from "@mobile/components/ui/card"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { StateBadge } from "@mobile/components/ui/state-badge"
import { Text } from "@mobile/components/ui/text"
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
export default function TripDetailScreen() {
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
