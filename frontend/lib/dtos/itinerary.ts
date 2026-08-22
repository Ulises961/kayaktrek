import { z } from "zod"
import { DaysSchema } from "./day"
import { DIFFICULTIES } from "./difficulty"
import { noHtmlTags } from "../validators"

export const ItinerarySchema = z.object({
  id: z.uuidv7().optional(),
  name: z.string().nullish(),
  // The route's public pitch and grade (M19 §1). Both describe the paddling, not the
  // trip — the public shape carries no Trip data, so they cannot live there.
  description: z.string().nullish(),
  difficulty: z.enum(DIFFICULTIES).nullish(),
  isPublic: z.boolean().nullish(),
  avgSpeedKnots: z.number().nullish(),
  totalMiles: z.number().nullish(),
  expectedTotalMiles: z.number().nullish(),
  createdFromId: z.uuidv7().nullish(),
  days: DaysSchema.nullish(),
  tripId: z.uuidv7().nullish(),
  userId: z.uuidv7().nullish(),
  // Unlisted trip-narrative share link (M7d) — only ever dumped back to the owner,
  // right after generate/regenerate (POST /<id>/story-share).
  storyShareToken: z.string().nullish(),
})

export type Itinerary = z.infer<typeof ItinerarySchema>
export const ItinerariesSchema = z.array(ItinerarySchema)

// The authoring form's shape — the route's pitch and grade. Mirrors the backend's
// own limits (2000 chars, markup stripped in the schema layer) so the author is told
// before the round trip rather than by a 400.
export const ItineraryPitchSchema = z.object({
  description: z
    .string()
    .max(2000, "Description must be at most 2000 characters.")
    .refine(noHtmlTags.check, noHtmlTags.message)
    .optional(),
  difficulty: z.enum(DIFFICULTIES).or(z.literal("")).optional(),
})
export type ItineraryPitch = z.infer<typeof ItineraryPitchSchema>

export const PublicItinerarySchema = z.object({
  id: z.string().optional(),
  name: z.string().nullish(),
  isPublic: z.boolean().nullish(),
  totalMiles: z.number().nullish(),
})
export type PublicItinerary = z.infer<typeof PublicItinerarySchema>
export const PublicItinerariesSchema = z.array(PublicItinerarySchema)

// Photo-level opt-in (M7d) — only images the owner explicitly made public. The
// caption (M19 §2) is what names a photo in the flat gallery, which has no grouping
// headings to do that job; the upload filename never reaches this shape.
export const PublicImageSchema = z.object({
  url: z.string(),
  caption: z.string().nullish(),
})
export type PublicImage = z.infer<typeof PublicImageSchema>

export const PublicPointSchema = z.object({
  id: z.string().optional(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  name: z.string().nullish(),
  type: z.string().nullish(),
  dayId: z.string().nullish(),
  nextId: z.string().nullish(),
  images: z.array(PublicImageSchema).default([]),
})
export type PublicPoint = z.infer<typeof PublicPointSchema>

export const PublicDaySchema = z.object({
  dayNumber: z.number(),
  date: z.string().nullish(),
  startPointId: z.string().nullish(),
  endPointId: z.string().nullish(),
  points: z.array(PublicPointSchema).default([]),
})
export type PublicDay = z.infer<typeof PublicDaySchema>

// Fork attribution (M7c) — the author of the itinerary this one was forked from.
// `linkable` mirrors the author's profile_is_public so the UI only deep-links public profiles.
export const OriginalAuthorSchema = z.object({
  username: z.string(),
  name: z.string().nullish(),
  linkable: z.boolean(),
})
export type OriginalAuthor = z.infer<typeof OriginalAuthorSchema>

// A place published with its itinerary (M19 §4) — glyph, label and note, and never
// the author or the visibility flag. Not the deferred community gazetteer: these
// belong to one route and travel with it.
export const PublicPlaceSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  note: z.string().nullish(),
  location: z.object({
    type: z.literal("Point"),
    coordinates: z.tuple([z.number(), z.number()]),
  }),
  category: z.object({
    slug: z.string(),
    name: z.string(),
    icon: z.string().nullish(),
  }),
})
export type PublicPlace = z.infer<typeof PublicPlaceSchema>

export const PublicItineraryDetailSchema = z.object({
  id: z.string().optional(),
  name: z.string().nullish(),
  description: z.string().nullish(),
  difficulty: z.enum(DIFFICULTIES).nullish(),
  isPublic: z.boolean().nullish(),
  totalMiles: z.number().nullish(),
  avgSpeedKnots: z.number().nullish(),
  createdFromId: z.string().nullish(),
  originalAuthor: OriginalAuthorSchema.nullish(),
  days: z.array(PublicDaySchema).default([]),
  places: z.array(PublicPlaceSchema).default([]),
  // Parent trip's lifecycle state (M7d) — read-only, reserved as the seam a future
  // M8 live-position feature attaches to while `happening`.
  tripState: z.string().nullish(),
})
export type PublicItineraryDetail = z.infer<typeof PublicItineraryDetailSchema>

// One row of the /explore discovery listing. Facets are derived server-side from the
// route's own points/dates (no Trip data).
export const ExploreItemSchema = z.object({
  id: z.string(),
  name: z.string().nullish(),
  // Clamped on the card rather than hidden below `sm` — 320 is the browsing context
  // where a scannable pitch matters most (M19 decision 9).
  description: z.string().nullish(),
  difficulty: z.enum(DIFFICULTIES).nullish(),
  totalMiles: z.number().nullish(),
  dayCount: z.number().default(0),
  season: z.string().nullish(),
  centroidLat: z.number().nullish(),
  centroidLng: z.number().nullish(),
  // Simplified [lat, lng] pairs for the card thumbnail polyline — supplied by the
  // backend so listing cards never N+1-fetch full route data to draw a preview.
  previewPositions: z.array(z.tuple([z.number(), z.number()])).default([]),
  createdFromId: z.string().nullish(),
  originalAuthor: OriginalAuthorSchema.nullish(),
})
export type ExploreItem = z.infer<typeof ExploreItemSchema>

export const ExplorePageSchema = z.object({
  items: z.array(ExploreItemSchema).default([]),
  total: z.number().default(0),
  page: z.number().default(1),
  pages: z.number().default(1),
})
export type ExplorePage = z.infer<typeof ExplorePageSchema>

export type ExploreBounds = {
  minLat: number
  minLng: number
  maxLat: number
  maxLng: number
}

export type ExploreSort = "recent" | "distance" | "duration" | "name"

export type ExploreFilters = {
  name?: string
  seasons?: string[]
  minMiles?: number
  maxMiles?: number
  minDays?: number
  maxDays?: number
  bbox?: ExploreBounds
  sort?: ExploreSort
  page?: number
  perPage?: number
}
