"use server"

import { revalidatePath } from "next/cache"
import { apiPost, isRedirectError } from "@/lib/api/client"

export type ItineraryActionResult = { success: true; itineraryId: string } | { success: false; error: string }

export async function createItinerary(tripId: string): Promise<ItineraryActionResult> {
  try {
    const itinerary = await apiPost<{ id: string }>("/api/itinerary/create", { tripId })
    revalidatePath(`/trips/${tripId}`)
    return { success: true, itineraryId: itinerary.id }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to create itinerary." }
  }
}
