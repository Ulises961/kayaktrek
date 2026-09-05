import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
} from "@maplibre/maplibre-react-native"
import { Link, Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, ScrollView, TouchableOpacity, View } from "react-native"

import type { Day } from "../../../../../frontend/lib/dtos/day"
import type { Point } from "../../../../../frontend/lib/dtos/point"
import { palette } from "../../../../../frontend/lib/tokens"
import { walkPoints } from "../../../../../frontend/lib/itinerary/linked-list"

import { WeatherSeaPanel } from "../../../../components/trips/weather-sea-panel"
import { ZoomControl } from "../../../../components/trips/zoom-control"
import { Row, Screen, Stack } from "../../../../components/ui/layout"
import { Text } from "../../../../components/ui/text"
import { OSM_TILE_URL } from "../../../../lib/map/tiles"
import { getTrip } from "../../../../lib/trips/actions"

import type { Trip } from "../../../../../frontend/lib/dtos/trip"

// A minimal inline style — one raster source pointing at the M8 tile proxy, one layer
// to render it — rather than a hosted style.json (plans/M9b.md WP3: "no new backend
// work needed", and we don't have a style-hosting concern to solve here either).
const MAP_STYLE = {
  version: 8 as const,
  sources: {
    osm: {
      type: "raster" as const,
      tiles: [OSM_TILE_URL],
      tileSize: 256,
    },
  },
  layers: [{ id: "osm", type: "raster" as const, source: "osm" }],
}

type LocatedPoint = Point & { latitude: number; longitude: number }

function isLocated(point: Point): point is LocatedPoint {
  return typeof point.latitude === "number" && typeof point.longitude === "number"
}

function boundsOf(points: LocatedPoint[]): [number, number, number, number] | null {
  if (points.length === 0) return null
  let west = points[0].longitude
  let east = points[0].longitude
  let south = points[0].latitude
  let north = points[0].latitude
  for (const p of points) {
    west = Math.min(west, p.longitude)
    east = Math.max(east, p.longitude)
    south = Math.min(south, p.latitude)
    north = Math.max(north, p.latitude)
  }
  // A single point (or a day with no spread) gives MapLibre a zero-area box, which
  // it can't fit a camera to — pad it out to a small neighborhood.
  if (west === east && south === north) {
    const pad = 0.01
    return [west - pad, south - pad, east + pad, north + pad]
  }
  return [west, south, east, north]
}

export default function TripMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const [trip, setTrip] = useState<Trip | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(10)
  const cameraRef = useRef<CameraRef>(null)

  useEffect(() => {
    let cancelled = false
    getTrip(id)
      .then((t) => {
        if (cancelled) return
        setTrip(t)
        setSelectedDayId(t.itinerary?.days?.[0]?.id ?? null)
      })
      .catch((err: unknown) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      })
    return () => {
      cancelled = true
    }
  }, [id])

  const days: Day[] = trip?.itinerary?.days ?? []
  const selectedDay = days.find((d) => d.id === selectedDayId) ?? null

  const locatedPoints = useMemo(() => {
    const ordered = walkPoints(selectedDay?.points ?? [])
    return ordered.filter(isLocated)
  }, [selectedDay])

  const routeGeoJson = useMemo(
    () => ({
      type: "Feature" as const,
      properties: {},
      geometry: {
        type: "LineString" as const,
        coordinates: locatedPoints.map((p) => [p.longitude, p.latitude]),
      },
    }),
    [locatedPoints],
  )

  const bounds = useMemo(() => boundsOf(locatedPoints), [locatedPoints])

  if (error) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center gap-4 p-6">
        <RouterStack.Screen options={{ title: "Trip" }} />
        <Text className="text-center text-muted-foreground">{error}</Text>
      </Screen>
    )
  }

  if (!trip) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        <RouterStack.Screen options={{ title: "Trip" }} />
        <ActivityIndicator />
      </Screen>
    )
  }

  return (
    <Screen edges={["bottom"]}>
      <RouterStack.Screen options={{ title: trip.destination ?? "Trip" }} />
      <Row className="items-center justify-between px-4 py-3">
        {days.length > 0 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="flex-1">
            <Stack className="flex-row gap-2">
              {days.map((day) => {
                const active = day.id === selectedDayId
                return (
                  <TouchableOpacity
                    key={day.id}
                    onPress={() => setSelectedDayId(day.id ?? null)}
                    className={active ? "rounded-full bg-primary px-4 py-2" : "rounded-full border border-border px-4 py-2"}
                  >
                    <Text className={active ? "text-primary-foreground" : "text-foreground"}>
                      Day {day.dayNumber}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </Stack>
          </ScrollView>
        ) : (
          <View className="flex-1" />
        )}

        <Link href={{ pathname: "/trips/[id]/float-plan", params: { id } }} asChild>
          <TouchableOpacity className="rounded-full border border-border px-4 py-2">
            <Text className="text-sm">Float plan</Text>
          </TouchableOpacity>
        </Link>
      </Row>

      <WeatherSeaPanel day={selectedDay} />

      <View style={{ flex: 1 }}>
        <MapLibreMap
          mapStyle={MAP_STYLE}
          style={{ flex: 1 }}
          onRegionDidChange={(event) => setZoom(event.nativeEvent.zoom)}
        >
          {/* Always mounted — even with no located points, so cameraRef is available for
              the zoom control. Conditionally rendering this on `bounds` left cameraRef
              null and the zoom buttons a silent no-op for any day with no points yet. */}
          <Camera
            ref={cameraRef}
            initialViewState={bounds ? { bounds } : { center: [0, 20], zoom: 1 }}
          />

          {locatedPoints.length > 1 && (
            <GeoJSONSource id="route" data={routeGeoJson}>
              <Layer
                id="route-line"
                type="line"
                paint={{ "line-color": palette.ocean600, "line-width": 3 }}
              />
            </GeoJSONSource>
          )}

          {locatedPoints.map((point, index) => (
            <Marker key={point.id ?? index} id={point.id ?? String(index)} lngLat={[point.longitude, point.latitude]}>
              <View
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 6,
                  backgroundColor: point.type === "stop" ? palette.ocean700 : palette.ocean400,
                  borderWidth: 2,
                  borderColor: "white",
                }}
              />
            </Marker>
          ))}
        </MapLibreMap>

        <ZoomControl cameraRef={cameraRef} zoom={zoom} />
      </View>
    </Screen>
  )
}
