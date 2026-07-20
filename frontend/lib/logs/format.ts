// The most frequently logged sea state (Beaufort) across a paddler's logbook,
// derived from the all-logs conditionsDistribution histogram (backend
// `stats_for_user`) rather than the current page's items — the logs page's
// Load-more conversion (M12 §K) means `items` is a partial list by design, so
// deriving this from it would silently reintroduce the truncation-bug class
// this phase closes.
//
// A mode, not a mean: Beaufort is not a linear severity scale, so averaging
// e.g. B2 and B8 into "B5" doesn't describe any condition the paddler actually
// experienced. The most-logged value does. Ties go to the lower (calmer)
// Beaufort value, for a deterministic result.
export function modalSeaState(distribution: Record<string, number>): number | null {
  const entries = Object.entries(distribution)
  if (entries.length === 0) return null

  let bestBeaufort = Number(entries[0][0])
  let bestCount = entries[0][1]
  for (const [beaufort, count] of entries.slice(1)) {
    const value = Number(beaufort)
    if (count > bestCount || (count === bestCount && value < bestBeaufort)) {
      bestBeaufort = value
      bestCount = count
    }
  }
  return bestBeaufort
}
