"use client"
import { memo, useCallback, useMemo, useState } from "react"
import { MapContainer, TileLayer, Polyline, Tooltip, useMapEvents } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"
import type { MapMode } from "./map-top-bar"
import { PointMarker } from "./point-marker"
import { haversineNm, formatDistance } from "@/lib/itinerary/distance"
import { getDayColor } from "@/lib/itinerary/colors"
import { splitRingIcon } from "./ring-icon"
import { cn } from "@/lib/utils"

export type MapCoreProps = {
  // Points already sorted in route order by MapBuilder — no walkList needed here.
  points: Point[]
  days: Day[]
  mode: MapMode
  distanceUnit: "nm" | "km"
  slidePreviewIds?: Set<string>
  slideColor?: string
  onMapClick: (lat: number, lng: number) => Promise<void>
  onMarkerDragEnd: (pointId: string, lat: number, lng: number) => void
  onMarkerDragMove: (pointId: string, lat: number, lng: number) => void
  onMarkerClick?: (pointId: string) => void
  onMarkerHover?: (pointId: string) => void
}

type ValidPoint = Point & { latitude: number; longitude: number }

type DragState = { id: string; lat: number; lng: number }

type Segment = {
  key: string
  positions: [[number, number], [number, number]]
  color: string
  distLabel: string
}

function resolvePosition(point: ValidPoint, drag: DragState | null): { latitude: number; longitude: number } {
  if (drag && point.id === drag.id) return { latitude: drag.lat, longitude: drag.lng }
  return point
}

function buildSegments(
  ordered: ValidPoint[],
  dayNumberById: Map<string | undefined, number>,
  slidePreviewIds: Set<string>,
  slideColor: string | undefined,
  distanceUnit: "nm" | "km",
  drag: DragState | null
): Segment[] {
  const segments: Segment[] = []
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = resolvePosition(ordered[i], drag)
    const b = resolvePosition(ordered[i + 1], drag)
    const pointId = ordered[i].id
    const isPreview = pointId != null && slidePreviewIds.has(pointId) && slideColor != null
    const dayNumA = dayNumberById.get(ordered[i].dayId ?? undefined) ?? 0
    const dayNumB = dayNumberById.get(ordered[i + 1].dayId ?? undefined) ?? 0
    // Use the higher day number across the segment so crossing into a new day
    // immediately takes that day's colour (boundary point belongs to Day N but
    // the leg leading into Day N+1 should render in Day N+1's colour).
    const dayNum = Math.max(dayNumA, dayNumB)
    segments.push({
      key: `${ordered[i].id ?? i}-${ordered[i + 1].id ?? i + 1}`,
      positions: [[a.latitude, a.longitude], [b.latitude, b.longitude]],
      color: isPreview ? slideColor! : getDayColor(dayNum),
      distLabel: formatDistance(haversineNm(a, b), distanceUnit),
    })
  }
  return segments
}

// ── MapEvents ─────────────────────────────────────────────────────────────────

function MapEvents({ mode, onMapClick }: { mode: MapMode; onMapClick: (lat: number, lng: number) => Promise<void> }) {
  useMapEvents({
    click(e) {
      if (mode === "drop") onMapClick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

// ── ConnectedMarker ───────────────────────────────────────────────────────────

type ConnectedMarkerProps = {
  point: ValidPoint
  dayNum: number
  boundaryColors: { left: string; right: string } | null
  isSlidePreview: boolean
  slideColor: string | undefined
  onMarkerDragMove: (pointId: string, lat: number, lng: number) => void
  onMarkerDragEnd: (pointId: string, lat: number, lng: number) => void
  onMarkerClick?: (pointId: string) => void
  onMarkerHover?: (pointId: string) => void
}

const ConnectedMarker = memo(function ConnectedMarker({
  point,
  dayNum,
  boundaryColors,
  isSlidePreview,
  slideColor,
  onMarkerDragMove,
  onMarkerDragEnd,
  onMarkerClick,
  onMarkerHover,
}: ConnectedMarkerProps) {
  const color = isSlidePreview && slideColor ? slideColor : getDayColor(dayNum)

  // Memoize split icon when this is a boundary point. Regular icon is computed
  // inside PointMarker. Splitting here keeps PointMarker unaware of day topology.
  const customIcon = useMemo(
    () => (boundaryColors ? splitRingIcon(boundaryColors.left, boundaryColors.right) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [boundaryColors?.left, boundaryColors?.right],
  )

  const handleDragMove = useCallback((lat: number, lng: number) => {
    if (point.id) onMarkerDragMove(point.id, lat, lng)
  }, [point.id, onMarkerDragMove])

  const handleDragEnd = useCallback((lat: number, lng: number) => {
    if (point.id) onMarkerDragEnd(point.id, lat, lng)
  }, [point.id, onMarkerDragEnd])

  const handleClick = useMemo(
    () => (onMarkerClick && point.id ? () => onMarkerClick(point.id!) : undefined),
    [onMarkerClick, point.id],
  )

  const handleMouseOver = useMemo(
    () => (onMarkerHover && point.id ? () => onMarkerHover(point.id!) : undefined),
    [onMarkerHover, point.id],
  )

  return (
    <PointMarker
      point={point}
      color={color}
      type={point.type}
      customIcon={customIcon}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
      onClick={handleClick}
      onMouseOver={handleMouseOver}
    />
  )
})

// ── MapCore ───────────────────────────────────────────────────────────────────

export default function MapCore({
  points,
  days,
  mode,
  distanceUnit,
  slidePreviewIds = new Set(),
  slideColor,
  onMapClick,
  onMarkerDragEnd,
  onMarkerDragMove,
  onMarkerClick,
  onMarkerHover,
}: MapCoreProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)

  const dayNumberById = useMemo(
    () => new Map(days.map((d) => [d.id, d.dayNumber ?? 0])),
    [days],
  )

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

  const validPoints = points.filter(
    (p): p is ValidPoint => p.latitude != null && p.longitude != null
  )

  const segments = buildSegments(validPoints, dayNumberById, slidePreviewIds, slideColor, distanceUnit, dragState)

  const handleMarkerDragMove = useCallback((id: string, lat: number, lng: number) => {
    setDragState({ id, lat, lng })
    onMarkerDragMove(id, lat, lng)
  }, [onMarkerDragMove])

  const handleMarkerDragEnd = useCallback((id: string, lat: number, lng: number) => {
    setDragState(null)
    onMarkerDragEnd(id, lat, lng)
  }, [onMarkerDragEnd])

  return (
    <div className={cn("w-full h-full", mode === "drop" && "[&_.leaflet-container]:cursor-crosshair")}>
      <MapContainer center={[43, 13]} zoom={6} className="w-full h-full" zoomControl>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <MapEvents mode={mode} onMapClick={onMapClick} />

        {segments.map((seg) => (
          <Polyline key={seg.key} positions={seg.positions} color={seg.color} weight={2.5} opacity={0.85}>
            <Tooltip permanent direction="top" className="distance-label">
              {seg.distLabel} {distanceUnit}
            </Tooltip>
          </Polyline>
        ))}

        {validPoints.map((point) => (
          <ConnectedMarker
            key={point.id ?? `${point.latitude},${point.longitude}`}
            point={point}
            dayNum={dayNumberById.get(point.dayId ?? undefined) ?? 0}
            boundaryColors={point.id ? (boundaryMap.get(point.id) ?? null) : null}
            isSlidePreview={point.id != null && slidePreviewIds.has(point.id)}
            slideColor={slideColor}
            onMarkerDragMove={handleMarkerDragMove}
            onMarkerDragEnd={handleMarkerDragEnd}
            onMarkerClick={onMarkerClick}
            onMarkerHover={onMarkerHover}
          />
        ))}
      </MapContainer>
    </div>
  )
}
