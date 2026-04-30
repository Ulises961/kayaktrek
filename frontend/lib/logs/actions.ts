"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { apiPost, apiPatch, apiDelete } from "@/lib/api/client"
import type { LogFields } from "@/lib/dtos/log"

export type LogActionResult = { success: true } | { success: false; error: string }

export async function createLog(fields: LogFields): Promise<LogActionResult> {
  try {
    await apiPost("/api/log/create", fields)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create log." }
  }
}

export async function updateLog(logId: string, fields: LogFields): Promise<LogActionResult> {
  try {
    await apiPatch(`/api/log/${logId}`, fields)
    revalidatePath("/logs")
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update log." }
  }
}

export async function deleteLog(logId: string): Promise<LogActionResult> {
  try {
    await apiDelete(`/api/log/${logId}`)
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete log." }
  }
  redirect("/logs")
}
