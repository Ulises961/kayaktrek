import { z } from "zod"
import { DaysSchema } from "./day"

export const ItinerarySchema = z.object({
  id: z.uuidv7().optional(),
  name: z.string().nullish(),
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

export const PublicItinerarySchema = z.object({
  id: z.string().optional(),
  name: z.string().nullish(),
  isPublic: z.boolean().nullish(),
  totalMiles: z.number().nullish(),
})
export type PublicItinerary = z.infer<typeof PublicItinerarySchema>
export const PublicItinerariesSchema = z.array(PublicItinerarySchema)

// Photo-level opt-in (M7d) — only images the owner explicitly made public.
export const PublicImageSchema = z.object({
  url: z.string(),
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

export const PublicItineraryDetailSchema = z.object({
  id: z.string().optional(),
  name: z.string().nullish(),
  isPublic: z.boolean().nullish(),
  totalMiles: z.number().nullish(),
  avgSpeedKnots: z.number().nullish(),
  createdFromId: z.string().nullish(),
  originalAuthor: OriginalAuthorSchema.nullish(),
  days: z.array(PublicDaySchema).default([]),
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
  totalMiles: z.number().nullish(),
  dayCount: z.number().default(0),
  season: z.string().nullish(),
  centroidLat: z.number().nullish(),
  centroidLng: z.number().nullish(),
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
