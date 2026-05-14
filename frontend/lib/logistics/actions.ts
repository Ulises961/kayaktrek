"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPut, isRedirectError } from "@/lib/api/client"
import { LogisticsSchema, type Logistics, type LogisticsFields } from "@/lib/dtos/logistics"

export type LogisticsActionResult = { success: true } | { success: false; error: string }

export async function getLogistics(tripId: string): Promise<Logistics | null> {
  const raw = await apiGet<unknown>(`/api/logistics/${tripId}`)
  if (!raw || typeof raw !== "object" || !("id" in raw)) return null
  return LogisticsSchema.parse(raw)
}

export async function upsertLogistics(tripId: string, fields: Partial<LogisticsFields>): Promise<LogisticsActionResult> {
  try {
    await apiPut(`/api/logistics/${tripId}`, fields)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to save logistics." }
  }
}
