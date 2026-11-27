import {
  NOTIFICATION_KIND,
  type NotificationKind,
  type PendingRequestsSummary,
} from "@/lib/dtos/pending-requests"

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
  acceptedTripInvitations: 0,
  acceptedBuddyRequests: 0,
}

// The counts for what is waiting on the user to answer.
type WaitingOnUser = Pick<
  PendingRequestsSummary,
  "tripInvitations" | "buddyRequests" | "endorsementRequests"
>

// What the notification badge shows: everything the user has not dealt with yet, requests to
// answer and answers to their own requests alike.
export function badgeTotal(summary: PendingRequestsSummary): number {
  return (
    summary.tripInvitations +
    summary.buddyRequests +
    summary.endorsementRequests +
    summary.acceptedTripInvitations +
    summary.acceptedBuddyRequests
  )
}

// The pages that list the requests the badge counts. A change in the counts has to reach these
// as well as the badge, so the header refreshes the page when it is on one of them.
const REQUEST_LISTING_PAGES = ["/dashboard", "/invitations", "/paddlers", "/logs"]

// A trip's Crew tab lists the invitations still pending on it, which an acceptance removes.
const TRIP_CREW_PAGE = /^\/trips\/[^/]+\/crew\/?$/

export function listsPendingRequests(pathname: string | null): boolean {
  if (!pathname) return false
  if (TRIP_CREW_PAGE.test(pathname)) return true
  return REQUEST_LISTING_PAGES.some((page) => pathname === page || pathname.startsWith(`${page}/`))
}

export interface PendingRequestRow {
  label: string
  href: string
  // Set on a row that reports an answer rather than asks for one: opening it clears that kind.
  clears?: NotificationKind
}

// The rows for answers to requests the user sent. Only the bell shows these; the dashboard lists
// what is waiting on the user.
export function buildNotificationRows({
  acceptedTripInvitations,
  acceptedBuddyRequests,
}: Pick<
  PendingRequestsSummary,
  "acceptedTripInvitations" | "acceptedBuddyRequests"
>): PendingRequestRow[] {
  const rows: PendingRequestRow[] = []
  if (acceptedTripInvitations > 0) {
    rows.push({
      label: `${acceptedTripInvitations} trip ${acceptedTripInvitations === 1 ? "invitation" : "invitations"} accepted`,
      href: "/trips",
      clears: NOTIFICATION_KIND.TRIP_INVITATION_ACCEPTED,
    })
  }
  if (acceptedBuddyRequests > 0) {
    rows.push({
      label: `${acceptedBuddyRequests} buddy ${acceptedBuddyRequests === 1 ? "request" : "requests"} accepted`,
      href: "/paddlers",
      clears: NOTIFICATION_KIND.BUDDY_REQUEST_ACCEPTED,
    })
  }
  return rows
}

// Derives the display rows (label + destination) shared by the sidebar
// notification entry and the dashboard summary — the one place that knows
// where each pending-request type is actually handled. Only nonzero types get
// a row; a zero-count type carries nothing to act on.
export function buildPendingRequestRows({
  tripInvitations,
  buddyRequests,
  endorsementRequests,
}: WaitingOnUser): PendingRequestRow[] {
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
