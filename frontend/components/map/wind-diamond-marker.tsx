"use client"
import { useMemo } from "react"
import { Marker, Popup } from "react-leaflet"
import L from "leaflet"
import { windDiamondLat, windDiamondLng, type WindDiamond } from "@/lib/dtos/wind-diamond"

// Builds the DivIcon markup: a chart-style ◇, tinted with the --notice tokens
// (a hazard reminder, not live data — distinct from the tidal diamond's
// rate-coloured glyph), with a wind glyph overlaid unrotated on top so the
// two diamond types read apart from each other at a glance. No rate/
// direction/radius: a wind diamond carries none.
export function windDiamondIconHtml(): string {
  return `<div style="position:relative;width:22px;height:22px;">
    <div style="position:absolute;top:1px;left:1px;width:20px;height:20px;transform:rotate(45deg);background:var(--notice-bg);border:2px solid var(--notice-border);box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>
    <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--notice-border)" stroke-width="2.75" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9.8 4.4A2 2 0 1 1 11 8H2" />
        <path d="M17.5 8a2.5 2.5 0 1 1 2 4H2" />
        <path d="M12.8 19.6A2 2 0 1 0 14 16H2" />
      </svg>
    </div>
  </div>`
}

type WindDiamondMarkerProps = {
  diamond: WindDiamond
  // When true the marker can be dragged to reposition and shows edit/delete
  // controls. The caller gates this on the manage-diamonds permission — any
  // trip member may edit, there is no creator-only gate (mirrors tidal diamonds).
  editable?: boolean
  onDragEnd?: (lat: number, lng: number) => void
  onEdit?: () => void
  onDelete?: () => void
}

export function WindDiamondMarker({
  diamond,
  editable = false,
  onDragEnd,
  onEdit,
  onDelete,
}: WindDiamondMarkerProps) {
  const position = useMemo<[number, number]>(
    () => [windDiamondLat(diamond), windDiamondLng(diamond)],
    [diamond],
  )

  // Memoise the icon so react-leaflet never calls marker.setIcon() on an
  // unrelated render — a fresh DivIcon each render replaces the DOM element.
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: windDiamondIconHtml(),
        iconSize: [22, 22],
        iconAnchor: [11, 11],
        popupAnchor: [0, -11],
      }),
    [],
  )

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
          <p className="text-foreground text-sm font-semibold">Katabatic wind</p>
          {diamond.name && <p className="text-foreground mt-0.5 text-xs">{diamond.name}</p>}
          {diamond.notes && (
            <p className="text-muted-foreground mt-1 text-[11px]">{diamond.notes}</p>
          )}
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
                  Delete diamond
                </button>
              )}
            </div>
          )}
        </div>
      </Popup>
    </Marker>
  )
}
