import { z } from "zod"

export const TRIP_CHANGE_OPERATION = {
  CREATE: "create",
  UPDATE: "update",
  DELETE: "delete",
} as const

// Identity only — never field values. A subscriber refetches through its normal read
// path, so what it may see is decided there and not by what the stream chose to send.
export const TripChangeSchema = z.object({
  t: z.string(),
  id: z.string(),
  op: z.enum([
    TRIP_CHANGE_OPERATION.CREATE,
    TRIP_CHANGE_OPERATION.UPDATE,
    TRIP_CHANGE_OPERATION.DELETE,
  ]),
})

export const TripChangeHelloSchema = z.object({ rev: z.number().int().nonnegative() })

export const TripChangeMessageSchema = z.object({
  rev: z.number().int().nonnegative(),
  changes: z.array(TripChangeSchema),
})

export type TripChange = z.infer<typeof TripChangeSchema>
export type TripChangeMessage = z.infer<typeof TripChangeMessageSchema>
