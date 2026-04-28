import { z } from "zod"
import { TravellerSchema } from "./user"
import { TripMemberSchema } from "./trip-member"
import { InventorySchema } from "./inventory"
import { ItinerarySchema } from "./itinerary"

export const TRIP_STATES = ["draft", "planning", "happening", "past"] as const
export type TripState = (typeof TRIP_STATES)[number]

export const TripSchema = z.object({
  id: z.uuidv7().optional(),
  state: z.enum(TRIP_STATES).nullish(),
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

export type Trip = z.infer<typeof TripSchema>
export type TripPage = z.infer<typeof TripPageSchema>
export const TripsSchema = z.array(TripSchema)
