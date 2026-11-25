"use server"

import { apiGet, isRedirectError } from "@/lib/api/client"
import {
  PendingRequestsSummarySchema,
  type PendingRequestsSummary,
} from "@/lib/dtos/pending-requests"

// The badge's poll (use-pending-requests.ts). Returns null when the answer could not be had, so
// the caller keeps showing the counts it already has: a dropped request is not "nothing waiting".
// A dead session still redirects, because that is a real answer.
export async function refreshPendingRequests(): Promise<PendingRequestsSummary | null> {
  try {
    const raw = await apiGet<unknown>("/api/pending-requests/summary")
    return PendingRequestsSummarySchema.parse(raw)
  } catch (e) {
    if (isRedirectError(e)) throw e
    return null
  }
}
