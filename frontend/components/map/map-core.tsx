"use client"
import { memo, useCallback, useState } from "react"
import { MapContainer, TileLayer, Polyline, Tooltip, useMapEvents } from "react-leaflet"
import "leaflet/dist/leaflet.css"
import type { Point } from "@/lib/dtos/point"
import type { Day } from "@/lib/dtos/day"
import type { MapMode } from "./map-top-bar"
import { PointMarker } from "./point-marker"
import { haversineNm, formatDistance } from "@/lib/itinerary/distance"
import { getDayColor } from "@/lib/itinerary/colors"
import { cn } from "@/lib/utils"

export type MapCoreProps = {
  // Points already sorted in route order by MapBuilder — no walkList needed here.
  points: Point[]
  days: Day[]
  mode: MapMode
  distanceUnit: "nm" | "km"
  onMapClick: (lat: number, lng: number) => Promise<void>
  onMarkerDragEnd: (pointId: string, lat: number, lng: number) => void
  onMarkerDragMove: (pointId: string, lat: number, lng: number) => void
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
  distanceUnit: "nm" | "km",
  drag: DragState | null
): Segment[] {
  const segments: Segment[] = []
  for (let i = 0; i < ordered.length - 1; i++) {
    const a = resolvePosition(ordered[i], drag)
    const b = resolvePosition(ordered[i + 1], drag)
    const dayNum = dayNumberById.get(ordered[i].dayId ?? undefined) ?? 0
    segments.push({
      key: `${ordered[i].id ?? i}-${ordered[i + 1].id ?? i + 1}`,
      positions: [[a.latitude, a.longitude], [b.latitude, b.longitude]],
      color: getDayColor(dayNum),
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
  onMarkerDragMove: (pointId: string, lat: number, lng: number) => void
  onMarkerDragEnd: (pointId: string, lat: number, lng: number) => void
}

const ConnectedMarker = memo(function ConnectedMarker({
  point,
  dayNum,
  onMarkerDragMove,
  onMarkerDragEnd,
}: ConnectedMarkerProps) {
  const color = getDayColor(dayNum)

  const handleDragMove = useCallback((lat: number, lng: number) => {
    if (point.id) onMarkerDragMove(point.id, lat, lng)
  }, [point.id, onMarkerDragMove])

  const handleDragEnd = useCallback((lat: number, lng: number) => {
    if (point.id) onMarkerDragEnd(point.id, lat, lng)
  }, [point.id, onMarkerDragEnd])

  return (
    <PointMarker
      point={point}
      color={color}
      type={point.type}
      onDragMove={handleDragMove}
      onDragEnd={handleDragEnd}
    />
  )
})

// ── MapCore ───────────────────────────────────────────────────────────────────

export default function MapCore({
  points,
  days,
  mode,
  distanceUnit,
  onMapClick,
  onMarkerDragEnd,
  onMarkerDragMove,
}: MapCoreProps) {
  const [dragState, setDragState] = useState<DragState | null>(null)

  const dayNumberById = new Map(days.map((d) => [d.id, d.dayNumber ?? 0]))

  const validPoints = points.filter(
    (p): p is ValidPoint => p.latitude != null && p.longitude != null
  )

  const segments = buildSegments(validPoints, dayNumberById, distanceUnit, dragState)

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
            onMarkerDragMove={handleMarkerDragMove}
            onMarkerDragEnd={handleMarkerDragEnd}
          />
        ))}
      </MapContainer>
    </div>
  )
}
