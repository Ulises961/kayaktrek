import type { Trip } from "@/lib/dtos/trip"
import type { Connection } from "@/lib/dtos/connection"
import type { EndorsementRequest } from "@/lib/dtos/endorsement-request"

// Pure logic only — no "server-only" fetch/session plumbing here, so this
// module is safe to import from client components too (the sidebar
// notification entry needs `buildPendingRequestRows` client-side). The actual
// fetch lives in lib/requests/actions.ts, which imports this file, never the
// other way around.

export interface PendingRequestsSummary {
  tripInvitations: number
  buddyRequests: number
  endorsementRequests: number
}

export const EMPTY_PENDING_SUMMARY: PendingRequestsSummary = {
  tripInvitations: 0,
  buddyRequests: 0,
  endorsementRequests: 0,
}

// `connections` is expected already status-filtered to "pending" (both
// incoming and outgoing) — only rows addressed to `currentUserId` count as
// incoming.
export function summarizePending(
  invitations: Trip[],
  connections: Connection[],
  endorsements: EndorsementRequest[],
  currentUserId: string,
): PendingRequestsSummary {
  return {
    tripInvitations: invitations.length,
    buddyRequests: connections.filter((c) => c.addressee.id === currentUserId).length,
    endorsementRequests: endorsements.length,
  }
}

export interface PendingRequestRow {
  label: string
  href: string
}

// Derives the display rows (label + destination) shared by the sidebar
// notification entry and the dashboard summary — the one place that knows
// where each pending-request type is actually handled. Only nonzero types get
// a row; a zero-count type carries nothing to act on.
export function buildPendingRequestRows({
  tripInvitations,
  buddyRequests,
  endorsementRequests,
}: PendingRequestsSummary): PendingRequestRow[] {
  const rows: PendingRequestRow[] = []
  if (tripInvitations > 0) {
    rows.push({
      label: `${tripInvitations} trip ${tripInvitations === 1 ? "invitation" : "invitations"}`,
      href: "/invitations",
    })
  }
  if (buddyRequests > 0) {
    rows.push({
      label: `${buddyRequests} buddy ${buddyRequests === 1 ? "request" : "requests"}`,
      href: "/paddlers",
    })
  }
  if (endorsementRequests > 0) {
    rows.push({
      label: `${endorsementRequests} endorsement ${endorsementRequests === 1 ? "request" : "requests"}`,
      href: "/logs",
    })
  }
  return rows
}
