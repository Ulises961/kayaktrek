"use server"

import { revalidatePath } from "next/cache"
import { apiPost, apiDelete } from "@/lib/api/client"

export type TripActionResult = { success: true } | { success: false; error: string }

export async function inviteUser(tripId: string, userId: string): Promise<TripActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/invite`, { userId })
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to send invitation." }
  }
}

export async function cancelInvitation(tripId: string, inviteeId: string): Promise<TripActionResult> {
  try {
    await apiDelete(`/api/trip/${tripId}/invite/${inviteeId}`)
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to cancel invitation." }
  }
}

export async function handleInvitation(tripId: string, accepted: boolean): Promise<TripActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/invitation`, { accepted })
    revalidatePath(`/trips/${tripId}`)
    return { success: true }
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : "Failed to respond to invitation." }
  }
}
