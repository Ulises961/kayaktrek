import type { Database } from "nitromelondb"

import type { Item } from "@shared/dtos/item"

import { CACHE_KEY, markCacheFresh } from "./cache-freshness"
import { database as productionDatabase } from "./database"
import { CachedGear } from "./models"

// The user's gear closet (`Item`): trip-independent, unlike the kit and
// requirement caches, so the whole table replaces wholesale on every
// successful fetch — same shape as trip-list-cache, no trip to scope by.
//
// Only what the Items screen renders off a piece of gear: its name, and the
// `status` that decides whether it can be added to a kit ("owned") or is just
// a suggestion. Category and default_pack have no offline reader.
export type GearCardData = {
  id: string
  name: string
  status: string | null
}

function toGearCardData(item: Item): GearCardData {
  return {
    id: item.id ?? "",
    name: item.name ?? "",
    status: item.status ?? null,
  }
}

export async function saveGearCache(items: Item[], database: Database = productionDatabase): Promise<void> {
  const collection = database.collections.get<CachedGear>("cached_gear")
  await database.write(async () => {
    const stale = await collection.query().fetch()
    await database.batch(...stale.map((row) => row.prepareDestroyPermanently()))
    await database.batch(
      ...items
        // Gear with no id can never be matched against a packing entry or
        // contributed to a requirement, so it has nothing to offer offline.
        .filter((item): item is Item & { id: string } => Boolean(item.id))
        .map((item) => {
          const card = toGearCardData(item)
          return collection.prepareCreateFromDirtyRaw({
            id: card.id,
            name: card.name,
            status: card.status,
          })
        })
    )
  })
  await markCacheFresh(CACHE_KEY.gear, database)
}

export async function loadGearCache(database: Database = productionDatabase): Promise<GearCardData[]> {
  const collection = database.collections.get<CachedGear>("cached_gear")
  const rows = await collection.query().fetch()
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status ?? null,
  }))
}
