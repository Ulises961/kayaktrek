import { z } from "zod"

// GeoJSON Point both ways, mirroring the backend GeometryField: [lng, lat].
const GeoJsonPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
})

// A seeded kind of map place (freshwater, food, campsite…). Read-only from the
// client — categories are seeded on the backend, never authored here. `icon` is a
// kebab-case Lucide glyph name the marker layer resolves to a component.
export const PlaceCategorySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  icon: z.string().nullable().optional(),
})

// A standing geographic mark dropped on the map — NOT a route Point. Mirrors the
// GET /api/place/* response: location is a GeoJSON Point; the resolved category is
// nested so a marker renders without a join. Ownership/visibility are server-stamped.
export const PlaceSchema = z.object({
  id: z.string().uuid(),
  location: GeoJsonPointSchema,
  category: PlaceCategorySchema,
  label: z.string(),
  note: z.string().nullable().optional(),
  visibility: z.enum(["private", "public"]),
  itineraryId: z.string().uuid().nullable().optional(),
  createdByUserId: z.string().uuid().nullable().optional(),
  created: z.string().optional(),
})

// Drop-a-pin entry form for a place. Location comes from the map click, not the
// form, so only the editable attributes live here. Validation mirrors
// PlaceSchema / PlaceUpdateSchema on the backend (label required, ≤255 chars).
export const PlaceFormSchema = z.object({
  categoryId: z.string().uuid("Choose a category"),
  label: z.string().trim().min(1, "Label is required").max(255, "Label is too long"),
  note: z.string().trim().max(2000, "Note is too long").nullable().optional(),
})

export type PlaceCategory = z.infer<typeof PlaceCategorySchema>
export type Place = z.infer<typeof PlaceSchema>
export type PlaceForm = z.infer<typeof PlaceFormSchema>

// A place enriched with whether the current user created it — drives the
// creator-only edit/delete affordance. `mine` is computed in the server action
// (it compares createdByUserId against the session), never sent by the backend.
export type PlaceWithOwnership = Place & { mine: boolean }

// Map the raw place onto edit-form values for prefilling the edit dialog.
export function placeToFormValues(place: Place): PlaceForm {
  return {
    categoryId: place.category.id,
    label: place.label,
    note: place.note ?? null,
  }
}

// Convenience accessors for the marker layer (GeoJSON stores [lng, lat]).
export function placeLat(place: Place): number {
  return place.location.coordinates[1]
}

export function placeLng(place: Place): number {
  return place.location.coordinates[0]
}
