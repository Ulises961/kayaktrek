import { z } from "zod"

// GeoJSON Point both ways, mirroring the backend GeometryField: [lng, lat].
const GeoJsonPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
})

// A static hazard-reminder marker for a place known to originate or accelerate
// wind (e.g. katabatic/valley-drainage flow) — NOT forecast-driven, and carries
// no rate/direction/intensity field, ever (docs/adr/features.md "Revision
// (M27): position-only diamond sharing"). Itinerary-scoped; any trip member may
// edit/delete (no creator-only gate — mirrors tidal diamonds, unlike Place).
export const WindDiamondSchema = z.object({
  id: z.string().uuid(),
  name: z.string().nullable().optional(),
  location: GeoJsonPointSchema,
  notes: z.string().nullable().optional(),
  itineraryId: z.string().uuid().nullable().optional(),
  createdByUserId: z.string().uuid().nullable().optional(),
  created: z.string().optional(),
})

// Drop-a-pin entry form for a wind diamond. Location comes from the map click,
// not the form — only the editable attributes live here.
export const WindDiamondFormSchema = z.object({
  name: z.string().trim().max(255, "Name is too long").nullable().optional(),
  notes: z.string().trim().max(2000, "Note is too long").nullable().optional(),
})

export type WindDiamond = z.infer<typeof WindDiamondSchema>
export type WindDiamondForm = z.infer<typeof WindDiamondFormSchema>

// Map the raw diamond onto edit-form values for prefilling the edit dialog.
export function windDiamondToFormValues(diamond: WindDiamond): WindDiamondForm {
  return {
    name: diamond.name ?? null,
    notes: diamond.notes ?? null,
  }
}

// Convenience accessors for the marker layer (GeoJSON stores [lng, lat]).
export function windDiamondLat(diamond: WindDiamond): number {
  return diamond.location.coordinates[1]
}

export function windDiamondLng(diamond: WindDiamond): number {
  return diamond.location.coordinates[0]
}
