import { z } from "zod"

// GET /api/v1/pending-requests/summary: what is waiting on the caller, as three counts.
export const PendingRequestsSummarySchema = z.object({
  tripInvitations: z.number().int().min(0),
  buddyRequests: z.number().int().min(0),
  endorsementRequests: z.number().int().min(0),
})

export type PendingRequestsSummary = z.infer<typeof PendingRequestsSummarySchema>
