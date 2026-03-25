import { z } from "zod";
import { TravellerSchema } from "./user";
import { InventorySchema } from "./inventory";
import { ItinerarySchema } from "./itinerary";

export const TripSchema = z.object({
  id: z.uuidv7().optional(),
  isDraft: z.boolean().optional(),
  description: z.string().optional(),
  destination: z.string().optional(),
  dateFrom: z.string().optional(), // ISO date: YYYY-MM-DD
  dateTo: z.string().optional(),   // ISO date: YYYY-MM-DD
  inventory: InventorySchema.optional(),
  itinerary: ItinerarySchema.optional(),
  travellers: z.array(TravellerSchema).optional(),
  pendingTravellers: z.array(TravellerSchema).optional(),
});

export type Trip = z.infer<typeof TripSchema>;
export const TripsSchema = z.array(TripSchema);
