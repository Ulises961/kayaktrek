import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
} from "@maplibre/maplibre-react-native"
import { Stack as RouterStack, useLocalSearchParams } from "expo-router"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { ActivityIndicator, View } from "react-native"

import type { Day } from "@shared/dtos/day"
import type { Point } from "@shared/dtos/point"
import { palette } from "@shared/tokens"
import { walkPoints } from "@shared/itinerary/linked-list"

import { ItinerarySheet } from "@mobile/components/trips/itinerary-sheet"
import { ZoomControl } from "@mobile/components/trips/zoom-control"
import { Screen } from "@mobile/components/ui/layout"
import { Text } from "@mobile/components/ui/text"
import { loadOfflineTrip } from "@mobile/lib/db/offline-itinerary"
import { pullRoute } from "@mobile/lib/db/route-sync"
import { OSM_TILE_URL } from "@mobile/lib/map/tiles"
import { getTrip } from "@mobile/lib/trips/actions"

// M9c WP6: the same live-first, cache-fallback shape as the trip list screen.
// This screen only needs `destination` and `itinerary.days` from the full
// `Trip` DTO — a lighter local type than importing `Trip` avoids fabricating
// every other field (medical, logistics, ...) for the offline-reconstructed
// case, which has no equivalent to supply them.
type ScreenTrip = { destination: string | null; days: Day[] }

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
  const [trip, setTrip] = useState<ScreenTrip | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [zoom, setZoom] = useState(10)
  const cameraRef = useRef<CameraRef>(null)

  // Named and stable so a refresh action (the WP5 weather/sea "refresh"
  // button, threaded in as ItinerarySheet's onRefresh) can re-run the same
  // live-fetch-then-fallback logic after POSTing a refresh, without
  // duplicating it.
  const reload = useCallback(async () => {
    try {
      const t = await getTrip(id)
      const days = t.itinerary?.days ?? []
      setTrip({ destination: t.destination ?? null, days })
      setIsOffline(false)
      setError(null)
      setSelectedDayId((current) => current ?? days[0]?.id ?? null)
      // Refresh the route cache in the background so the next offline fallback
      // has this trip's latest route — best-effort, a failure here shouldn't
      // surface as a screen error since the live fetch above already succeeded.
      void pullRoute(id).catch(() => undefined)
    } catch (err) {
      const offline = await loadOfflineTrip(id)
      if (offline.days.length > 0 || offline.destination !== null) {
        setTrip(offline)
        setIsOffline(true)
        setError(null)
        setSelectedDayId((current) => current ?? offline.days[0]?.id ?? null)
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      }
    }
  }, [id])

  useEffect(() => {
    // Fetching on mount is exactly the "sync with an external system" case the rule's
    // own docs carve out — the setState calls just happen inside `reload`'s async body
    // rather than the effect body itself, which the lint rule can't see through.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload()
  }, [reload])

  const days: Day[] = trip?.days ?? []
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

      {/* M9b3 WP2: full-bleed map — the day strip and weather/sea detail no longer sit
          in a fixed row above it. `ItinerarySheet` (`@gorhom/bottom-sheet`) docks the day
          strip as its always-visible handle and reveals weather/sea below it by dragging
          or tapping — see plans/M9b3.md's library-choice table for why gorhom over the
          reverted `@expo/ui` modal prototype. */}
      <View style={{ flex: 1 }}>
        {isOffline && (
          <View className="absolute left-0 right-0 top-0 z-10 bg-muted px-4 py-1.5">
            <Text className="text-center text-[11px] text-muted-foreground">
              Offline — showing your last synced route
            </Text>
          </View>
        )}
        <MapLibreMap
          mapStyle={MAP_STYLE}
          style={{ flex: 1 }}
          onRegionDidChange={(event) => setZoom(event.nativeEvent.zoom)}
          // Default "surface" renders via Android's GLSurfaceView, a separate hardware
          // compositing layer outside RN's normal view z-order — this is what caused the
          // day-strip/weather-panel area above the map to render as a solid black bar
          // (M9b2 bug report, 2026-09-06). "texture" uses a regular TextureView, which
          // composites normally within the RN view hierarchy at a real perf cost that's
          // fine for this static, non-gesture-heavy map.
          androidView="texture"
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

        <ItinerarySheet
          days={days}
          selectedDayId={selectedDayId}
          onSelectDay={setSelectedDayId}
          selectedDay={selectedDay}
          onRefreshWeather={reload}
        />
      </View>
    </Screen>
  )
}
