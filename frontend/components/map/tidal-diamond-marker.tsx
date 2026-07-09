"use client"
import { useMemo } from "react"
import { Circle, Marker, Popup } from "react-leaflet"
import L from "leaflet"
import type { TidalDiamond } from "@/lib/dtos/tidal-station"

// Faint zone-of-validity circle drawn around a diamond when it carries no
// explicit radius. Display-only — it does NOT change the tidal-gate proximity
// threshold (that stays its own value in the backend).
const DEFAULT_RADIUS_M = 500

// Rate → colour ramp (knots): calm green, building yellow, strong orange,
// dangerous red. A neutral slate marks an unknown rate (no data at the hour).
export function diamondColor(rateKnots: number | null): string {
  if (rateKnots == null) return "#94a3b8"
  if (rateKnots < 1) return "#16a34a"
  if (rateKnots < 2) return "#eab308"
  if (rateKnots < 3) return "#f97316"
  return "#dc2626"
}

// Not `lib/weather/hourly.ts`'s formatHour (which formats an "HH:MM:SS" time
// string) — this formats an hour offset from high water, e.g. "+2" / "-1".
function formatHourOffset(h: number): string {
  return h > 0 ? `+${h}` : `${h}`
}

// Builds the DivIcon markup: a chart-style ◇ coloured by rate, an arrow rotated
// to the set direction (compass bearing, 0° = north/up), and a rate label.
export function diamondIconHtml(
  rateKnots: number | null,
  directionDegrees: number | null,
  color: string,
): string {
  const arrow =
    directionDegrees == null
      ? ""
      : `<div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transform:rotate(${directionDegrees}deg);">
           <div style="width:0;height:0;border-left:4px solid transparent;border-right:4px solid transparent;border-bottom:11px solid ${color};margin-bottom:6px;"></div>
         </div>`
  const label = rateKnots == null ? "—" : `${rateKnots.toFixed(1)} kn`
  return `<div style="position:relative;width:26px;height:34px;">
    <div style="position:absolute;top:2px;left:3px;width:20px;height:20px;transform:rotate(45deg);background:white;border:2px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,0.35);"></div>
    ${arrow}
    <span style="position:absolute;bottom:0;left:0;width:100%;text-align:center;font-size:9px;font-weight:700;color:${color};font-family:system-ui,sans-serif;text-shadow:0 0 2px white,0 0 2px white;">${label}</span>
  </div>`
}

type TidalDiamondMarkerProps = {
  diamond: TidalDiamond
  // When true the marker can be dragged to reposition and shows edit/delete
  // controls. The caller gates this on ownership (isUserCreated + manage permission).
  editable?: boolean
  onDragEnd?: (lat: number, lng: number) => void
  onEdit?: () => void
  onDelete?: () => void
}

export function TidalDiamondMarker({
  diamond,
  editable = false,
  onDragEnd,
  onEdit,
  onDelete,
}: TidalDiamondMarkerProps) {
  const color = diamondColor(diamond.rateKnots)
  const radius = diamond.radiusM ?? DEFAULT_RADIUS_M
  const position = useMemo<[number, number]>(
    () => [diamond.lat, diamond.lng],
    [diamond.lat, diamond.lng],
  )

  // Memoise the icon so react-leaflet never calls marker.setIcon() on an
  // unrelated render — a fresh DivIcon each render replaces the DOM element.
  const icon = useMemo(
    () =>
      L.divIcon({
        className: "",
        html: diamondIconHtml(diamond.rateKnots, diamond.directionDegrees, color),
        iconSize: [26, 34],
        iconAnchor: [13, 12],
        popupAnchor: [0, -14],
      }),
    [diamond.rateKnots, diamond.directionDegrees, color],
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
    <>
      <Circle
        center={position}
        radius={radius}
        pathOptions={{ color, weight: 1, opacity: 0.35, fillOpacity: 0.05 }}
        interactive={false}
      />
      <Marker position={position} icon={icon} draggable={editable} eventHandlers={eventHandlers}>
        <Popup>
          <div className="min-w-44">
            <p className="text-foreground text-sm font-semibold">{diamond.name}</p>
            <p className="text-muted-foreground mb-1.5 text-[10px] tracking-wide uppercase">
              {diamond.isUserCreated ? "Local knowledge" : "Atlas"} · stream by hour from HW
            </p>
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-muted-foreground text-left">
                  <th className="font-medium">HW</th>
                  <th className="font-medium">Rate</th>
                  <th className="font-medium">Set</th>
                </tr>
              </thead>
              <tbody>
                {diamond.hourlyTable.map((row) => (
                  <tr key={row.hourFromHw}>
                    <td>{formatHourOffset(row.hourFromHw)}</td>
                    <td>{row.rateKnots == null ? "—" : `${row.rateKnots.toFixed(1)} kn`}</td>
                    <td>
                      {row.directionDegrees == null ? "—" : `${Math.round(row.directionDegrees)}°`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
    </>
  )
}
