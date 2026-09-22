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
  // `cachedAt` lets a caller tell "never synced" from "synced, and the answer
  // was an empty list" (no buddies yet): the second is data to show, not a
  // missing cache. Left to the caller because it is not always true — a cache
  // that is a projection (the trip hub reading one trip out of the trip list)
  // can be synced and still not hold what this screen needs.
  isCacheEmpty: (data: T, cachedAt: string | null) => boolean
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
    let result: T
    try {
      result = await optionsRef.current.fetchLive()
    } catch (err) {
      const { cacheKey } = optionsRef.current
      const [cached, cacheCachedAt] = await Promise.all([
        optionsRef.current.loadCache(),
        cacheKey ? readCachedAt(cacheKey) : Promise.resolve(null),
      ])
      if (!optionsRef.current.isCacheEmpty(cached, cacheCachedAt)) {
        setData(cached)
        setIsOffline(true)
        setCachedAt(cacheCachedAt)
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.")
      }
      return
    }

    setData(result)
    setIsOffline(false)
    // Cleared rather than left behind: this render is live data, and a stale
    // "from 2 days ago" line surviving a successful refresh would be exactly
    // the misreport the age indicator exists to prevent.
    setCachedAt(null)
    // Outside the fetch's try, deliberately: a failing save used to land in
    // the fetch's catch and fall back to the cache, overwriting the live data
    // just set with an older copy. Saving is best effort and must never
    // change what the screen shows.
    void Promise.resolve()
      .then(() => optionsRef.current.saveCache(result))
      .catch(() => undefined)
  }, [])

  return { data, error, isOffline, cachedAt, reload, setData, setError }
}
