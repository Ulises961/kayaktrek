"use server"

import { revalidatePath } from "next/cache"
import { apiGet, apiPost, apiDelete, isRedirectError } from "@/lib/api/client"
import { EndorsementRequestSchema } from "@/lib/dtos/endorsement-request"
import type { EndorsementRequest } from "@/lib/dtos/endorsement-request"

export type EndorsementRequestActionResult = { success: true } | { success: false; error: string }

export type RequestDirection = "incoming" | "outgoing"

// List the caller's pending endorsement requests. "incoming" = the endorser's
// "asked to endorse" inbox; "outgoing" = the author's outstanding asks.
export async function listEndorsementRequests(
  direction: RequestDirection,
): Promise<EndorsementRequest[]> {
  try {
    const raw = await apiGet<unknown>(`/api/endorsement-requests?direction=${direction}`)
    if (!Array.isArray(raw)) return []
    return raw.map((row) => EndorsementRequestSchema.parse(row))
  } catch (e) {
    if (isRedirectError(e)) throw e
    return []
  }
}

// Ask a trip-mate to endorse one of the caller's own trip-linked logs.
export async function requestEndorsement(
  logId: string,
  target: { username?: string; userId?: string },
): Promise<EndorsementRequestActionResult> {
  try {
    await apiPost("/api/endorsement-requests", {
      logId,
      addresseeUsername: target.username,
      addresseeId: target.userId,
    })
    revalidatePath("/logs")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    const msg = e instanceof Error ? e.message : String(e)
    if (msg.includes("409"))
      return { success: false, error: "You've already asked this paddler, or they've endorsed it." }
    if (msg.includes("403"))
      return { success: false, error: "You can't ask this paddler to endorse this log." }
    if (msg.includes("422"))
      return { success: false, error: "This log isn't linked to a trip, so it can't be endorsed." }
    return { success: false, error: "Failed to send endorsement request." }
  }
}

// Author cancels, or addressee declines — deletes the request (re-requestable).
export async function deleteEndorsementRequest(
  requestId: string,
): Promise<EndorsementRequestActionResult> {
  try {
    await apiDelete(`/api/endorsement-requests/${requestId}`)
    revalidatePath("/logs")
    return { success: true }
  } catch (e) {
    if (isRedirectError(e)) throw e
    return { success: false, error: "Failed to remove endorsement request." }
  }
}
