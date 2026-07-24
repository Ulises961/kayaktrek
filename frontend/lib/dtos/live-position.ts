import { z } from "zod"

// Wire shape published by the backend's LivePositionService.to_broadcast_dict
// (M8 §D2) — relayed verbatim by the SSE sidecar as both the `snapshot` array
// entries and each `position` event's payload.
export const LivePositionSchema = z.object({
  userId: z.string(),
  name: z.string(),
  lat: z.number(),
  lon: z.number(),
  accuracyM: z.number().nullable(),
  headingDeg: z.number().nullable(),
  speedMs: z.number().nullable(),
  recordedAt: z.string(),
})

export type LivePosition = z.infer<typeof LivePositionSchema>
