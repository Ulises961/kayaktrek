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

// One poll's answer. `truncated` means the exact list of changes since the cursor cannot be
// given (the server's log was trimmed, expired or lost), so `changes` is empty and the
// client should refresh everything it shows.
export const TripChangesPageSchema = z.object({
  rev: z.number().int().nonnegative(),
  changes: z.array(TripChangeSchema),
  truncated: z.boolean(),
})

export type TripChange = z.infer<typeof TripChangeSchema>
export type TripChangesPage = z.infer<typeof TripChangesPageSchema>
