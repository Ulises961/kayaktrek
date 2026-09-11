import L from "leaflet"
import type { PointType } from "@/lib/dtos/point"

const SIZES: Record<PointType, number> = {
  stop: 22, // overnight stop — larger, fits 2-digit numbers
  position: 18, // waypoint — standard
}

function numHtml(index: number, color: string, size: number): string {
  const fs = size <= 18 ? 8 : 9
  return `<span style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:700;color:${color};line-height:1;font-family:system-ui,sans-serif;">${index}</span>`
}

export type RouteMarker = "start" | "finish"

// The route's overall start/finish — not a Place, not a Point attribute — is
// derived from position in the already-ordered route (first/last of the whole
// multi-day linked list) and rendered as a small flag badge overlaid on the
// existing day-coloured ring, rather than a second marker at the same spot.
// Green for start, dark slate for finish; distinct from every other palette
// already in play here (day colours, tidal-diamond rate ramp, hazard red).
const ROUTE_MARKER_COLOR: Record<RouteMarker, string> = {
  start: "#16a34a",
  finish: "#1e293b",
}

function flagBadgeHtml(routeMarker: RouteMarker): string {
  return `<div style="position:absolute;top:-5px;right:-5px;width:14px;height:14px;border-radius:50%;background:${ROUTE_MARKER_COLOR[routeMarker]};border:1.5px solid white;box-shadow:0 1px 2px rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;">
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
      <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
      <path d="M4 22V3" />
    </svg>
  </div>`
}

function buildHtml(
  color: string,
  size: number,
  index?: number,
  routeMarker?: RouteMarker | null,
): string {
  const inner = index != null ? numHtml(index, color, size) : ""
  const badge = routeMarker ? flagBadgeHtml(routeMarker) : ""
  return `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:white;border:2px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,0.35);">${inner}${badge}</div>`
}

export function ringIcon(
  color: string,
  type: PointType = "position",
  index?: number,
  routeMarker?: RouteMarker | null,
): L.DivIcon {
  const size = SIZES[type]
  return L.divIcon({
    className: "",
    html: buildHtml(color, size, index, routeMarker),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 6)],
  })
}

export function splitRingIcon(leftColor: string, rightColor: string, index?: number): L.DivIcon {
  const size = 22
  const border = 2
  const inner = index != null ? numHtml(index, "#555", size) : ""
  const html = `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(to right,${leftColor} 50%,${rightColor} 50%);box-shadow:0 1px 3px rgba(0,0,0,0.35);"><div style="position:absolute;inset:${border}px;border-radius:50%;background:white;"></div>${inner}</div>`
  return L.divIcon({
    className: "",
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 6)],
  })
}
