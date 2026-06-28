import { z } from "zod"
import { ConnectionUserSchema } from "./connection"

// A block row. The blocker is always the caller, so only the blocked party is
// projected. Mirrors BlockSchema on the backend. One-way and asymmetric.
export const BlockSchema = z.object({
  id: z.uuidv7().optional(),
  created: z.string().nullish(),
  blocked: ConnectionUserSchema,
})

export type Block = z.infer<typeof BlockSchema>
