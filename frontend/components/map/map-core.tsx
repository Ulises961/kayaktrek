"use client"
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import { MapContainer, TileLayer, Polyline, Circle, useMap, useMapEvents } from "react-leaflet"
import L from "leaflet"
import type { ControlPosition, LeafletMouseEvent } from "leaflet"
import "leaflet/dist/leaflet.css"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"
import { PointMarker } from "./point-marker"
import { dayRouteLegs, legLabel, type DistanceUnit } from "@/lib/itinerary/distance"
import { dayRouteGroups } from "@/lib/itinerary/day-points"
import { getDayColor } from "@/lib/itinerary/colors"
import { buildBoundaryColorMap, resolveLegDayNumber } from "@/lib/itinerary/day-boundaries"
import { numberByOrder } from "@/lib/itinerary/linked-list"
import { splitRingIcon } from "./ring-icon"
import { cn } from "@/lib/utils"
import { VelocityLayer } from "@/components/weather/velocity-layer"
import { Graticule, ScaleBar, ForecastCellShell, type ForecastCellLayer } from "./chart"
import { useIsBelowBreakpoint } from "@/hooks/use-mobile"
import { discCell, maskGridToDisc } from "@/lib/landing/ambient-wind"
import { LayersControl } from "./layers-control"
import { TidalDiamondMarker } from "./tidal-diamond-marker"
import { TidalDiamondForm } from "./tidal-diamond-form"
import { PlaceMarker } from "./place-marker"
import { PlaceForm } from "./place-form"
import { WindDiamondMarker } from "./wind-diamond-marker"
import { WindDiamondForm } from "./wind-diamond-form"
import { HazardPositionMarker } from "./hazard-position-marker"
import { MapAddControl } from "./map-add-control"
import { ResizeHandler } from "./resize-handler"
import { MapCredits } from "./map-credits"
import { LivePositionLayer } from "./live-position-layer"
import type { LivePosition } from "@/lib/dtos/live-position"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  fetchWindVectors,
  fetchWaveVectors,
  fetchTidalDiamonds,
  fetchGlobalWindVectors,
  createTidalDiamond,
  editTidalDiamond,
  fetchTidalDiamondForEdit,
  repositionTidalDiamond,
  deleteTidalDiamond,
} from "@/lib/weather/actions"
import {
  fetchPlaceCategories,
  fetchPlaces,
  createPlace,
  updatePlace,
  repositionPlace,
  deletePlace,
} from "@/lib/places/actions"
import {
  fetchWindDiamonds,
  createWindDiamond,
  updateWindDiamond,
  repositionWindDiamond,
  deleteWindDiamond,
} from "@/lib/wind-diamonds/actions"
import { fetchNearbyHazardPositions } from "@/lib/map/hazard-positions/actions"
import type { VelocityGridData } from "@/lib/types/ui"
import {
  OSM_TILE_URL,
  SEAMARK_TILE_URL,
  OSM_ATTRIBUTION,
  SEAMARK_ATTRIBUTION,
} from "@/lib/map/tiles"
import {
  diamondEditToFormValues,
  type TidalDiamond,
  type TidalDiamondForm as TidalDiamondFormValues,
} from "@/lib/dtos/tidal-station"
import {
  placeToFormValues,
  type PlaceCategory,
  type PlaceWithOwnership,
  type PlaceForm as PlaceFormValues,
} from "@/lib/dtos/place"
import {
  windDiamondToFormValues,
  type WindDiamond,
  type WindDiamondForm as WindDiamondFormValues,
} from "@/lib/dtos/wind-diamond"
import type { HazardDiamondPosition } from "@/lib/dtos/hazard-diamond"

export type FlyToTarget = { id: string; lat: number; lng: number }

export type MapCoreProps = {
  // Points already sorted in route order by MapBuilder — no walkList needed here.
  points: Point[]
  days: Day[]
  distanceUnit: DistanceUnit
  avgSpeedKnots?: number
  viewMode?: boolean
  selectedDayId?: string | null
  // The point whose leg the map is currently answering for. A stop states its leg
  // unasked; a pass-through position states it only when the user asks, which is
  // what clicking it means.
  selectedPointId?: string | null
  selectedHour?: number
  flyToPoint?: FlyToTarget | null
  // Itinerary that user-created tidal diamonds are scoped to. Required for the
  // drop-a-pin create flow; absent on the public/unauthenticated map.
  itineraryId?: string
  // Any trip member may add/move/delete diamonds. Off by default so the public
  // map and edit-only contexts never expose the affordance.
  canManageDiamonds?: boolean
  // Any trip member may add places; edit/move/delete is creator-only (gated per
  // marker on place.mine). Off by default for the public/read-only map.
  canManagePlaces?: boolean
  onMapClick: (lat: number, lng: number) => Promise<void>
  onMarkerDragEnd: (pointId: string, lat: number, lng: number) => void
  onMarkerDragMove: (pointId: string, lat: number, lng: number) => void
  onMarkerClick?: (pointId: string) => void
  // Dropping a point on a leg — the gesture for inserting mid-route. Absent in
  // view mode and on the public map, where the legs are not editable.
  onLegClick?: (afterPointId: string, lat: number, lng: number) => void
  // Crew positions broadcast during Navigate mode (M8). Absent/empty outside a
  // happening trip — MapBuilder only ever populates this while navigateMode is on.
  livePositions?: LivePosition[]
}

// Module-level constants so options objects are stable across renders.
// leaflet-velocity needs hex colors — CSS custom properties are not resolved by canvas.
// Wind: saturated calm-blue → gale-red ramp. The earlier Spectral palette had pastel
// green/yellow midtones (the most common light-wind range) that washed out against the
// light-blue sea tiles, so every stop here is high-chroma to stay legible over water.
const WIND_SCALE = [
  "#0d47a1",
  "#0091ea",
  "#00bfa5",
  "#00c853",
  "#aeea00",
  "#ffd600",
  "#ff9100",
  "#ff3d00",
  "#d50000",
]
// Particle density (particleMultiplier) and lineWidth are tuned sparser + thicker
// across all layers so individual streaks read clearly instead of blurring into a
// dense field. velocityScale is left forecast-driven — particle speed reflects the
// actual modelled wind/wave/stream speed, not a cosmetic constant.
const WIND_OPTIONS = {
  velocityScale: 0.005,
  colorScale: WIND_SCALE,
  particleAge: 64,
  lineWidth: 2.5,
  particleMultiplier: 0.0016,
}
// Swell: white — direction matters more than speed, matches standard chart convention.
const SWELL_OPTIONS = {
  velocityScale: 0.012,
  colorScale: ["#ffffff", "#e8f4fc"],
  particleAge: 90,
  lineWidth: 3.5,
  particleMultiplier: 0.0014,
}
// Global background: sparser, slower particles to show large-scale atmospheric context.
// §8b fills the data; for now the backend stub returns an empty grid.
const GLOBAL_WIND_OPTIONS = {
  velocityScale: 0.003,
  colorScale: WIND_SCALE,
  particleAge: 120,
  lineWidth: 1,
  particleMultiplier: 0.002,
}

// Tailwind's `lg`. The chart furniture keys off this rather than `md`: the panes
// return beside the map at `md` and take 414px of it, so the map column at a 768
// viewport is 264px — narrower than the 311px the same map gets on a phone.
const LG_BREAKPOINT = 1024

// Driven through the existing control's `setPosition` rather than
// `zoomControl={false}` plus a replacement, because react-leaflet reads that prop
// once at construction.
const BOTTOM_LEFT: ControlPosition = "bottomleft"

type ValidPoint = Point & { latitude: number; longitude: number }

type DragState = { id: string; lat: number; lng: number }

type Segment = {
  key: string
  positions: [[number, number], [number, number]]
  color: string
  dayNum: number
  // The point this leg leaves from — the predecessor a point dropped on this leg
  // is spliced in after. Null when the leg starts at an unsaved point.
  afterId: string | null
}

function resolvePosition(
  point: ValidPoint,
  drag: DragState | null,
): { latitude: number; longitude: number } {
  if (drag && point.id === drag.id) return { latitude: drag.lat, longitude: drag.lng }
  return point
}

function buildSegments(
  ordered: ValidPoint[],
  dayNumberById: Map<string | undefined, number>,
  boundaryPointIds: Set<string>,
  drag: DragState | null,
): Segment[] {
  const segments: Segment[] = []
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = resolvePosition(ordered[i], drag)
    const b = resolvePosition(ordered[i + 1], drag)
    const dayNumA = dayNumberById.get(ordered[i].dayId ?? undefined) ?? 0
    const dayNumB = dayNumberById.get(ordered[i + 1].dayId ?? undefined) ?? 0
    const dayNum = resolveLegDayNumber(
      dayNumA,
      dayNumB,
      ordered[i].id != null && boundaryPointIds.has(ordered[i].id!),
    )
    segments.push({
      key: `${ordered[i].id ?? i}-${ordered[i + 1].id ?? i + 1}`,
      afterId: ordered[i].id ?? null,
      positions: [
        [a.latitude, a.longitude],
        [b.latitude, b.longitude],
      ],
      color: getDayColor(dayNum),
      dayNum,
    })
  }
  return segments
}

// ── FlyToController ───────────────────────────────────────────────────────────

/**
 * How many pixels of the map's bottom edge are hidden behind the point summary.
 *
 * Measured from the element rather than assumed, because the same card lives in
 * two places: floating over the map from `md`, and as a segment of the bottom
 * sheet below it at base — where it is a sibling of the map and covers none of
 * it. `offsetParent` is null for a `display:none` element, which is how the
 * hidden one of the pair is skipped.
 */
function coveredMapHeight(container: HTMLElement): number {
  let covered = 0
  for (const el of document.querySelectorAll<HTMLElement>('[data-testid="point-detail-sheet"]')) {
    // `offsetParent` is null for a `display:none` element, which is how the hidden
    // one of the pair is skipped. Requiring that it also contains the map is what
    // separates the two: the floating card is absolutely positioned inside the same
    // box as the map, while the segment's nearest positioned ancestor is the sheet,
    // which the map is not inside.
    const anchor = el.offsetParent
    if (!anchor || !anchor.contains(container)) continue
    // `offsetHeight`, not `getBoundingClientRect`: the card enters on a
    // `slide-in-from-bottom` animation and this runs inside that window, so its
    // transformed box is still below where it settles and reads as covering nothing.
    // Layout height ignores the transform.
    covered = Math.max(covered, el.offsetHeight)
  }
  return Math.min(covered, container.clientHeight)
}

function FlyToController({ flyToPoint }: { flyToPoint: FlyToTarget | null | undefined }) {
  const map = useMap()
  const prevIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!flyToPoint) {
      prevIdRef.current = null
      return
    }
    if (flyToPoint.id === prevIdRef.current) return
    prevIdRef.current = flyToPoint.id

    const zoom = 13
    // Centre the point in the part of the map still visible under the summary
    // card, by shifting the map's centre down half of whatever the card covers.
    //
    // This used to offset by 27.5% of `window.innerHeight` — a figure about the
    // window rather than about the map, and one that only looked right because on
    // a desktop the map is most of the window. At 320 the map is ~209px tall
    // inside a 700px window, so it pushed the target nearly a full map-height off
    // and the point landed somewhere else entirely.
    const container = map.getContainer()
    const shift = coveredMapHeight(container) / 2
    const target: [number, number] = [flyToPoint.lat, flyToPoint.lng]
    if (shift < 1) {
      map.flyTo(target, zoom, { animate: true, duration: 0.6 })
      return
    }
    const px = map.project(target, zoom)
    map.flyTo(map.unproject([px.x, px.y + shift], zoom), zoom, { animate: true, duration: 0.6 })
  }, [flyToPoint, map])

  return null
}

// ── FitBoundsController ───────────────────────────────────────────────────────

// On first load, frame the map around the actual route rather than the continent-scale
// default zoom — a kayak trip spans at most a few hundred miles, so a far-out view just
// collapses the itinerary and velocity layers. Fits once: it does not re-frame while the
// user edits (that would yank the view every time a pin is dropped). maxZoom caps how far
// in a single point / tight cluster zooms.
function FitBoundsController({ points }: { points: ValidPoint[] }) {
  const map = useMap()
  const hasFitRef = useRef(false)

  useEffect(() => {
    if (hasFitRef.current || points.length === 0) return
    const lats = points.map((p) => p.latitude)
    const lngs = points.map((p) => p.longitude)
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lats), Math.min(...lngs)],
      [Math.max(...lats), Math.max(...lngs)],
    ]
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 13 })
    hasFitRef.current = true
  }, [points, map])

  return null
}

// ── ZoomCorner ────────────────────────────────────────────────────────────────

// Leaflet defaults the zoom control to the top-left. It lives in the bottom-left
// here instead, at every width — paired with the layers toggle bottom-right and
// the Annotate FAB top-right, so a control is in the same corner on a phone as on
// a desktop and there is nothing to re-find when the window changes size.
function ZoomCorner() {
  const map = useMap()
  useEffect(() => {
    map.zoomControl?.setPosition(BOTTOM_LEFT)
  }, [map])
  return null
}

// ── MapEvents ─────────────────────────────────────────────────────────────────

function MapEvents({ onMapClick }: { onMapClick: (lat: number, lng: number) => Promise<void> }) {
  useMapEvents({
    click(e) {
      onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// ── DiamondPlacer ───────────────────────────────────────────────────────────

// Mounted only while the user is placing a new tidal diamond. Captures the next
// map click as the diamond's location — works in view mode too, where the route
// MapEvents handler is not mounted.
function DiamondPlacer({ onPlace }: { onPlace: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPlace(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// ── ConnectedMarker ───────────────────────────────────────────────────────────

type ConnectedMarkerProps = {
  point: ValidPoint
  index: number
  dayNum: number
  boundaryColors: { left: string; right: string } | null
  draggable?: boolean
  label?: string | null
  onMarkerDragMove: (pointId: string, lat: number, lng: number) => void
  onMarkerDragEnd: (pointId: string, lat: number, lng: number) => void
  onMarkerClick?: (pointId: string) => void
}

const ConnectedMarker = memo(function ConnectedMarker({
  point,
  index,
  dayNum,
  boundaryColors,
  draggable = true,
  label,
  onMarkerDragMove,
  onMarkerDragEnd,
  onMarkerClick,
}: ConnectedMarkerProps) {
  const color = getDayColor(dayNum)

  // Memoize split icon when this is a boundary point. Regular icon is computed
  // inside PointMarker. Splitting here keeps PointMarker unaware of day topology.
  const customIcon = useMemo(
    () =>
      boundaryColors ? splitRingIcon(boundaryColors.left, boundaryColors.right, index) : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boundaryColors?.left, boundaryColors?.right, index],
  )

  const handleDragMove = useCallback(
    (lat: number, lng: number) => {
      if (point.id) onMarkerDragMove(point.id, lat, lng)
    },
    [point.id, onMarkerDragMove],
  )

  const handleDragEnd = useCallback(
    (lat: number, lng: number) => {
      if (point.id) onMarkerDragEnd(point.id, lat, lng)
    },
    [point.id, onMarkerDragEnd],
  )

  const handleClick = useMemo(
    () => (onMarkerClick && point.id ? () => onMarkerClick(point.id!) : undefined),
    [onMarkerClick, point.id],
  )

  return (
    <PointMarker
      point={point}
      color={color}
      type={point.type}
      index={index}
      customIcon={customIcon}
      draggable={draggable}
      label={label}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
    />
  )
})

// ── MapCore ───────────────────────────────────────────────────────────────────

export default function MapCore({
  points,
  days,
  distanceUnit,
  avgSpeedKnots = 2.5,
  viewMode = false,
  selectedDayId = null,
  selectedPointId = null,
  selectedHour = 12,
  flyToPoint = null,
  itineraryId,
  canManageDiamonds = false,
  canManagePlaces = false,
  onMapClick,
  onMarkerDragEnd,
  onMarkerDragMove,
  onMarkerClick,
  onLegClick,
  livePositions = [],
}: MapCoreProps) {
  // Drives the chart-furniture branch below.
  const isCompactMap = useIsBelowBreakpoint(LG_BREAKPOINT)
  const [dragState, setDragState] = useState<DragState | null>(null)

  const [windData, setWindData] = useState<VelocityGridData | null>(null)
  const [swellData, setSwellData] = useState<VelocityGridData | null>(null)
  const [diamonds, setDiamonds] = useState<TidalDiamond[]>([])
  const [globalWindData, setGlobalWindData] = useState<VelocityGridData | null>(null)
  const [windEnabled, setWindEnabled] = useState(true)
  const [swellEnabled, setSwellEnabled] = useState(true)
  const [diamondsEnabled, setDiamondsEnabled] = useState(true)

  // Diamond entry dialog drives two flows through one form:
  //  • create — `placing` arms the next map click; `draft` holds the dropped spot
  //  • edit   — `editing` holds the diamond id + the prefilled form values
  const [placing, setPlacing] = useState(false)
  const [draft, setDraft] = useState<{ lat: number; lng: number } | null>(null)
  const [editing, setEditing] = useState<{ id: string; values: TidalDiamondFormValues } | null>(
    null,
  )
  const [mutationError, setMutationError] = useState<string | null>(null)
  const [isMutating, startMutation] = useTransition()

  // Places are itinerary-scoped (not day-scoped) so they load once and stay
  // visible across day changes. Same two-flow dialog as diamonds: create arms a
  // map click then holds the dropped spot; edit holds the place id + form values.
  const [places, setPlaces] = useState<PlaceWithOwnership[]>([])
  const [categories, setCategories] = useState<PlaceCategory[]>([])
  const [placesEnabled, setPlacesEnabled] = useState(true)
  const [placingPlace, setPlacingPlace] = useState(false)
  const [placeDraft, setPlaceDraft] = useState<{ lat: number; lng: number } | null>(null)
  const [editingPlace, setEditingPlace] = useState<{ id: string; values: PlaceFormValues } | null>(
    null,
  )
  const [placeError, setPlaceError] = useState<string | null>(null)
  const [isPlaceMutating, startPlaceMutation] = useTransition()

  // Wind diamonds are itinerary-scoped and day-agnostic, like places — same
  // two-flow dialog shape, no rate/direction data to resolve per hour.
  const [windDiamonds, setWindDiamonds] = useState<WindDiamond[]>([])
  const [windDiamondsEnabled, setWindDiamondsEnabled] = useState(true)
  const [placingWind, setPlacingWind] = useState(false)
  const [windDraft, setWindDraft] = useState<{ lat: number; lng: number } | null>(null)
  const [editingWind, setEditingWind] = useState<{
    id: string
    values: WindDiamondFormValues
  } | null>(null)
  const [windError, setWindError] = useState<string | null>(null)
  const [isWindMutating, startWindMutation] = useTransition()

  // Shared cross-trip "known hazard" positions (M27) — fetched once per
  // itinerary load, centered on the route's own centroid. Position-only, no
  // edit affordance, no toggle to disable (mirrors LivePositionLayer).
  const [hazardPositions, setHazardPositions] = useState<HazardDiamondPosition[]>([])

  const selectedDayDate = useMemo(
    () => days.find((d) => d.id === selectedDayId)?.date ?? null,
    [days, selectedDayId],
  )

  // Forecast cell — the selected day's route positions define a disc that clips
  // the wind/swell fields to a round chart annotation (M5b). The backend stamps a
  // single value across the day's bbox, so clipping the arbitrary corners is
  // information-neutral. No route points → no disc; fall back to the raw fields.
  const selectedDayPositions = useMemo<[number, number][]>(
    () =>
      points
        .filter(
          (point) =>
            (point.dayId ?? null) === selectedDayId &&
            point.latitude != null &&
            point.longitude != null,
        )
        .map((point) => [point.latitude as number, point.longitude as number]),
    [points, selectedDayId],
  )
  const forecastCell = useMemo(
    () => (selectedDayPositions.length > 0 ? discCell(selectedDayPositions) : null),
    [selectedDayPositions],
  )
  // Clip the fetched grids to the disc once (memoised so VelocityLayer keeps a
  // stable `data` reference and does not rebuild every render).
  const windCellGrid = useMemo(
    () =>
      forecastCell && windData
        ? maskGridToDisc(windData.grid, forecastCell.center, forecastCell.radiusKm)
        : null,
    [forecastCell, windData],
  )
  const swellCellGrid = useMemo(
    () =>
      forecastCell && swellData
        ? maskGridToDisc(swellData.grid, forecastCell.center, forecastCell.radiusKm)
        : null,
    [forecastCell, swellData],
  )
  const cellLayers = useMemo<ForecastCellLayer[]>(() => {
    const layers: ForecastCellLayer[] = []
    if (windCellGrid && windEnabled)
      layers.push({ key: "wind", grid: windCellGrid, options: WIND_OPTIONS })
    if (swellCellGrid && swellEnabled)
      layers.push({ key: "swell", grid: swellCellGrid, options: SWELL_OPTIONS })
    return layers
  }, [windCellGrid, swellCellGrid, windEnabled, swellEnabled])

  useEffect(() => {
    if (!selectedDayId) return
    fetchWindVectors(selectedDayId, selectedHour).then((r) =>
      setWindData(r.success ? r.data : null),
    )
    fetchWaveVectors(selectedDayId, selectedHour).then((r) =>
      setSwellData(r.success ? r.data : null),
    )
  }, [selectedDayId, selectedHour])

  // Diamonds re-resolve on day/hour change and after every mutation, so the
  // create/reposition/delete handlers all funnel through this one fetch. When no
  // day is selected we leave state untouched — the hasDiamonds guard hides the
  // markers — so the effect never sets state synchronously.
  const reloadDiamonds = useCallback(() => {
    if (!selectedDayId) return
    fetchTidalDiamonds(selectedDayId, selectedHour).then((r) =>
      setDiamonds(r.success ? r.data : []),
    )
  }, [selectedDayId, selectedHour])

  useEffect(() => {
    reloadDiamonds()
  }, [reloadDiamonds])

  const handlePlace = useCallback((lat: number, lng: number) => {
    setPlacing(false)
    setMutationError(null)
    setDraft({ lat, lng })
  }, [])

  const closeDialog = useCallback(() => {
    setDraft(null)
    setEditing(null)
    setMutationError(null)
  }, [])

  // One submit path for both flows: edit PATCHes the existing diamond, create
  // POSTs at the dropped location. Both re-resolve the markers on success.
  const handleDialogSubmit = useCallback(
    (fields: TidalDiamondFormValues) => {
      setMutationError(null)
      startMutation(async () => {
        const result = editing
          ? await editTidalDiamond(editing.id, fields)
          : itineraryId && draft
            ? await createTidalDiamond(itineraryId, draft.lat, draft.lng, fields)
            : null
        if (!result) return
        if (result.success) {
          closeDialog()
          reloadDiamonds()
        } else {
          setMutationError(result.error)
        }
      })
    },
    [editing, itineraryId, draft, reloadDiamonds, closeDialog],
  )

  const handleDiamondEdit = useCallback((id: string) => {
    setMutationError(null)
    startMutation(async () => {
      const result = await fetchTidalDiamondForEdit(id)
      if (result.success) {
        setEditing({ id, values: diamondEditToFormValues(result.data) })
      } else {
        setMutationError(result.error)
      }
    })
  }, [])

  const handleDiamondDragEnd = useCallback(
    (id: string, lat: number, lng: number) => {
      repositionTidalDiamond(id, lat, lng).then(reloadDiamonds)
    },
    [reloadDiamonds],
  )

  const handleDiamondDelete = useCallback(
    (id: string) => {
      deleteTidalDiamond(id).then(reloadDiamonds)
    },
    [reloadDiamonds],
  )

  // ── Places ──────────────────────────────────────────────────────────────────

  const reloadPlaces = useCallback(() => {
    if (!itineraryId) return
    fetchPlaces(itineraryId).then((r) => setPlaces(r.success ? r.data : []))
  }, [itineraryId])

  useEffect(() => {
    reloadPlaces()
  }, [reloadPlaces])

  // Category catalogue is needed only by the create/edit form, so it loads once
  // when the viewer can actually manage places.
  useEffect(() => {
    if (!canManagePlaces) return
    fetchPlaceCategories().then((r) => setCategories(r.success ? r.data : []))
  }, [canManagePlaces])

  const handlePlaceDrop = useCallback((lat: number, lng: number) => {
    setPlacingPlace(false)
    setPlaceError(null)
    setPlaceDraft({ lat, lng })
  }, [])

  const closePlaceDialog = useCallback(() => {
    setPlaceDraft(null)
    setEditingPlace(null)
    setPlaceError(null)
  }, [])

  const handlePlaceSubmit = useCallback(
    (fields: PlaceFormValues) => {
      setPlaceError(null)
      startPlaceMutation(async () => {
        const result = editingPlace
          ? await updatePlace(editingPlace.id, fields)
          : itineraryId && placeDraft
            ? await createPlace(itineraryId, placeDraft.lat, placeDraft.lng, fields)
            : null
        if (!result) return
        if (result.success) {
          closePlaceDialog()
          reloadPlaces()
        } else {
          setPlaceError(result.error)
        }
      })
    },
    [editingPlace, itineraryId, placeDraft, reloadPlaces, closePlaceDialog],
  )

  const handlePlaceEdit = useCallback(
    (id: string) => {
      const place = places.find((p) => p.id === id)
      if (!place) return
      setPlaceError(null)
      setEditingPlace({ id, values: placeToFormValues(place) })
    },
    [places],
  )

  const handlePlaceDragEnd = useCallback(
    (id: string, lat: number, lng: number) => {
      repositionPlace(id, lat, lng).then(reloadPlaces)
    },
    [reloadPlaces],
  )

  const handlePlaceDelete = useCallback(
    (id: string) => {
      deletePlace(id).then(reloadPlaces)
    },
    [reloadPlaces],
  )

  // ── Wind diamonds ─────────────────────────────────────────────────────────────

  const reloadWindDiamonds = useCallback(() => {
    if (!itineraryId) return
    fetchWindDiamonds(itineraryId).then((r) => setWindDiamonds(r.success ? r.data : []))
  }, [itineraryId])

  useEffect(() => {
    reloadWindDiamonds()
  }, [reloadWindDiamonds])

  const handleWindPlace = useCallback((lat: number, lng: number) => {
    setPlacingWind(false)
    setWindError(null)
    setWindDraft({ lat, lng })
  }, [])

  const closeWindDialog = useCallback(() => {
    setWindDraft(null)
    setEditingWind(null)
    setWindError(null)
  }, [])

  const handleWindSubmit = useCallback(
    (fields: WindDiamondFormValues) => {
      setWindError(null)
      startWindMutation(async () => {
        const result = editingWind
          ? await updateWindDiamond(editingWind.id, fields)
          : itineraryId && windDraft
            ? await createWindDiamond(itineraryId, windDraft.lat, windDraft.lng, fields)
            : null
        if (!result) return
        if (result.success) {
          closeWindDialog()
          reloadWindDiamonds()
        } else {
          setWindError(result.error)
        }
      })
    },
    [editingWind, itineraryId, windDraft, reloadWindDiamonds, closeWindDialog],
  )

  const handleWindDiamondEdit = useCallback(
    (id: string) => {
      const diamond = windDiamonds.find((d) => d.id === id)
      if (!diamond) return
      setWindError(null)
      setEditingWind({ id, values: windDiamondToFormValues(diamond) })
    },
    [windDiamonds],
  )

  const handleWindDiamondDragEnd = useCallback(
    (id: string, lat: number, lng: number) => {
      repositionWindDiamond(id, lat, lng).then(reloadWindDiamonds)
    },
    [reloadWindDiamonds],
  )

  const handleWindDiamondDelete = useCallback(
    (id: string) => {
      deleteWindDiamond(id).then(reloadWindDiamonds)
    },
    [reloadWindDiamonds],
  )

  // ── Hazard positions (M27) ────────────────────────────────────────────────────

  // The itinerary's own route centroid — a reasonable center for a single,
  // generous-radius query that covers the whole route without depending on
  // which day is selected. Recomputed only when the route's own points change,
  // not on every render.
  const itineraryCentroid = useMemo<{ lat: number; lng: number } | null>(() => {
    const located = points.filter((p) => p.latitude != null && p.longitude != null)
    if (located.length === 0) return null
    const lat = located.reduce((sum, p) => sum + (p.latitude as number), 0) / located.length
    const lng = located.reduce((sum, p) => sum + (p.longitude as number), 0) / located.length
    return { lat, lng }
  }, [points])

  useEffect(() => {
    if (!itineraryId || !itineraryCentroid) return
    fetchNearbyHazardPositions(itineraryCentroid.lat, itineraryCentroid.lng, 50).then((r) =>
      setHazardPositions(r.success ? r.data : []),
    )
    // Fires once per itinerary load and once more if the route had no located
    // points yet (centroid null → available) — not re-run on every point drag,
    // since the centroid shifting slightly mid-edit isn't worth a request per
    // gesture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itineraryId, itineraryCentroid !== null])

  useEffect(() => {
    if (!selectedDayId || !selectedDayDate) return
    let cancelled = false
    fetchGlobalWindVectors(selectedDayDate, selectedHour).then((r) => {
      if (!cancelled) setGlobalWindData(r.success ? r.data : null)
    })
    return () => {
      cancelled = true
    }
  }, [selectedDayId, selectedDayDate, selectedHour])

  const selectedDayNum = useMemo(
    () => (selectedDayId ? (days.find((d) => d.id === selectedDayId)?.dayNumber ?? null) : null),
    [selectedDayId, days],
  )

  const dayNumberById = useMemo(() => new Map(days.map((d) => [d.id, d.dayNumber ?? 0])), [days])

  // Point id → { left, right } colors for split-ring markers at shared
  // day boundaries — derivation shared with the public/explore renderers
  // via lib/itinerary/day-boundaries.
  const boundaryMap = useMemo(() => buildBoundaryColorMap(days), [days])

  const boundaryPointIds = useMemo(() => new Set(Object.keys(boundaryMap)), [boundaryMap])

  const pointIndexById = useMemo(() => numberByOrder(points), [points])

  const validPoints = points.filter(
    (p): p is ValidPoint => p.latitude != null && p.longitude != null,
  )

  const segments = buildSegments(validPoints, dayNumberById, boundaryPointIds, dragState)

  // On-map distance labels (decided in docs/adr/itinerary-frontend.md): each stop —
  // and, while planning, the route's growing tip — carries its leg from the previous
  // stop, the stretch paddled to reach it, so the stops read as steps. Viewing
  // scopes to the selected day for a clean overview; planning labels every day since
  // you're building the whole route.
  //
  // A pass-through position gets the same figure, but only while it is the selected
  // point: labelling every position permanently is the noise stop-to-stop legs exist
  // to remove, yet "how far is it to here?" is exactly the question behind promoting
  // one to a stop. Clicking it asks; this answers.
  //
  // Legs are walked per day *seeded from the previous point in route order*
  // (dayRouteGroups), so the first point of a day reports the crossing from the
  // overnight stop the previous day owns rather than nothing at all.
  const stopLabelById = new Map<string, string>()
  const labelDayIds = viewMode
    ? selectedDayId != null
      ? [selectedDayId]
      : []
    : Array.from(new Set(validPoints.map((p) => p.dayId ?? null)))
  const dayGroups = dayRouteGroups(validPoints)
  for (const dayId of labelDayIds) {
    const group = dayGroups.get(dayId)
    if (!group) continue
    for (const leg of dayRouteLegs(group.seed, group.own)) {
      if (leg.isStart || !leg.point.id) continue
      if (!leg.isAnchor && leg.point.id !== selectedPointId) continue
      stopLabelById.set(leg.point.id, legLabel(leg.legNm, avgSpeedKnots, distanceUnit))
    }
  }

  const handleMarkerDragMove = useCallback(
    (id: string, lat: number, lng: number) => {
      setDragState({ id, lat, lng })
      onMarkerDragMove(id, lat, lng)
    },
    [onMarkerDragMove],
  )

  const handleMarkerDragEnd = useCallback(
    (id: string, lat: number, lng: number) => {
      setDragState(null)
      onMarkerDragEnd(id, lat, lng)
    },
    [onMarkerDragEnd],
  )

  const hasDiamonds = selectedDayId !== null && diamonds.length > 0
  const hasPlaces = places.length > 0
  const hasWindDiamonds = windDiamonds.length > 0

  // Add-action availability. Places and wind diamonds are itinerary-scoped;
  // tidal diamonds resolve per day, so their entry needs a selected day.
  const canAddPlace = canManagePlaces
  const canAddDiamond = canManageDiamonds && selectedDayId != null
  const canAddWindDiamond = canManageDiamonds

  return (
    <div
      className={cn(
        "relative h-full w-full",
        (!viewMode || placing || placingPlace || placingWind) &&
          "[&_.leaflet-container]:cursor-crosshair",
      )}
    >
      {/* `builder-map` is the hook for the bottom-left zoom rule in globals.css,
          which has to be unlayered to beat Leaflet's own stylesheet. */}
      <MapContainer center={[43, 13]} zoom={9} className="builder-map h-full w-full" zoomControl>
        <ZoomCorner />
        <TileLayer attribution={OSM_ATTRIBUTION} url={OSM_TILE_URL} />
        {/* OpenSeaMap seamark overlay — transparent nautical chart tiles (buoys, beacons,
            depth/seamark data) layered over the OSM base. Default-on: go/no-go relevant
            for kayak planning. Decided in docs/adr/itinerary-frontend.md. */}
        <TileLayer attribution={SEAMARK_ATTRIBUTION} url={SEAMARK_TILE_URL} />

        {/* Nautical-chart furniture — a real lat/lon graticule and a scale bar,
            reused from the landing chart (M5b). The grid runs edge-to-edge,
            underneath the top control row (zoom control, Overlays toggle, the
            "+ Add" disclosure) — it should read as genuinely part of the map
            surface, not visibly inset from it.

            From `md` only (M18 §4). On a phone the map is roughly 311×209 with
            the day sheet open, and a full-width scale bar plus a degree mesh
            spend a real share of it on decoration: the graticule's labels and
            the bar's ruler cost more of the chart than they explain at that
            size. This is the one branch here that cannot be a CSS class —
            these render into Leaflet's own panes, not into our tree, so there
            is nothing for a `md:` prefix to attach to. Presentation only: no
            state and no interaction differs by width. */}
        {!isCompactMap && (
          <>
            <Graticule />
            <ScaleBar placement="bottom-center" />
          </>
        )}

        {!viewMode && !placing && !placingPlace && !placingWind && (
          <MapEvents onMapClick={onMapClick} />
        )}
        {placing && <DiamondPlacer onPlace={handlePlace} />}
        {placingPlace && <DiamondPlacer onPlace={handlePlaceDrop} />}
        {placingWind && <DiamondPlacer onPlace={handleWindPlace} />}
        <ResizeHandler />
        <MapCredits />
        <FitBoundsController points={validPoints} />
        <FlyToController flyToPoint={flyToPoint} />

        {segments.map((seg) => {
          const dimmed =
            selectedDayNum !== null && seg.dayNum !== selectedDayNum && seg.dayNum !== 0
          return (
            <Polyline
              key={`${seg.key}-${seg.color}`}
              positions={seg.positions}
              color={seg.color}
              weight={
                dimmed ? 2 : selectedDayNum !== null && seg.dayNum === selectedDayNum ? 3.5 : 2.5
              }
              opacity={dimmed ? 0.2 : 0.85}
            />
          )
        })}

        {/* Leg hit targets, edit mode only. The drawn line is 2.5px, which is not a
            finger, so each leg carries a wide near-transparent twin that takes the
            tap. Leaflet's `visibleStroke` pointer-events would hit-test a fully
            transparent stroke too, but 0.01 keeps that from depending on it. */}
        {!viewMode &&
          onLegClick &&
          segments.map((seg) =>
            seg.afterId ? (
              <Polyline
                key={`insert-${seg.key}`}
                positions={seg.positions}
                pathOptions={{ color: seg.color, weight: 18, opacity: 0.01 }}
                interactive
                eventHandlers={{
                  click: (e: LeafletMouseEvent) => {
                    // Leaflet bubbles a path click up to the map, which in edit mode
                    // appends a point to the end of the route — the opposite of what
                    // was asked for.
                    L.DomEvent.stopPropagation(e)
                    onLegClick(seg.afterId!, e.latlng.lat, e.latlng.lng)
                  },
                }}
              />
            ) : null,
          )}

        {validPoints.map((point) => (
          <ConnectedMarker
            key={point.id ?? `${point.latitude},${point.longitude}`}
            point={point}
            index={point.id ? (pointIndexById.get(point.id) ?? 0) : 0}
            dayNum={dayNumberById.get(point.dayId ?? undefined) ?? 0}
            boundaryColors={point.id ? (boundaryMap[point.id] ?? null) : null}
            draggable={!viewMode}
            label={point.id ? (stopLabelById.get(point.id) ?? null) : null}
            onMarkerDragMove={handleMarkerDragMove}
            onMarkerDragEnd={handleMarkerDragEnd}
            onMarkerClick={onMarkerClick}
          />
        ))}

        {/* Large-scale atmospheric context — real spatial OpenMeteo grid, not
            disc-clipped (clipping a genuine spatial field would drop real data). */}
        {selectedDayId && globalWindData && windEnabled && (
          <VelocityLayer data={globalWindData.grid} options={GLOBAL_WIND_OPTIONS} />
        )}
        {/* Day wind + swell as one round forecast cell: shared disc, one ring and
            note. When the day has no route points, fall back to the raw fields. */}
        {selectedDayId && forecastCell && cellLayers.length > 0 && (
          <ForecastCellShell
            layers={cellLayers}
            center={forecastCell.center}
            radiusKm={forecastCell.radiusKm}
          />
        )}
        {selectedDayId && !forecastCell && windData && windEnabled && (
          <VelocityLayer data={windData.grid} options={WIND_OPTIONS} />
        )}
        {selectedDayId && !forecastCell && swellData && swellEnabled && (
          <VelocityLayer data={swellData.grid} options={SWELL_OPTIONS} />
        )}
        {hasDiamonds &&
          diamondsEnabled &&
          diamonds.map((d) => (
            <TidalDiamondMarker
              key={d.id}
              diamond={d}
              editable={canManageDiamonds && d.isUserCreated}
              onDragEnd={(lat, lng) => handleDiamondDragEnd(d.id, lat, lng)}
              onEdit={() => handleDiamondEdit(d.id)}
              onDelete={() => handleDiamondDelete(d.id)}
            />
          ))}

        {/* Places — itinerary-scoped marks, day-independent. Creator-only edit. */}
        {hasPlaces &&
          placesEnabled &&
          places.map((place) => (
            <PlaceMarker
              key={place.id}
              place={place}
              editable={canManagePlaces && place.mine}
              onDragEnd={(lat, lng) => handlePlaceDragEnd(place.id, lat, lng)}
              onEdit={() => handlePlaceEdit(place.id)}
              onDelete={() => handlePlaceDelete(place.id)}
            />
          ))}

        {/* Wind diamonds — itinerary-scoped, day-independent static hazard
            reminders. Any trip member may edit — no creator-only gate. */}
        {hasWindDiamonds &&
          windDiamondsEnabled &&
          windDiamonds.map((d) => (
            <WindDiamondMarker
              key={d.id}
              diamond={d}
              editable={canManageDiamonds}
              onDragEnd={(lat, lng) => handleWindDiamondDragEnd(d.id, lat, lng)}
              onEdit={() => handleWindDiamondEdit(d.id)}
              onDelete={() => handleWindDiamondDelete(d.id)}
            />
          ))}

        {/* Shared cross-trip "known hazard" positions (M27) — position only,
            never this trip's own diamonds (those render fully above). */}
        {hazardPositions.map((p) => (
          <HazardPositionMarker key={`${p.kind}-${p.id}`} position={p} />
        ))}

        {/* Draft pin shown while an entry dialog is open over the chosen spot. */}
        {(draft || placeDraft || windDraft) && (
          <Circle
            center={[
              (draft ?? placeDraft ?? windDraft)!.lat,
              (draft ?? placeDraft ?? windDraft)!.lng,
            ]}
            radius={60}
            pathOptions={{ color: "#0ea5e9", weight: 2, fillOpacity: 0.2 }}
            interactive={false}
          />
        )}

        <LivePositionLayer positions={livePositions} />
      </MapContainer>

      {(selectedDayId || hasPlaces || hasWindDiamonds) && (
        <LayersControl
          windEnabled={windEnabled}
          swellEnabled={swellEnabled}
          diamondsEnabled={diamondsEnabled}
          hasDiamonds={hasDiamonds}
          windDiamondsEnabled={windDiamondsEnabled}
          hasWindDiamonds={hasWindDiamonds}
          placesEnabled={placesEnabled}
          hasPlaces={hasPlaces}
          showConditions={selectedDayId != null}
          onWindToggle={() => setWindEnabled((e) => !e)}
          onSwellToggle={() => setSwellEnabled((e) => !e)}
          onDiamondsToggle={() => setDiamondsEnabled((e) => !e)}
          onWindDiamondsToggle={() => setWindDiamondsEnabled((e) => !e)}
          onPlacesToggle={() => setPlacesEnabled((e) => !e)}
        />
      )}

      {/* Drop-a-pin affordances, consolidated into a top-centre "+ Add" disclosure
          (the create-action counterpart to the top-right Overlays control). Clear
          of the top-left zoom control and the bottom point-detail sheet. The
          tidal-diamond entry needs a selected day; places and wind diamonds are
          itinerary-scoped. Arming one disarms the others. */}
      {itineraryId && (canAddPlace || canAddDiamond || canAddWindDiamond) && (
        <MapAddControl
          canAddPlace={canAddPlace}
          canAddDiamond={canAddDiamond}
          canAddWindDiamond={canAddWindDiamond}
          placingMode={placing ? "diamond" : placingPlace ? "place" : placingWind ? "wind" : null}
          onStartPlace={() => {
            setPlacing(false)
            setPlacingPlace(true)
            setPlacingWind(false)
          }}
          onStartDiamond={() => {
            setPlacingPlace(false)
            setPlacing(true)
            setPlacingWind(false)
          }}
          onStartWindDiamond={() => {
            setPlacingPlace(false)
            setPlacing(false)
            setPlacingWind(true)
          }}
          onCancel={() => {
            setPlacing(false)
            setPlacingPlace(false)
            setPlacingWind(false)
          }}
        />
      )}

      <Dialog
        open={draft != null || editing != null}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit tidal diamond" : "New tidal diamond"}</DialogTitle>
          </DialogHeader>
          {/* Remount per flow so the field array resets cleanly between create
              (empty) and edit (prefilled). */}
          <TidalDiamondForm
            key={editing?.id ?? "create"}
            values={editing?.values}
            submitLabel={editing ? "Save changes" : "Save diamond"}
            isPending={isMutating}
            error={mutationError}
            onSubmit={handleDialogSubmit}
            onCancel={closeDialog}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={placeDraft != null || editingPlace != null}
        onOpenChange={(open) => {
          if (!open) closePlaceDialog()
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingPlace ? "Edit place" : "New place"}</DialogTitle>
          </DialogHeader>
          {/* Remount per flow so the fields reset cleanly between create (empty)
              and edit (prefilled). */}
          <PlaceForm
            key={editingPlace?.id ?? "create"}
            categories={categories}
            values={editingPlace?.values}
            submitLabel={editingPlace ? "Save changes" : "Save place"}
            isPending={isPlaceMutating}
            error={placeError}
            onSubmit={handlePlaceSubmit}
            onCancel={closePlaceDialog}
          />
        </DialogContent>
      </Dialog>

      <Dialog
        open={windDraft != null || editingWind != null}
        onOpenChange={(open) => {
          if (!open) closeWindDialog()
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingWind ? "Edit wind diamond" : "New wind diamond"}</DialogTitle>
          </DialogHeader>
          {/* Remount per flow so the fields reset cleanly between create (empty)
              and edit (prefilled). */}
          <WindDiamondForm
            key={editingWind?.id ?? "create"}
            values={editingWind?.values}
            submitLabel={editingWind ? "Save changes" : "Save wind diamond"}
            isPending={isWindMutating}
            error={windError}
            onSubmit={handleWindSubmit}
            onCancel={closeWindDialog}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
