"use client"
import { useCallback, useEffect, useMemo, useReducer, useState } from "react"
import dynamic from "next/dynamic"
import { useSearchParams } from "next/navigation"
import { toast } from "sonner"
import { useCollapseSidebar } from "@/hooks/use-collapse-sidebar"
import { useContentLayout } from "@/hooks/use-content-layout"
import { usePositionWatch } from "@/hooks/use-position-watch"
import { useLivePositions } from "@/hooks/use-live-positions"
import { useServerItinerarySync } from "@/hooks/use-server-itinerary-sync"
import { Button } from "@/components/ui/button"
import { CloseDayButton } from "./close-day-button"
import { MapTopBar } from "./map-top-bar"
import { PositionConsentDialog, POSITION_SOURCE } from "@/components/common/position-consent-dialog"
import type { MapCoreProps } from "./map-core"
import { PointListPane } from "./point-list-pane"
import type { Day } from "@/lib/dtos/day"
import type { Itinerary } from "@/lib/dtos/itinerary"
import { mapReducer, initialMapState } from "@/lib/itinerary/map-reducer"
import { totalDistanceNm, DISTANCE_UNIT, type DistanceUnit } from "@/lib/itinerary/distance"
import { MapBuilderContext } from "@/lib/itinerary/map-builder-context"
import { initDraftBoundaries, type DraftBoundary } from "@/lib/itinerary/boundaries"
import { repointDraftAfterPointRemoval } from "@/lib/itinerary/point-removal"
import type { TripState } from "@/lib/dtos/trip"
import {
  createPoint,
  updatePoint,
  deletePoint,
  updateItinerary,
  ensureStagingDay,
  setPointOrder,
} from "@/lib/itinerary/actions"
import { getStreamTicket } from "@/lib/live/actions"
import { setUnitPreference } from "@/lib/profile/actions"
import { debounce } from "@/lib/utils/debounce"
import { DayRail } from "./day-rail"
import { FeatureDrawer } from "./feature-drawer"
import { PointDetailSheet } from "./point-detail-sheet"

const MapCore = dynamic(() => import("./map-core"), {
  ssr: false,
}) as React.ComponentType<MapCoreProps>

const SERVER_MOVED_TOAST_ID = "route-changed-by-someone-else"

type MapBuilderProps = {
  itinerary: Itinerary
  tripId: string | null
  tripName: string
  tripDateFrom?: string | null
  tripDateTo?: string | null
  tripState?: TripState | null
  isLeader?: boolean
  // Any trip member may enter Navigate mode while the trip is happening — a
  // separate axis from isLeader, which only gates the View/Edit route-editing
  // toggle. Computed server-side (deriveMembership + tripState === "happening").
  showNavigate?: boolean
  // The member's position on this trip comes from their inReach (`inReachIsPositionSource`),
  // so Navigate shows the crew without sending the phone's position, and has nothing from
  // the device to ask consent for. Off, Navigate shares the phone's GPS as before.
  inReachIsSource?: boolean
  initialDistanceUnit?: DistanceUnit
}

export function MapBuilder({
  itinerary,
  tripId,
  tripName,
  tripDateFrom = null,
  tripDateTo = null,
  tripState = null,
  isLeader = true,
  showNavigate = false,
  inReachIsSource = false,
  initialDistanceUnit = DISTANCE_UNIT.NM,
}: MapBuilderProps) {
  useCollapseSidebar()
  useContentLayout("bleed")

  const [distanceUnit, setDistanceUnit] = useState<DistanceUnit>(initialDistanceUnit)
  const [avgSpeedKnots, setAvgSpeedKnots] = useState(itinerary.avgSpeedKnots ?? 2.5)
  const [draft, setDraft] = useState<DraftBoundary[] | null>(null)
  const [removedRealDayIds, setRemovedRealDayIds] = useState<string[]>([])
  const [viewMode, setViewMode] = useState(true)
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null)
  const [selectedPointId, setSelectedPointId] = useState<string | null>(null)
  const [selectedHour, setSelectedHour] = useState(12)
  const [conditionsVersion, setConditionsVersion] = useState(0)
  // Honors the `?navigate=1` deep link once, at mount — as a state initializer
  // rather than an effect, so a user who explicitly turns Navigate off is never
  // fought by a later re-run. A link only ever watches: sharing the device's position
  // is a separate choice, made in the app and behind its own consent dialog.
  const searchParams = useSearchParams()
  const navigateDeepLink = showNavigate && searchParams.get("navigate") === "1"
  const [navigateMode, setNavigateMode] = useState(() => navigateDeepLink)
  const [sharing, setSharing] = useState(false)
  const [showShareConfirm, setShowShareConfirm] = useState(false)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)

  const bumpConditions = useCallback(() => setConditionsVersion((v) => v + 1), [])

  // ── Navigate mode (M8) ──────────────────────────────────────────────────
  // Navigate shows the crew. Sharing the device's own position is a second switch in the
  // Navigate bar, and turning it ON shares live location (Privacy §2/§3's "explicit
  // consent" claim), so it goes through PositionConsentDialog first. Turning it OFF, or
  // leaving Navigate, stops sharing and needs no confirmation; a new Navigate session
  // starts by watching only. When the member's position comes from their inReach there
  // is nothing from the device to share and no switch.

  const leaveNavigate = useCallback(() => {
    setNavigateMode(false)
    setSharing(false)
  }, [])

  const handleToggleNavigate = useCallback(() => {
    if (navigateMode) {
      leaveNavigate()
      return
    }
    setNavigateMode(true)
    setViewMode(true)
  }, [navigateMode, leaveNavigate])

  const handleToggleSharing = useCallback(() => {
    if (sharing) {
      setSharing(false)
      return
    }
    setShowShareConfirm(true)
  }, [sharing])

  const handleConfirmShare = useCallback(() => setSharing(true), [])

  const mintStreamUrl = useCallback(
    () => (tripId ? getStreamTicket(tripId) : Promise.resolve(null)),
    [tripId],
  )

  useEffect(() => {
    if (!navigateMode || !tripId) return
    let cancelled = false
    mintStreamUrl().then((url) => {
      if (!cancelled) setStreamUrl(url)
    })
    // Leaving Navigate drops the ticket on the way out rather than on the next
    // run, so a stale one is never held while the stream is closed.
    return () => {
      cancelled = true
      setStreamUrl(null)
    }
  }, [navigateMode, tripId, mintStreamUrl])

  const positionWatch = usePositionWatch(tripId ?? "", navigateMode && sharing && !inReachIsSource)
  const liveStream = useLivePositions(navigateMode ? streamUrl : null, {
    mintUrl: mintStreamUrl,
  })

  const navigateStatusLabel = inReachIsSource ? (
    <>
      inReach · {liveStream.positions.length}
      <span className="sr-only sm:not-sr-only"> crew</span> live
    </>
  ) : !sharing ? (
    <>
      Watching · {liveStream.positions.length}
      <span className="sr-only sm:not-sr-only"> crew</span> live
    </>
  ) : positionWatch.status === "denied" ? (
    "Location denied"
  ) : positionWatch.status === "unsupported" ? (
    "Location unavailable"
  ) : positionWatch.status === "sending" ? (
    // Shortened on a phone to "Sharing · N live", where this chip and
    // CloseDayButton share one row over a ~311px map and the full sentence took
    // the whole width on its own. The dropped words are `sr-only` rather than
    // removed, so the status announced is the same sentence at every width.
    <>
      Sharing<span className="sr-only sm:not-sr-only"> position</span> ·{" "}
      {liveStream.positions.length}
      <span className="sr-only sm:not-sr-only"> crew</span> live
    </>
  ) : (
    "Acquiring location…"
  )

  // Persist the cruising speed only after the user stops dragging the slider.
  const debouncedSaveSpeed = useMemo(
    () =>
      debounce((speedKnots: number) => {
        updateItinerary(itinerary.id ?? "", { avgSpeedKnots: speedKnots })
      }, 800),
    [itinerary.id],
  )
  useEffect(() => debouncedSaveSpeed.cancel, [debouncedSaveSpeed])

  // Held in state, not derived, because an itinerary can arrive without one: the
  // staging day is provisioned on demand and the map has to pick it up mid-session
  // (it carries the day colour every staged point renders in).
  const [day0, setDay0] = useState<Day | null>(
    () => itinerary.days?.find((d) => d.dayNumber === 0) ?? null,
  )
  const day0Id = day0?.id ?? null
  const allPoints = itinerary.days?.flatMap((d) => d.points ?? []) ?? []
  const numberedDays = itinerary.days?.filter((d) => d.dayNumber > 0) ?? []

  const [state, dispatch] = useReducer(
    mapReducer,
    { points: allPoints, days: numberedDays },
    ({ points, days }) => initialMapState(points, days),
  )

  const isSaving = state.savingCount > 0

  // ── Other people's edits (M36) ───────────────────────────────────────────
  // The reducer above is seeded from `itinerary` once, so a `router.refresh()` that
  // brings someone else's change changes nothing on screen unless it is applied here.
  const applyServerItinerary = useCallback((next: Itinerary) => {
    const days = next.days ?? []
    dispatch({
      type: "STATE_REPLACE",
      state: initialMapState(
        days.flatMap((d) => d.points ?? []),
        days.filter((d) => d.dayNumber > 0),
      ),
    })
    setDay0(days.find((d) => d.dayNumber === 0) ?? null)
  }, [])
  const discardLocalEdit = useCallback(() => {
    setDraft(null)
    setRemovedRealDayIds([])
  }, [])
  const { serverMovedWhileEditing, takeServerVersion } = useServerItinerarySync({
    itinerary,
    isEditing: draft !== null || state.pendingPointId !== null || removedRealDayIds.length > 0,
    isSaving,
    apply: applyServerItinerary,
    discardLocalEdit,
  })
  useEffect(() => {
    if (!serverMovedWhileEditing) return
    // Persistent and non-blocking, like the route-conflict banner on mobile: the user
    // keeps what they are doing and chooses when to look. Dismissed by this effect's own
    // cleanup, so it goes away when the change is applied, reverts, or the page unmounts —
    // and a page that never showed it never touches the toaster.
    toast.info("Someone else changed this route while you were editing.", {
      id: SERVER_MOVED_TOAST_ID,
      duration: Infinity,
      action: { label: "Load their version", onClick: takeServerVersion },
    })
    return () => {
      toast.dismiss(SERVER_MOVED_TOAST_ID)
    }
  }, [serverMovedWhileEditing, takeServerVersion])

  const orderedPoints = useMemo(
    () =>
      state.pointOrder
        .map((id) => state.points.find((p) => p.id === id))
        .filter((p): p is NonNullable<typeof p> => p !== undefined),
    [state.pointOrder, state.points],
  )

  const validForDistance = orderedPoints.filter(
    (p): p is typeof p & { latitude: number; longitude: number } =>
      p.latitude != null && p.longitude != null,
  )
  const totalDistance = totalDistanceNm(validForDistance)

  // All days passed to MapCore: Day 0 (for dayId colour lookups) + numbered days.
  const allDaysForMap = useMemo(() => [...(day0 ? [day0] : []), ...state.days], [day0, state.days])

  // ── handlers ─────────────────────────────────────────────────────────────

  // Every path that stages a point resolves the day through here. Reading day0Id
  // directly and bailing when it's null is how a cloned itinerary silently refused
  // every point the user dropped and every day boundary they saved.
  const resolveDay0Id = useCallback(async (): Promise<string | null> => {
    if (day0Id) return day0Id
    const result = await ensureStagingDay(itinerary.id ?? "")
    if (!result.success) {
      toast.error(result.error)
      return null
    }
    setDay0(result.day)
    return result.day.id ?? null
  }, [day0Id, itinerary.id])

  const handleMapClick = async (lat: number, lng: number) => {
    const stagingDayId = await resolveDay0Id()
    if (!stagingDayId) return
    const tempId = `tmp-${Date.now()}`

    // Collapse any expanded point row so the newly added point is the only focus.
    setSelectedPointId(null)

    dispatch({
      type: "POINT_ADD",
      point: { id: tempId, type: "position", latitude: lat, longitude: lng, dayId: stagingDayId },
    })
    dispatch({ type: "SET_PENDING", id: tempId })
    dispatch({ type: "SAVING_START" })

    // A point landing in Day 0 is a tail-orphan the last day's boundary already
    // covers (boundaries.ts's tail rule) — materialize the implicit draft so
    // Save days lights up without a separate boundary gesture, the same as any
    // other dirtying edit (M14). Only when a numbered day exists to walk it
    // into; with none, there's nothing yet for Save days to do.
    const materializedDraftHere = draft === null && state.days.length > 0
    if (materializedDraftHere) {
      setDraft(initDraftBoundaries(state.days, [...state.pointOrder, tempId]))
    }

    const result = await createPoint(stagingDayId, {
      type: "position",
      latitude: lat,
      longitude: lng,
    })
    dispatch({ type: "SAVING_END" })

    if (result.success) {
      dispatch({ type: "POINT_CONFIRM", tempId, point: { ...result.point, dayId: stagingDayId } })
    } else {
      dispatch({ type: "POINT_ROLLBACK", id: tempId })
      if (materializedDraftHere) setDraft(null)
    }
  }

  // Dropping a point on a leg. The insert is expressed twice on purpose: the
  // create carries `afterPointId` so a single insert is correct in one round trip,
  // and the whole order is then re-sent so `pointOrder` — the client's canonical
  // route order — is what the server holds. Without the first, a failed second
  // would leave the point silently appended to the end of the route.
  const handleLegClick = async (afterPointId: string, lat: number, lng: number) => {
    const predecessorIdx = state.pointOrder.indexOf(afterPointId)
    if (predecessorIdx === -1) return

    // The successor's day, not the predecessor's: a point inserted immediately
    // after a boundary stop belongs to the day the stop opens, since the stop
    // itself is owned by the day that ends there. Mid-day the two agree.
    const successorId = state.pointOrder[predecessorIdx + 1]
    const successor = successorId ? state.points.find((p) => p.id === successorId) : undefined
    const predecessor = state.points.find((p) => p.id === afterPointId)
    const dayId = successor?.dayId ?? predecessor?.dayId ?? (await resolveDay0Id())
    if (!dayId) return

    const tempId = `tmp-${Date.now()}`
    setSelectedPointId(null)

    dispatch({
      type: "POINT_ADD",
      afterId: afterPointId,
      point: { id: tempId, type: "position", latitude: lat, longitude: lng, dayId },
    })
    dispatch({ type: "SET_PENDING", id: tempId })
    dispatch({ type: "SAVING_START" })

    const result = await createPoint(dayId, {
      type: "position",
      latitude: lat,
      longitude: lng,
      afterPointId,
    })
    dispatch({ type: "SAVING_END" })

    if (!result.success) {
      dispatch({ type: "POINT_ROLLBACK", id: tempId })
      toast.error(result.error)
      return
    }
    dispatch({ type: "POINT_CONFIRM", tempId, point: { ...result.point, dayId } })

    // Only now that the real id exists — an order carrying a temp id is a set the
    // server cannot match, and it would answer 409 for a reason of our own making.
    const savedId = result.point.id
    if (!savedId) return
    const order = [
      ...state.pointOrder.slice(0, predecessorIdx + 1),
      savedId,
      ...state.pointOrder.slice(predecessorIdx + 1),
    ]
    dispatch({ type: "SAVING_START" })
    const ordered = await setPointOrder(itinerary.id ?? "", order)
    dispatch({ type: "SAVING_END" })
    // The point is already spliced server-side by `afterPointId`, so a failure
    // here costs nothing but the reconciliation — the route on screen is the route
    // that was saved. Worth saying out loud rather than swallowing.
    if (!ordered.success) toast.error(ordered.error)
  }

  const handleMarkerDragEnd = useCallback(
    async (pointId: string, lat: number, lng: number) => {
      const original = state.points.find((p) => p.id === pointId)
      dispatch({ type: "POINT_UPDATE", id: pointId, fields: { latitude: lat, longitude: lng } })
      dispatch({ type: "SAVING_START" })
      const result = await updatePoint(pointId, { latitude: lat, longitude: lng })
      dispatch({ type: "SAVING_END" })
      // The drag already moved the marker optimistically — if the persist failed,
      // put it back where it was rather than leaving an unsaved position on screen
      // with nothing to say it never made it to the server.
      if (!result.success && original) {
        dispatch({
          type: "POINT_UPDATE",
          id: pointId,
          fields: { latitude: original.latitude, longitude: original.longitude },
        })
      }
    },
    [state.points],
  )

  const handleMarkerDragMove = useCallback((_pointId: string, _lat: number, _lng: number) => {
    /* intentional — MapCore handles live label updates locally */
  }, [])

  const handleMarkerClick = useCallback(
    (pointId: string) => {
      if (viewMode) {
        const point = state.points.find((p) => p.id === pointId)
        setSelectedPointId(pointId)
        setSelectedDayId(point?.dayId ?? null)
        return
      }
      setSelectedPointId((prev) => (prev === pointId ? null : pointId))
    },
    [viewMode, state.points],
  )

  // The tail of the route is the one point removable without re-anchoring
  // anything after it, so the map's discard control always targets it —
  // deleting it hands the control to the point now underneath, letting a run
  // of stray clicks be trimmed back-to-front. A still-optimistic add carries
  // a temp id — undoing it would delete nothing server-side and orphan the
  // row createPoint is about to persist — so the control withholds itself
  // until the tail has a real, confirmed id.
  const lastPointId = state.pointOrder[state.pointOrder.length - 1] ?? null
  const discardablePointId = lastPointId && !lastPointId.startsWith("tmp-") ? lastPointId : null

  const handleUndoPendingPoint = useCallback(async () => {
    const pointId = discardablePointId
    if (!pointId) return
    if (draft) {
      setDraft(repointDraftAfterPointRemoval(draft, state.pointOrder, pointId))
    }
    setSelectedPointId(null)
    dispatch({ type: "POINT_REMOVE", id: pointId })
    dispatch({ type: "SAVING_START" })
    await deletePoint(pointId)
    dispatch({ type: "SAVING_END" })
  }, [discardablePointId, draft, state.pointOrder, dispatch])

  const handleDistanceUnitChange = useCallback((unit: DistanceUnit) => {
    setDistanceUnit(unit)
    setUnitPreference(unit)
  }, [])

  const handleAvgSpeedChange = useCallback(
    (v: number) => {
      setAvgSpeedKnots(v)
      debouncedSaveSpeed(v)
    },
    [debouncedSaveSpeed],
  )

  const flyToPoint = useMemo(() => {
    if (!selectedPointId) return null
    const p = state.points.find((pt) => pt.id === selectedPointId)
    if (!p || p.latitude == null || p.longitude == null) return null
    return { id: selectedPointId, lat: p.latitude, lng: p.longitude }
  }, [selectedPointId, state.points])

  const handleToggleViewMode = useCallback(() => {
    setViewMode((v) => {
      const next = !v
      // Edit and Navigate are mutually exclusive — Navigate is a View-only sub-state
      // (handleToggleNavigate already forces viewMode true on entry), so leaving View
      // for Edit must also leave Navigate, or the two ended up simultaneously true.
      if (!next) leaveNavigate()
      return next
    })
    setSelectedDayId(null)
    setSelectedPointId(null)
  }, [leaveNavigate])

  const ctxValue = useMemo(
    () => ({
      state,
      dispatch,
      draft,
      setDraft,
      removedRealDayIds,
      setRemovedRealDayIds,
      tripId: tripId ?? null,
      tripName,
      tripDateFrom,
      tripDateTo,
      itineraryId: itinerary.id ?? "",
      distanceUnit,
      setDistanceUnit: handleDistanceUnitChange,
      avgSpeedKnots,
      setAvgSpeedKnots,
      day0Id,
      resolveDay0Id,
      viewMode,
      setViewMode,
      selectedDayId,
      setSelectedDayId,
      selectedPointId,
      setSelectedPointId,
      tripState,
      isLeader,
      selectedHour,
      setSelectedHour,
      conditionsVersion,
      bumpConditions,
    }),
    [
      state,
      dispatch,
      draft,
      removedRealDayIds,
      tripId,
      tripName,
      tripDateFrom,
      tripDateTo,
      itinerary.id,
      distanceUnit,
      handleDistanceUnitChange,
      avgSpeedKnots,
      day0Id,
      resolveDay0Id,
      viewMode,
      selectedDayId,
      selectedPointId,
      tripState,
      isLeader,
      selectedHour,
      conditionsVersion,
      bumpConditions,
    ],
  )

  return (
    <MapBuilderContext.Provider value={ctxValue}>
      <div className="bg-background absolute inset-0 z-50">
        <MapTopBar
          tripId={tripId}
          tripName={tripName}
          distanceUnit={distanceUnit}
          onDistanceUnitChange={handleDistanceUnitChange}
          totalDistance={totalDistance}
          dayCount={state.days.length}
          isSaving={isSaving}
          avgSpeedKnots={avgSpeedKnots}
          onAvgSpeedKnotsChange={handleAvgSpeedChange}
          viewMode={viewMode}
          onToggleViewMode={handleToggleViewMode}
          isLeader={isLeader}
          tripState={tripState}
          showNavigate={showNavigate}
          navigateMode={navigateMode}
          onToggleNavigate={handleToggleNavigate}
        />
        <PositionConsentDialog
          source={POSITION_SOURCE.DEVICE}
          open={showShareConfirm}
          onOpenChange={setShowShareConfirm}
          onConfirm={handleConfirmShare}
        />
        {/* Panels are layout siblings of the map, not overlays — they push the map
            narrower instead of covering it, so no information is hidden.
            From `md` they sit beside it; below `md` they stack around it instead
            (day strip · full-bleed map · bottom sheet). Side-by-side does not
            survive a phone: DayRail is 126px and FeatureDrawer 288px — 414px of
            chrome against a 320px viewport — and because the map is
            `min-w-0 flex-1` it collapses to zero width rather than overflowing,
            so the page looks clean and has no map on it. A layout branch only:
            same components, same state, at every width. */}
        <div className="absolute top-[100px] right-0 bottom-0 left-0 flex flex-col md:top-12 md:flex-row">
          {viewMode && <DayRail />}
          <div data-testid="map-column" className="relative min-h-0 min-w-0 flex-1">
            {navigateMode && (
              // Shares the map's top row with the Annotate FAB at base rather than
              // taking a band of its own — two rows of chrome over a ~209px map is
              // most of the map. `right-16` reserves the FAB's corner (58px plus its
              // margins); the chip and CloseDayButton are both compact at this width,
              // so all three fit the row. The zoom stack that used to sit here is
              // hidden at base, which is what freed the space.
              <div
                data-testid="navigate-chrome"
                className="absolute top-3 right-16 left-3 z-[1001] flex flex-wrap items-center gap-2 lg:right-auto lg:flex-nowrap"
              >
                <div className="bg-primary text-primary-foreground rounded-full px-3 py-1 text-xs font-semibold shadow">
                  {navigateStatusLabel}
                </div>
                {!inReachIsSource && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleToggleSharing}
                    className="rounded-full shadow"
                  >
                    {sharing ? "Stop sharing" : "Share my position"}
                  </Button>
                )}
                {isLeader && tripId && <CloseDayButton tripId={tripId} />}
              </div>
            )}
            <MapCore
              points={orderedPoints}
              days={allDaysForMap}
              distanceUnit={distanceUnit}
              viewMode={viewMode}
              selectedDayId={selectedDayId}
              selectedPointId={selectedPointId}
              selectedHour={selectedHour}
              flyToPoint={flyToPoint}
              itineraryId={itinerary.id ?? ""}
              canManageDiamonds
              canManagePlaces
              onMapClick={handleMapClick}
              onMarkerDragEnd={handleMarkerDragEnd}
              onMarkerDragMove={handleMarkerDragMove}
              onMarkerClick={handleMarkerClick}
              onLegClick={handleLegClick}
              avgSpeedKnots={avgSpeedKnots}
              livePositions={navigateMode ? liveStream.positions : []}
              discardablePointId={discardablePointId}
              onUndoPendingPoint={handleUndoPendingPoint}
            />
            {viewMode && <PointDetailSheet />}
          </div>
          {viewMode ? <FeatureDrawer /> : <PointListPane />}
        </div>
      </div>
    </MapBuilderContext.Provider>
  )
}
