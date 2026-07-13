// Weighted mean sea-state (Beaufort) across a paddler's logbook, derived from the
// all-logs conditionsDistribution histogram (backend `stats_for_user`) rather than
// the current page's items — the logs page's Load-more conversion (M12 §K) means
// `items` is a partial list by design, so averaging over it would silently
// reintroduce the truncation-bug class this phase closes.
export function averageSeaState(distribution: Record<string, number>): number | null {
  const entries = Object.entries(distribution)
  if (entries.length === 0) return null

  let weightedSum = 0
  let totalCount = 0
  for (const [beaufort, count] of entries) {
    weightedSum += Number(beaufort) * count
    totalCount += count
  }
  return totalCount > 0 ? weightedSum / totalCount : null
}
