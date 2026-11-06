import {
  Camera,
  type CameraRef,
  GeoJSONSource,
  Layer,
  Map as MapLibreMap,
  type MapRef,
  type PixelPointBounds,
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
import { TriangleAlert } from "lucide-react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  type NativeSyntheticEvent,
  Pressable,
  View,
} from "react-native";

import type { Day } from "@shared/dtos/day";
import { POINT_TYPE } from "@shared/dtos/point";
import { TRIP_STATE } from "@shared/dtos/trip";
import { getDayColor } from "@shared/itinerary/colors";
import { lightTokens, palette } from "@shared/tokens";

import { CrewPositionMarkers } from "@mobile/components/live/crew-position-markers";
import { AddPointTooltip } from "@mobile/components/trips/add-point-tooltip";
import { DayRail } from "@mobile/components/trips/day-rail";
import { ItinerarySheet } from "@mobile/components/trips/itinerary-sheet";
import { MapVelocityOverlay } from "@mobile/components/trips/map-velocity-overlay";
import { UndoSnackbar } from "@mobile/components/trips/undo-snackbar";
import { ZoomControl } from "@mobile/components/trips/zoom-control";
import { Screen } from "@mobile/components/ui/layout";
import { OfflineNotice } from "@mobile/components/ui/offline-notice";
import { Text } from "@mobile/components/ui/text";
import { CACHE_KEY, readCachedAt } from "@mobile/lib/db/cache-freshness";
import { loadOfflineTrip } from "@mobile/lib/db/offline-itinerary";
import { requestPush } from "@mobile/lib/db/push-pending";
import { isPointDraggable } from "@mobile/lib/itinerary/point-drag";
import { routeIsOnPhone, type RouteSample } from "@mobile/lib/itinerary/route-source";
import { getPushStatus } from "@mobile/lib/network/push-status";
import { editRoute, loadRouteSyncState } from "@mobile/lib/db/route-edit";
import { pullRoute } from "@mobile/lib/db/route-sync";
import { isTripLeader } from "@mobile/lib/db/trip-role";
import { useTripChanges } from "@mobile/lib/live/use-trip-changes";
import { buildDayColoredRoute } from "@mobile/lib/itinerary/day-route";
import { distanceToPredecessorNm } from "@mobile/lib/itinerary/draft-point";
import { withLiveImages } from "@mobile/lib/itinerary/live-images";
import { numberedDays } from "@mobile/lib/itinerary/numbered-days";
import {
  deletePoint,
  insertionDayId,
  insertPoint,
  movePointByDrag,
} from "@mobile/lib/itinerary/route-edits";
import { boundsOf } from "@mobile/lib/map/bounds";
import type { MapViewState } from "@mobile/lib/map/project-lng-lat";
import { MAP_STYLE } from "@mobile/lib/map/tiles";
import { getTrip } from "@mobile/lib/trips/actions";
import { uuidv7 } from "@mobile/lib/uuid";

// M9c WP6: the same live-first, cache-fallback shape as the trip list screen.
// This screen only needs `destination` and `itinerary.days` from the full
// `Trip` DTO — a lighter local type than importing `Trip` avoids fabricating
// every other field (medical, logistics, ...) for the offline-reconstructed
// case, which has no equivalent to supply them.
type ScreenTrip = {
  destination: string | null;
  days: Day[];
  avgSpeedKnots: number;
  // Known only from a live read: the live crew layer is for a trip under way, and offline there is
  // no one to poll.
  isHappening?: boolean;
};

// Same fallback web's builder uses (map-builder.tsx) when the itinerary has never
// had a speed set — kept as one named constant rather than repeating the literal.
const DEFAULT_AVG_SPEED_KNOTS = 2.5;

// M34 WP4: a not-yet-created point, pending Undo/Confirm at the tap location.
// `afterPointId` is already resolved (append-at-end vs mid-route insert) by
// the time the draft is shown, so Confirm has nothing left to figure out.
type DraftPoint = { latitude: number; longitude: number; afterPointId: string | null };

// How close a tap needs to land to the route line to count as a mid-route
// insertion rather than an append at the end — a small screen-pixel box around
// the tap point, queried against the rendered "route-line" layer. Mirrors web's
// own hit-target widening (map-core.tsx's 18px invisible stroke over a 2.5px
// visible line), achieved differently since MapLibre RN's Layer has no onPress.
// Wider than web's ±9px on purpose: a tap that close to an existing route is
// clearly meant to refine it, and nobody travelling the chain back wants the
// tip dragged to that spot, so there is no reason to make them zoom in first.
// ±24px is a 48px target, the usual minimum for a finger.
const ROUTE_LINE_TAP_TOLERANCE_PX = 24;

// Wire names (TripChange.t) of everything this screen draws.
const ROUTE_CHANGE_TABLES = [
  "trip",
  "itinerary",
  "day",
  "point",
  "image",
  "place",
  "wind_diamond",
  "tidal_station",
];

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
  const [draftPoint, setDraftPoint] = useState<DraftPoint | null>(null);
  const [addingPoint, setAddingPoint] = useState(false);
  // M34 WP6 fix: the draft tooltip's Add/Undo buttons stopped being tappable
  // once they were map-annotation children (both as ViewAnnotation and as
  // Marker) — found on-device, and traced to the library's own Android
  // click handling (MLRNMapView.onMapClick): a tap is resolved by the map's
  // OWN click gesture detector, which hit-tests against each Marker's
  // bounding box and fires that ONE marker's onPress — nested Pressables
  // inside it never get a real touch event through this path. The fix is
  // the same one ZoomControl already uses: a plain RN
  // overlay `View`, not a map annotation, positioned over the map via
  // `mapRef.project()` (lngLat -> screen pixel) instead of MapLibre's own
  // annotation placement. `draftScreenPoint` is that projected position,
  // recomputed whenever the draft point changes or the map moves (handled
  // in handleMapPress/handleRegionChange); `tooltipSize` is the tooltip's
  // own measured size, needed to center it above the point rather than
  // anchoring at its top-left corner.
  const [draftScreenPoint, setDraftScreenPoint] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [tooltipSize, setTooltipSize] = useState<{ width: number; height: number } | null>(
    null,
  );
  // M34 WP6 fix: while a point is being dragged, its adjacent legs still draw
  // from the pre-drag `days` state (only `reload()` after drag-end brings them
  // current) — without this, they'd visibly lag behind the marker mid-drag.
  // `draggingPointId` marks which point's legs need the live override below;
  // `dragPreview` is that live position, updated on every `onDrag` tick
  // (ViewAnnotation's `onDrag`, not just `onDragStart`/`onDragEnd`, fires
  // continuously with the current `lngLat` — confirmed against the installed
  // `@maplibre/maplibre-react-native` types). A brief position mismatch
  // (dragging disappearing/reappearing, or turning dashed) reads worse than
  // just tracking it, and only the affected leg endpoints need recomputing
  // per tick, not the whole route.
  const [draggingPointId, setDraggingPointId] = useState<string | null>(null);
  const [dragPreview, setDragPreview] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
  // M34: where the most recently dragged point was before the drag, so a pan
  // that caught a marker can be taken back (UndoSnackbar). Only the latest
  // move is kept — a newer drag replaces it, and the snackbar's own timer or
  // a delete clears it.
  const [lastMove, setLastMove] = useState<{
    pointId: string;
    latitude: number;
    longitude: number;
  } | null>(null);
  // M35: which forecast layer is drawn on the map, and for which hour. The hour is
  // chosen in the weather sheet's grids, so both live here, where the sheet and the
  // overlay can both reach them. 12:00 is the same representative hour the day
  // strip uses.
  // Wind and swell are independent layers, as on web, so both can be on at once.
  const [windOn, setWindOn] = useState(false);
  const [swellOn, setSwellOn] = useState(false);
  const [overlayHour, setOverlayHour] = useState(12);
  const [mapSize, setMapSize] = useState({ width: 0, height: 0 });
  // The map's latest view, kept in a ref: it changes many times a second during a
  // gesture, and the overlay reads it every frame, so state would re-render this
  // whole screen for each report.
  const mapViewRef = useRef<MapViewState | null>(null);
  const cameraRef = useRef<CameraRef>(null);
  const mapRef = useRef<MapRef>(null);
  const router = useRouter();
  const dismissLastMove = useCallback(() => setLastMove(null), []);

  // Named and stable so a refresh action (the WP5 weather/sea "refresh"
  // button, threaded in as ItinerarySheet's onRefresh) can re-run the same
  // live-fetch-then-fallback logic after POSTing a refresh, without
  // duplicating it.
  const reload = useCallback(async () => {
    try {
      // Asked before the fetch as well as after (see routeIsOnPhone): an edit and its push can
      // both finish while the server's copy is on its way, and asking only afterwards would show
      // that older copy over the leader's newer edit.
      const sampleRoute = async (): Promise<RouteSample> => {
        const state = await loadRouteSyncState(id);
        return {
          hasLocalChanges: !!state?.hasLocalChanges,
          inConflict: !!state?.inConflict,
          pushing: getPushStatus().state === "pushing",
        };
      };
      const before = await sampleRoute();
      const t = await getTrip(id);
      // Filtered at ingestion, not at render: Day 0 sorts first, so leaving it in the
      // array also made it the default selection below.
      // M9d: a route the leader edited on this phone and hasn't pushed yet — or a
      // parked conflict — is shown from the phone, not the server: the server's
      // copy doesn't have the edits, and hiding them would look like they'd vanished.
      const after = await sampleRoute();
      setInConflict(after.inConflict);
      const liveDays = t.itinerary?.days ?? [];
      const rawDays = routeIsOnPhone([before, after])
        ? (await loadOfflineTrip(id)).days
        : liveDays;
      const days = numberedDays(withLiveImages(rawDays, liveDays));
      setTrip({
        destination: t.destination ?? null,
        days,
        avgSpeedKnots: t.itinerary?.avgSpeedKnots ?? DEFAULT_AVG_SPEED_KNOTS,
        isHappening: t.state === TRIP_STATE.HAPPENING,
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

  // Someone else changed the route, or a place/diamond/photo on it (M36).
  useTripChanges(id, () => void reload(), { tables: ROUTE_CHANGE_TABLES });

  useEffect(() => {
    let cancelled = false;
    void isTripLeader(id).then((leader) => {
      if (!cancelled) setIsLeader(leader);
    });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const days: Day[] = useMemo(() => trip?.days ?? [], [trip]);

  // Images ride along as a JSON route param instead of the edit screen
  // fetching them itself — an independent fetch there previously swallowed
  // any failure to "no photos," indistinguishable from the point having none.
  function handleEditPoint(pointId: string) {
    const point = days.flatMap((day) => day.points ?? []).find((p) => p.id === pointId);
    const images = (point?.images ?? []).map((image) => ({
      id: image.id ?? null,
      location: image.location,
      caption: image.caption ?? null,
    }));
    router.push({
      pathname: "/trips/[id]/point/[pointId]",
      params: { id, pointId, images: JSON.stringify(images) },
    });
  }

  function confirmDeletePoint(pointId: string) {
    Alert.alert("Delete this point?", "It is removed from the route for everyone once sent.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => void handleDeletePoint(pointId),
      },
    ]);
  }

  async function handleDeletePoint(pointId: string) {
    try {
      await editRoute(id, (route) => deletePoint(route, pointId));
      requestPush();
      clearPointSelection();
      setLastMove((move) => (move?.pointId === pointId ? null : move));
      await reload();
    } catch (err) {
      Alert.alert(
        "Couldn't delete point",
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    }
  }

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

  // Deselecting a point also collapses the sheet. It was expanded to show that
  // point, and left open it falls back to the weather body — the forecast
  // popping up on a plain map tap. Weather expands only from the day strip
  // (handleDayPress).
  function clearPointSelection() {
    setSelectedPointId(null);
    setSheetExpanded(false);
  }

  function handlePointPress(pointId: string) {
    suppressNextMapPress.current = true;
    setSelectedPointId(pointId);
    setSheetExpanded(true);
  }

  // M34 WP1/WP3 (merged): dragging a marker repositions the point through the
  // same editRoute path the point-edit form already uses (lib/db/route-edit.ts)
  // — no new persistence code, only a new gesture entry into it. It does NOT
  // reorder the point — an earlier version re-inserted it next to whichever
  // point was nearest the drop location, which is order-blind and could
  // garble the route into a non-linear path on anything but a straight line
  // (found on-device); see movePointByDrag's own comment. Moving a point to a
  // *different* day is out of scope for this drag too (left for the future
  // day-boundaries work) — the day-picker on the point-edit form is still the
  // only way to do either. A drag also fires the map's own onPress underneath
  // it (the same double-recognizer behaviour handlePointPress works around
  // above), so it reuses that guard too.
  // `before` is the marker's own pre-drag position, handed in by the caller
  // rather than looked up in routePoints (declared further down — reading it
  // from here makes the React Compiler skip this component).
  async function handlePointDragEnd(
    pointId: string,
    event: { nativeEvent: ViewAnnotationEvent },
    before: { latitude: number; longitude: number },
  ) {
    suppressNextMapPress.current = true;
    const [longitude, latitude] = event.nativeEvent.lngLat;
    try {
      await editRoute(id, (route) => movePointByDrag(route, pointId, latitude, longitude));
      setLastMove({ pointId, latitude: before.latitude, longitude: before.longitude });
      requestPush();
    } catch (err) {
      Alert.alert(
        "Couldn't move point",
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      // Reload before clearing the live-preview override, so the real legs
      // take over already at the dragged-to position rather than flashing at
      // the stale one first.
      await reload();
      setDraggingPointId(null);
      setDragPreview(null);
      // The summary sheet expands here, once the drag has actually finished,
      // not at drag-start (see onDragStart below) — expanding it mid-drag was
      // handing its own pan gesture a live claim on the same touch stream the
      // marker drag was still using.
      setSheetExpanded(true);
    }
  }

  // Restores the pre-drag position through the same editRoute path the drag
  // itself used. Cleared first so a double tap can't undo twice.
  async function handleUndoMove() {
    if (!lastMove) return;
    const { pointId, latitude, longitude } = lastMove;
    setLastMove(null);
    try {
      await editRoute(id, (route) => movePointByDrag(route, pointId, latitude, longitude));
      requestPush();
      await reload();
    } catch (err) {
      Alert.alert(
        "Couldn't undo the move",
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
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

  // The selected day's route, which the forecast disc is built around (web's map-core.tsx
  // `selectedDayPositions`): the overlay shows conditions over that passage.
  const selectedDayPositions = useMemo(
    () =>
      routePoints
        .filter((point) => point.dayId === selectedDayId)
        .map((point): [number, number] => [point.latitude, point.longitude]),
    [routePoints, selectedDayId],
  );

  // M34 WP6 fix: while dragging, redraw the leg(s) touching the dragged point
  // at its live position — legs are index-aligned with routePoints (legs[i]
  // joins points[i]/points[i+1]), so the dragged point at index `i` touches
  // legs[i-1] (incoming, where it's the second coordinate) and legs[i]
  // (outgoing, where it's the first).
  const draggingIndex = draggingPointId
    ? routePoints.findIndex((p) => p.id === draggingPointId)
    : -1;

  const routeGeoJson = useMemo(() => {
    if (draggingIndex === -1 || !dragPreview) {
      return { type: "FeatureCollection" as const, features: routeLegs };
    }
    const liveCoord: [number, number] = [dragPreview.longitude, dragPreview.latitude];
    const features = routeLegs.map((leg, i) => {
      if (i === draggingIndex - 1) {
        return {
          ...leg,
          geometry: { ...leg.geometry, coordinates: [leg.geometry.coordinates[0], liveCoord] },
        };
      }
      if (i === draggingIndex) {
        return {
          ...leg,
          geometry: { ...leg.geometry, coordinates: [liveCoord, leg.geometry.coordinates[1]] },
        };
      }
      return leg;
    });
    return { type: "FeatureCollection" as const, features };
  }, [routeLegs, draggingIndex, dragPreview]);

  const bounds = useMemo(() => boundsOf(routePoints), [routePoints]);

  // M34 WP4: a tap on empty map space, with nothing selected, starts the
  // tap-to-place flow — replacing the old long-press-then-navigate-to-a-form
  // placement outright (long-press competes with panning the map; a tap
  // doesn't, since MapLibre resolves it to a pan instead the moment the finger
  // moves). Ported from web's builder: distance/time preview, Undo/Confirm,
  // then selection into the point summary sheet, same as every other point —
  // not a separate compact form. This is now the only way to add a point on
  // mobile; the separate GPS-position "Add stop here" button was retired once
  // this covered its case too (tap the map at your own dot, same result).
  async function handleMapPress(event: NativeSyntheticEvent<PressEvent>) {
    if (suppressNextMapPress.current) {
      suppressNextMapPress.current = false;
      return;
    }
    if (selectedPointId) {
      clearPointSelection();
      return;
    }
    if (draftPoint) {
      setDraftPoint(null);
      setDraftScreenPoint(null);
      setTooltipSize(null);
      return;
    }
    if (!isLeader) return;

    const { point, lngLat } = event.nativeEvent;
    const [longitude, latitude] = lngLat;
    const tolerance = ROUTE_LINE_TAP_TOLERANCE_PX;
    const queryBounds: PixelPointBounds = [
      [point[0] - tolerance, point[1] - tolerance],
      [point[0] + tolerance, point[1] + tolerance],
    ];

    // Mid-route insert when the tap lands near an existing leg, append-at-end
    // otherwise. Falls back to append-at-end on any query failure — a leader
    // can still always add a point, just not necessarily mid-route this time.
    let afterPointId = routePoints[routePoints.length - 1]?.id ?? null;
    try {
      const features = await mapRef.current?.queryRenderedFeatures(queryBounds, {
        layers: ["route-line"],
      });
      const hitAfterId = features?.[0]?.properties?.afterId;
      if (typeof hitAfterId === "string") afterPointId = hitAfterId;
    } catch {
      // Line hit-testing is a nice-to-have, not a precondition for adding a point.
    }

    setDraftPoint({ latitude, longitude, afterPointId });
    // The tap's own screen point is already exactly the projection of
    // (latitude, longitude) — no need for a round-trip through mapRef.project()
    // just to place the tooltip where the finger already is.
    setDraftScreenPoint({ x: point[0], y: point[1] });
    setTooltipSize(null);
  }

  // Keeps the overlay tooltip tracking the draft point's geographic position
  // as the map is panned/zoomed — its screen position changes even though
  // the underlying lngLat doesn't.
  function handleRegionMoving(event: { nativeEvent: MapViewState }) {
    const { center, zoom: nextZoom, bearing, pitch } = event.nativeEvent;
    mapViewRef.current = { center, zoom: nextZoom, bearing, pitch };
  }

  // The map only reports a view when it moves, so switching a layer on at rest has
  // nothing to draw against until it is asked once.
  function seedMapView() {
    void mapRef.current
      ?.getViewState()
      .then(({ center, zoom: nextZoom, bearing, pitch }) => {
        mapViewRef.current = { center, zoom: nextZoom, bearing, pitch };
      })
      .catch(() => undefined);
  }

  function handleWindToggle() {
    if (!windOn) seedMapView();
    setWindOn(!windOn);
  }

  function handleSwellToggle() {
    if (!swellOn) seedMapView();
    setSwellOn(!swellOn);
  }

  function handleRegionChange(event: { nativeEvent: MapViewState }) {
    handleRegionMoving(event);
    setZoom(event.nativeEvent.zoom);
    if (!draftPoint) return;
    void mapRef.current
      ?.project([draftPoint.longitude, draftPoint.latitude])
      .then(([x, y]) => setDraftScreenPoint({ x, y }))
      .catch(() => undefined);
  }

  function handleUndoDraft() {
    setDraftPoint(null);
    setDraftScreenPoint(null);
    setTooltipSize(null);
  }

  async function handleConfirmDraft() {
    if (!draftPoint) return;
    setAddingPoint(true);
    const newPointId = uuidv7();
    try {
      await editRoute(id, (route) => {
        const dayId = insertionDayId(route, draftPoint.afterPointId);
        return insertPoint(route, dayId, draftPoint.afterPointId, {
          id: newPointId,
          latitude: draftPoint.latitude,
          longitude: draftPoint.longitude,
          name: null,
          notes: null,
          type: POINT_TYPE.STOP,
        });
      });
      requestPush();
      setDraftPoint(null);
      setDraftScreenPoint(null);
      setTooltipSize(null);
      await reload();
      // Select the new point and let the summary sheet show it — no forced
      // trip to a form. Name and type are set right there in the sheet
      // (PointSummaryCard); a point created with neither is a normal, valid
      // state, not one that demands immediate editing.
      setSelectedPointId(newPointId);
      setSheetExpanded(true);
    } catch (err) {
      Alert.alert(
        "Couldn't add point",
        err instanceof Error ? err.message : "Something went wrong. Please try again.",
      );
    } finally {
      setAddingPoint(false);
    }
  }

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
          see the M9b3 plan's library-choice table for why gorhom over the reverted
          `@expo/ui` modal prototype. */}
      <View style={{ flex: 1 }}>
        <OfflineNotice visible={isOffline} cachedAt={cachedAt} onRetry={() => void reload()} />

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

        <View
          style={{ flex: 1 }}
          onLayout={(event) =>
            setMapSize({
              width: event.nativeEvent.layout.width,
              height: event.nativeEvent.layout.height,
            })
          }
        >
          <MapLibreMap
            ref={mapRef}
            mapStyle={MAP_STYLE}
            style={{ flex: 1 }}
            onRegionIsChanging={handleRegionMoving}
            onRegionDidChange={handleRegionChange}
            onPress={(event) => void handleMapPress(event)}
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
                // Leader-only, and only the selected point: any point being draggable let a
                // swipe or pan that crossed one carry it off. Tap a point, then drag it.
                draggable={isPointDraggable({ isLeader, pointId: point.id, selectedPointId })}
                onPress={() => point.id && handlePointPress(point.id)}
                // Selects the point but deliberately does NOT expand the sheet
                // (unlike handlePointPress) — see handlePointDragEnd's own note.
                onDragStart={(event) => {
                  if (!point.id) return;
                  suppressNextMapPress.current = true;
                  setSelectedPointId(point.id);
                  setDraggingPointId(point.id);
                  const [longitude, latitude] = event.nativeEvent.lngLat;
                  setDragPreview({ latitude, longitude });
                }}
                onDrag={(event) => {
                  const [longitude, latitude] = event.nativeEvent.lngLat;
                  setDragPreview({ latitude, longitude });
                }}
                onDragEnd={(event) => point.id && void handlePointDragEnd(point.id, event, point)}
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

            {draftPoint && (
              // Non-interactive — just marks where the point would land. No
              // onPress: the Undo/Confirm controls live in the plain overlay
              // below now, not on this annotation (see that overlay's own
              // comment for why they moved out of the map layer entirely).
              <ViewAnnotation
                id="draft-point"
                lngLat={[draftPoint.longitude, draftPoint.latitude]}
              >
                <View
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    borderWidth: 2,
                    borderStyle: "dashed",
                    borderColor: lightTokens.cta,
                  }}
                />
              </ViewAnnotation>
            )}

            <CrewPositionMarkers tripId={id} live={!!trip.isHappening} />
          </MapLibreMap>

          {/* Straight after the map, before everything else drawn over it: a later sibling
            paints on top, and the particles fill the whole screen, so anything placed before
            this (the new-point tooltip, the "Point moved" snackbar) sat behind them. */}
          <MapVelocityOverlay
            day={selectedDay}
            dayPositions={selectedDayPositions}
            windOn={windOn}
            swellOn={swellOn}
            onWindToggle={handleWindToggle}
            onSwellToggle={handleSwellToggle}
            hour={overlayHour}
            viewRef={mapViewRef}
            size={mapSize}
            offline={isOffline}
          />

          {draftPoint && draftScreenPoint && (
            // A plain RN overlay, not a map annotation — see draftScreenPoint's
            // own comment (state declarations, above) for why: MapLibre's
            // Android click handling resolves a tap by hit-testing map
            // annotations and firing that ONE annotation's own onPress, so a
            // Pressable nested inside one never got a real touch event
            // through it (confirmed on both ViewAnnotation and Marker,
            // on-device). Positioned by projecting the draft point's lngLat
            // to a screen pixel instead, exactly like ZoomControl and "Add
            // stop here" already are.
            <View
              pointerEvents="box-none"
              style={{ position: "absolute", left: draftScreenPoint.x, top: draftScreenPoint.y }}
            >
              <View
                onLayout={(event) =>
                  setTooltipSize({
                    width: event.nativeEvent.layout.width,
                    height: event.nativeEvent.layout.height,
                  })
                }
                style={{
                  position: "absolute",
                  // Centered above the point: -50% of its own width, and its
                  // own height plus a small gap above the point's dashed ring.
                  left: tooltipSize ? -tooltipSize.width / 2 : 0,
                  top: tooltipSize ? -tooltipSize.height - 16 : -16,
                  // Invisible until measured once — an unmeasured tooltip
                  // would otherwise flash at the wrong (top-left-anchored)
                  // position for one frame.
                  opacity: tooltipSize ? 1 : 0,
                }}
              >
                <AddPointTooltip
                  distanceNm={distanceToPredecessorNm(
                    routePoints,
                    draftPoint.afterPointId,
                    draftPoint.latitude,
                    draftPoint.longitude,
                  )}
                  avgSpeedKnots={trip.avgSpeedKnots}
                  submitting={addingPoint}
                  onUndo={handleUndoDraft}
                  onConfirm={() => void handleConfirmDraft()}
                />
              </View>
            </View>
          )}

          {/* Top of the map, not the bottom: ItinerarySheet docks over the bottom
            edge. Hidden while a draft point is pending so the two "Undo"s never
            compete — confirming or discarding the draft comes first. */}
          {lastMove && !draftPoint && (
            <View
              pointerEvents="box-none"
              style={{ position: "absolute", top: 16, left: 16, right: 16 }}
            >
              <UndoSnackbar
                message="Point moved"
                onUndo={() => void handleUndoMove()}
                onDismiss={dismissLastMove}
              />
            </View>
          )}

          <ZoomControl cameraRef={cameraRef} zoom={zoom} />

          <ItinerarySheet
            selectedDay={selectedDay}
            selectedPointId={selectedPointId}
            days={days}
            avgSpeedKnots={trip.avgSpeedKnots}
            onClosePoint={clearPointSelection}
            onEditPoint={isLeader ? handleEditPoint : undefined}
            onDeletePoint={isLeader ? confirmDeletePoint : undefined}
            onViewPoint={handleEditPoint}
            expanded={sheetExpanded}
            onExpandedChange={setSheetExpanded}
            onRefreshWeather={reload}
            selectedHour={overlayHour}
            onHourChange={setOverlayHour}
            // A marker drag is still claiming the touch stream at this point
            // (draggingPointId only clears in handlePointDragEnd's finally) —
            // gorhom's own pan gesture must not compete for it.
            panGestureDisabled={draggingPointId !== null}
          />
        </View>
      </View>
    </Screen>
  );
}
