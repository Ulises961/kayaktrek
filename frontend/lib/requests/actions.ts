import "server-only"
import { cache } from "react"
import { getSession } from "@/lib/auth/session"
import { listTripInvitations } from "@/lib/trips/actions"
import { listConnections } from "@/lib/connections/actions"
import { listEndorsementRequests } from "@/lib/endorsement-requests/actions"
import { summarizePending, EMPTY_PENDING_SUMMARY, type PendingRequestsSummary } from "./pending"

// Aggregates the three independent "someone is waiting on you" surfaces (trip
// invitations, incoming buddy requests, incoming endorsement asks) into one
// summary for the sidebar notification entry and the dashboard — both mount
// points share this single upstream set of calls per request via `cache()`
// (mirrors `getMe()`, lib/user/me.ts).
export const getPendingRequestsSummary = cache(async (): Promise<PendingRequestsSummary> => {
  const session = await getSession()
  if (!session) return EMPTY_PENDING_SUMMARY

  const [invitations, connections, endorsements] = await Promise.all([
    listTripInvitations(session.userId),
    listConnections("pending"),
    listEndorsementRequests("incoming"),
  ])

  return summarizePending(invitations, connections, endorsements, session.userId)
})
