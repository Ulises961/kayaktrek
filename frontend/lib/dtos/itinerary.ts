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

export const PublicPointSchema = z.object({
  id: z.string().optional(),
  latitude: z.number().nullish(),
  longitude: z.number().nullish(),
  name: z.string().nullish(),
  type: z.string().nullish(),
  dayId: z.string().nullish(),
  nextId: z.string().nullish(),
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

export const PublicItineraryDetailSchema = z.object({
  id: z.string().optional(),
  name: z.string().nullish(),
  isPublic: z.boolean().nullish(),
  totalMiles: z.number().nullish(),
  avgSpeedKnots: z.number().nullish(),
  days: z.array(PublicDaySchema).default([]),
})
export type PublicItineraryDetail = z.infer<typeof PublicItineraryDetailSchema>
