import type { ReactNode } from "react"

import { formatTimeAgo } from "@shared/utils/date"

import { cn } from "../../lib/cn"
import { Text } from "./text"

// The one place a screen says "what you are looking at came from the cache, and
// here is how old it is". Every read screen hand-rolled the first half of that
// sentence as its own inline <Text> before M9c WP7; none of them could say the
// second half at all.
//
// Distinct from OfflineBanner, which reports live device connectivity from the
// app root. This is per-surface and about the *data*: a screen can be showing a
// week-old cache with four bars of signal (the fetch failed for some other
// reason), and connectivity alone would call that fine.
//
// `docs/adr/mobile-offline.md` ("Staleness must be expressed, not implied")
// makes the age mandatory rather than decorative: for crew or inventory,
// undated stale data is untidy, but a three-day-old forecast rendered
// identically to a live one is a safety problem.
export function OfflineNotice({
  children,
  cachedAt,
  visible = true,
  now,
  className,
}: {
  children: ReactNode
  /** ISO timestamp from `readCachedAt`/`useLiveCache`, or null if never recorded. */
  cachedAt: string | null
  visible?: boolean
  /** Injectable clock, for tests. */
  now?: Date
  className?: string
}) {
  if (!visible) return null

  return (
    <Text
      className={cn(
        "rounded-md bg-muted px-3 py-1.5 text-center text-[11px] text-muted-foreground",
        className,
      )}
    >
      {children}
      {cachedAt !== null && ` Updated ${formatTimeAgo(cachedAt, now)}.`}
    </Text>
  )
}
