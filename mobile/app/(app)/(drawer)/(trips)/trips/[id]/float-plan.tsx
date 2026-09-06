import { HeartPulse, Phone, Sailboat, UserRound } from "lucide-react-native"
import { Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { useEffect, useState } from "react"
import { ActivityIndicator, ScrollView } from "react-native"

import type { Logistics } from "@shared/dtos/logistics"
import { TRIP_STATE_LABELS, type Trip } from "@shared/dtos/trip"
import type { TripMember } from "@shared/dtos/trip-member"
import { palette } from "@shared/tokens"
import { formatPaddlerName, formatVesselLength } from "@shared/user/format"

import { Badge } from "../../../../../../components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "../../../../../../components/ui/card"
import { Row, Screen, Stack } from "../../../../../../components/ui/layout"
import { Text } from "../../../../../../components/ui/text"
import { getLogistics, getTrip } from "../../../../../../lib/trips/actions"

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
                <Row className="items-center gap-1.5">
                  <UserRound size={14} color={palette.ocean500} />
                  <Text>{logistics.shoreContactName}</Text>
                </Row>
                {logistics.shoreContactPhone && (
                  <Row className="items-center gap-1.5">
                    <Phone size={13} color={palette.ocean500} />
                    <Text className="text-sm text-muted-foreground">
                      {logistics.shoreContactPhone}
                    </Text>
                  </Row>
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
                    <Row className="items-center gap-1.5">
                      <Sailboat size={13} color={palette.ocean500} />
                      <Text className="text-sm text-muted-foreground">
                        {[member.vesselMake, member.vesselModel].filter(Boolean).join(" ")}
                        {member.vesselLengthCm != null
                          ? ` · ${formatVesselLength(member.vesselLengthCm)}`
                          : ""}
                      </Text>
                    </Row>
                  )}
                  {(member.vesselColorPrimary || member.vesselColorSecondary) && (
                    <Text className="pl-[19px] text-sm text-muted-foreground">
                      {[member.vesselColorPrimary, member.vesselColorSecondary]
                        .filter(Boolean)
                        .join(" / ")}
                    </Text>
                  )}
                  {member.emergencyContactName && (
                    <Row className="items-center gap-1.5">
                      <HeartPulse size={13} color={palette.ocean500} />
                      <Text className="text-sm text-muted-foreground">
                        {member.emergencyContactName}
                        {member.emergencyContactPhone ? ` · ${member.emergencyContactPhone}` : ""}
                        {member.emergencyContactRelationship
                          ? ` (${member.emergencyContactRelationship})`
                          : ""}
                      </Text>
                    </Row>
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
