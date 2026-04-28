import { z } from "zod"
import { TravellerSchema } from "./user"
import { TripMemberSchema } from "./trip-member"
import { InventorySchema } from "./inventory"
import { ItinerarySchema } from "./itinerary"

export const TRIP_STATES = ["draft", "planning", "happening", "past"] as const
export type TripState = (typeof TRIP_STATES)[number]

export const TripSchema = z.object({
  id: z.uuidv7().optional(),
  state: z.enum(TRIP_STATES).optional(),
  description: z.string().optional(),
  destination: z.string().optional(),
  dateFrom: z.string().optional(),
  dateTo: z.string().optional(),
  inventory: InventorySchema.optional(),
  itinerary: ItinerarySchema.optional(),
  travellers: z.array(TripMemberSchema).optional(),
  pendingTravellers: z.array(TravellerSchema).optional(),
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
