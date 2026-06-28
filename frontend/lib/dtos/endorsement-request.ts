import { z } from "zod"
import { ConnectionUserSchema } from "./connection"

// Shallow projection of the log an endorsement is requested for. Mirrors the
// backend _RequestLogSchema — enough to describe the paddle without exposing the
// private log body to the endorser.
export const RequestLogSchema = z.object({
  id: z.uuidv7(),
  date: z.string().nullish(),
  distance: z.number().nullish(),
  hours: z.number().nullish(),
  tripId: z.uuidv7().nullish(),
})

// An author-initiated request asking a trip-mate to endorse a specific log.
// Mirrors EndorsementRequestSchema on the backend. Serialise-only.
export const EndorsementRequestSchema = z.object({
  id: z.uuidv7().optional(),
  status: z.enum(["pending", "actioned"]),
  created: z.string().nullish(),
  respondedAt: z.string().nullish(),
  requester: ConnectionUserSchema,
  addressee: ConnectionUserSchema,
  log: RequestLogSchema,
})

export type RequestLog = z.infer<typeof RequestLogSchema>
export type EndorsementRequest = z.infer<typeof EndorsementRequestSchema>
