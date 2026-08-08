import type { Stats } from "@/lib/dtos/public-profile"

type ActivityBucket = Stats["activityByMonth"][number]

// A month on the chart's axis. `hasData` separates "no logs that month" from
// "logged, but no distance recorded" — they look identical once distance is 0,
// and only one of them should be drawn as a bar.
export type ActivityMonth = ActivityBucket & { hasData: boolean }

// How many months the chart shows. `stats_for_user` buckets a paddler's entire
// history, which for a long-standing logbook is dozens of rows; a profile stat
// block is a summary, and the recent stretch is the part anyone reads.
export const ACTIVITY_MONTH_WINDOW = 6

function toIndex(month: string): number {
  const [year, m] = month.split("-").map(Number)
  return year * 12 + (m - 1)
}

function toKey(index: number): string {
  const year = Math.floor(index / 12)
  return `${year}-${String((index % 12) + 1).padStart(2, "0")}`
}

/**
 * Expand the backend's sparse buckets into a continuous run of months.
 *
 * `LogService.stats_for_user` only emits months that have logs, so a paddler who
 * skipped June gets April, May and July back as three adjacent entries — drawn
 * as-is, the axis stops being a timeline and the gap reads as though it never
 * happened. Filling the gaps is presentation, not aggregation, so it lives here
 * rather than changing a shape the public profile also serves.
 */
export function monthSeries(
  buckets: ActivityBucket[],
  window: number = ACTIVITY_MONTH_WINDOW,
): ActivityMonth[] {
  if (buckets.length === 0) return []

  const byMonth = new Map(buckets.map((bucket) => [bucket.month, bucket]))
  const indices = buckets.map((bucket) => toIndex(bucket.month))
  const last = Math.max(...indices)
  const first = Math.max(Math.min(...indices), last - window + 1)

  return Array.from({ length: last - first + 1 }, (_, offset) => {
    const month = toKey(first + offset)
    const bucket = byMonth.get(month)
    return bucket
      ? { ...bucket, hasData: true }
      : { month, distance: 0, hours: 0, count: 0, hasData: false }
  })
}
