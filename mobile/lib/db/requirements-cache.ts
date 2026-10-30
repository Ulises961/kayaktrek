import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"

import type { TripRequirement } from "@shared/dtos/inventory"
import type { ItemCategory } from "@shared/dtos/item-category"
import { bucketByCategory } from "@shared/inventory/format"

import { CACHE_KEY, markCacheFresh } from "./cache-freshness"
import { database as productionDatabase } from "./database"
import { CachedRequirement } from "./models"

// Exactly the fields the Items screen's "Group" tab renders in its read-only
// (offline) branch — who's covering what (contributions, proposedBy) has no
// offline reader, same trim as logs-cache.ts's LogCardData dropping notes/
// geometry/endorsers. Covering, adding, and removing a requirement all need a
// connection regardless, so there's nothing to act on from cached data.
export type RequirementCardData = {
  id: string
  name: string
  status: string | null
  /** The heading's name — see `headingsById` — or null for an uncategorised requirement. */
  category: string | null
}

function toRequirementCardData(
  requirement: TripRequirement,
  headings: Map<string, string>,
): RequirementCardData {
  const id = requirement.id ?? ""
  return {
    id,
    name: requirement.name,
    status: requirement.status ?? null,
    category: headings.get(id) ?? null,
  }
}

// The category a requirement is stored under is a slug, or free text from before the slug was
// chosen from a list. Offline there is no category list to look a slug up in, so the heading it
// resolves to is saved instead, resolved the way the screen resolves it online.
function headingsById(
  requirements: TripRequirement[],
  categories: ItemCategory[],
): Map<string, string> {
  const headings = new Map<string, string>()
  for (const bucket of bucketByCategory(requirements, (r) => r.category, categories)) {
    if (!bucket.key) continue
    for (const requirement of bucket.entries) headings.set(requirement.id ?? "", bucket.label)
  }
  return headings
}

export async function saveRequirementsCache(
  tripId: string,
  requirements: TripRequirement[],
  categories: ItemCategory[],
  database: Database = productionDatabase,
): Promise<void> {
  const collection = database.collections.get<CachedRequirement>("cached_requirements")
  const headings = headingsById(requirements, categories)
  await database.write(async () => {
    const stale = await collection.query(Q.where("trip_id", tripId)).fetch()
    await database.batch(...stale.map((row) => row.prepareDestroyPermanently()))
    await database.batch(
      ...requirements
        .filter((requirement): requirement is TripRequirement & { id: string } =>
          Boolean(requirement.id),
        )
        .map((requirement) => {
          const card = toRequirementCardData(requirement, headings)
          return collection.prepareCreateFromDirtyRaw({
            id: card.id,
            trip_id: tripId,
            name: card.name,
            status: card.status,
            category: card.category,
          })
        }),
    )
  })
  await markCacheFresh(CACHE_KEY.tripRequirements(tripId), database)
}

export async function loadRequirementsCache(
  tripId: string,
  database: Database = productionDatabase,
): Promise<RequirementCardData[]> {
  const collection = database.collections.get<CachedRequirement>("cached_requirements")
  const rows = await collection.query(Q.where("trip_id", tripId)).fetch()
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    category: row.category ?? null,
  }))
}
