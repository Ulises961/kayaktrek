import { Q } from "nitromelondb"
import type { Database } from "nitromelondb"

import { expandVelocityField, type VelocityKind } from "../weather/velocity-descriptor"
import type { VelocityField } from "../weather/velocity"
import { database as productionDatabase } from "./database"
import type { VelocityDay, VelocityHour } from "./models"

// The map overlay's wind and swell fields from what the last pull saved on the phone
// (docs/mobile/sync-protocol-spec.md §6.5), so the overlay draws with no connection.

/** Whether a pull has saved this day's velocity: the overlay can be offered offline only if so. */
export async function hasCachedVelocity(dayId: string, database: Database = productionDatabase): Promise<boolean> {
  const days = await database.collections.get<VelocityDay>("velocity_days").query(Q.where("day_id", dayId)).fetchCount()
  return days > 0
}

/**
 * The saved field for a day, hour and layer. `undefined` means nothing has been saved for the
 * day (ask the server); `null` means it was saved and the day has no forecast for this layer
 * or hour. Throws when the saved data does not fit together, so a caller falls back rather than
 * drawing it.
 */
export async function loadCachedVelocityField(
  dayId: string,
  hour: number,
  kind: VelocityKind,
  database: Database = productionDatabase,
): Promise<VelocityField | null | undefined> {
  const [day] = await database.collections.get<VelocityDay>("velocity_days").query(Q.where("day_id", dayId)).fetch()
  if (!day) return undefined

  const [saved] = await database.collections
    .get<VelocityHour>("velocity_hours")
    .query(Q.where("day_id", dayId), Q.where("hour", hour))
    .fetch()
  if (!saved) return null

  return expandVelocityField(day, saved, kind)
}
