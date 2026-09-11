"use client"
import { useCallback, useMemo } from "react"
import { Marker, Tooltip } from "react-leaflet"
import L from "leaflet"
import { Trash2Icon } from "lucide-react"
import type { Point, PointType } from "@/lib/dtos/point"
import { ringIcon, type RouteMarker } from "./ring-icon"

type PointMarkerProps = {
  point: Point & { latitude: number; longitude: number }
  color: string
  type: PointType
  index?: number
  // The route's overall start/finish, derived from position in the ordered
  // route — a badge on the existing marker, not a second one at the same spot.
  routeMarker?: RouteMarker | null
  customIcon?: L.Icon | L.DivIcon
  draggable?: boolean
  // Permanent distance label shown above the marker (e.g. a stop's leg in view
  // mode, or the route tip's running total while planning). Null hides it.
  label?: string | null
  // The tail of the route is always the one point safe to remove without
  // re-anchoring anything after it — showing a discard control there lets a
  // stray click (or a run of them) be trimmed straight from the map, one point
  // at a time, without scrolling the sidebar list to find it. Renders inside
  // the same tooltip as `label`, not instead of it.
  showUndo?: boolean
  onUndo?: () => void
  onDragMove: (lat: number, lng: number) => void
  onDragEnd: (lat: number, lng: number) => void
  onClick?: () => void
  onMouseOver?: () => void
}

export function PointMarker({
  point,
  color,
  type,
  index,
  routeMarker,
  customIcon,
  draggable = true,
  label,
  showUndo = false,
  onUndo,
  onDragMove,
  onDragEnd,
  onClick,
  onMouseOver,
}: PointMarkerProps) {
  const position = useMemo<[number, number]>(
    () => [point.latitude, point.longitude],
    [point.latitude, point.longitude],
  )

  // Memoize icon so react-leaflet never calls marker.setIcon() mid-drag.
  // A new DivIcon instance on every render would replace the marker's DOM element,
  // detaching Leaflet's drag handlers and producing the jagged "dropped early" effect.
  // customIcon (e.g. splitRingIcon for boundary markers) must also be memoised by the caller.
  const icon = useMemo(
    () => customIcon ?? ringIcon(color, type, index, routeMarker),
    [customIcon, color, type, index, routeMarker],
  )

  const handleDrag = useCallback(
    (e: L.LeafletEvent) => {
      const { lat, lng } = (e.target as L.Marker).getLatLng()
      onDragMove(lat, lng)
    },
    [onDragMove],
  )

  const handleDragEnd = useCallback(
    (e: L.LeafletEvent) => {
      const { lat, lng } = (e.target as L.Marker).getLatLng()
      onDragEnd(lat, lng)
    },
    [onDragEnd],
  )

  const eventHandlers = useMemo(
    () => ({
      drag: handleDrag,
      dragend: handleDragEnd,
      ...(onClick ? { click: onClick } : {}),
      ...(onMouseOver ? { mouseover: onMouseOver } : {}),
    }),
    [handleDrag, handleDragEnd, onClick, onMouseOver],
  )

  return (
    <Marker position={position} icon={icon} draggable={draggable} eventHandlers={eventHandlers}>
      {showUndo && onUndo ? (
        <Tooltip permanent interactive direction="top" className="discard-point-tooltip">
          <span className="flex items-center gap-1.5">
            {label}
            <button
              type="button"
              aria-label="Discard point"
              onClick={(e) => {
                e.stopPropagation()
                onUndo()
              }}
              className="flex items-center"
            >
              <Trash2Icon className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        </Tooltip>
      ) : label ? (
        <Tooltip permanent direction="top" className="distance-label">
          {label}
        </Tooltip>
      ) : null}
    </Marker>
  )
}
