"use client"
import { useCallback, useMemo } from "react"
import { Marker, Tooltip } from "react-leaflet"
import L from "leaflet"
import type { Point, PointType } from "@/lib/dtos/point"
import { ringIcon } from "./ring-icon"

type PointMarkerProps = {
  point: Point & { latitude: number; longitude: number }
  color: string
  type: PointType
  index?: number
  customIcon?: L.Icon | L.DivIcon
  draggable?: boolean
  // Permanent distance label shown above the marker (e.g. a stop's leg in view
  // mode, or the route tip's running total while planning). Null hides it.
  label?: string | null
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
  customIcon,
  draggable = true,
  label,
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
    () => customIcon ?? ringIcon(color, type, index),
    [customIcon, color, type, index],
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
      {label ? (
        <Tooltip permanent direction="top" className="distance-label">
          {label}
        </Tooltip>
      ) : null}
    </Marker>
  )
}
