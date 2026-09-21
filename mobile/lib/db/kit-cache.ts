import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"

import type { PersonalPackingItem } from "@shared/dtos/personal-packing"

import { CACHE_KEY, markCacheFresh } from "./cache-freshness"
import { database as productionDatabase } from "./database"
import { CachedPackingItem } from "./models"

// A member's private per-trip packing list (`PersonalPackingItem`) — trip-scoped
// like requirements, and distinct from the gear closet it draws from
// (gear-cache.ts), which is trip-independent.
//
// Denormalised on purpose: the item's name is copied in rather than joined from
// cached_gear at read time, so a kit entry still renders when the closet cache
// is empty or that gear has since been deleted. `checked` is carried because
// the packed/unpacked state is the entire reason to read this with no signal —
// "did I pack the spare paddle" is a question asked at the put-in.
export type KitEntryData = {
  id: string
  itemId: string | null
  itemName: string
  checked: boolean
}

function toKitEntryData(entry: PersonalPackingItem): KitEntryData {
  return {
    id: entry.id ?? "",
    itemId: entry.item?.id ?? null,
    // Matches what the screen renders for an unexpanded item, so the offline
    // row is not blank where the live row says "Item".
    itemName: entry.item?.name ?? "Item",
    checked: entry.checked ?? false,
  }
}

export async function saveKitCache(
  tripId: string,
  entries: PersonalPackingItem[],
  database: Database = productionDatabase,
): Promise<void> {
  const collection = database.collections.get<CachedPackingItem>("cached_packing_items")
  await database.write(async () => {
    const stale = await collection.query(Q.where("trip_id", tripId)).fetch()
    await database.batch(...stale.map((row) => row.prepareDestroyPermanently()))
    await database.batch(
      ...entries
        .filter((entry): entry is PersonalPackingItem & { id: string } => Boolean(entry.id))
        .map((entry) => {
          const card = toKitEntryData(entry)
          return collection.prepareCreateFromDirtyRaw({
            id: card.id,
            trip_id: tripId,
            item_id: card.itemId,
            item_name: card.itemName,
            checked: card.checked,
          })
        })
    )
  })
  await markCacheFresh(CACHE_KEY.tripKit(tripId), database)
}

export async function loadKitCache(
  tripId: string,
  database: Database = productionDatabase,
): Promise<KitEntryData[]> {
  const collection = database.collections.get<CachedPackingItem>("cached_packing_items")
  const rows = await collection.query(Q.where("trip_id", tripId)).fetch()
  return rows.map((row) => ({
    id: row.id,
    itemId: row.itemId ?? null,
    itemName: row.itemName,
    checked: row.checked ?? false,
  }))
}
