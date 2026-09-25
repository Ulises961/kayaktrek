import type { Database } from "nitromelondb"
import { Q } from "nitromelondb"
import { z } from "zod"

import { apiPost } from "../api/client"
import { getSession } from "../auth/session"
import { uuidv7 } from "../uuid"
import { database as productionDatabase } from "./database"
import { PendingMutation } from "./models"

// M9d: changes made offline, queued on the phone and sent as one batch when there
// is signal (docs/adr/mobile-offline.md "Sync up"; backend
// Services/mutation_queue_service.py). A screen that changes something offline
// queues it here and updates its own cache so the change shows at once.
//
// The route never comes through here — it is edited local-first on the synced
// route tables and pushed over its own channel (spec §8.2).

export const MUTATION_ENTITY = {
  TRIP_MEMBER: "trip_member",
  PACKING_ITEM: "packing_item",
  CONTRIBUTION: "contribution",
  LOG: "log",
  TRIP: "trip",
  CREW_DEPARTURE: "crew_departure",
} as const

export const MUTATION_OPERATION = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
} as const

export const MUTATION_STATUS = {
  PENDING: "pending",
  // The server refused it. Kept, with its reason, until the paddler dismisses it:
  // a change that silently vanished would be worse than one that visibly failed.
  REJECTED: "rejected",
} as const

export type MutationEntity = (typeof MUTATION_ENTITY)[keyof typeof MUTATION_ENTITY]
export type MutationOperation = (typeof MUTATION_OPERATION)[keyof typeof MUTATION_OPERATION]
export type MutationStatus = (typeof MUTATION_STATUS)[keyof typeof MUTATION_STATUS]

export type MutationInput = {
  entityType: MutationEntity
  operation: MutationOperation
  entityId: string
  payload?: Record<string, unknown>
}

export type QueuedMutation = {
  mutationId: string
  entityType: string
  operation: string
  entityId: string
  payload: Record<string, unknown>
  deviceTimestamp: string
  status: MutationStatus
  reason: string | null
}

// What the batch endpoint answers per envelope. "duplicate" carries what happened the
// first time; "failed" means try again later.
const MutationResultSchema = z.object({
  mutationId: z.string(),
  status: z.enum(["applied", "rejected", "duplicate", "failed"]),
  result: z.string().optional(),
  reason: z.string().optional(),
})
const BatchResponseSchema = z.object({ results: z.array(MutationResultSchema) })

// Enough for a long day offline without one request growing unbounded.
const BATCH_SIZE = 100

async function currentUserId(): Promise<string> {
  const session = await getSession()
  if (!session) throw new Error("Not signed in")
  return session.userId
}

function collection(database: Database) {
  return database.collections.get<PendingMutation>("pending_mutations")
}

function parsePayload(payload: string): Record<string, unknown> {
  try {
    const parsed: unknown = JSON.parse(payload)
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

function toQueued(row: PendingMutation): QueuedMutation {
  return {
    mutationId: row.mutationId,
    entityType: row.entityType,
    operation: row.operation,
    entityId: row.entityId,
    payload: parsePayload(row.payload),
    deviceTimestamp: new Date(row.deviceTimestamp).toISOString(),
    status: row.status === MUTATION_STATUS.REJECTED ? MUTATION_STATUS.REJECTED : MUTATION_STATUS.PENDING,
    reason: row.reason,
  }
}

/** Queue a change made on this phone. Returns its mutation id. */
export async function enqueueMutation(
  input: MutationInput,
  database: Database = productionDatabase,
  at: Date = new Date(),
): Promise<string> {
  const userId = await currentUserId()
  const mutationId = uuidv7(at)
  await database.write(async () => {
    await collection(database).create((row) => {
      row.mutationId = mutationId
      row.userId = userId
      row.entityType = input.entityType
      row.operation = input.operation
      row.entityId = input.entityId
      row.payload = JSON.stringify(input.payload ?? {})
      row.deviceTimestamp = at.getTime()
      row.status = MUTATION_STATUS.PENDING
      row.reason = null
    })
  })
  return mutationId
}

/** The signed-in paddler's queued and rejected changes, oldest first. */
export async function loadQueuedMutations(database: Database = productionDatabase): Promise<QueuedMutation[]> {
  const session = await getSession()
  if (!session) return []
  const rows = await collection(database)
    .query(Q.where("user_id", session.userId), Q.sortBy("device_timestamp", Q.asc))
    .fetch()
  return rows.map(toQueued)
}

export type PushSummary = { applied: number; rejected: number; kept: number }

/**
 * Send the queue. Applied changes are forgotten, rejected ones kept with their
 * reason, and anything the server could not process now stays queued. Throws when
 * there is no connection, leaving everything as it was.
 */
export async function pushQueuedMutations(database: Database = productionDatabase): Promise<PushSummary> {
  const summary: PushSummary = { applied: 0, rejected: 0, kept: 0 }
  const session = await getSession()
  if (!session) return summary

  const pending = await collection(database)
    .query(
      Q.where("user_id", session.userId),
      Q.where("status", MUTATION_STATUS.PENDING),
      Q.sortBy("device_timestamp", Q.asc),
    )
    .fetch()

  for (let start = 0; start < pending.length; start += BATCH_SIZE) {
    const batch = pending.slice(start, start + BATCH_SIZE)
    const response = BatchResponseSchema.parse(
      await apiPost<unknown>("/api/sync/mutations", {
        mutations: batch.map((row) => {
          const queued = toQueued(row)
          return {
            mutationId: queued.mutationId,
            entityType: queued.entityType,
            operation: queued.operation,
            entityId: queued.entityId,
            payload: queued.payload,
            deviceTimestamp: queued.deviceTimestamp,
          }
        }),
      }),
    )

    const byId = new Map(batch.map((row) => [row.mutationId, row]))
    await database.write(async () => {
      for (const result of response.results) {
        const row = byId.get(result.mutationId)
        if (!row) continue
        const outcome = result.status === "duplicate" ? result.result : result.status
        if (outcome === "applied") {
          await row.destroyPermanently()
          summary.applied += 1
        } else if (outcome === "rejected") {
          await row.update((record) => {
            record.status = MUTATION_STATUS.REJECTED
            record.reason = result.reason ?? "The server refused this change."
          })
          summary.rejected += 1
        } else {
          summary.kept += 1
        }
      }
    })
  }
  return summary
}

/** Drop one change, once the paddler has read why it was rejected. */
export async function discardMutation(mutationId: string, database: Database = productionDatabase): Promise<void> {
  const rows = await collection(database).query(Q.where("mutation_id", mutationId)).fetch()
  await database.write(async () => {
    for (const row of rows) await row.destroyPermanently()
  })
}

/** Drop everything a paddler queued — on sign-out, after they have been warned. */
export async function clearMutationsForUser(userId: string, database: Database = productionDatabase): Promise<void> {
  const rows = await collection(database).query(Q.where("user_id", userId)).fetch()
  await database.write(async () => {
    for (const row of rows) await row.destroyPermanently()
  })
}
