import { useEffect, useState } from "react"

import { fetchWaveVectors, fetchWindVectors, type VelocityField } from "./velocity"

export type VelocityKind = "wind" | "wave"

export type VelocityFieldStatus = "idle" | "loading" | "ready" | "empty" | "error"

type Settled = { key: string; status: "ready" | "empty" | "error"; field: VelocityField | null; error: string | null }

// The wind or wave grid for one day and hour, fetched while `enabled` and refetched
// when the day, hour or kind changes. The map overlay reads `field` and draws
// nothing unless status is "ready"; "empty" means the day has no forecast for this
// field (not a failure) and "error" carries the message for the caller to show.
//
// `settled` remembers which request its result answers (`key`). Whatever the current
// request key is, a result for a different key is never shown — so a slow response
// for hour 8 cannot overwrite the field for hour 9, and "loading" needs no setState
// inside the effect: it is simply "active, and nothing has settled for this key yet".
export function useVelocityField({
  dayId,
  hour,
  kind,
  enabled,
}: {
  dayId: string | null
  hour: number
  kind: VelocityKind
  enabled: boolean
}): { status: VelocityFieldStatus; field: VelocityField | null; error: string | null } {
  const [settled, setSettled] = useState<Settled | null>(null)
  const active = enabled && dayId !== null
  const key = `${kind}:${dayId}:${hour}`

  useEffect(() => {
    if (!active || dayId === null) return
    let cancelled = false
    const fetchField = kind === "wind" ? fetchWindVectors : fetchWaveVectors

    fetchField(dayId, hour).then(
      (field) => {
        if (!cancelled) setSettled({ key, status: field ? "ready" : "empty", field, error: null })
      },
      (err: unknown) => {
        if (cancelled) return
        const error = err instanceof Error ? err.message : "Could not load the forecast overlay."
        setSettled({ key, status: "error", field: null, error })
      },
    )

    return () => {
      cancelled = true
    }
  }, [active, dayId, hour, kind, key])

  if (!active) return { status: "idle", field: null, error: null }
  if (settled?.key !== key) return { status: "loading", field: null, error: null }
  return { status: settled.status, field: settled.field, error: settled.error }
}
