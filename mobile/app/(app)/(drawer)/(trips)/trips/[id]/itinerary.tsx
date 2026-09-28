import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  LocationManager,
  Map as MapLibreMap,
  type PressEvent,
  ViewAnnotation,
  type ViewAnnotationEvent,
} from "@maplibre/maplibre-react-native";
import {
  Stack as RouterStack,
  useFocusEffect,
  useLocalSearchParams,
  useRouter,
} from "expo-router";
import { MapPinPlus, TriangleAlert } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  type NativeSyntheticEvent,
  Pressable,
  View,
} from "react-native";

import type { Day } from "@shared/dtos/day";
import { getDayColor } from "@shared/itinerary/colors";
import { lightTokens, palette } from "@shared/tokens";

import { DayRail } from "@mobile/components/trips/day-rail";
import { ItinerarySheet } from "@mobile/components/trips/itinerary-sheet";
import { ZoomControl } from "@mobile/components/trips/zoom-control";
import { Button } from "@mobile/components/ui/button";
import { Screen } from "@mobile/components/ui/layout";
import { OfflineNotice } from "@mobile/components/ui/offline-notice";
import { Text } from "@mobile/components/ui/text";
import { CACHE_KEY, readCachedAt } from "@mobile/lib/db/cache-freshness";
import { loadOfflineTrip } from "@mobile/lib/db/offline-itinerary";
import { editRoute, loadRouteSyncState } from "@mobile/lib/db/route-edit";
import { pullRoute } from "@mobile/lib/db/route-sync";
import { isTripLeader } from "@mobile/lib/db/trip-role";
import { buildDayColoredRoute } from "@mobile/lib/itinerary/day-route";
import { numberedDays } from "@mobile/lib/itinerary/numbered-days";
import { movePointByDrag } from "@mobile/lib/itinerary/route-edits";
import { boundsOf } from "@mobile/lib/map/bounds";
import { MAP_STYLE } from "@mobile/lib/map/tiles";
import { getTrip } from "@mobile/lib/trips/actions";

// M9c WP6: the same live-first, cache-fallback shape as the trip list screen.
// This screen only needs `destination` and `itinerary.days` from the full
// `Trip` DTO — a lighter local type than importing `Trip` avoids fabricating
// every other field (medical, logistics, ...) for the offline-reconstructed
// case, which has no equivalent to supply them.
type ScreenTrip = {
  destination: string | null;
  days: Day[];
  avgSpeedKnots: number;
};

// Same fallback web's builder uses (map-builder.tsx) when the itinerary has never
// had a speed set — kept as one named constant rather than repeating the literal.
const DEFAULT_AVG_SPEED_KNOTS = 2.5;

export default function TripMapScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [trip, setTrip] = useState<ScreenTrip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const [zoom, setZoom] = useState(10);
  const [isLeader, setIsLeader] = useState(false);
  const [inConflict, setInConflict] = useState(false);
  const cameraRef = useRef<CameraRef>(null);
  const router = useRouter();

  // Named and stable so a refresh action (the WP5 weather/sea "refresh"
  // button, threaded in as ItinerarySheet's onRefresh) can re-run the same
  // live-fetch-then-fallback logic after POSTing a refresh, without
  // duplicating it.
  const reload = useCallback(async () => {
    try {
      const t = await getTrip(id);
      // Filtered at ingestion, not at render: Day 0 sorts first, so leaving it in the
      // array also made it the default selection below.
      // M9d: a route the leader edited on this phone and hasn't pushed yet — or a
      // parked conflict — is shown from the phone, not the server: the server's
      // copy doesn't have the edits, and hiding them would look like they'd vanished.
      const sync = await loadRouteSyncState(id);
      setInConflict(!!sync?.inConflict);
      const days = numberedDays(
        sync?.hasLocalChanges || sync?.inConflict
          ? (await loadOfflineTrip(id)).days
          : (t.itinerary?.days ?? []),
      );
      setTrip({
        destination: t.destination ?? null,
        days,
        avgSpeedKnots: t.itinerary?.avgSpeedKnots ?? DEFAULT_AVG_SPEED_KNOTS,
      });
      setIsOffline(false);
      setCachedAt(null);
      setError(null);
      setSelectedDayId((current) => current ?? days[0]?.id ?? null);
      // Refresh the route cache in the background so the next offline fallback
      // has this trip's latest route — best-effort, a failure here shouldn't
      // surface as a screen error since the live fetch above already succeeded.
      void pullRoute(id).catch(() => undefined);
    } catch (err) {
      const offline = await loadOfflineTrip(id);
      setInConflict(!!(await loadRouteSyncState(id))?.inConflict);
      if (offline.days.length > 0 || offline.destination !== null) {
        const offlineDays = numberedDays(offline.days);
        // The cache has no speed setting of its own — same default as a live
        // itinerary that's never had one set.
        setTrip({
          ...offline,
          days: offlineDays,
          avgSpeedKnots: DEFAULT_AVG_SPEED_KNOTS,
        });
        setIsOffline(true);
        setError(null);
        setCachedAt(await readCachedAt(CACHE_KEY.tripRoute(id)));
        // offlineDays, not offline.days — the cache stores Day 0 deliberately
        // (it is the staging area for points no boundary owns), so the
        // selection must be seeded from the filtered list or the screen opens
        // on the staging day.
        setSelectedDayId((current) => current ?? offlineDays[0]?.id ?? null);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : "Something went wrong. Please try again.",
        );
      }
    }
  }, [id]);

  // On focus rather than on mount (M9d): coming back from editing or adding a
  // point has to show the edit.
  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  useEffect(() => {
    let cancelled = false;
    void isTripLeader(id).then((leader) => {
      if (!cancelled) setIsLeader(leader);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  // M9d WP3: leader-only route editing, on the phone, signal or not.
  function handleEditPoint(pointId: string) {
    router.push(`/trips/${id}/point/${pointId}`);
  }

  function openNewPoint(latitude: number, longitude: number) {
    router.push({
      pathname: "/trips/[id]/point/new",
      params: {
        id,
        dayId: selectedDayId ?? "",
        latitude: String(latitude),
        longitude: String(longitude),
      },
    });
  }

  function handleMapLongPress(event: NativeSyntheticEvent<PressEvent>) {
    const [longitude, latitude] = event.nativeEvent.lngLat;
    openNewPoint(latitude, longitude);
  }

  // "Add stop here": the emergency stop, at the phone's own position. MapLibre's
  // location manager needs no module of its own, and foreground permission is
  // enough — this is one reading, not tracking.
  async function handleAddStopHere() {
    const granted = await LocationManager.requestPermissions();
    if (!granted) {
      Alert.alert(
        "Location is off",
        "Allow location access to add a stop where you are, or long-press the map instead.",
      );
      return;
    }
    const position = await LocationManager.getCurrentPosition();
    if (!position) {
      Alert.alert(
        "No position yet",
        "The phone hasn't found where it is. Try again in a moment, or long-press the map.",
      );
      return;
    }
    openNewPoint(position.coords.latitude, position.coords.longitude);
  }

  const days: Day[] = useMemo(() => trip?.days ?? [], [trip]);
  const selectedDay = days.find((d) => d.id === selectedDayId) ?? null;

  // Select-or-toggle now lives here rather than inside ItinerarySheet — DayRail
  // (a separate top bar, M9l WP2 revised) and ItinerarySheet (purely the weather/sea
  // panel now) don't know about each other, only about this screen's state.
  function handleDayPress(dayId: string) {
    setSelectedPointId(null);
    if (dayId === selectedDayId) {
      setSheetExpanded((v) => !v);
      return;
    }
    setSelectedDayId(dayId);
    setSheetExpanded(true);
  }

  // M9l WP3: tapping a point selects it and expands the sheet to show its summary;
  // tapping empty map space or re-tapping the day strip (handleDayPress, above)
  // returns the sheet to the weather body.
  //
  // A point tap fires BOTH Marker's own onPress and the underlying MapLibreMap's
  // onPress for the same gesture — two independent native tap recognizers, not
  // event bubbling (confirmed on-device: without this guard, handleMapPress ran
  // right after handlePointPress and cleared the selection back to null before
  // the sheet ever rendered it, so the sheet expanded but showed weather instead
  // of the point). This ref, set synchronously in handlePointPress and consumed
  // by the very next handleMapPress call, absorbs exactly that one paired call
  // without guessing at a timing window.
  const suppressNextMapPress = useRef(false);

  function handlePointPress(pointId: string) {
    suppressNextMapPress.current = true;
    setSelectedPointId(pointId);
    setSheetExpanded(true);
  }

  function handleMapPress() {
    if (suppressNextMapPress.current) {
      suppressNextMapPress.current = false;
      return;
    }
    setSelectedPointId(null);
  }

  // M34 WP1/WP3 (merged): dragging a marker repositions the point and reorders
  // it within its own day to match its new geographic neighbours, through the
  // same editRoute path the point-edit form already uses (lib/db/route-edit.ts)
  // — no new persistence code, only a new gesture entry into it. Moving a point
  // to a *different* day is out of scope for this drag (left for the future
  // day-boundaries work) — the day-picker on the point-edit form is still the
  // only way to do that. A drag also fires the map's own onPress underneath it
  // (the same double-recognizer behaviour handlePointPress works around above),
  // so it reuses that guard too.
  async function handlePointDragEnd(pointId: string, event: { nativeEvent: ViewAnnotationEvent }) {
    suppressNextMapPress.current = true;
    const [longitude, latitude] = event.nativeEvent.lngLat;
    try {
      await editRoute(id, (route) => movePointByDrag(route, pointId, latitude, longitude));
    } catch (err) {
      Alert.alert(
        "Couldn't move point",
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      await reload();
    }
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
        <OfflineNotice visible={isOffline} cachedAt={cachedAt} />

        {/* M9d WP4: a push refused because the route changed elsewhere is parked,
            never merged. The phone keeps showing its own route until the leader
            compares the two (spec §8.3). */}
        {inConflict && (
          <Pressable
            onPress={() => router.push(`/trips/${id}/route-conflict`)}
            accessibilityRole="button"
            testID="route-conflict-banner"
            className="flex-row items-center gap-2 bg-sunset-100 px-4 py-3"
          >
            <TriangleAlert size={16} color={palette.sunset600} />
            <Text className="flex-1 text-xs text-sunset-600">
              Route not synced: it changed elsewhere while you edited it.
            </Text>
            <Text className="text-xs font-medium text-sunset-600 underline">
              Review
            </Text>
          </Pressable>
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
            onPress={handleMapPress}
            onLongPress={isLeader ? handleMapLongPress : undefined}
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
              <ViewAnnotation
                key={point.id ?? index}
                id={point.id ?? String(index)}
                lngLat={[point.longitude, point.latitude]}
                // M34 WP1: leader-only, same gating as long-press-to-add and "Add stop
                // here" — a crew member reads the route, only the leader edits it.
                draggable={isLeader}
                onPress={() => point.id && handlePointPress(point.id)}
                onDragStart={() => point.id && handlePointPress(point.id)}
                onDragEnd={(event) => point.id && void handlePointDragEnd(point.id, event)}
              >
                {/* MapLibre's native marker view sizes its tap area to exactly its
                  children's rendered bounds — no padding/hit-slop of its own (confirmed
                  by reading Marker.js; ViewAnnotation shares the same underlying native
                  point-annotation component, so treat this as still true until checked
                  on-device — M34 WP1's own risk note). The visible dot is 8-14px,
                  unusably small to tap on a real device (found on-device: taps were
                  landing on nothing), so the touch target is this 32px box, with the
                  dot centered inside it. */}
                <View
                  style={{
                    width: 32,
                    height: 32,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
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
                </View>
              </ViewAnnotation>
            ))}
          </MapLibreMap>

          <ZoomControl cameraRef={cameraRef} zoom={zoom} />

          {isLeader && (
            <View className="absolute left-3 top-3">
              <Button
                size="sm"
                onPress={() => void handleAddStopHere()}
                testID="add-stop-here"
                icon={<MapPinPlus size={14} color={lightTokens.primaryForeground} />}
              >
                Add stop here
              </Button>
            </View>
          )}

          <ItinerarySheet
            selectedDay={selectedDay}
            selectedPointId={selectedPointId}
            days={days}
            avgSpeedKnots={trip.avgSpeedKnots}
            onClosePoint={() => setSelectedPointId(null)}
            onEditPoint={isLeader ? handleEditPoint : undefined}
            expanded={sheetExpanded}
            onExpandedChange={setSheetExpanded}
            onRefreshWeather={reload}
          />
        </View>
      </View>
    </Screen>
  );
}
