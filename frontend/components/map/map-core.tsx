"use client"
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react"
import {
  MapContainer,
  TileLayer,
  Polyline,
  Tooltip,
  Circle,
  useMap,
  useMapEvents,
} from "react-leaflet"
import "leaflet/dist/leaflet.css"
import { Plus } from "lucide-react"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"
import { PointMarker } from "./point-marker"
import { haversineNm, legLabel } from "@/lib/itinerary/distance"
import { getDayColor } from "@/lib/itinerary/colors"
import { splitRingIcon } from "./ring-icon"
import { cn } from "@/lib/utils"
import { VelocityLayer } from "@/components/weather/velocity-layer"
import { LayersControl } from "./layers-control"
import { TidalDiamondMarker } from "./tidal-diamond-marker"
import { TidalDiamondForm } from "./tidal-diamond-form"
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
import type { VelocityGridData } from "@/lib/types/ui"
import {
  diamondEditToFormValues,
  type TidalDiamond,
  type TidalDiamondForm as TidalDiamondFormValues,
} from "@/lib/dtos/tidal-station"

export type FlyToTarget = { id: string; lat: number; lng: number }

export type MapCoreProps = {
  // Points already sorted in route order by MapBuilder — no walkList needed here.
  points: Point[]
  days: Day[]
  distanceUnit: "nm" | "km"
  avgSpeedKnots?: number
  viewMode?: boolean
  selectedDayId?: string | null
  selectedHour?: number
  flyToPoint?: FlyToTarget | null
  // Itinerary that user-created tidal diamonds are scoped to. Required for the
  // drop-a-pin create flow; absent on the public/unauthenticated map.
  itineraryId?: string
  // Any trip member may add/move/delete diamonds. Off by default so the public
  // map and edit-only contexts never expose the affordance.
  canManageDiamonds?: boolean
  onMapClick: (lat: number, lng: number) => Promise<void>
  onMarkerDragEnd: (pointId: string, lat: number, lng: number) => void
  onMarkerDragMove: (pointId: string, lat: number, lng: number) => void
  onMarkerClick?: (pointId: string) => void
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

type ValidPoint = Point & { latitude: number; longitude: number }

type DragState = { id: string; lat: number; lng: number }

type Segment = {
  key: string
  positions: [[number, number], [number, number]]
  color: string
  distLabel: string
  dayNum: number
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
  distanceUnit: "nm" | "km",
  avgSpeedKnots: number,
  drag: DragState | null,
): Segment[] {
  const segments: Segment[] = []
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = resolvePosition(ordered[i], drag)
    const b = resolvePosition(ordered[i + 1], drag)
    const dayNumA = dayNumberById.get(ordered[i].dayId ?? undefined) ?? 0
    const dayNumB = dayNumberById.get(ordered[i + 1].dayId ?? undefined) ?? 0
    // A leg takes the colour of the day both endpoints agree on:
    //   • both unassigned → grey
    //   • same day → that day's colour
    //   • A is a split-ring boundary stop and B is the immediately following day
    //     → B's colour (the matching right-half of the split ring)
    //   • otherwise (cross-day discontinuity, no shared colour) → grey
    let dayNum: number
    if (dayNumA === 0 || dayNumB === 0) {
      dayNum = 0
    } else if (dayNumA === dayNumB) {
      dayNum = dayNumA
    } else if (
      ordered[i].id != null &&
      boundaryPointIds.has(ordered[i].id!) &&
      dayNumB === dayNumA + 1
    ) {
      dayNum = dayNumB
    } else {
      dayNum = 0
    }
    segments.push({
      key: `${ordered[i].id ?? i}-${ordered[i + 1].id ?? i + 1}`,
      positions: [
        [a.latitude, a.longitude],
        [b.latitude, b.longitude],
      ],
      color: getDayColor(dayNum),
      distLabel: legLabel(haversineNm(a, b), avgSpeedKnots, distanceUnit),
      dayNum,
    })
  }
  return segments
}

// ── FlyToController ───────────────────────────────────────────────────────────

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
    // Offset the target so the point centres in the visible area above the 55vh
    // point-detail sheet rather than at the geometric centre of the viewport.
    const px = map.project([flyToPoint.lat, flyToPoint.lng], zoom)
    const sheetOffset = window.innerHeight * 0.275
    const offsetLatLng = map.unproject([px.x, px.y + sheetOffset] as [number, number], zoom)
    map.flyTo(offsetLatLng, zoom, { animate: true, duration: 0.6 })
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

// ── ResizeHandler ─────────────────────────────────────────────────────────────

// The map now shares horizontal space with the side panels (DayRail / drawer) as
// flex siblings rather than being covered by them. When a panel opens or closes,
// or the viewport changes, the map container width changes — Leaflet must be told
// to recompute its size or it renders grey tiles and misplaced markers.
function ResizeHandler() {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    observer.observe(container)
    return () => observer.disconnect()
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
  selectedHour = 12,
  flyToPoint = null,
  itineraryId,
  canManageDiamonds = false,
  onMapClick,
  onMarkerDragEnd,
  onMarkerDragMove,
  onMarkerClick,
}: MapCoreProps) {
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

  const selectedDayDate = useMemo(
    () => days.find((d) => d.id === selectedDayId)?.date ?? null,
    [days, selectedDayId],
  )

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

  // Build boundary map: point id → { left, right } colors for split-ring markers.
  // A boundary point is startPointId of any numbered day (dayNumber > 0).
  const boundaryMap = useMemo(() => {
    // Split-ring icons appear only on true shared boundaries: points that are
    // simultaneously the end of Day N and the start of Day N+1 (dayNumber > 1).
    //
    // Plain rings (no split) for:
    //   • Day 1's start — no previous numbered day, left half would be grey
    //   • The trip's final endpoint — it is endPointId of the last day only,
    //     never anyone's startPointId, so it never enters this map
    const map = new Map<string, { left: string; right: string }>()
    for (const day of days) {
      if (day.dayNumber > 1 && day.startPointId) {
        map.set(day.startPointId, {
          left: getDayColor(day.dayNumber - 1),
          right: getDayColor(day.dayNumber),
        })
      }
    }
    return map
  }, [days])

  const boundaryPointIds = useMemo(() => new Set(boundaryMap.keys()), [boundaryMap])

  const pointIndexById = useMemo(() => {
    const m = new Map<string, number>()
    points.forEach((p, i) => {
      if (p.id) m.set(p.id, i + 1)
    })
    return m
  }, [points])

  const validPoints = points.filter(
    (p): p is ValidPoint => p.latitude != null && p.longitude != null,
  )

  const segments = buildSegments(
    validPoints,
    dayNumberById,
    boundaryPointIds,
    distanceUnit,
    avgSpeedKnots,
    dragState,
  )

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

  return (
    <div
      className={cn(
        "relative h-full w-full",
        (!viewMode || placing) && "[&_.leaflet-container]:cursor-crosshair",
      )}
    >
      <MapContainer center={[43, 13]} zoom={9} className="h-full w-full" zoomControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {/* OpenSeaMap seamark overlay — transparent nautical chart tiles (buoys, beacons,
            depth/seamark data) layered over the OSM base. Default-on: go/no-go relevant
            for kayak planning. Decided in docs/adr/itinerary-frontend.md. */}
        <TileLayer
          attribution='Seamarks &copy; <a href="https://www.openseamap.org">OpenSeaMap</a>'
          url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
        />

        {!viewMode && !placing && <MapEvents onMapClick={onMapClick} />}
        {placing && <DiamondPlacer onPlace={handlePlace} />}
        <ResizeHandler />
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
            >
              {!dragState && !viewMode && (
                <Tooltip
                  key={`${seg.positions[0][0]},${seg.positions[0][1]}-${seg.positions[1][0]},${seg.positions[1][1]}`}
                  permanent
                  direction="top"
                  className="distance-label"
                >
                  {seg.distLabel}
                </Tooltip>
              )}
            </Polyline>
          )
        })}

        {validPoints.map((point) => (
          <ConnectedMarker
            key={point.id ?? `${point.latitude},${point.longitude}`}
            point={point}
            index={point.id ? (pointIndexById.get(point.id) ?? 0) : 0}
            dayNum={dayNumberById.get(point.dayId ?? undefined) ?? 0}
            boundaryColors={point.id ? (boundaryMap.get(point.id) ?? null) : null}
            draggable={!viewMode}
            onMarkerDragMove={handleMarkerDragMove}
            onMarkerDragEnd={handleMarkerDragEnd}
            onMarkerClick={onMarkerClick}
          />
        ))}

        {selectedDayId && globalWindData && windEnabled && (
          <VelocityLayer data={globalWindData.grid} options={GLOBAL_WIND_OPTIONS} />
        )}
        {selectedDayId && windData && windEnabled && (
          <VelocityLayer data={windData.grid} options={WIND_OPTIONS} />
        )}
        {selectedDayId && swellData && swellEnabled && (
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

        {/* Draft pin shown while the entry dialog is open over the chosen spot. */}
        {draft && (
          <Circle
            center={[draft.lat, draft.lng]}
            radius={60}
            pathOptions={{ color: "#0ea5e9", weight: 2, fillOpacity: 0.2 }}
            interactive={false}
          />
        )}
      </MapContainer>

      {selectedDayId && (
        <LayersControl
          windEnabled={windEnabled}
          swellEnabled={swellEnabled}
          diamondsEnabled={diamondsEnabled}
          hasDiamonds={hasDiamonds}
          onWindToggle={() => setWindEnabled((e) => !e)}
          onSwellToggle={() => setSwellEnabled((e) => !e)}
          onDiamondsToggle={() => setDiamondsEnabled((e) => !e)}
        />
      )}

      {/* Drop-a-pin affordance — top-centre, clear of the top-left zoom control
          and the top-right LayersControl. Only when a day is selected (the
          conditions context) and the viewer may manage diamonds. */}
      {canManageDiamonds && selectedDayId && itineraryId && (
        <div className="absolute top-2 left-1/2 z-[1001] -translate-x-1/2">
          {placing ? (
            <div className="bg-card/95 ring-border/40 flex items-center gap-2 rounded-md px-3 py-1.5 text-[11px] font-medium shadow-md ring-1 backdrop-blur-sm">
              <span>Click the map to place the diamond</span>
              <button
                type="button"
                onClick={() => setPlacing(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              data-testid="add-diamond-button"
              onClick={() => setPlacing(true)}
              className="bg-card/95 text-foreground ring-border/40 hover:bg-card flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] font-semibold shadow-md ring-1 backdrop-blur-sm transition-colors"
            >
              <Plus className="size-3.5" aria-hidden />
              Add tidal diamond
            </button>
          )}
        </div>
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
    </div>
  )
}
