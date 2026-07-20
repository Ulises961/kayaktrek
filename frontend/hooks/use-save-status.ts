import { useCallback, useEffect, useRef, useState } from "react"

export type SaveStatus = "idle" | "saving" | "saved"

/**
 * Tracks a "Saving… → Saved" status around a single async save call, reverting
 * to idle automatically after `clearAfterMs`. Callers are expected to skip
 * calling `run` when there's nothing to save (e.g. blur with no changes) —
 * this hook only reflects a save that actually happened.
 */
export function useSaveStatus(clearAfterMs = 2000) {
  const [status, setStatus] = useState<SaveStatus>("idle")
  const clearHandle = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (clearHandle.current) clearTimeout(clearHandle.current)
    },
    [],
  )

  const run = useCallback(
    async (save: () => Promise<void>) => {
      if (clearHandle.current) clearTimeout(clearHandle.current)
      setStatus("saving")
      try {
        await save()
        setStatus("saved")
        clearHandle.current = setTimeout(() => setStatus("idle"), clearAfterMs)
      } catch (e) {
        setStatus("idle")
        throw e
      }
    },
    [clearAfterMs],
  )

  return { status, run }
}
