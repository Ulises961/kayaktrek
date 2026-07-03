"use client"

import { useEffect, useRef, useState } from "react"
import { useMapEvents } from "react-leaflet"

// True while a zoom/pan gesture is in flight, flipping back `settled` a beat after
// it ends. Vector overlays computed for the old viewport get CSS-transformed during
// the animation and read as "out of phase" until redrawn — callers hide themselves
// while unsettled and redraw fresh on settle (same idea as VelocityLayer's fade).
export function useSettled(delay = 280): boolean {
  const [settled, setSettled] = useState(true)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
  }
  useMapEvents({
    movestart: () => {
      clear()
      setSettled(false)
    },
    zoomstart: () => {
      clear()
      setSettled(false)
    },
    moveend: () => {
      clear()
      timer.current = setTimeout(() => setSettled(true), delay)
    },
    zoomend: () => {
      clear()
      timer.current = setTimeout(() => setSettled(true), delay)
    },
  })
  useEffect(() => clear, [])
  return settled
}
