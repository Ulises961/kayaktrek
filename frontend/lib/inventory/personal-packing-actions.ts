"use server"

import { revalidatePath } from "next/cache"
import { apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"

export type PackingActionResult = { success: true } | { success: false; error: string }

// Adds one of the caller's owned gear-closet items to their private packing
// list for the trip. The backend scopes everything to the caller's TripMember.
export async function addPackingItem(tripId: string, itemId: string): Promise<PackingActionResult> {
  try {
    await apiPost("/api/packing/create", { tripId, itemId })
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to add to your kit." }
  }
}

// Toggles the packed flag on one of the caller's own packing entries.
export async function togglePackingItem(
  entryId: string,
  checked: boolean,
  tripId: string,
): Promise<PackingActionResult> {
  try {
    await apiPatch(`/api/packing/${entryId}`, { checked })
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update your kit." }
  }
}

export async function removePackingItem(
  entryId: string,
  tripId: string,
): Promise<PackingActionResult> {
  try {
    await apiDelete(`/api/packing/${entryId}`)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to remove from your kit.",
    }
  }
}
