"use client"
import { useEffect, useLayoutEffect, useRef } from "react"
import { useMap } from "react-leaflet"
import L from "leaflet"
import "leaflet-velocity"
import type { VelocityLayerProps } from "@/lib/types/ui"

// Reveal delay after a zoom/pan settles. leaflet-velocity restarts its field on
// zoomend/moveend (_clearAndRestart → _startWindy) but not instantaneously;
// revealing before that lands shows the stale, mis-projected frame. This also
// coalesces rapid consecutive zooms — each gesture re-hides and re-arms the timer.
const SETTLE_MS = 320

// leaflet-velocity's internals, as far as we have to reach into them. The
// canvas layer is the plugin's own L.CanvasLayer instance: `_frame` is the
// pending requestAnimFrame handle for its next draw, and `_onLayerDidMove` is
// the method its deferred reposition lands in. Both are needed at teardown, see
// the cleanup below.
type CanvasLayerHandle = {
  _canvas?: HTMLCanvasElement
  _frame?: number | null
  _onLayerDidMove?: () => void
}

type VelocityLayerHandle = L.Layer & {
  setOptions?: (options: Record<string, unknown>) => void
  _canvasLayer?: CanvasLayerHandle
}

export function VelocityLayer({ data, options = {} }: VelocityLayerProps) {
  const map = useMap()
  const layerRef = useRef<VelocityLayerHandle | null>(null)
  // Latest options for layer creation without forcing a rebuild when only the
  // options change (that path is handled in place below).
  const optionsRef = useRef(options)

  // Layout effects flush ahead of passive ones, so this lands before the creation
  // effect reads the ref — a render changing data and options together must build
  // the new layer from the new options.
  useLayoutEffect(() => {
    optionsRef.current = options
  }, [options])

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
          // Force leaflet-velocity to recompute the field at the NEW bounds now.
          // On pan its options don't change, so without this it keeps the stale,
          // mis-positioned frame (the canvas is repositioned on moveend but the
          // recompute is deferred by its internal 750ms timer) — that is the
          // off-shift on drag. Zoom already restarts via the options effect
          // (zoom-derived particleMultiplier changes), which is why only drag
          // showed it. setOptions → _clearAndRestart restarts immediately.
          layer.setOptions?.({ ...optionsRef.current })
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
      const attached = layerRef.current
      if (attached) {
        map.removeLayer(attached)

        // leaflet-velocity's canvas layer schedules two calls in onAdd that
        // dereference `this._map`, and its onRemove cancels neither:
        //   • needRedraw() → requestAnimFrame(drawLayer) → this._map.getSize()
        //   • setTimeout(…, 0) → _onLayerDidMove() → containerPointToLayerPoint()
        // Leaflet nulls `_map` the moment the layer is removed, so a map torn
        // down inside either window throws an uncaught TypeError onto the page
        // (both were observed on the landing chart when navigating away from it
        // on a slow machine — the windows are a frame and a macrotask wide, so
        // only a starved CPU loses the race).
        //
        // This runs AFTER removeLayer on purpose: onRemove does
        // `map.off(this.getEvents(), this)`, which rebuilds its handler object
        // from these same properties, so stubbing first would leave the real
        // listeners attached.
        const canvasLayer = attached._canvasLayer
        if (canvasLayer) {
          if (canvasLayer._frame != null) {
            L.Util.cancelAnimFrame(canvasLayer._frame)
            canvasLayer._frame = null
          }
          canvasLayer._onLayerDidMove = () => {}
        }

        layerRef.current = null
      }
    }
  }, [map, data])

  // Apply option changes (e.g. a zoom-derived particleMultiplier) IN PLACE.
  // setOptions → _clearAndRestart restarts immediately, avoiding the ~750ms
  // "showing velocity is delayed" blank that destroying + recreating would cause
  // on every zoom. No-ops on first run (layer not added yet — creation used the ref).
  useEffect(() => {
    layerRef.current?.setOptions?.(options)
  }, [options])

  return null
}
