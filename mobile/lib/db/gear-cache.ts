import type { Database } from "nitromelondb"

import type { Item } from "@shared/dtos/item"

import { CACHE_KEY, markCacheFresh } from "./cache-freshness"
import { database as productionDatabase } from "./database"
import { CachedGear } from "./models"

// The user's gear closet (`Item`): trip-independent, unlike the kit and
// requirement caches, so the whole table replaces wholesale on every
// successful fetch — same shape as trip-list-cache, no trip to scope by.
//
// What the two offline readers render off a piece of gear. The Items screen's
// contribute list needs the name and the `status` that decides whether it can
// be added to a kit ("owned") or is only a suggestion; M30 WP5's Gear screen
// additionally groups by category and renders M10's default-pack flag.
//
// Those last two were originally dropped as having no offline reader — true
// when written, false once the Gear screen shipped. Without them that screen
// showed every item as unfiled and not-default regardless of what it is, which
// for default-pack is a misrepresentation of what the next trip will look like
// rather than a missing detail.
export type GearCardData = {
  id: string
  name: string
  status: string | null
  categoryName: string | null
  defaultPack: boolean
}

function toGearCardData(item: Item): GearCardData {
  return {
    id: item.id ?? "",
    name: item.name ?? "",
    status: item.status ?? null,
    categoryName: item.category?.name ?? null,
    // Coerced rather than carried as nullable: absent must read as off, never
    // as "unknown" that a chip then renders indistinguishably from on.
    defaultPack: item.defaultPack ?? false,
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
            category_name: card.categoryName,
            default_pack: card.defaultPack,
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
    categoryName: row.categoryName ?? null,
    defaultPack: row.defaultPack ?? false,
  }))
}
