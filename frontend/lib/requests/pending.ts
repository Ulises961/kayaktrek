import type { PendingRequestsSummary } from "@/lib/dtos/pending-requests"

// Pure logic only — no "server-only" fetch/session plumbing here, so this
// module is safe to import from client components too (the sidebar
// notification entry needs `buildPendingRequestRows` client-side). The actual
// fetch lives in lib/requests/actions.ts, which imports this file, never the
// other way around.

export type { PendingRequestsSummary }

export const EMPTY_PENDING_SUMMARY: PendingRequestsSummary = {
  tripInvitations: 0,
  buddyRequests: 0,
  endorsementRequests: 0,
}

// The pages that list the requests the badge counts. A change in the counts has to reach these
// as well as the badge, so the header refreshes the page when it is on one of them.
const REQUEST_LISTING_PAGES = ["/dashboard", "/invitations", "/paddlers", "/logs"]

export function listsPendingRequests(pathname: string | null): boolean {
  if (!pathname) return false
  return REQUEST_LISTING_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))
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
