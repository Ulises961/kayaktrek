import { useEffect, useState } from "react"

import { loadCachedVelocityField } from "../db/velocity-cache"
import { fetchWaveVectors, fetchWindVectors, type VelocityField } from "./velocity"

export type VelocityKind = "wind" | "wave"

export type VelocityFieldStatus = "idle" | "loading" | "ready" | "empty" | "error"

type Settled = {
  key: string
  status: "ready" | "empty" | "error"
  field: VelocityField | null
  error: string | null
  fromCache: boolean
}

const NOT_SAVED = "This day's wind and swell are not saved for offline use yet."

// The wind or wave grid for one day and hour, fetched while `enabled` and refetched
// when the day, hour or kind changes. The map overlay reads `field` and draws
// nothing unless status is "ready"; "empty" means the day has no forecast for this
// field (not a failure) and "error" carries the message for the caller to show.
//
// Online it asks the server, as the weather panel does, so the two agree. When `offline`, or when
// the server cannot be reached, it uses what the last pull saved on the phone
// (lib/db/velocity-cache.ts) and says so in `fromCache`; only when nothing is saved does it
// report an error. Saved rows are read only when needed.
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
  offline = false,
}: {
  dayId: string | null
  hour: number
  kind: VelocityKind
  enabled: boolean
  offline?: boolean
}): { status: VelocityFieldStatus; field: VelocityField | null; error: string | null; fromCache: boolean } {
  const [settled, setSettled] = useState<Settled | null>(null)
  const active = enabled && dayId !== null
  const key = `${kind}:${dayId}:${hour}:${offline ? "offline" : "online"}`

  useEffect(() => {
    if (!active || dayId === null) return
    let cancelled = false
    const fetchField = kind === "wind" ? fetchWindVectors : fetchWaveVectors

    // `undefined`: nothing saved (or unreadable); `null`: saved, and no forecast for this layer.
    async function saved(): Promise<VelocityField | null | undefined> {
      try {
        return await loadCachedVelocityField(dayId as string, hour, kind)
      } catch {
        return undefined
      }
    }

    const settle = (field: VelocityField | null, fromCache: boolean): Settled => ({
      key,
      status: field ? "ready" : "empty",
      field,
      error: null,
      fromCache,
    })
    const failed = (error: string): Settled => ({ key, status: "error", field: null, error, fromCache: false })

    async function load(): Promise<Settled> {
      if (offline) {
        const cached = await saved()
        return cached === undefined ? failed(NOT_SAVED) : settle(cached, true)
      }
      try {
        return settle(await fetchField(dayId as string, hour), false)
      } catch (err) {
        const cached = await saved()
        if (cached !== undefined) return settle(cached, true)
        return failed(err instanceof Error ? err.message : "Could not load the forecast overlay.")
      }
    }

    void load().then((result) => {
      if (!cancelled) setSettled(result)
    })

    return () => {
      cancelled = true
    }
  }, [active, dayId, hour, kind, key, offline])

  if (!active) return { status: "idle", field: null, error: null, fromCache: false }
  if (settled?.key !== key) return { status: "loading", field: null, error: null, fromCache: false }
  return { status: settled.status, field: settled.field, error: settled.error, fromCache: settled.fromCache }
}
