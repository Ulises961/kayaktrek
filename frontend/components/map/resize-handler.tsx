"use client"

import { useEffect } from "react"
import { useMap } from "react-leaflet"

/**
 * Tells Leaflet to recompute its size whenever its container is resized.
 *
 * The map shares horizontal space with panels that are flex siblings rather than
 * overlays — the builder's DayRail and drawer, the public pages' route detail —
 * so opening or collapsing one changes the map's width without a window resize
 * event. Leaflet only listens for the window, and left uninformed it renders grey
 * tiles and misplaced markers over the strip it just gained.
 */
export function ResizeHandler() {
  const map = useMap()
  useEffect(() => {
    const container = map.getContainer()
    const observer = new ResizeObserver(() => map.invalidateSize({ animate: false }))
    observer.observe(container)
    return () => observer.disconnect()
  }, [map])
  return null
}
