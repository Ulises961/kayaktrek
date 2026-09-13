import { AnchorIcon, MapPinIcon, PackageIcon } from "lucide-react-native"
import { Link, Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, Pressable } from "react-native"

import type { Trip } from "@shared/dtos/trip"
import { palette } from "@shared/tokens"

import { Card, CardContent } from "@mobile/components/ui/card"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { StateBadge } from "@mobile/components/ui/state-badge"
import { Text } from "@mobile/components/ui/text"
import { getTrip } from "@mobile/lib/trips/actions"

const header = <RouterStack.Screen options={{ title: "Trip" }} />

// The trip list's actual tap target (docs/adr/mobile-offline.md "Screen structure",
// decided 2026-09-06) — mirrors the role web's TripDetailNav tabs play, minimal per
// that decision: link out to what already exists (Itinerary, Float plan — which
// already carries the crew manifest — and Items) rather than a v1 of every web tab.
// The itinerary map is a destination FROM here now, not the trip list's direct
// target the way M9b/M9b2 built it.
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
    { href: `/trips/${id}/float-plan`, label: "Float plan", icon: AnchorIcon },
    { href: `/trips/${id}/items`, label: "Items", icon: PackageIcon },
  ]

  return (
    <Screen edges={["bottom"]}>
      {header}
      <Stack className="gap-4 p-4">
        <Row className="justify-between">
          <Text className="flex-1 text-xl font-semibold" numberOfLines={1}>
            {trip.destination ?? "Untitled trip"}
          </Text>
          {trip.state && <StateBadge state={trip.state} />}
        </Row>

        <Stack className="gap-3">
          {links.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} asChild>
              <Pressable>
                <Card>
                  <CardContent>
                    <Row className="items-center gap-3">
                      <Icon size={18} color={palette.ocean600} />
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
