import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"

import { StatsSchema, type Stats } from "@shared/dtos/public-profile"
import { UserSchema, type User } from "@shared/dtos/user"

import { CACHE_KEY, markCacheFresh } from "./cache-freshness"
import { database as productionDatabase } from "./database"
import { CachedProfileEntry } from "./models"

// Tier 4 (docs/adr/mobile-offline.md, "The tiers"): the paddler's own record
// and log stats. Profile, Settings and the drawer header read it when /user/me
// can't be reached. One row per kind, stored whole and parsed back through
// the shared schema, like logistics-cache.ts.
const KIND = {
  ME: "me",
  LOG_STATS: "log-stats",
} as const

type Kind = (typeof KIND)[keyof typeof KIND]

// /user/me dumps every log, endorsed log, itinerary, inventory and item the
// user has. Those have caches of their own (or none, by choice), nothing
// reading this one renders them, and they would make a tiny row unbounded.
function withoutCollections(user: User): User {
  const {
    itineraries: _itineraries,
    inventories: _inventories,
    items: _items,
    logs: _logs,
    endorsedLogs: _endorsedLogs,
    ...profile
  } = user
  return profile
}

export async function saveMeCache(
  user: User,
  database: Database = productionDatabase,
): Promise<void> {
  await saveEntry(KIND.ME, withoutCollections(user), database)
  await markCacheFresh(CACHE_KEY.me, database)
}

export async function loadMeCache(database: Database = productionDatabase): Promise<User | null> {
  const parsed = UserSchema.safeParse(await loadEntry(KIND.ME, database))
  return parsed.success ? parsed.data : null
}

export async function saveLogStatsCache(
  stats: Stats,
  database: Database = productionDatabase,
): Promise<void> {
  await saveEntry(KIND.LOG_STATS, stats, database)
  await markCacheFresh(CACHE_KEY.logStats, database)
}

export async function loadLogStatsCache(
  database: Database = productionDatabase,
): Promise<Stats | null> {
  const parsed = StatsSchema.safeParse(await loadEntry(KIND.LOG_STATS, database))
  return parsed.success ? parsed.data : null
}

async function saveEntry(kind: Kind, payload: unknown, database: Database): Promise<void> {
  const collection = database.collections.get<CachedProfileEntry>("cached_profile")
  await database.write(async () => {
    const stale = await collection.query(Q.where("kind", kind)).fetch()
    await database.batch(
      ...stale.map((row) => row.prepareDestroyPermanently()),
      collection.prepareCreate((record) => {
        record.kind = kind
        record.payload = JSON.stringify(payload)
      }),
    )
  })
}

// Null for a missing row and for one that no longer parses as JSON; the
// caller's schema parse then treats both as "nothing cached".
async function loadEntry(kind: Kind, database: Database): Promise<unknown> {
  const collection = database.collections.get<CachedProfileEntry>("cached_profile")
  const [row] = await collection.query(Q.where("kind", kind)).fetch()
  if (!row) return null
  try {
    return JSON.parse(row.payload)
  } catch {
    return null
  }
}
