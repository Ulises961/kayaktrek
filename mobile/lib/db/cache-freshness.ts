import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"

import { database as productionDatabase } from "./database"
import { CacheFreshness } from "./models"

// How old is the thing on screen. Every cached surface records the moment its
// last successful network refresh landed, and every screen rendering from a
// cache shows it — the generalisation of WP5's mandatory "forecast as of
// [timestamp]" label to every cached entity (docs/adr/mobile-offline.md,
// "Staleness must be expressed, not implied").
//
// Until this existed a screen could only report a boolean — *you are offline*,
// derived from one failed fetch — and nothing anywhere could say *this is from
// Tuesday*. That gap is why the indicator ships BEFORE WP7 widens sync scope
// rather than after: more cached screens with no age shown is more chances to
// render three-day-old weather indistinguishably from live weather.

// One key per cached surface. Trip-scoped surfaces take the trip id so two
// trips cached days apart report their own ages, not a shared one.
export const CACHE_KEY = {
  tripList: "trip-list",
  logs: "logs",
  connections: "connections",
  blocks: "blocks",
  gear: "gear",
  me: "me",
  logStats: "log-stats",
  // No separate key for the trip header's summary: it reads the trip-list cache
  // rather than one of its own (see lib/trips/use-trip-header.ts), so `tripList` is
  // already the honest age for it.
  tripRoute: (tripId: string) => `trip:${tripId}:route`,
  tripSync: (tripId: string) => `trip:${tripId}:sync`,
  tripRequirements: (tripId: string) => `trip:${tripId}:requirements`,
  tripKit: (tripId: string) => `trip:${tripId}:kit`,
  tripLogistics: (tripId: string) => `trip:${tripId}:logistics`,
} as const

export async function markCacheFresh(
  key: string,
  database: Database = productionDatabase,
  at: Date = new Date(),
): Promise<void> {
  const collection = database.collections.get<CacheFreshness>("cache_freshness")
  const existing = await collection.query(Q.where("key", key)).fetch()
  await database.write(async () => {
    if (existing[0]) {
      await existing[0].update((row) => {
        row.cachedAt = at.getTime()
      })
    } else {
      await collection.create((row) => {
        row.key = key
        row.cachedAt = at.getTime()
      })
    }
  })
}

// ISO rather than epoch ms because every consumer is a display one, and
// @shared/utils/date's formatTimeAgo — the same helper web's device-session
// list and the weather panel's "forecast as of" label already use — takes an
// ISO string. Returns null when this surface has never been refreshed, which
// a screen renders as no age line at all rather than as "—".
export async function readCachedAt(
  key: string,
  database: Database = productionDatabase,
): Promise<string | null> {
  const collection = database.collections.get<CacheFreshness>("cache_freshness")
  const rows = await collection.query(Q.where("key", key)).fetch()
  const cachedAt = rows[0]?.cachedAt
  return cachedAt === undefined ? null : new Date(cachedAt).toISOString()
}
