import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"

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

  const value = useMemo(() => ({ reports: [...entries.values()], report }), [entries, report])

  return <CachedSurfacesContext.Provider value={value}>{children}</CachedSurfacesContext.Provider>
}

export function useCachedSurfaces(): CachedSurfacesValue {
  const value = useContext(CachedSurfacesContext)
  if (!value) throw new Error("useCachedSurfaces must be used inside a CachedSurfacesProvider")
  return value
}
