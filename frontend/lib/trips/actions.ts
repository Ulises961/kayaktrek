"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { apiGet, apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"
import { TripSchema } from "@/lib/dtos/trip"
import type { TripMember } from "@/lib/dtos/trip-member"

export type TripActionResult = { success: true } | { success: false; error: string }
export type CreateTripResult = { success: true; tripId: string } | { success: false; error: string }

interface TripFields {
  destination?: string
  description?: string
  dateFrom?: string
  dateTo?: string
  difficulty?: string | null
}

export async function createTrip(fields: TripFields): Promise<CreateTripResult> {
  try {
    const trip = await apiPost<{ id: string }>("/api/trip/create", fields)
    return { success: true, tripId: trip.id }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to create trip." }
  }
}

export async function updateTrip(tripId: string, fields: TripFields): Promise<TripActionResult> {
  try {
    await apiPatch(`/api/trip/${tripId}`, fields)
    // Destination/dates/difficulty are shown in the layout-owned header, not
    // just the current segment — revalidate the layout so it isn't stale.
    revalidatePath("/trips/[id]", "layout")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to update trip." }
  }
}

export async function advanceState(tripId: string, targetState: string): Promise<TripActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/state`, { state: targetState })
    // The state badge/timeline live in the layout-owned header.
    revalidatePath("/trips/[id]", "layout")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to advance trip state.",
    }
  }
}

export async function removeMember(tripId: string, userId: string): Promise<TripActionResult> {
  try {
    await apiDelete(`/api/trip/${tripId}/member/${userId}`)
    // Travellers feed both the layout header's avatar cluster and the crew
    // segment's member list.
    revalidatePath("/trips/[id]", "layout")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to remove member." }
  }
}

export async function deleteTrip(tripId: string): Promise<TripActionResult> {
  try {
    await apiDelete(`/api/trip/${tripId}`)
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete trip." }
  }
  redirect("/trips")
}

// The trip's crew (travellers). Used by the "ask to endorse" picker to list the
// candidates an author can ask to endorse a trip-linked log.
export async function getTripCrew(tripId: string): Promise<TripMember[]> {
  try {
    const raw = await apiGet(`/api/trip/${tripId}`)
    return TripSchema.parse(raw).travellers ?? []
  } catch (e) {
    if (isRedirectError(e)) throw e
    return []
  }
}

export async function inviteUser(tripId: string, email: string): Promise<TripActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/invite`, { email })
    // Pending invitations are only rendered on the crew segment.
    revalidatePath(`/trips/${tripId}/crew`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to send invitation." }
  }
}

export async function inviteBuddy(tripId: string, userId: string): Promise<TripActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/invite`, { userId })
    revalidatePath(`/trips/${tripId}/crew`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : "Failed to send invitation."
    if (msg.includes("403")) return { success: false, error: "You can't invite this paddler." }
    return { success: false, error: msg }
  }
}

export async function cancelInvitation(
  tripId: string,
  inviteeId: string,
): Promise<TripActionResult> {
  try {
    await apiDelete(`/api/trip/${tripId}/invite/${inviteeId}`)
    revalidatePath(`/trips/${tripId}/crew`)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to cancel invitation.",
    }
  }
}

export async function handleInvitation(
  tripId: string,
  accepted: boolean,
): Promise<TripActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/invitation`, { accepted })
    // Called from /invitations, not the trip detail itself — but acceptance
    // changes travellers, which the layout header shows on next visit.
    revalidatePath("/trips/[id]", "layout")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to respond to invitation.",
    }
  }
}
