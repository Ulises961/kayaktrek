"use server"

import { ApiError, apiPost, isRedirectError } from "@/lib/api/client"
import { API_PREFIX, SSE_URL } from "@/lib/api/config"

export type PositionPingInput = {
  lat: number
  lon: number
  accuracyM?: number
  headingDeg?: number
  speedMs?: number
  recordedAt?: string
}

export type SendPositionPingResult = { success: true } | { success: false; error: string }

export async function sendPositionPing(
  tripId: string,
  ping: PositionPingInput,
): Promise<SendPositionPingResult> {
  try {
    await apiPost<unknown>(`/api/live/trip/${tripId}/position`, ping)
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to send position." }
  }
}

export type CloseDayResult = { success: true } | { success: false; error: string }

export async function closeDay(tripId: string, date?: string): Promise<CloseDayResult> {
  try {
    await apiPost<unknown>(`/api/live/trip/${tripId}/close-day`, date ? { date } : {})
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: e instanceof Error ? e.message : "Failed to close the day." }
  }
}

// Mints a trip-changes ticket (M36) and returns the sidecar URL the browser polls for the
// crew's changes. Distinct from getStreamTicket: that one opens the position stream and ends
// when a trip is no longer happening; this one is valid in every state.
//
// `null` means the server said no — the caller is not on the trip. Anything else that goes
// wrong throws: the poller must not take a backend that is down for a removed member.
export async function getChangesPollUrl(tripId: string): Promise<string | null> {
  try {
    const { ticket } = await apiPost<{ ticket: string }>(
      `/api/live/trip/${tripId}/changes-ticket`,
      {},
    )
    return `${SSE_URL}${API_PREFIX}/live/trip/${tripId}/changes?ticket=${ticket}`
  } catch (e) {
    if (isRedirectError(e)) throw e
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) return null
    throw e
  }
}

// Mints a fresh stream ticket (§D5) and returns the full sidecar URL the browser's
// EventSource should connect to, or null on failure (e.g. not a trip member).
export async function getStreamTicket(tripId: string): Promise<string | null> {
  try {
    const { ticket } = await apiPost<{ ticket: string }>(
      `/api/live/trip/${tripId}/stream-ticket`,
      {},
    )
    return `${SSE_URL}${API_PREFIX}/live/trip/${tripId}/stream?ticket=${ticket}`
  } catch (e) {
    if (isRedirectError(e)) throw e
    return null
  }
}
