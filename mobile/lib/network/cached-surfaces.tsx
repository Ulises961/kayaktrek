import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react"

// What the screen in front of the paddler is showing from the cache, reported
// up to the app-root banner so there is one offline message rather than two.
// Before this, a screen on cached data said so inline while the banner above it
// said "some information may be out of date" — two messages about one fact,
// and only the one lower down could say how old anything was.
//
// Keyed per reporter rather than a single slot: a screen can show more than one
// cached surface at once (the paddlers screen's connections and blocks), and a
// screen losing focus must remove only its own entries, not whatever the newly
// focused screen has already reported.
export type CachedSurfaceReport = {
  // What cannot be done, or what is missing. Optional: an age can say it all.
  message?: ReactNode
  // ISO, from readCachedAt; null when no refresh was ever recorded; absent
  // when the screen has no cached copy at all (NeedsConnectionNotice), so there
  // is no age to state.
  cachedAt?: string | null
}

type CachedSurfacesValue = {
  reports: CachedSurfaceReport[]
  report: (id: string, entry: CachedSurfaceReport | null) => void
  // Whether the paddler collapsed the offline banner. Here rather than in the
  // banner because every Screen renders its own banner: held per instance, a
  // dismissal would come straight back on the next navigation.
  dismissed: boolean
  setDismissed: (dismissed: boolean) => void
  // A reporter's own retry, registered alongside its report under the same id.
  // The banner's "Recheck connection" used to only re-poll device connectivity
  // (NetInfo), which can't clear a stale report: that failure came from a
  // backend request, not from the device being offline, so nothing retried it
  // until the screen itself happened to refocus or remount (found live —
  // "the server connection is not present even if adb port forwarding is
  // active": the backend was reachable the whole time, the report just never
  // got a chance to re-check).
  registerRetry: (id: string, retry: (() => void) | null) => void
  retryAll: () => void
}

const CachedSurfacesContext = createContext<CachedSurfacesValue | null>(null)

export function CachedSurfacesProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<Map<string, CachedSurfaceReport>>(() => new Map())

  const report = useCallback((id: string, entry: CachedSurfaceReport | null) => {
    setEntries((current) => {
      if (entry === null && !current.has(id)) return current
      const next = new Map(current)
      if (entry === null) next.delete(id)
      else next.set(id, entry)
      return next
    })
  }, [])

  const [dismissed, setDismissed] = useState(false)

  // A ref, not state: a retry callback changing identity (a screen's `load`
  // re-created on every render) must not itself trigger a re-render of every
  // consumer the way adding it to `entries` would.
  const retries = useRef<Map<string, () => void>>(new Map())

  const registerRetry = useCallback((id: string, retry: (() => void) | null) => {
    if (retry === null) retries.current.delete(id)
    else retries.current.set(id, retry)
  }, [])

  const retryAll = useCallback(() => {
    for (const retry of retries.current.values()) retry()
  }, [])

  const value = useMemo(
    () => ({
      reports: [...entries.values()],
      report,
      dismissed,
      setDismissed,
      registerRetry,
      retryAll,
    }),
    [entries, report, dismissed, registerRetry, retryAll],
  )

  return <CachedSurfacesContext.Provider value={value}>{children}</CachedSurfacesContext.Provider>
}

export function useCachedSurfaces(): CachedSurfacesValue {
  const value = useContext(CachedSurfacesContext)
  if (!value) throw new Error("useCachedSurfaces must be used inside a CachedSurfacesProvider")
  return value
}
