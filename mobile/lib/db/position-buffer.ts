import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"
import { z } from "zod"

import { ApiError, apiPost } from "../api/client"
import { getSession } from "../auth/session"
import type { PositionFix } from "../live/position/types"
import { database as productionDatabase } from "./database"
import { PendingPositionPing } from "./models"

// M9e WP5: the paddler's own position fixes that could not be sent, kept for the track and uploaded
// oldest first when there is signal. They are not queued for the live map (a lost ping is superseded
// by the next); the expedition log is built from them, and the hours offshore without signal are the
// ones it would otherwise lose. Sent through `pushPending` (push-pending.ts) like everything else.

// A 10-hour day at one fix per 15 s is 2,400; past this the oldest are dropped.
export const BUFFER_CAP = 3000
// The server accepts at most 100 pings in one request.
const BATCH_SIZE = 100

const BatchAnswerSchema = z.object({ accepted: z.number(), duplicates: z.number() })

export type BufferPushSummary = { sent: number; discarded: number }

function collection(database: Database) {
  return database.collections.get<PendingPositionPing>("pending_position_pings")
}

async function currentUserId(): Promise<string | null> {
  const session = await getSession()
  return session ? session.userId : null
}

/** Keep one fix that could not be sent. Does nothing when nobody is signed in to own it. */
export async function bufferPing(
  tripId: string,
  fix: PositionFix,
  database: Database = productionDatabase,
): Promise<void> {
  const userId = await currentUserId()
  if (userId === null) return
  await database.write(async () => {
    await collection(database).create((row) => {
      row.tripId = tripId
      row.userId = userId
      row.lat = fix.lat
      row.lon = fix.lon
      row.accuracyM = fix.accuracyM
      row.headingDeg = fix.headingDeg
      row.speedMs = fix.speedMs
      row.recordedAt = fix.timestamp
    })
    const excess = (await collection(database).query(Q.where("user_id", userId)).fetchCount()) - BUFFER_CAP
    if (excess > 0) {
      const oldest = await collection(database)
        .query(Q.where("user_id", userId), Q.sortBy("recorded_at", Q.asc), Q.take(excess))
        .fetch()
      for (const row of oldest) await row.destroyPermanently()
    }
  })
}

/** How many fixes the signed-in paddler has waiting. */
export async function bufferedPingCount(database: Database = productionDatabase): Promise<number> {
  const userId = await currentUserId()
  if (userId === null) return 0
  return collection(database).query(Q.where("user_id", userId)).fetchCount()
}

/** Forget one trip's waiting fixes, for instance because the trip is over. */
export async function discardBufferedPings(tripId: string, database: Database = productionDatabase): Promise<number> {
  const userId = await currentUserId()
  if (userId === null) return 0
  const rows = await collection(database).query(Q.where("user_id", userId), Q.where("trip_id", tripId)).fetch()
  await database.write(async () => {
    for (const row of rows) await row.destroyPermanently()
  })
  return rows.length
}

function toWire(row: PendingPositionPing): Record<string, number | string> {
  return {
    lat: row.lat,
    lon: row.lon,
    ...(row.accuracyM !== null && { accuracyM: row.accuracyM }),
    ...(row.headingDeg !== null && { headingDeg: row.headingDeg }),
    ...(row.speedMs !== null && { speedMs: row.speedMs }),
    recordedAt: new Date(row.recordedAt).toISOString(),
  }
}

/**
 * Send the waiting fixes, oldest first, a trip at a time. Whatever the server took (or already had) is
 * forgotten. A trip the server answers 409, 403 or 404 for is over for this paddler, so its fixes are
 * discarded. Any other failure, including no connection, leaves what is left and throws so the push
 * retries.
 */
export async function pushBufferedPings(database: Database = productionDatabase): Promise<BufferPushSummary> {
  const summary: BufferPushSummary = { sent: 0, discarded: 0 }
  const userId = await currentUserId()
  if (userId === null) return summary

  const waiting = await collection(database)
    .query(Q.where("user_id", userId), Q.sortBy("recorded_at", Q.asc))
    .fetch()
  const byTrip = new Map<string, PendingPositionPing[]>()
  for (const row of waiting) byTrip.set(row.tripId, [...(byTrip.get(row.tripId) ?? []), row])

  for (const [tripId, rows] of byTrip) {
    for (let start = 0; start < rows.length; start += BATCH_SIZE) {
      const batch = rows.slice(start, start + BATCH_SIZE)
      try {
        BatchAnswerSchema.parse(await apiPost<unknown>(`/api/live/trip/${tripId}/positions`, { pings: batch.map(toWire) }))
      } catch (error) {
        if (error instanceof ApiError && [403, 404, 409].includes(error.status)) {
          const remaining = rows.slice(start)
          await database.write(async () => {
            for (const row of remaining) await row.destroyPermanently()
          })
          summary.discarded += remaining.length
          break
        }
        throw error
      }
      await database.write(async () => {
        for (const row of batch) await row.destroyPermanently()
      })
      summary.sent += batch.length
    }
  }
  return summary
}
