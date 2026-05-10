"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api/client"
import { ShuttleAssignmentSchema, type ShuttleAssignment, type ShuttleAssignmentFields } from "@/lib/dtos/shuttle-assignment"

export type ShuttleActionResult = { success: true } | { success: false; error: string }

export async function getShuttleAssignments(tripId: string): Promise<ShuttleAssignment[]> {
  const raw = await apiGet<unknown[]>(`/api/shuttle/${tripId}/all`)
  return raw.map((a) => ShuttleAssignmentSchema.parse(a))
}

export async function createShuttleAssignment(tripId: string, fields: Partial<ShuttleAssignmentFields>): Promise<ShuttleActionResult> {
  try {
    await apiPost(`/api/shuttle/${tripId}/create`, fields)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to create shuttle assignment." }
  }
}

export async function updateShuttleAssignment(tripId: string, assignmentId: string, fields: Partial<ShuttleAssignmentFields>): Promise<ShuttleActionResult> {
  try {
    await apiPatch(`/api/shuttle/${assignmentId}`, fields)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to update shuttle assignment." }
  }
}

export async function deleteShuttleAssignment(tripId: string, assignmentId: string): Promise<ShuttleActionResult> {
  try {
    await apiDelete(`/api/shuttle/${assignmentId}`)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete shuttle assignment." }
  }
}
