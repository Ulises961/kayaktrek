"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"
import { LOG_SORT, LogPageSchema, type LogFields, type LogPage, type LogSort } from "@/lib/dtos/log"
import { StatsSchema } from "@/lib/dtos/public-profile"
import type { Stats } from "@/lib/dtos/public-profile"

export type LogActionResult = { success: true } | { success: false; error: string }

const EMPTY_LOG_PAGE: LogPage = { items: [], total: 0, page: 1, pages: 1 }

export async function listMyLogs(page = 1, sort: LogSort = LOG_SORT.NEWEST): Promise<LogPage> {
  try {
    const raw = await apiGet<unknown>(`/api/log/all?page=${page}&sort=${sort}`)
    return LogPageSchema.parse(raw)
  } catch {
    return EMPTY_LOG_PAGE
  }
}

export async function listEndorsedLogs(
  page = 1,
  sort: LogSort = LOG_SORT.NEWEST,
): Promise<LogPage> {
  try {
    const raw = await apiGet<unknown>(`/api/log/endorsed?page=${page}&sort=${sort}`)
    return LogPageSchema.parse(raw)
  } catch {
    return EMPTY_LOG_PAGE
  }
}

// Aggregate stats for the authenticated paddler. Reuses the same shape the public
// profile exposes (StatsSchema). Throws on failure — callers render via the page.
export async function getMyStats(): Promise<Stats> {
  const raw = await apiGet<unknown>("/api/log/stats")
  return StatsSchema.parse(raw)
}

export async function createLog(fields: LogFields): Promise<LogActionResult> {
  try {
    await apiPost("/api/log/create", fields)
    revalidatePath("/logs")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to create log." }
  }
}

export async function updateLog(logId: string, fields: LogFields): Promise<LogActionResult> {
  try {
    await apiPatch(`/api/log/${logId}`, fields)
    revalidatePath("/logs")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update log." }
  }
}

export async function deleteLog(logId: string): Promise<LogActionResult> {
  try {
    await apiDelete(`/api/log/${logId}`)
    revalidatePath("/logs")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete log." }
  }
}

// Endorse another paddler's trip-linked log under the same-trip rule. The backend
// enforces eligibility (shared trip, not self, log is trip-linked) and returns
// 403 (not allowed) or 422 (non-endorsable) — surface those reasons cleanly.
export async function endorseLog(logId: string): Promise<LogActionResult> {
  try {
    await apiPost(`/api/log/${logId}/endorse`, {})
    revalidatePath("/logs")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : ""
    if (msg.includes("403"))
      return { success: false, error: "You can only endorse logs from a trip you shared." }
    if (msg.includes("422"))
      return { success: false, error: "This log isn't linked to a trip, so it can't be endorsed." }
    return { success: false, error: "Failed to endorse log." }
  }
}

export async function unendorseLog(logId: string): Promise<LogActionResult> {
  try {
    await apiDelete(`/api/log/${logId}/endorse`)
    revalidatePath("/logs")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: "Failed to withdraw endorsement." }
  }
}
