"use client"

import { useEffect } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import {
  CHART_INK as INK,
  CHART_PAPER as PAPER,
  CHART_PAPER_GLOW as PAPER_GLOW,
} from "./chart-theme"

// ── Scale bar ────────────────────────────────────────────────────────────────
// The ruler every chart carries — a segmented nautical-style bar showing the real
// ground distance at the current center/zoom, so the graticule's degrees have a
// metric reference. Built as a Leaflet control (correctly positioned, above map).
const EARTH_CIRCUMFERENCE_M = 40075016.686
const SCALE_TARGET_PX = 188

function metersPerPixel(lat: number, zoom: number): number {
  return (EARTH_CIRCUMFERENCE_M * Math.cos((lat * Math.PI) / 180)) / 2 ** (zoom + 8)
}

// Largest 1/2/5 × 10ⁿ metres that fits the target width — the "nice round number"
// a chart ruler always lands on.
function niceScaleMeters(maxMeters: number): number {
  const pow = 10 ** Math.floor(Math.log10(maxMeters))
  for (const mult of [5, 2, 1]) {
    if (mult * pow <= maxMeters) return mult * pow
  }
  return pow / 2
}

function fmtDistance(m: number): string {
  return m >= 1000 ? `${m / 1000} km` : `${m} m`
}

function scaleBarHtml(px: number, meters: number): string {
  const segs = 4
  const segPx = px / segs
  const cells = Array.from({ length: segs }, (_, i) => {
    const fill = i % 2 === 0 ? INK : PAPER
    return `<div style="width:${segPx}px;height:9px;background:${fill};border-right:1px solid ${INK};"></div>`
  }).join("")
  return `<div style="font-family:var(--font-mono),ui-monospace,monospace;color:${INK};text-shadow:0 1px 2px ${PAPER_GLOW};">
    <div style="display:flex;width:${px}px;border:1px solid ${INK};border-right:none;">${cells}</div>
    <div style="display:flex;justify-content:space-between;width:${px}px;font-size:11px;letter-spacing:0.04em;margin-top:4px;opacity:0.85;"><span>0</span><span>${fmtDistance(meters)}</span></div>
  </div>`
}

export function ScaleBar() {
  const map = useMap()
  useEffect(() => {
    // On desktop the cartouche sits bottom-left, so bottom-right is clear. On
    // mobile the cartouche spans the bottom — move the bar up to the top-right
    // (empty water under the header) so it is never occluded.
    const mq = window.matchMedia("(min-width: 640px)")
    let control: L.Control | null = null
    let el: HTMLElement | null = null
    const render = () => {
      if (!el) return
      const mpp = metersPerPixel(map.getCenter().lat, map.getZoom())
      const meters = niceScaleMeters(SCALE_TARGET_PX * mpp)
      el.innerHTML = scaleBarHtml(meters / mpp, meters)
    }
    const mount = () => {
      const desktop = mq.matches
      control = new L.Control({ position: desktop ? "bottomright" : "topright" })
      control.onAdd = () => {
        el = L.DomUtil.create("div")
        el.style.margin = desktop ? "0 42px 40px 0" : "60px 16px 0 0"
        render()
        return el
      }
      control.addTo(map)
    }
    const remount = () => {
      control?.remove()
      el = null
      mount()
    }
    mount()
    mq.addEventListener("change", remount)
    map.on("zoomend moveend", render)
    return () => {
      mq.removeEventListener("change", remount)
      map.off("zoomend moveend", render)
      control?.remove()
    }
  }, [map])
  return null
}
