import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  Marker,
} from "@maplibre/maplibre-react-native";
import { Stack as RouterStack, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, View } from "react-native";

import type { Day } from "@shared/dtos/day";
import { getDayColor } from "@shared/itinerary/colors";

import { DayRail } from "@mobile/components/trips/day-rail";
import { ItinerarySheet } from "@mobile/components/trips/itinerary-sheet";
import { ZoomControl } from "@mobile/components/trips/zoom-control";
import { Screen } from "@mobile/components/ui/layout";
import { Text } from "@mobile/components/ui/text";
import { loadOfflineTrip } from "@mobile/lib/db/offline-itinerary";
import { pullRoute } from "@mobile/lib/db/route-sync";
import {
  buildDayColoredRoute,
  type LocatedRoutePoint,
} from "@mobile/lib/itinerary/day-route";
import { OSM_TILE_URL } from "@mobile/lib/map/tiles";
import { getTrip } from "@mobile/lib/trips/actions";

// M9c WP6: the same live-first, cache-fallback shape as the trip list screen.
// This screen only needs `destination` and `itinerary.days` from the full
// `Trip` DTO — a lighter local type than importing `Trip` avoids fabricating
// every other field (medical, logistics, ...) for the offline-reconstructed
// case, which has no equivalent to supply them.
type ScreenTrip = { destination: string | null; days: Day[] };

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
};

function boundsOf(
  points: LocatedRoutePoint[],
): [number, number, number, number] | null {
  if (points.length === 0) return null;
  let west = points[0].longitude;
  let east = points[0].longitude;
  let south = points[0].latitude;
  let north = points[0].latitude;
  for (const p of points) {
    west = Math.min(west, p.longitude);
    east = Math.max(east, p.longitude);
    south = Math.min(south, p.latitude);
    north = Math.max(north, p.latitude);
  }
  // A single point (or a day with no spread) gives MapLibre a zero-area box, which
  // it can't fit a camera to — pad it out to a small neighborhood.
  if (west === east && south === north) {
    const pad = 0.01;
    return [west - pad, south - pad, east + pad, north + pad];
  }
  return [west, south, east, north];
}

export default function TripMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<ScreenTrip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [zoom, setZoom] = useState(10);
  const cameraRef = useRef<CameraRef>(null);

  // Named and stable so a refresh action (the WP5 weather/sea "refresh"
  // button, threaded in as ItinerarySheet's onRefresh) can re-run the same
  // live-fetch-then-fallback logic after POSTing a refresh, without
  // duplicating it.
  const reload = useCallback(async () => {
    try {
      const t = await getTrip(id);
      const days = t.itinerary?.days ?? [];
      setTrip({ destination: t.destination ?? null, days });
      setIsOffline(false);
      setError(null);
      setSelectedDayId((current) => current ?? days[0]?.id ?? null);
      // Refresh the route cache in the background so the next offline fallback
      // has this trip's latest route — best-effort, a failure here shouldn't
      // surface as a screen error since the live fetch above already succeeded.
      void pullRoute(id).catch(() => undefined);
    } catch (err) {
      const offline = await loadOfflineTrip(id);
      if (offline.days.length > 0 || offline.destination !== null) {
        setTrip(offline);
        setIsOffline(true);
        setError(null);
        setSelectedDayId((current) => current ?? offline.days[0]?.id ?? null);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
        );
      }
    }
  }, [id]);

  useEffect(() => {
    // Fetching on mount is exactly the "sync with an external system" case the rule's
    // own docs carve out — the setState calls just happen inside `reload`'s async body
    // rather than the effect body itself, which the lint rule can't see through.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  const days: Day[] = useMemo(() => trip?.days ?? [], [trip]);
  const selectedDay = days.find((d) => d.id === selectedDayId) ?? null;

  // Select-or-toggle now lives here rather than inside ItinerarySheet — DayRail
  // (a separate top bar, M9l WP2 revised) and ItinerarySheet (purely the weather/sea
  // panel now) don't know about each other, only about this screen's state.
  function handleDayPress(dayId: string) {
    if (dayId === selectedDayId) {
      setSheetExpanded((v) => !v);
      return;
    }
    setSelectedDayId(dayId);
    setSheetExpanded(true);
  }

  // M9l WP1: the whole trip's route, colored per day, always on screen — selecting
  // a day (ItinerarySheet) no longer changes what's drawn on the map, only what the
  // sheet shows below it. Mirrors web's map-core.tsx (buildSegments/getDayColor),
  // adapted for MapLibre's data-driven `line-color` (one Feature per leg, a
  // precomputed `color` property) instead of Leaflet's per-segment `<Polyline>` list.
  const { points: routePoints, legs: routeLegs } = useMemo(
    () => buildDayColoredRoute(days),
    [days],
  );

  const routeGeoJson = useMemo(
    () => ({ type: "FeatureCollection" as const, features: routeLegs }),
    [routeLegs],
  );

  const bounds = useMemo(() => boundsOf(routePoints), [routePoints]);

  if (error) {
    return (
      <Screen
        edges={["bottom"]}
        className="items-center justify-center gap-4 p-6"
      >
        <RouterStack.Screen options={{ title: "Trip" }} />
        <Text className="text-center text-muted-foreground">{error}</Text>
      </Screen>
    );
  }

  if (!trip) {
    return (
      <Screen edges={["bottom"]} className="items-center justify-center">
        <RouterStack.Screen options={{ title: "Trip" }} />
        <ActivityIndicator />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <RouterStack.Screen options={{ title: trip.destination ?? "Trip" }} />

      {/* M9l WP2 (revised): DayRail is a separate bar above the map, matching web's
          actual layout — not part of ItinerarySheet's handle (M9b3's original design,
          made before this plan's side-by-side reading of what web does). The map fills
          the remaining space; ItinerarySheet (`@gorhom/bottom-sheet`) docks weather/sea
          over it, revealed by dragging or by re-tapping the selected day in the rail —
          see plans/M9b3.md's library-choice table for why gorhom over the reverted
          `@expo/ui` modal prototype. */}
      <View style={{ flex: 1 }}>
        {isOffline && (
          <View className="bg-muted px-4 py-1.5">
            <Text className="text-center text-[11px] text-muted-foreground">
              Offline — showing your last synced route
            </Text>
          </View>
        )}

        <DayRail
          days={days}
          selectedDayId={selectedDayId}
          onDayPress={handleDayPress}
        />

        <View style={{ flex: 1 }}>
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
              initialViewState={
                bounds ? { bounds } : { center: [0, 20], zoom: 1 }
              }
            />

            {routeLegs.length > 0 && (
              <GeoJSONSource id="route" data={routeGeoJson}>
                {/* One Feature per leg, each carrying a precomputed `color` property
                  (getDayColor resolved ahead of time in day-route.ts) — simpler than
                  handing MapLibre a `["match", ["get", "dayNum"], ...]` expression,
                  since DAY_COLORS is a small fixed array. */}
                <Layer
                  id="route-line"
                  type="line"
                  paint={{ "line-color": ["get", "color"], "line-width": 3 }}
                />
              </GeoJSONSource>
            )}

            {routePoints.map((point, index) => (
              <Marker
                key={point.id ?? index}
                id={point.id ?? String(index)}
                lngLat={[point.longitude, point.latitude]}
              >
                {/* Colored by owning day (getDayColor), not by point type, per M9l WP1 —
                  the stop-vs-position distinction moves to size/shape instead: stops
                  are a larger ring, positions a smaller dot. Split-ring boundary
                  markers (web's two-tone stop at a shared overnight point) are a
                  flagged follow-up, not this WP's acceptance bar. */}
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

          <ZoomControl cameraRef={cameraRef} zoom={zoom} />

          <ItinerarySheet
            selectedDay={selectedDay}
            expanded={sheetExpanded}
            onExpandedChange={setSheetExpanded}
            onRefreshWeather={reload}
          />
        </View>
      </View>
    </Screen>
  );
}
