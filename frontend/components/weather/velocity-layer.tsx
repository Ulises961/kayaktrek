"use client"
import { useEffect, useRef } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet-velocity"
import type { VelocityLayerProps } from "@/lib/types/ui"

// Reveal delay after a zoom/pan settles. leaflet-velocity restarts its field on
// zoomend/moveend (_clearAndRestart → _startWindy) but not instantaneously;
// revealing before that lands shows the stale, mis-projected frame. This also
// coalesces rapid consecutive zooms — each gesture re-hides and re-arms the timer.
const SETTLE_MS = 320

type VelocityLayerHandle = L.Layer & {
  setOptions?: (options: Record<string, unknown>) => void
  _canvasLayer?: { _canvas?: HTMLCanvasElement }
}

export function VelocityLayer({ data, options = {} }: VelocityLayerProps) {
  const map = useMap()
  const layerRef = useRef<VelocityLayerHandle | null>(null)
  // Latest options for layer creation without forcing a rebuild when only the
  // options change (that path is handled in place below). Kept current via the
  // options effect, not during render. Initialised for the first creation.
  const optionsRef = useRef(options)

  // Create / destroy the layer when the map or the underlying data changes.
  useEffect(() => {
    if (!data || data.length === 0) return
    let cancelled = false
    let detach: (() => void) | null = null
    const lv = L as unknown as {
      velocityLayer: (opts: Record<string, unknown>) => VelocityLayerHandle
    }
    // displayValues:false — the bottom-left hover readout is ambiguous when several
    // layers (wind/swell/tidal) are active and can't be labelled per-layer cleanly.
    // The per-hour cards and the colour legend convey the same data unambiguously.
    const layer = lv.velocityLayer({ displayValues: false, data, ...optionsRef.current })

    // Defer past React Strict Mode's synchronous cleanup phase. The first (double-invoke)
    // run's rAF is cancelled by cleanup before it fires, so addTo is called exactly once.
    // This also prevents the dangling canvas-layer resize handler that causes the
    // "getSize / containerPointToLayerPoint, this._map is null" errors.
    const rafId = requestAnimationFrame(() => {
      if (cancelled) return
      layer.addTo(map)
      layerRef.current = layer

      // During a zoom/pan, leaflet-velocity stops the animation but its canvas keeps
      // the stale frame, which Leaflet's zoom animation then transforms — so particles
      // slide outside the field until the positions are recomputed. Hide the canvas
      // INSTANTLY when the gesture starts (a transitioned fade-out would leave the
      // mis-projected frame visible as it slides), then fade it back in only after the
      // field has settled (SETTLE_MS), so particles never appear out of place.
      const canvas = layer._canvasLayer?._canvas
      if (canvas) {
        let showTimer: ReturnType<typeof setTimeout> | null = null
        const hide = () => {
          if (showTimer) {
            clearTimeout(showTimer)
            showTimer = null
          }
          canvas.style.transition = "none"
          canvas.style.opacity = "0"
        }
        const show = () => {
          if (showTimer) clearTimeout(showTimer)
          showTimer = setTimeout(() => {
            canvas.style.transition = "opacity 220ms ease"
            canvas.style.opacity = "1"
            showTimer = null
          }, SETTLE_MS)
        }
        map.on("movestart zoomstart", hide)
        map.on("moveend zoomend", show)
        detach = () => {
          if (showTimer) clearTimeout(showTimer)
          map.off("movestart zoomstart", hide)
          map.off("moveend zoomend", show)
        }
      }
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(rafId)
      detach?.()
      if (layerRef.current) {
        map.removeLayer(layerRef.current)
        layerRef.current = null
      }
    }
  }, [map, data])

  // Apply option changes (e.g. a zoom-derived particleMultiplier) IN PLACE.
  // setOptions → _clearAndRestart restarts immediately, avoiding the ~750ms
  // "showing velocity is delayed" blank that destroying + recreating would cause
  // on every zoom. No-ops on first run (layer not added yet — creation used the ref).
  useEffect(() => {
    optionsRef.current = options
    layerRef.current?.setOptions?.(options)
  }, [options])

  return null
}
