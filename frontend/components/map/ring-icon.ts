import L from "leaflet"
import type { PointType } from "@/lib/dtos/point"

const SIZES: Record<PointType, number> = {
  stop: 20,       // overnight stop — larger, more prominent
  position: 14,   // waypoint — standard
  interest: 16,   // POI — medium, rotated square to visually separate from route points
}

function buildHtml(color: string, size: number, rotate: boolean): string {
  const transform = rotate ? "transform:rotate(45deg);" : ""
  return `<div style="width:${size}px;height:${size}px;border-radius:${rotate ? "3px" : "50%"};background:white;border:3px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,0.35);${transform}"></div>`
}

export function ringIcon(color: string, type: PointType = "position"): L.DivIcon {
  const size = SIZES[type]
  const rotate = type === "interest"
  return L.divIcon({
    className: "",
    html: buildHtml(color, size, rotate),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -(size / 2 + 6)],
  })
}
