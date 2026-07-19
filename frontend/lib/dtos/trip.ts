import { z } from "zod"
import { TravellerSchema } from "./user"
import { TripMemberSchema } from "./trip-member"
import { InventorySchema } from "./inventory"
import { ItinerarySchema } from "./itinerary"
import { noHtmlTags, isoDateField } from "../validators"

export const TRIP_STATES = ["building", "happening", "past"] as const
export type TripState = (typeof TRIP_STATES)[number]

export const TRIP_STATE_LABELS: Record<TripState, string> = {
  building: "Planning",
  happening: "Happening",
  past: "Past",
}

// Canonical values for equality checks — never hand-type the string literal at a
// call site. Includes `archived`, the GDPR-erasure terminal state outside the
// forward-only TRIP_STATES progression (never frontend-set, so not part of TripState).
export const TRIP_STATE = {
  BUILDING: "building",
  HAPPENING: "happening",
  PAST: "past",
  ARCHIVED: "archived",
} as const

// Mirrors LOG_SORT (lib/dtos/log.ts) — the same load-more listing convention
// (M12 §24 follow-up). "latest_end" is the Past section's fixed order (most
// recently finished first); "soonest"/"latest" back the Planning section's
// user-facing sort control.
export const TRIP_SORT = {
  SOONEST: "soonest",
  LATEST: "latest",
  LATEST_END: "latest_end",
} as const
export type TripSort = (typeof TRIP_SORT)[keyof typeof TRIP_SORT]

export const TRIP_DIFFICULTIES = ["easy", "moderate", "demanding", "expert"] as const
export type TripDifficulty = (typeof TRIP_DIFFICULTIES)[number]

export const TRIP_DIFFICULTY_LABELS: Record<TripDifficulty, string> = {
  easy: "Easy",
  moderate: "Moderate",
  demanding: "Demanding",
  expert: "Expert",
}

export const TripSchema = z.object({
  id: z.uuidv7().optional(),
  state: z.enum(TRIP_STATES).nullish(),
  difficulty: z.enum(TRIP_DIFFICULTIES).nullish(),
  description: z.string().nullish(),
  destination: z.string().nullish(),
  dateFrom: z.string().nullish(),
  dateTo: z.string().nullish(),
  inventory: InventorySchema.nullish(),
  itinerary: ItinerarySchema.nullish(),
  travellers: z.array(TripMemberSchema).nullish(),
  pendingTravellers: z.array(TravellerSchema).nullish(),
})

export const TripPageSchema = z.object({
  items: z.array(TripSchema),
  total: z.number(),
  page: z.number(),
  pages: z.number(),
})

export const TripFieldsSchema = z
  .object({
    destination: z
      .string()
      .max(200, "Destination must be at most 200 characters.")
      .refine(noHtmlTags.check, noHtmlTags.message)
      .optional(),
    description: z
      .string()
      .max(2000, "Description must be at most 2000 characters.")
      .refine(noHtmlTags.check, noHtmlTags.message)
      .optional(),
    dateFrom: isoDateField,
    dateTo: isoDateField,
    difficulty: z.enum(TRIP_DIFFICULTIES).nullish(),
  })
  .refine(
    (d) => {
      if (d.dateFrom && d.dateTo) return d.dateFrom <= d.dateTo
      return true
    },
    { message: "End date must be on or after the start date.", path: ["dateTo"] },
  )

export type Trip = z.infer<typeof TripSchema>
export type TripPage = z.infer<typeof TripPageSchema>
export type TripFields = z.infer<typeof TripFieldsSchema>
export const TripsSchema = z.array(TripSchema)
