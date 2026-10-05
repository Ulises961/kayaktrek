import { useIsFocused } from "expo-router"
import { useEffect, useId, type ReactNode } from "react"

import { type CachedSurfaceReport, useCachedSurfaces } from "../../lib/network/cached-surfaces"

// Report what the focused screen is missing to the app-root OfflineBanner,
// which is the one place any of it is said. Only while the screen is focused:
// stacked and drawer screens stay mounted behind the one in front, and the
// banner must describe the screen the paddler is actually looking at.
function useReportToBanner(visible: boolean, entry: CachedSurfaceReport, retry?: () => void) {
  const id = useId()
  const isFocused = useIsFocused()
  const { report, registerRetry } = useCachedSurfaces()
  const { message, cachedAt } = entry

  useEffect(() => {
    report(id, visible && isFocused ? { message, cachedAt } : null)
  }, [id, visible, isFocused, message, cachedAt, report])

  useEffect(() => {
    registerRetry(id, visible && isFocused ? (retry ?? null) : null)
  }, [id, visible, isFocused, retry, registerRetry])

  useEffect(
    () => () => {
      report(id, null)
      registerRetry(id, null)
    },
    [id, report, registerRetry],
  )
}

// The screen is showing its cached copy. The banner states how old it is —
// docs/adr/mobile-offline.md ("Staleness must be expressed, not implied") makes
// the age mandatory: a three-day-old forecast rendered identically to a live
// one is a safety problem.
//
// Renders nothing itself. This used to be an inline line under the banner, so
// an offline screen carried two messages about one fact, and the banner — the
// one the eye lands on — was the one that could not say how old anything was.
export function OfflineNotice({
  children,
  cachedAt,
  visible = true,
  onRetry,
}: {
  /** What cannot be done with the cached data, shown behind the banner's "Read more",
   *  e.g. "Adding, covering, and removing need a connection." Omit when the age says it all. */
  children?: ReactNode
  /** ISO timestamp from `readCachedAt`/`useLiveCache`, or null if never recorded. */
  cachedAt: string | null
  visible?: boolean
  /** Re-run on "Retry sync", so a stale report can clear itself once the
   *  backend is actually reachable again, without the paddler having to leave
   *  and return to the screen. Usually the screen's own `load`/`reload`. */
  onRetry?: () => void
}) {
  useReportToBanner(visible, { message: children, cachedAt }, onRetry)
  return null
}

// The screen has no cached copy at all — Explore by choice, Settings until
// M9c WP7's tier 4 — and its fetch failed for want of a connection. Without
// this the screen printed the raw network error in red, which read as a fault
// rather than as the expected state of being offline.
export function NeedsConnectionNotice({
  children,
  visible = true,
  onRetry,
}: {
  /** e.g. "Explore needs a connection." */
  children: ReactNode
  visible?: boolean
  /** Re-run on "Retry sync" (see OfflineNotice's onRetry). */
  onRetry?: () => void
}) {
  useReportToBanner(visible, { message: children }, onRetry)
  return null
}
