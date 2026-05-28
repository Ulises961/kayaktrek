import { z } from "zod";
import { DaysSchema } from "./day";

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
});

export type Itinerary = z.infer<typeof ItinerarySchema>;
export const ItinerariesSchema = z.array(ItinerarySchema);

export const PublicItinerarySchema = z.object({
  id: z.string().optional(),
  name: z.string().nullish(),
  isPublic: z.boolean().nullish(),
  totalMiles: z.number().nullish(),
});
export type PublicItinerary = z.infer<typeof PublicItinerarySchema>;
export const PublicItinerariesSchema = z.array(PublicItinerarySchema);
