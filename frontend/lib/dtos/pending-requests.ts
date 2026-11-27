import { z } from "zod"

// GET /api/v1/pending-requests/summary: what is waiting on the caller (the first three counts),
// and the answers to requests they sent that they have not seen yet (the last two). Together
// they are the notification badge.
export const PendingRequestsSummarySchema = z.object({
  tripInvitations: z.number().int().min(0),
  buddyRequests: z.number().int().min(0),
  endorsementRequests: z.number().int().min(0),
  acceptedTripInvitations: z.number().int().min(0),
  acceptedBuddyRequests: z.number().int().min(0),
})

export type PendingRequestsSummary = z.infer<typeof PendingRequestsSummarySchema>

// Which kind of notification a row of the bell clears when it is opened. The backend's wire values.
export const NOTIFICATION_KIND = {
  TRIP_INVITATION_ACCEPTED: "trip_invitation_accepted",
  BUDDY_REQUEST_ACCEPTED: "buddy_request_accepted",
} as const
export type NotificationKind = (typeof NOTIFICATION_KIND)[keyof typeof NOTIFICATION_KIND]
