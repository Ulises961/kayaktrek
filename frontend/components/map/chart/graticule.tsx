"use client"

import { type ReactNode } from "react"
import { Polyline, Marker, useMap } from "react-leaflet"
import L from "leaflet"
import { useSettled } from "./use-settled"
import { CHART_INK as INK, CHART_PAPER_GLOW as PAPER_GLOW } from "./chart-theme"

// ── Graticule ────────────────────────────────────────────────────────────────
// A real geographic lat/lon grid drawn across the whole chart (the old ticks were
// CSS marginalia fixed to the frame border). Lines are meridians/parallels at a
// per-zoom degree step; they pan and zoom with the map like a true chart graticule.
function niceStep(zoom: number): number {
  if (zoom >= 10) return 0.25
  if (zoom >= 8) return 0.5
  return 1
}

function fmtDeg(value: number, pos: string, neg: string): string {
  const a = Math.abs(value)
  const s = Number.isInteger(a) ? `${a}` : a.toFixed(2).replace(/0+$/, "").replace(/\.$/, "")
  return `${s}°${value >= 0 ? pos : neg}`
}

function gratLabelIcon(text: string, anchor: [number, number], weight = 400): L.DivIcon {
  return L.divIcon({
    className: "",
    html: `<span style="font-family:var(--font-mono),ui-monospace,monospace;font-size:11px;font-weight:${weight};letter-spacing:0.04em;color:${INK};opacity:0.68;text-shadow:0 1px 2px ${PAPER_GLOW};">${text}</span>`,
    iconSize: [0, 0],
    iconAnchor: anchor,
  })
}

export function Graticule({ ready = true }: { ready?: boolean }) {
  const map = useMap()
  // Hide the grid during a gesture and redraw it (fresh bounds) once settled, so
  // it never shows the transformed, out-of-phase lines while zooming/panning.
  const settled = useSettled()

  // `ready` is an explicit signal from the caller (LandingMap, via FrameRoute's
  // onReady) that any initial programmatic fitBounds() has already applied —
  // not inferred from event timing. Without it, this component's very first
  // render reads the map's construction-time center/zoom (before FrameRoute's
  // own mount effect has had a chance to fit it to the routes), flashing that
  // small default extent for a frame before catching up.
  if (!ready || !settled) return null

  const b = map.getBounds()
  const step = niceStep(map.getZoom())
  const south = b.getSouth()
  const north = b.getNorth()
  const west = b.getWest()
  const east = b.getEast()
  const lineOpts = { color: INK, weight: 0.7, opacity: 0.42, interactive: false } as const

  const els: ReactNode[] = []
  for (let lon = Math.ceil(west / step) * step; lon <= east; lon += step) {
    const k = `m${lon.toFixed(3)}`
    els.push(
      <Polyline
        key={k}
        positions={[
          [south, lon],
          [north, lon],
        ]}
        pathOptions={lineOpts}
      />,
    )
    // Drop the label below the top edge so it clears the header strip.
    els.push(
      <Marker
        key={`${k}t`}
        position={[north, lon]}
        icon={gratLabelIcon(fmtDeg(lon, "E", "W"), [10, -64])}
        interactive={false}
        keyboard={false}
      />,
    )
  }
  for (let lat = Math.ceil(south / step) * step; lat <= north; lat += step) {
    const k = `p${lat.toFixed(3)}`
    els.push(
      <Polyline
        key={k}
        positions={[
          [lat, west],
          [lat, east],
        ]}
        pathOptions={lineOpts}
      />,
    )
    // Labels on the right edge — the left is occupied by the cartouche.
    els.push(
      <Marker
        key={`${k}l`}
        position={[lat, east]}
        icon={gratLabelIcon(fmtDeg(lat, "N", "S"), [34, -4], 600)}
        interactive={false}
        keyboard={false}
      />,
    )
  }
  return <>{els}</>
}
