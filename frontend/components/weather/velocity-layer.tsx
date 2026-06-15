"use client"
import { useEffect, useRef } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet-velocity"
import type { VelocityLayerProps } from "@/lib/types/ui"

export function VelocityLayer({ data, options = {} }: VelocityLayerProps) {
  const map = useMap()
  const layerRef = useRef<L.Layer | null>(null)

  useEffect(() => {
    if (!data || data.length === 0) return
    let cancelled = false
    const lv = L as unknown as { velocityLayer: (opts: Record<string, unknown>) => L.Layer }
    const layer = lv.velocityLayer({ displayValues: true, data, ...options })

    // Defer past React Strict Mode's synchronous cleanup phase. The first (double-invoke)
    // run's rAF is cancelled by cleanup before it fires, so addTo is called exactly once.
    // This also prevents the dangling canvas-layer resize handler that causes the
    // "getSize / containerPointToLayerPoint, this._map is null" errors.
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return
      layer.addTo(map)
      layerRef.current = layer
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map, data, options])

  return null
}
