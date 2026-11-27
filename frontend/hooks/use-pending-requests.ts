"use client"

import { useEffect, useRef, useState } from "react"
import type { PendingRequestsSummary } from "@/lib/dtos/pending-requests"
import { refreshPendingRequests } from "@/lib/requests/poll"

export const PENDING_REQUESTS_POLL_MS = 10_000

// Every count, not only the badge's: a change in the requests the user sent (someone accepted)
// is what tells their own pages that they are out of date.
function sameCounts(a: PendingRequestsSummary, b: PendingRequestsSummary): boolean {
  return (Object.keys(a) as (keyof PendingRequestsSummary)[]).every((key) => a[key] === b[key])
}

// Keeps the notification badge current: starts from what the server rendered, then asks for the
// counts every 10 seconds while this tab is in front, and straight away when it comes back to
// the front. One request is in flight at a time, and a failed one leaves the last counts alone.
// `onChange` hears about a real change in the counts, never about the first reading or a repeat.
export function usePendingRequests(
  initial: PendingRequestsSummary,
  onChange?: (summary: PendingRequestsSummary) => void,
): PendingRequestsSummary {
  const [summary, setSummary] = useState(initial)
  const [renderedInitial, setRenderedInitial] = useState(initial)
  // A fresh server render is newer than anything polled before it.
  if (initial !== renderedInitial) {
    setRenderedInitial(initial)
    setSummary(initial)
  }

  const latestRef = useRef(summary)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    latestRef.current = summary
    onChangeRef.current = onChange
  }, [summary, onChange])

  useEffect(() => {
    let inFlight = false
    let stopped = false

    async function poll() {
      if (inFlight || stopped) return
      inFlight = true
      try {
        const next = await refreshPendingRequests()
        if (stopped || !next) return
        if (!sameCounts(latestRef.current, next)) {
          latestRef.current = next
          setSummary(next)
          onChangeRef.current?.(next)
        }
      } catch {
        // The next tick asks again; a dead session is handled by the server action's redirect.
      } finally {
        inFlight = false
      }
    }

    const isVisible = () => document.visibilityState === "visible"
    let timer: ReturnType<typeof setInterval> | null = null

    function start() {
      if (timer) return
      timer = setInterval(poll, PENDING_REQUESTS_POLL_MS)
    }
    function stop() {
      if (timer) clearInterval(timer)
      timer = null
    }
    function onVisibilityChange() {
      if (isVisible()) {
        void poll()
        start()
      } else {
        stop()
      }
    }

    if (isVisible()) start()
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      stopped = true
      stop()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }, [])

  return summary
}
