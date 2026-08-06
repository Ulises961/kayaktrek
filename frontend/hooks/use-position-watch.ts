"use client"

import { useEffect, useState } from "react"
import { haversineNm } from "@/lib/itinerary/distance"
import { sendPositionPing } from "@/lib/live/actions"

export type PositionWatchStatus = "off" | "acquiring" | "sending" | "denied" | "unsupported"

// §D3: at most one ping per 15s, and only if displaced ≥ 10m — dedupes anchor-drift
// noise from a stationary or slow-moving kayak.
const THROTTLE_MS = 15_000
const MIN_DISPLACEMENT_M = 10
const NM_TO_M = 1852

// Browsers report PERMISSION_DENIED as this code (GeolocationPositionError.PERMISSION_DENIED
// on a real error instance — hardcoded here so it also matches a plain mock in tests).
const PERMISSION_DENIED = 1

export function usePositionWatch(tripId: string, enabled: boolean) {
  const supported = typeof navigator !== "undefined" && !!navigator.geolocation
  const initialStatus: PositionWatchStatus = !enabled
    ? "off"
    : supported
      ? "acquiring"
      : "unsupported"
  const [status, setStatus] = useState<PositionWatchStatus>(initialStatus)
  const [lastSentAt, setLastSentAt] = useState<Date | null>(null)

  // Render-phase reset when the target changes (React's sanctioned "adjusting
  // state when a prop changes" bail-out — see useLivePositions for the same
  // pattern), not inside the effect below: calling setState synchronously at
  // the top of an effect body is a lint error (extra cascading render).
  const trackedKey = `${tripId}:${enabled}:${supported}`
  const [prevKey, setPrevKey] = useState(trackedKey)
  if (trackedKey !== prevKey) {
    setPrevKey(trackedKey)
    setStatus(initialStatus)
  }

  useEffect(() => {
    if (!enabled || !supported) return

    let cancelled = false
    let watchId: number | null = null
    let lastSent: { lat: number; lon: number; at: number } | null = null

    function handleSuccess(position: GeolocationPosition) {
      if (cancelled) return
      setStatus("sending")

      const { latitude, longitude, accuracy, heading, speed } = position.coords
      const now = Date.now()

      if (lastSent) {
        const elapsed = now - lastSent.at
        if (elapsed < THROTTLE_MS) return
        const distanceM =
          haversineNm(
            { latitude: lastSent.lat, longitude: lastSent.lon },
            { latitude, longitude },
          ) * NM_TO_M
        if (distanceM < MIN_DISPLACEMENT_M) return
      }

      lastSent = { lat: latitude, lon: longitude, at: now }
      sendPositionPing(tripId, {
        lat: latitude,
        lon: longitude,
        accuracyM: accuracy ?? undefined,
        headingDeg: heading ?? undefined,
        speedMs: speed ?? undefined,
      })
        .then((result) => {
          if (!cancelled && result.success) setLastSentAt(new Date())
        })
        .catch(() => {
          // sendPositionPing normalizes ordinary failures into { success: false,
          // error } — the only way this promise rejects is a thrown session-expiry
          // redirect signal. A background geolocation ping has no render/transition
          // context to redirect through, so there is nothing useful to do with it
          // here beyond not leaking it as an unhandled rejection; the next
          // authenticated navigation hits the same expired session and redirects
          // normally.
        })
    }

    function handleError(error: GeolocationPositionError) {
      if (cancelled) return
      if (error.code === PERMISSION_DENIED) setStatus("denied")
    }

    function startWatching() {
      watchId = navigator.geolocation.watchPosition(handleSuccess, handleError, {
        enableHighAccuracy: true,
        maximumAge: 10_000,
      })
    }

    function stopWatching() {
      if (watchId !== null) navigator.geolocation.clearWatch(watchId)
      watchId = null
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        stopWatching()
      } else {
        startWatching()
      }
    }

    if (!document.hidden) startWatching()
    document.addEventListener("visibilitychange", handleVisibilityChange)

    return () => {
      cancelled = true
      document.removeEventListener("visibilitychange", handleVisibilityChange)
      stopWatching()
    }
  }, [enabled, supported, tripId])

  return { status, lastSentAt }
}
