// Relative, not the "@/" alias: this module is imported by the mobile client too, and
// mobile's jest resolves a file under frontend/ without frontend's path aliases. Every
// other cross-workspace module in lib/dtos/ imports the same way, for the same reason.
import type { ExploreFilters } from "../dtos/itinerary"

/**
 * Serialises explore filters into the query string `/api/itinerary/explore` expects.
 *
 * Shared with the mobile client (`@shared/itinerary/explore-params`), which calls the
 * same endpoint — the filter-to-parameter mapping is a contract with the backend, and
 * two copies of it drift silently, showing up as a filter that quietly stops applying
 * on one platform.
 *
 * Built by hand rather than with `URLSearchParams` because React Native's polyfill of
 * it is partial. `encodeURIComponent` is plain ECMAScript and behaves identically
 * everywhere; the only visible difference is that a space encodes as `%20` rather than
 * `+`, which the backend decodes the same way.
 */
export function exploreQueryString(filters: ExploreFilters): string {
  const pairs: [string, string][] = []
  const add = (key: string, value: string | number) => pairs.push([key, String(value)])

  const name = filters.name?.trim()
  if (name) add("name", name)

  for (const season of filters.seasons ?? []) add("season", season)

  // Compared against null rather than checked for truthiness: 0 is a meaningful bound.
  if (filters.minMiles != null) add("minMiles", filters.minMiles)
  if (filters.maxMiles != null) add("maxMiles", filters.maxMiles)
  if (filters.minDays != null) add("minDays", filters.minDays)
  if (filters.maxDays != null) add("maxDays", filters.maxDays)

  // bbox is all-or-nothing — only sent when the full viewport box is known.
  if (filters.bbox) {
    add("minLat", filters.bbox.minLat)
    add("minLng", filters.bbox.minLng)
    add("maxLat", filters.bbox.maxLat)
    add("maxLng", filters.bbox.maxLng)
  }

  if (filters.sort) add("sort", filters.sort)
  if (filters.page != null) add("page", filters.page)
  if (filters.perPage != null) add("per_page", filters.perPage)

  return pairs
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&")
}
