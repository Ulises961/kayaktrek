import { z } from "zod";
import { DaysSchema } from "./day";

export const ItinerarySchema = z.object({
  id: z.uuidv7().optional(),
  isPublic: z.boolean().nullish(),
  totalMiles: z.number().nullish(),
  expectedTotalMiles: z.number().nullish(),
  days: DaysSchema.nullish(),
  tripId: z.uuidv7().nullish(),
  userId: z.uuidv7().nullish(),
});

export type Itinerary = z.infer<typeof ItinerarySchema>;
export const ItinerariesSchema = z.array(ItinerarySchema);
