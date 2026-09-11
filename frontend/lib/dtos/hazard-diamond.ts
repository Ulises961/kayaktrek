import { z } from "zod"

// Position-only cross-trip view of a tidal or wind diamond (M27 "Revision
// (M27): position-only diamond sharing" — docs/adr/features.md). An unlabeled
// pin, never the diamond's content (name/notes/rate/direction).
export const HazardDiamondPositionSchema = z.object({
  id: z.string().uuid(),
  lat: z.number(),
  lng: z.number(),
  kind: z.enum(["tidal", "wind"]),
})

export type HazardDiamondPosition = z.infer<typeof HazardDiamondPositionSchema>
