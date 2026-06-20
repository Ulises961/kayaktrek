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

function buildHtml(color: string, size: number, index?: number): string {
  const inner = index != null ? numHtml(index, color, size) : ""
  return `<div style="position:relative;width:${size}px;height:${size}px;border-radius:50%;background:white;border:2px solid ${color};box-shadow:0 1px 3px rgba(0,0,0,0.35);">${inner}</div>`
}

export function ringIcon(color: string, type: PointType = "position", index?: number): L.DivIcon {
  const size = SIZES[type]
  return L.divIcon({
    className: "",
    html: buildHtml(color, size, index),
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
