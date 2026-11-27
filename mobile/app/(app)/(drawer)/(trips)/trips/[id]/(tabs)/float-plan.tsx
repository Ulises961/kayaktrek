import { HeartPulse, Phone, Sailboat, UserRound } from "lucide-react-native"
import { Link, Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useState } from "react"
import { ActivityIndicator, ScrollView } from "react-native"

import type { Logistics } from "@shared/dtos/logistics"
import { TRIP_STATE_LABELS, type TripState } from "@shared/dtos/trip"
import { lightTokens } from "@shared/tokens"
import { formatPaddlerName, formatVesselLength } from "@shared/user/format"

import { Badge } from "@mobile/components/ui/badge"
import { Button } from "@mobile/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@mobile/components/ui/card"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { OfflineNotice } from "@mobile/components/ui/offline-notice"
import { Text } from "@mobile/components/ui/text"
import { CACHE_KEY, readCachedAt } from "@mobile/lib/db/cache-freshness"
import { loadOfflineCrew } from "@mobile/lib/db/offline-float-plan"
import { loadTripListCache } from "@mobile/lib/db/trip-list-cache"
import { getSession } from "@mobile/lib/auth/session"
import { useQueuedChanges } from "@mobile/lib/network/queued-changes"
import { applyPendingFloatPlan } from "@mobile/lib/trips/pending-float-plan"
import { getLogistics, getTrip } from "@mobile/lib/trips/actions"

// The fields this screen actually renders off a crew member — both the live
// Trip DTO's `travellers` (TripMember[]) and the offline cache's
// OfflineCrewMember[] (lib/db/offline-float-plan.ts) satisfy this shape
// structurally, so the render logic below doesn't need to branch on source.
type CrewMemberView = {
  id?: string
  role: string
  user: { id?: string | null; name: string; surname?: string | null; username?: string | null }
  vesselMake?: string | null
  vesselModel?: string | null
  vesselLengthCm?: number | null
  vesselColorPrimary?: string | null
  vesselColorSecondary?: string | null
  emergencyContactName?: string | null
  emergencyContactPhone?: string | null
  emergencyContactRelationship?: string | null
}

// M9c WP6: live-first, offline-fallback, same shape as the trip list and
// itinerary map screens. Shore contact (Logistics) has no local cache at
// all — it's not part of any M9c sync channel — so offline mode can only
// ever show the crew manifest, never shore contact; the screen says so
// rather than showing a misleading "No shore contact set."
export default function FloatPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [state, setState] = useState<TripState | null>(null)
  const [crew, setCrew] = useState<CrewMemberView[] | null>(null)
  const [logistics, setLogistics] = useState<Logistics | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const { pending } = useQueuedChanges()

  useEffect(() => {
    void getSession()
      .then((session) => setCurrentUserId(session?.userId ?? null))
      .catch(() => undefined)
  }, [])

  const load = useCallback(async () => {
    try {
      const [trip, fetchedLogistics] = await Promise.all([getTrip(id), getLogistics(id).catch(() => null)])
      setState(trip.state ?? null)
      setCrew(trip.travellers ?? [])
      setLogistics(fetchedLogistics)
      setIsOffline(false)
      setCachedAt(null)
      setError(null)
    } catch (err) {
      const [offlineCrew, cachedTrips] = await Promise.all([loadOfflineCrew(id), loadTripListCache()])
      const cachedTrip = cachedTrips.find((trip) => trip.id === id)
      if (offlineCrew.length > 0 || cachedTrip) {
        setState(cachedTrip?.state ?? null)
        setCrew(offlineCrew)
        setLogistics(null)
        setIsOffline(true)
        setError(null)
        // The crew manifest comes from the trip's delta sync (trip_members),
        // not from the trip-list cache the state above falls back to — so the
        // age shown is the sync's, which is what the list on screen is.
        setCachedAt(await readCachedAt(CACHE_KEY.tripSync(id)))
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      }
    }
  }, [id])

  useEffect(() => {
    // Fetching on mount is exactly the "sync with an external system" case the rule's
    // own docs carve out — the setState calls just happen inside `load`'s async body
    // rather than the effect body itself, which the lint rule can't see through.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  if (error) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center gap-4 p-6">
        <RouterStack.Screen options={{ title: "Float plan" }} />
        <Text className="text-center text-muted-foreground">{error}</Text>
      </Screen>
    )
  }

  if (crew === null) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        <RouterStack.Screen options={{ title: "Float plan" }} />
        <ActivityIndicator />
      </Screen>
    )
  }

  const sortedCrew = [...applyPendingFloatPlan(id, crew, pending)].sort((a, b) => {
    if (a.role === "leader") return -1
    if (b.role === "leader") return 1
    return 0
  })

  return (
    <Screen edges={["bottom"]}>
      <RouterStack.Screen options={{ title: "Float plan" }} />
      <ScrollView contentContainerClassName="gap-4 p-4">
        {/* No detail for the banner: the shore contact card below already says it
            needs a connection, right where someone looking for it will look. */}
        <OfflineNotice visible={isOffline} cachedAt={cachedAt} onRetry={() => void load()} />
        <Card>
          <CardHeader>
            <CardTitle>Shore contact</CardTitle>
          </CardHeader>
          <CardContent>
            {isOffline ? (
              <Text className="text-sm text-muted-foreground">Shore contact needs a connection.</Text>
            ) : logistics?.shoreContactName ? (
              <Stack className="gap-1">
                <Row className="items-center gap-1.5">
                  <UserRound size={14} color={lightTokens.mutedForeground} />
                  <Text>{logistics.shoreContactName}</Text>
                </Row>
                {logistics.shoreContactPhone && (
                  <Row className="items-center gap-1.5">
                    <Phone size={13} color={lightTokens.mutedForeground} />
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
          {sortedCrew.map((member, index) => (
            <Card key={member.id ?? String(index)}>
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
                      <Sailboat size={13} color={lightTokens.mutedForeground} />
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
                      <HeartPulse size={13} color={lightTokens.mutedForeground} />
                      <Text className="text-sm text-muted-foreground">
                        {member.emergencyContactName}
                        {member.emergencyContactPhone ? ` · ${member.emergencyContactPhone}` : ""}
                        {member.emergencyContactRelationship
                          ? ` (${member.emergencyContactRelationship})`
                          : ""}
                      </Text>
                    </Row>
                  )}
                  {member.floatPlanUnsent && (
                    <Text className="text-xs text-sunset-600">Changed here, not sent yet.</Text>
                  )}
                  {/* M9d WP7: a paddler edits their own details, signal or not. */}
                  {currentUserId && member.user.id === currentUserId && (
                    <Link href={`/trips/${id}/my-details`} asChild>
                      <Button variant="link" size="sm" className="self-start px-0" testID="edit-my-details">
                        Edit my details
                      </Button>
                    </Link>
                  )}
                </Stack>
              </CardContent>
            </Card>
          ))}
        </Stack>

        {state && (
          <Text className="text-center text-sm text-muted-foreground">
            Trip status: {TRIP_STATE_LABELS[state]}
          </Text>
        )}
      </ScrollView>
    </Screen>
  )
}
