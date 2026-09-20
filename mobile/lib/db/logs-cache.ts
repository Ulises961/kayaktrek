import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"

import type { Log } from "@shared/dtos/log"

import { CACHE_KEY, markCacheFresh } from "./cache-freshness"
import { database as productionDatabase } from "./database"
import { CachedLog } from "./models"

// Exactly the fields components/logs/log-card.tsx renders — same reasoning as
// trip-list-cache.ts's TripCardData: the full Log DTO (notes, route geometry,
// endorsers) has no offline reader, so caching it would be dead weight.
export type LogCardData = {
  id: string
  date: string | null
  hours: number | null
  distance: number | null
  avgSea: number | null
  endorsementCount: number | null
}

export type LogsCacheKind = "mine" | "endorsed"

function toLogCardData(log: Log): LogCardData {
  return {
    id: log.id ?? "",
    date: log.date ?? null,
    hours: log.hours ?? null,
    distance: log.distance ?? null,
    avgSea: log.avgSea ?? null,
    endorsementCount: log.endorsementCount ?? null,
  }
}

export async function saveLogsCache(
  kind: LogsCacheKind,
  logs: Log[],
  database: Database = productionDatabase,
): Promise<void> {
  const collection = database.collections.get<CachedLog>("cached_logs")
  await database.write(async () => {
    const stale = await collection.query(Q.where("kind", kind)).fetch()
    await database.batch(...stale.map((row) => row.prepareDestroyPermanently()))
    await database.batch(
      ...logs
        .filter((log): log is Log & { id: string } => Boolean(log.id))
        .map((log) => {
          const card = toLogCardData(log)
          return collection.prepareCreateFromDirtyRaw({
            id: card.id,
            kind,
            date: card.date,
            hours: card.hours,
            distance: card.distance,
            avg_sea: card.avgSea,
            endorsement_count: card.endorsementCount,
          })
        }),
    )
  })
  // One key for both kinds: the logs screen fetches "mine" and "endorsed" in a
  // single load, so they are never meaningfully different ages, and two age
  // lines on one screen would be noise.
  await markCacheFresh(CACHE_KEY.logs, database)
}

// One cached log by id, for the detail screen. `kind` comes back with it
// because the cache carries no userId — the list a log was cached under is the
// only record of whether it is the caller's own, which is what the detail
// screen branches on to decide between the edit form and the read-only view.
export async function loadCachedLog(
  id: string,
  database: Database = productionDatabase,
): Promise<(LogCardData & { kind: LogsCacheKind }) | null> {
  const collection = database.collections.get<CachedLog>("cached_logs")
  const rows = await collection.query(Q.where("id", id)).fetch()
  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    kind: row.kind as LogsCacheKind,
    date: row.date,
    hours: row.hours,
    distance: row.distance,
    avgSea: row.avgSea,
    endorsementCount: row.endorsementCount,
  }
}

export async function loadLogsCache(
  kind: LogsCacheKind,
  database: Database = productionDatabase,
): Promise<LogCardData[]> {
  const collection = database.collections.get<CachedLog>("cached_logs")
  const rows = await collection.query(Q.where("kind", kind)).fetch()
  return rows.map((row) => ({
    id: row.id,
    date: row.date,
    hours: row.hours,
    distance: row.distance,
    avgSea: row.avgSea,
    endorsementCount: row.endorsementCount,
  }))
}
