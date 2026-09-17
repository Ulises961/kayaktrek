import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"

import type { TripRequirement } from "@shared/dtos/inventory"

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
}

function toRequirementCardData(requirement: TripRequirement): RequirementCardData {
  return {
    id: requirement.id ?? "",
    name: requirement.name,
    status: requirement.status ?? null,
  }
}

export async function saveRequirementsCache(
  tripId: string,
  requirements: TripRequirement[],
  database: Database = productionDatabase,
): Promise<void> {
  const collection = database.collections.get<CachedRequirement>("cached_requirements")
  await database.write(async () => {
    const stale = await collection.query(Q.where("trip_id", tripId)).fetch()
    await database.batch(...stale.map((row) => row.prepareDestroyPermanently()))
    await database.batch(
      ...requirements
        .filter((requirement): requirement is TripRequirement & { id: string } =>
          Boolean(requirement.id),
        )
        .map((requirement) => {
          const card = toRequirementCardData(requirement)
          return collection.prepareCreateFromDirtyRaw({
            id: card.id,
            trip_id: tripId,
            name: card.name,
            status: card.status,
          })
        }),
    )
  })
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
  }))
}
