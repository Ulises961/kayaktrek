import { z } from "zod"

// One signed-in device. Mirrors the backend Session model as projected by
// SessionSchema (M17) — read-only: sessions are created by logging in and ended by
// revoking them, never edited.
//
// Both labels are deliberately coarse and may be absent: deviceLabel is derived from
// the User-Agent, locationLabel from the proxy's location headers, and neither is
// invented when the source says nothing.
export const SessionSchema = z.object({
  id: z.uuidv7(),
  deviceLabel: z.string().nullish(),
  locationLabel: z.string().nullish(),
  created: z.string(),
  lastUsedAt: z.string(),
  expiresAt: z.string(),
  isCurrent: z.boolean(),
})

export const SessionsSchema = z.array(SessionSchema)

export type Session = z.infer<typeof SessionSchema>
