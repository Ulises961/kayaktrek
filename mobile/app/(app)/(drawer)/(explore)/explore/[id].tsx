import { Camera, GeoJSONSource, Layer, Map as MapLibreMap, Marker } from "@maplibre/maplibre-react-native"
import { Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo, useState } from "react"
import { ActivityIndicator, ScrollView, View } from "react-native"

import { DIFFICULTY_LABELS } from "@shared/dtos/difficulty"
import { POINT_TYPE } from "@shared/dtos/point"
import {
  DISTANCE_UNIT,
  formatDistance,
  legLabel,
  type DistanceUnit,
} from "@shared/itinerary/distance"
import { extractRouteData, type RouteData, type RouteDaySegment } from "@shared/itinerary/public-routes"
import { seasonOfDetail } from "@shared/itinerary/season"
import { formatDayDate } from "@shared/utils/date"
import { palette } from "@shared/tokens"

import { SeasonBadge } from "@mobile/components/explore/season-badge"
import { Badge } from "@mobile/components/ui/badge"
import { Card, CardContent } from "@mobile/components/ui/card"
import { SectionLabel } from "@mobile/components/ui/section-label"
import { Row, Screen, Stack } from "@mobile/components/ui/layout"
import { NeedsConnectionNotice } from "@mobile/components/ui/offline-notice"
import { Text } from "@mobile/components/ui/text"
import { isOfflineError } from "@mobile/lib/api/client"
import { fetchPublicItineraryDetail } from "@mobile/lib/explore/actions"
import { numberedDays } from "@mobile/lib/itinerary/numbered-days"
import { MAP_STYLE } from "@mobile/lib/map/tiles"
import { getMe } from "@mobile/lib/profile/actions"

// Distance alone when there is no planning speed to estimate time from — an older route
// may never have had `avgSpeedKnots` set, and legLabel divides by it.
function legText(nm: number, avgSpeedKnots: number | null | undefined, unit: DistanceUnit) {
  if (avgSpeedKnots != null) return legLabel(nm, avgSpeedKnots, unit)
  return `${formatDistance(nm, unit)} ${unit}`
}

// A published route is read-only by definition — no edit affordance, no mutation path.
// Reuses the itinerary screen's map setup (tile style, `androidView`) but none of its
// day/selection state, which only exists to support editing.
export default function PublicRouteScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [route, setRoute] = useState<RouteData | null>(null)
  const [season, setSeason] = useState<string | null>(null)
  const [unit, setUnit] = useState<DistanceUnit>(DISTANCE_UNIT.NM)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setError(null)
    try {
      const detail = await fetchPublicItineraryDetail(id)
      // Day 0 is the staging area for unassigned points, not an itinerary day — web's
      // public-routes.ts drops it from every published route for the same reason.
      const days = numberedDays(detail.days)
      // The shared extractor does the work web's own route page relies on: per-day
      // segments, per-day distance, day colours and the flattened position list. Mobile
      // deriving its own would be a second implementation of the same leg model.
      setRoute(extractRouteData({ ...detail, days }))
      // Derived from the days' dates by the same helper web's route page uses — the
      // published shape carries no season field of its own.
      setSeason(seasonOfDetail({ ...detail, days }))
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
    // The unit preference only changes how distances read, so a failure here must not
    // fail the screen — it falls back to the default rather than showing an error.
    void getMe()
      .then((me) => me.unitPreference && setUnit(me.unitPreference))
      .catch(() => {})
  }, [])

  // Memoised rather than a bare `??`: a fresh [] every render would invalidate the
  // GeoJSON memo below on every render, rebuilding the whole feature collection.
  const days = useMemo(() => route?.days ?? [], [route])

  // One LineString per day, each carrying its own colour — the same shape the itinerary
  // screen feeds MapLibre, so a day reads as a continuous leg rather than loose pins.
  const routeGeoJson = useMemo(
    () => ({
      type: "FeatureCollection" as const,
      features: days
        .filter((day) => day.points.length > 1)
        .map((day) => ({
          type: "Feature" as const,
          properties: { color: day.color },
          geometry: {
            type: "LineString" as const,
            coordinates: day.points.map((point) => [point.lon, point.lat] as [number, number]),
          },
        })),
    }),
    [days],
  )

  const hasLine = routeGeoJson.features.length > 0

  // One marker per point. An overnight stop ends one day and starts the next, so it
  // sits in both days' segments; drawn per day, it gave two Markers the same key and
  // id and crashed the screen. The first occurrence wins — the day that ends there,
  // which is also the day that owns the stop in storage — so it takes that day's colour.
  const markers = useMemo(() => {
    const seen = new Set<string>()
    return days.flatMap((day) =>
      day.points.flatMap((point, index) => {
        const markerId = point.id ?? `${day.dayNumber}-${index}`
        if (seen.has(markerId)) return []
        seen.add(markerId)
        return [{ markerId, point, color: day.color }]
      }),
    )
  }, [days])

  // [west, south, east, north] — the same tuple the itinerary screen's `boundsOf` builds.
  const bounds = useMemo<[number, number, number, number] | null>(() => {
    const positions = route?.positions ?? []
    if (positions.length === 0) return null
    const lats = positions.map(([lat]) => lat)
    const lngs = positions.map(([, lng]) => lng)
    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)]
  }, [route])

  const header = <RouterStack.Screen options={{ title: route?.name ?? "Route" }} />

  if (loading) {
    return (
      <Screen className="items-center justify-center" edges={["bottom"]}>
        {header}
        <ActivityIndicator />
      </Screen>
    )
  }

  if (error) {
    // Not cached by choice (a discovery surface, acted on while connected), so
    // offline is expected: the banner says so rather than a red network error.
    return (
      <Screen className="p-4" edges={["bottom"]}>
        {header}
        <NeedsConnectionNotice visible={isOfflineError(error)}>
          Explore needs a connection.
        </NeedsConnectionNotice>
        {!isOfflineError(error) && <Text className="text-sm text-destructive">{error}</Text>}
      </Screen>
    )
  }

  return (
    <Screen edges={["bottom"]}>
      {header}

      {/* Map on top, detail below — the phone-adapted cut of web's map-beside-panel
          split, the same way M9b3 adapted the builder. */}
      <View style={{ height: 260 }}>
        <MapLibreMap
          mapStyle={MAP_STYLE}
          style={{ flex: 1 }}
          // See the itinerary screen: the default "surface" renders through a separate
          // Android compositing layer and paints a black bar over sibling views.
          androidView="texture"
        >
          <Camera initialViewState={bounds ? { bounds } : { center: [0, 20], zoom: 1 }} />

          {hasLine && (
            <GeoJSONSource id="public-route" data={routeGeoJson} testID="route-line">
              <Layer
                id="public-route-line"
                type="line"
                paint={{ "line-color": ["get", "color"], "line-width": 3 }}
              />
            </GeoJSONSource>
          )}

          {markers.map(({ markerId, point, color }) => (
            <Marker key={markerId} id={markerId} lngLat={[point.lon, point.lat]}>
              <View
                style={{
                  width: point.type === POINT_TYPE.STOP ? 14 : 8,
                  height: point.type === POINT_TYPE.STOP ? 14 : 8,
                  borderRadius: point.type === POINT_TYPE.STOP ? 7 : 4,
                  backgroundColor: color,
                  borderWidth: 2,
                  borderColor: "white",
                }}
              />
            </Marker>
          ))}
        </MapLibreMap>
      </View>

      <ScrollView contentContainerClassName="gap-4 p-4">
        <Stack className="gap-2">
          <Row className="justify-between gap-2">
            <Text className="flex-1 text-lg font-semibold" numberOfLines={2}>
              {route?.name ?? "Untitled route"}
            </Text>
            <Row className="shrink-0 gap-1.5">
              {route?.difficulty && <Badge>{DIFFICULTY_LABELS[route.difficulty]}</Badge>}
              <SeasonBadge season={season} />
            </Row>
          </Row>

          <Row className="flex-wrap gap-x-4 gap-y-1">
            {route?.totalMiles != null && (
              <Text className="text-sm tabular-nums text-muted-foreground">
                {formatDistance(route.totalMiles, unit)} {unit}
              </Text>
            )}
            {days.length > 0 && (
              <Text className="text-sm tabular-nums text-muted-foreground">
                {days.length} {days.length === 1 ? "day" : "days"}
              </Text>
            )}
          </Row>

          {route?.description && (
            // Unclamped, unlike the listing card: this is the screen someone opened in
            // order to read it.
            <Text className="text-sm leading-relaxed" testID="route-pitch">
              {route.description}
            </Text>
          )}
        </Stack>

        {days.length === 0 ? (
          <Text className="text-sm text-muted-foreground">
            No route detail was published with this route.
          </Text>
        ) : (
          <Stack className="gap-2">
            <SectionLabel>Daily breakdown</SectionLabel>
            {days.map((day) => (
              <DayCard
                key={day.dayNumber}
                day={day}
                avgSpeedKnots={route?.avgSpeedKnots}
                unit={unit}
              />
            ))}
          </Stack>
        )}
      </ScrollView>
    </Screen>
  )
}

function DayCard({
  day,
  avgSpeedKnots,
  unit,
}: {
  day: RouteDaySegment
  avgSpeedKnots: number | null | undefined
  unit: DistanceUnit
}) {
  // Stops are the places a reader recognises; positions are pass-through geometry that
  // shapes the line without naming anywhere, so the list names stops and counts the rest
  // rather than printing a row of unnamed waypoints.
  const stops = day.points.filter((point) => point.type === POINT_TYPE.STOP)
  const viaCount = day.points.length - stops.length

  return (
    <Card>
      <CardContent className="gap-2">
        <Row className="items-baseline justify-between gap-3">
          <Row className="items-center gap-2">
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: day.color,
              }}
            />
            <Text className="text-sm font-medium">Day {day.dayNumber}</Text>
          </Row>
          {day.date && (
            <Text className="flex-1 text-[11px] text-muted-foreground">
              {formatDayDate(day.date)}
            </Text>
          )}
          <Text
            className="text-[11px] tabular-nums text-muted-foreground"
            testID={`day-distance-${day.dayNumber}`}
          >
            {legText(day.distanceNm, avgSpeedKnots, unit)}
          </Text>
        </Row>

        <Stack className="gap-1">
          {stops.map((stop, index) => (
            <Row key={stop.id ?? index} className="items-center gap-2">
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: palette.ocean500,
                }}
              />
              <Text className="flex-1 text-sm" numberOfLines={1}>
                {stop.name ?? `Stop ${index + 1}`}
              </Text>
            </Row>
          ))}
          {viaCount > 0 && (
            <Text className="pl-4 text-[11px] text-muted-foreground">
              via {viaCount} {viaCount === 1 ? "waypoint" : "waypoints"}
            </Text>
          )}
        </Stack>
      </CardContent>
    </Card>
  )
}
