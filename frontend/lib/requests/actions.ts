import "server-only"
import { cache } from "react"
import { getSession } from "@/lib/auth/session"
import { apiGet, isRedirectError } from "@/lib/api/client"
import { PendingRequestsSummarySchema } from "@/lib/dtos/pending-requests"
import { EMPTY_PENDING_SUMMARY, type PendingRequestsSummary } from "./pending"

// The three "someone is waiting on you" counts (trip invitations, incoming buddy requests,
// incoming endorsement asks) for the header badge and the dashboard, from the one summary
// endpoint the badge's poll also reads. Both mount points share this single call per request
// via `cache()` (mirrors `getMe()`, lib/user/me.ts). A failure shows an empty badge rather
// than breaking the page it sits on.
export const getPendingRequestsSummary = cache(async (): Promise<PendingRequestsSummary> => {
  const session = await getSession()
  if (!session) return EMPTY_PENDING_SUMMARY

  try {
    const raw = await apiGet<unknown>("/api/pending-requests/summary")
    return PendingRequestsSummarySchema.parse(raw)
  } catch (e) {
    if (isRedirectError(e)) throw e
    return EMPTY_PENDING_SUMMARY
  }
})
