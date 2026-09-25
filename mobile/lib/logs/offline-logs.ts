import type { Log, LogFields } from "@shared/dtos/log"

import { isOfflineError } from "../api/client"
import { type LogCardData, removeCachedLog, upsertCachedLog } from "../db/logs-cache"
import { MUTATION_ENTITY, MUTATION_OPERATION, enqueueMutation, pushQueuedMutations } from "../db/mutation-queue"
import { uuidv7 } from "../uuid"
import { createLog, deleteLog, updateLog } from "./actions"

// M9d WP8: logs written, edited and deleted at camp. Each goes to the server when
// it can be reached; when it can't, it is queued for the batch endpoint and the
// logs cache is updated so the list shows it at once. A log the server refused
// (invalid values) is not queued — that would only be refused again later.

export type LogSaveOutcome = "sent" | "queued"

function unreachable(error: unknown): boolean {
  return error instanceof Error && isOfflineError(error.message)
}

async function queue(operation: "create" | "update" | "delete", entityId: string, payload?: LogFields) {
  await enqueueMutation({
    entityType: MUTATION_ENTITY.LOG,
    operation:
      operation === "create"
        ? MUTATION_OPERATION.CREATE
        : operation === "update"
          ? MUTATION_OPERATION.UPDATE
          : MUTATION_OPERATION.DELETE,
    entityId,
    payload,
  })
  void pushQueuedMutations().catch(() => undefined)
}

function card(id: string, fields: LogFields, endorsementCount: number | null): LogCardData {
  return {
    id,
    date: fields.date ?? null,
    hours: fields.hours ?? null,
    distance: fields.distance ?? null,
    avgSea: fields.avgSea ?? null,
    endorsementCount,
  }
}

export async function createLogAnywhere(fields: LogFields): Promise<LogSaveOutcome> {
  try {
    await createLog(fields)
    return "sent"
  } catch (error) {
    if (!unreachable(error)) throw error
  }
  const id = uuidv7()
  await queue("create", id, fields)
  await upsertCachedLog(card(id, fields, 0), "mine")
  return "queued"
}

/** The server's updated log, or null when the edit was queued. */
export async function updateLogAnywhere(id: string, fields: LogFields): Promise<Log | null> {
  try {
    return await updateLog(id, fields)
  } catch (error) {
    if (!unreachable(error)) throw error
  }
  await queue("update", id, fields)
  await upsertCachedLog(card(id, fields, null), "mine")
  return null
}

export async function deleteLogAnywhere(id: string): Promise<LogSaveOutcome> {
  try {
    await deleteLog(id)
    return "sent"
  } catch (error) {
    if (!unreachable(error)) throw error
  }
  await queue("delete", id)
  await removeCachedLog(id)
  return "queued"
}
