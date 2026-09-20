import { Camera, Map as MapLibreMap, Marker } from "@maplibre/maplibre-react-native"
import { Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ActivityIndicator, View } from "react-native"

import { DIFFICULTY_LABELS } from "@shared/dtos/difficulty"
import type { PublicItineraryDetail, PublicPoint } from "@shared/dtos/itinerary"
import { getDayColor } from "@shared/itinerary/colors"
import { DISTANCE_UNIT, formatDistance, type DistanceUnit } from "@shared/itinerary/distance"

import { Badge } from "@mobile/components/ui/badge"
import { Card, CardContent } from "@mobile/components/ui/card"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { Text } from "@mobile/components/ui/text"
import { fetchPublicItineraryDetail } from "@mobile/lib/explore/actions"
import { MAP_STYLE } from "@mobile/lib/map/tiles"
import { getMe } from "@mobile/lib/profile/actions"

type LocatedPoint = PublicPoint & { latitude: number; longitude: number; dayNumber: number }

// A published route is read-only by definition — there is no edit affordance here and no
// mutation path. Reuses the itinerary screen's map setup (tile style, `androidView`) but
// none of its day/selection state, which only exists to support editing.
export default function PublicRouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [route, setRoute] = useState<PublicItineraryDetail | null>(null)
  const [unit, setUnit] = useState<DistanceUnit>(DISTANCE_UNIT.NM)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setError(null)
    try {
      setRoute(await fetchPublicItineraryDetail(id))
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  useEffect(() => {
    void getMe()
      .then((me) => me.unitPreference && setUnit(me.unitPreference))
      .catch(() => {})
  }, [])

  // A published route can carry points that were never placed on the map, so the
  // coordinates are filtered before anything derives a bounding box from them.
  const points = useMemo<LocatedPoint[]>(() => {
    return (route?.days ?? []).flatMap((day) =>
      day.points
        .filter(
          (point): point is PublicPoint & { latitude: number; longitude: number } =>
            point.latitude != null && point.longitude != null,
        )
        .map((point) => ({ ...point, dayNumber: day.dayNumber })),
    )
  }, [route])

  // [west, south, east, north] — the same tuple the itinerary screen's `boundsOf` builds.
  const bounds = useMemo<[number, number, number, number] | null>(() => {
    if (points.length === 0) return null
    const lats = points.map((point) => point.latitude)
    const lngs = points.map((point) => point.longitude)
    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
  }, [points])

  const header = (
    <RouterStack.Screen options={{ title: route?.name ?? "Route" }} />
  )

  if (loading) {
    return (
      <Screen className="items-center justify-center" edges={["bottom"]}>
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  if (error) {
    return (
      <Screen className="p-4" edges={["bottom"]}>
        {header}
        <Text className="text-sm text-destructive">{error}</Text>
      </Screen>
    )
  }

  return (
    <Screen edges={["bottom"]}>
      {header}

      <View style={{ flex: 1 }}>
        <MapLibreMap
          mapStyle={MAP_STYLE}
          style={{ flex: 1 }}
          // See the itinerary screen: the default "surface" renders through a separate
          // Android compositing layer and paints a black bar over sibling views.
          androidView="texture"
        >
          <Camera
            initialViewState={bounds ? { bounds } : { center: [0, 20], zoom: 1 }}
          />

          {points.map((point, index) => (
            <Marker
              key={point.id ?? index}
              id={point.id ?? String(index)}
              lngLat={[point.longitude, point.latitude]}
            >
              <View
                style={{
                  width: point.type === "stop" ? 14 : 8,
                  height: point.type === "stop" ? 14 : 8,
                  borderRadius: point.type === "stop" ? 7 : 4,
                  backgroundColor: getDayColor(point.dayNumber),
                  borderWidth: 2,
                  borderColor: "white",
                }}
              />
            </Marker>
          ))}
        </MapLibreMap>
      </View>

      <Card className="m-3">
        <CardContent>
          <Row className="justify-between gap-2">
            <Text className="flex-1 text-base font-semibold" numberOfLines={2}>
              {route?.name ?? "Untitled route"}
            </Text>
            {route?.difficulty && <Badge>{DIFFICULTY_LABELS[route.difficulty]}</Badge>}
          </Row>

          {route?.description && (
            <Text className="text-sm text-muted-foreground">{route.description}</Text>
          )}

          <Stack className="gap-1">
            {route?.totalMiles != null && (
              <Text className="text-[11px] tabular-nums text-muted-foreground">
                {formatDistance(route.totalMiles, unit)} {unit}
              </Text>
            )}
            {route?.days && route.days.length > 0 && (
              <Text className="text-[11px] tabular-nums text-muted-foreground">
                {route.days.length} {route.days.length === 1 ? "day" : "days"}
              </Text>
            )}
          </Stack>
        </CardContent>
      </Card>
    </Screen>
  )
}
