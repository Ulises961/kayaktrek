"use client"
import { useMemo } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { Marker, Popup } from "react-leaflet"
import L from "leaflet"
import { placeIcon, placeColor } from "@/lib/itinerary/place-icons"
import { placeLat, placeLng, type PlaceWithOwnership } from "@/lib/dtos/place"
import React from "react"

// Builds the DivIcon markup: a teardrop pin (border-radius 50% 50% 50% 0, rotated
// −45°, tip at the bottom) carrying the category glyph. The pin shape separates a
// place from route rings (circles) and tidal diamonds (◇) at a glance. The glyph
// SVG is rendered by the caller so this stays a pure, testable string builder.
export function placeMarkerHtml(iconSvg: string, color: string): string {
  return `<div style="position:relative;width:30px;height:30px;">
    <div style="position:absolute;inset:0;transform:rotate(-45deg);border-radius:50% 50% 50% 0;background:white;border:2px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">${iconSvg}</div>
  </div>`
}

type PlaceMarkerProps = {
  place: PlaceWithOwnership
  // When true the marker can be dragged to reposition and shows edit/delete
  // controls. The caller gates this on ownership (place.mine + manage permission).
  editable?: boolean
  onDragEnd?: (lat: number, lng: number) => void
  onEdit?: () => void
  onDelete?: () => void
}

export function PlaceMarker({
  place,
  editable = false,
  onDragEnd,
  onEdit,
  onDelete,
}: PlaceMarkerProps) {
  const color = placeColor(place.category.slug)
  const position = useMemo<[number, number]>(() => [placeLat(place), placeLng(place)], [place])

  // Memoise the icon so react-leaflet never calls marker.setIcon() on an
  // unrelated render — a fresh DivIcon each render replaces the DOM element
  // (see the Leaflet-icon-memoization rule).
  const icon = useMemo(() => {
    const Glyph = placeIcon(place.category.icon)
    const iconSvg = renderToStaticMarkup(
      React.createElement(Glyph, {
        size: 15,
        color,
        strokeWidth: 2.25,
      }),
    )
    return L.divIcon({
      className: "",
      html: placeMarkerHtml(iconSvg, color),
      iconSize: [30, 30],
      iconAnchor: [15, 28],
      popupAnchor: [0, -28],
    })
  }, [place.category.icon, color])

  const eventHandlers = useMemo(
    () =>
      editable && onDragEnd
        ? {
            dragend: (e: L.LeafletEvent) => {
              const { lat, lng } = (e.target as L.Marker).getLatLng()
              onDragEnd(lat, lng)
            },
          }
        : undefined,
    [editable, onDragEnd],
  )

  return (
    <Marker position={position} icon={icon} draggable={editable} eventHandlers={eventHandlers}>
      <Popup>
        <div className="min-w-44">
          <p className="text-foreground text-sm font-semibold">{place.label}</p>
          <p className="text-muted-foreground mb-1.5 text-[10px] tracking-wide uppercase">
            {place.category.name}
          </p>
          {place.note && <p className="text-foreground text-xs">{place.note}</p>}
          {editable && (onEdit || onDelete) && (
            <div className="mt-2 flex gap-1">
              {onEdit && (
                <button
                  type="button"
                  onClick={onEdit}
                  className="text-foreground hover:bg-muted flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors"
                >
                  Edit
                </button>
              )}
              {onDelete && (
                <button
                  type="button"
                  onClick={onDelete}
                  className="text-destructive hover:bg-destructive/10 flex-1 rounded px-2 py-1 text-[11px] font-medium transition-colors"
                >
                  Delete place
                </button>
              )}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  )
}
