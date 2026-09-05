import { Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView } from "react-native"

import type { Logistics } from "../../../../../frontend/lib/dtos/logistics"
import { TRIP_STATE_LABELS, type Trip } from "../../../../../frontend/lib/dtos/trip"
import type { TripMember } from "../../../../../frontend/lib/dtos/trip-member"
import { formatPaddlerName, formatVesselLength } from "../../../../../frontend/lib/user/format"

import { Badge } from "../../../../components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "../../../../components/ui/card"
import { Row, Screen, Stack } from "../../../../components/ui/layout"
import { Text } from "../../../../components/ui/text"
import { getLogistics, getTrip } from "../../../../lib/trips/actions"

// WP6 (plans/M9b.md): read-only rendering of the same data the printable web float
// plan shows (frontend/app/(app)/trips/float-plan/[id]/page.tsx) — shore contact +
// crew manifest (vessel, emergency contact). No editing, no PDF generation, no
// share-link generation — those stay leader-only web actions.
export default function FloatPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [logistics, setLogistics] = useState<Logistics | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    Promise.all([getTrip(id), getLogistics(id).catch(() => null)])
      .then(([t, l]) => {
        if (cancelled) return
        setTrip(t)
        setLogistics(l)
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
        <RouterStack.Screen options={{ title: "Float plan" }} />
        <Text className="text-center text-muted-foreground">{error}</Text>
      </Screen>
    )
  }

  if (!trip) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        <RouterStack.Screen options={{ title: "Float plan" }} />
        <ActivityIndicator />
      </Screen>
    )
  }

  const crew: TripMember[] = [...(trip.travellers ?? [])].sort((a, b) => {
    if (a.role === "leader") return -1
    if (b.role === "leader") return 1
    return 0
  })

  return (
    <Screen edges={["bottom"]}>
      <RouterStack.Screen options={{ title: "Float plan" }} />
      <ScrollView contentContainerClassName="gap-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle>Shore contact</CardTitle>
          </CardHeader>
          <CardContent>
            {logistics?.shoreContactName ? (
              <Stack className="gap-1">
                <Text>{logistics.shoreContactName}</Text>
                {logistics.shoreContactPhone && (
                  <Text className="text-sm text-muted-foreground">{logistics.shoreContactPhone}</Text>
                )}
                {logistics.shoreContactEmail && (
                  <Text className="text-sm text-muted-foreground">{logistics.shoreContactEmail}</Text>
                )}
                {logistics.shoreContactRelationship && (
                  <Text className="text-sm text-muted-foreground">
                    {logistics.shoreContactRelationship}
                  </Text>
                )}
              </Stack>
            ) : (
              <Text className="text-sm text-muted-foreground">No shore contact set.</Text>
            )}
          </CardContent>
        </Card>

        <Stack className="gap-3">
          <Text className="text-lg font-semibold">Crew manifest</Text>
          {crew.map((member) => (
            <Card key={member.id}>
              <CardHeader>
                <Row className="justify-between">
                  <CardTitle className="flex-1" numberOfLines={1}>
                    {formatPaddlerName(member.user)}
                  </CardTitle>
                  <Badge variant={member.role === "leader" ? "default" : "secondary"}>
                    {member.role === "leader" ? "Leader" : "Crew"}
                  </Badge>
                </Row>
              </CardHeader>
              <CardContent>
                <Stack className="gap-1">
                  {(member.vesselMake || member.vesselModel) && (
                    <Text className="text-sm text-muted-foreground">
                      {[member.vesselMake, member.vesselModel].filter(Boolean).join(" ")}
                      {member.vesselLengthCm != null
                        ? ` · ${formatVesselLength(member.vesselLengthCm)}`
                        : ""}
                    </Text>
                  )}
                  {(member.vesselColorPrimary || member.vesselColorSecondary) && (
                    <Text className="text-sm text-muted-foreground">
                      {[member.vesselColorPrimary, member.vesselColorSecondary]
                        .filter(Boolean)
                        .join(" / ")}
                    </Text>
                  )}
                  {member.emergencyContactName && (
                    <Text className="text-sm text-muted-foreground">
                      Emergency: {member.emergencyContactName}
                      {member.emergencyContactPhone ? ` · ${member.emergencyContactPhone}` : ""}
                      {member.emergencyContactRelationship
                        ? ` (${member.emergencyContactRelationship})`
                        : ""}
                    </Text>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>

        {trip.state && (
          <Text className="text-center text-sm text-muted-foreground">
            Trip status: {TRIP_STATE_LABELS[trip.state]}
          </Text>
        )}
      </ScrollView>
    </Screen>
  )
}
