import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"

import { getSession } from "../auth/session"
import { database as productionDatabase } from "./database"
import { TripMember } from "./models"

const LEADER = "leader"

// Whether the signed-in paddler leads this trip, read from the crew rows every
// sync already stores — so the phone can offer leader-only editing (M9d) with no
// signal. The server checks again when the change arrives; this only decides what
// to offer.
export async function isTripLeader(tripId: string, database: Database = productionDatabase): Promise<boolean> {
  const session = await getSession()
  if (!session) return false
  const rows = await database.collections
    .get<TripMember>("trip_members")
    .query(Q.where("trip_id", tripId), Q.where("user_id", session.userId))
    .fetch()
  return rows[0]?.role === LEADER
}
