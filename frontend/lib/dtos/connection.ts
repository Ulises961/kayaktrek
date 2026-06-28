import { z } from "zod"

// Shallow, privacy-safe projection of a connection's counterparty. Mirrors the
// backend `_ConnectionUserSchema` — public-identity fields only, never contact or
// any private data.
export const ConnectionUserSchema = z.object({
  id: z.uuidv7().optional(),
  username: z.string(),
  name: z.string(),
  surname: z.string().nullish(),
  avatarUrl: z.string().url().nullish(),
})

// The caller's relationship to another paddler, as annotated by the backend search
// and derivable from a connection row. Drives which action button the UI renders.
export const RelationshipSchema = z.enum(["none", "pending_outgoing", "pending_incoming", "buddy"])

// A buddy connection row. Both parties are dumped shallowly; the client derives the
// direction by comparing the authenticated user against requester / addressee.
// Mirrors ConnectionSchema on the backend.
export const ConnectionSchema = z.object({
  id: z.uuidv7().optional(),
  status: z.enum(["pending", "accepted"]),
  created: z.string().nullish(),
  respondedAt: z.string().nullish(),
  requester: ConnectionUserSchema,
  addressee: ConnectionUserSchema,
})

export type ConnectionUser = z.infer<typeof ConnectionUserSchema>
export type Relationship = z.infer<typeof RelationshipSchema>
export type Connection = z.infer<typeof ConnectionSchema>
