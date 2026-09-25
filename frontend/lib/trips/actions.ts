"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { apiGet, apiPost, apiPatch, apiDelete, isRedirectError } from "@/lib/api/client"
import { getSession } from "@/lib/auth/session"
import { type Difficulty } from "@/lib/dtos/difficulty"
import {
  TripPageSchema,
  type Trip,
  type TripPage,
  type TripSort,
  type TripState,
  TripSchema,
} from "@/lib/dtos/trip"
import type { TripMember } from "@/lib/dtos/trip-member"

export type TripActionResult = { success: true } | { success: false; error: string }
export type CreateTripResult = { success: true; tripId: string } | { success: false; error: string }

const EMPTY_TRIP_PAGE: TripPage = { items: [], total: 0, page: 1, pages: 1 }

export type TripListFilters = {
  state?: TripState
  sort?: TripSort
  difficulty?: Difficulty
  minMiles?: number
  maxMiles?: number
  page?: number
}

// Backend user is always the authenticated caller (from the session, never a
// client-supplied id) — the endpoint is path-scoped to a user id for
// ownership, not something a caller picks.
export async function listTrips(filters: TripListFilters): Promise<TripPage> {
  const session = await getSession()
  if (!session) return EMPTY_TRIP_PAGE

  const params = new URLSearchParams()
  params.set("page", String(filters.page ?? 1))
  if (filters.state) params.set("state", filters.state)
  if (filters.sort) params.set("sort", filters.sort)
  if (filters.difficulty) params.set("difficulty", filters.difficulty)
  if (filters.minMiles != null) params.set("min_miles", String(filters.minMiles))
  if (filters.maxMiles != null) params.set("max_miles", String(filters.maxMiles))

  // No catch: an empty page here reads as "you have no trips" — the Trips page's empty state —
  // so a failed fetch must reach the error boundary (page) or the caller's own handler (the
  // client-side re-query and Load more) instead of masquerading as an empty list.
  const raw = await apiGet<unknown>(`/api/trip/${session.userId}/all?${params}`)
  return TripPageSchema.parse(raw)
}

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

export async function pauseTrip(tripId: string): Promise<TripActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/pause`, {})
    // The paused banner/timeline live in the layout-owned header.
    revalidatePath("/trips/[id]", "layout")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to pause trip." }
  }
}

export async function resumeTrip(tripId: string, resumeDate?: string): Promise<TripActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/resume`, resumeDate ? { resumeDate } : {})
    revalidatePath("/trips/[id]", "layout")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to resume trip." }
  }
}

export async function abortTrip(tripId: string): Promise<TripActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/abort`, {})
    revalidatePath("/trips/[id]", "layout")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to abort trip." }
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

// Leader-only — always deletes the trip and all its data for every member.
export async function deleteTripForEveryone(tripId: string): Promise<TripActionResult> {
  try {
    await apiDelete(`/api/trip/${tripId}`)
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to delete trip." }
  }
  redirect("/trips")
}

// Any member removes their own membership. If the leader leaves and crew
// remain, the trip survives with no leader — see claimLeadership.
export async function leaveTrip(tripId: string): Promise<TripActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/leave`, {})
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to leave trip." }
  }
  redirect("/trips")
}

export async function nominateSuccessor(tripId: string, userId: string): Promise<TripActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/member/${userId}/nominate-successor`, {})
    // The successor picker and the leaderless-claim banner both read
    // travellers off the layout-owned header data.
    revalidatePath("/trips/[id]", "layout")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to nominate successor.",
    }
  }
}

export async function clearNomination(tripId: string): Promise<TripActionResult> {
  try {
    await apiDelete(`/api/trip/${tripId}/nominate-successor`)
    revalidatePath("/trips/[id]", "layout")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to clear nomination.",
    }
  }
}

export async function claimLeadership(tripId: string): Promise<TripActionResult> {
  try {
    await apiPost(`/api/trip/${tripId}/claim-leadership`, {})
    revalidatePath("/trips/[id]", "layout")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return {
      success: false,
      error: e instanceof Error ? e.message : "Failed to claim leadership.",
    }
  }
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

// The given user's outstanding crew invitations — trips they've been invited to
// but haven't accepted/declined yet. Surfaced at /invitations and reused by the
// sidebar/dashboard pending-requests summary (lib/requests/actions.ts).
export async function listTripInvitations(userId: string): Promise<Trip[]> {
  try {
    const raw = await apiGet<unknown>(`/api/trip/${userId}/invitations`)
    if (!Array.isArray(raw)) return []
    return raw.map((row) => TripSchema.parse(row))
  } catch (e) {
    if (isRedirectError(e)) throw e
    return []
  }
}
