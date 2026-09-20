import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react"

import { readCachedAt } from "./cache-freshness"

// Extracted from four screens (items.tsx's requirements, the paddlers
// screen's connections/blocks, the logs screen's mine/endorsed) that each
// hand-rolled the identical live-first/cache-fallback shape: fetch live, save
// to cache on success; on failure, read the cache and show it with an
// "offline" flag, or surface the live error if the cache has nothing either.
// One copy of the logic — the screens still own their own state variable and
// decide what to render from `data`/`error`/`isOffline`.
export type UseLiveCacheOptions<T> = {
  fetchLive: () => Promise<T>
  loadCache: () => Promise<T>
  saveCache: (data: T) => Promise<void>
  isCacheEmpty: (data: T) => boolean
  // CACHE_KEY entry for this surface (cache-freshness.ts). Optional only
  // because a caller may be rendering something with no age worth showing;
  // anything a paddler could act on offline should pass one.
  cacheKey?: string
}

export type UseLiveCacheResult<T> = {
  data: T | null
  error: string | null
  isOffline: boolean
  // When the cache currently on screen was last refreshed, ISO, or null when
  // looking at live data (or at a surface with no recorded age).
  cachedAt: string | null
  reload: () => Promise<void>
  setData: Dispatch<SetStateAction<T | null>>
  setError: Dispatch<SetStateAction<string | null>>
}

export function useLiveCache<T>(options: UseLiveCacheOptions<T>): UseLiveCacheResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isOffline, setIsOffline] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)

  // A caller typically passes inline fetchLive/loadCache/saveCache/isCacheEmpty
  // functions, recreated every render. Reading them through a ref (updated on
  // every render, never a dependency) keeps `reload`'s own identity stable —
  // load-on-mount screens depend on `reload` in a `useEffect`, and a `reload`
  // that changes identity every render turns that effect into an infinite loop
  // (caught by logs.tsx's screen tests timing out during this hook's extraction).
  const optionsRef = useRef(options)
  useEffect(() => {
    optionsRef.current = options
  })

  const reload = useCallback(async () => {
    setError(null)
    try {
      const result = await optionsRef.current.fetchLive()
      setData(result)
      setIsOffline(false)
      // Cleared rather than left behind: this render is live data, and a stale
      // "from 2 days ago" line surviving a successful refresh would be exactly
      // the misreport the age indicator exists to prevent.
      setCachedAt(null)
      void optionsRef.current.saveCache(result).catch(() => undefined)
    } catch (err) {
      const cached = await optionsRef.current.loadCache()
      if (!optionsRef.current.isCacheEmpty(cached)) {
        setData(cached)
        setIsOffline(true)
        const { cacheKey } = optionsRef.current
        setCachedAt(cacheKey ? await readCachedAt(cacheKey) : null)
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      }
    }
  }, [])

  return { data, error, isOffline, cachedAt, reload, setData, setError }
}
