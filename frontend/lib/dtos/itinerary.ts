import { z } from "zod";
import { DaysSchema } from "./day";

export const ItinerarySchema = z.object({
  id: z.uuidv7().optional(),
  isPublic: z.boolean().optional(),
  totalMiles: z.number().optional(),
  expectedTotalMiles: z.number().optional(),
  days: DaysSchema.optional(),
  tripId: z.uuidv7().optional(),
  userId: z.uuidv7().optional(),
});

export type Itinerary = z.infer<typeof ItinerarySchema>;
export const ItinerariesSchema = z.array(ItinerarySchema);
