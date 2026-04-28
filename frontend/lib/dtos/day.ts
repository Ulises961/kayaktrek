import { z } from "zod";
import { PointsSchema } from "./point";
import { WeatherSchema } from "./weather";
import { SeaSchema } from "./sea";

export const DaySchema = z.object({
  id: z.uuidv7().optional(),
  dayNumber: z.number().int().min(1).max(365),
  itineraryId: z.uuidv7().nullish(),
  date: z.string(),
  points: PointsSchema.nullish(),
  weather: WeatherSchema.nullish(),
  sea: SeaSchema.nullish(),
});

export type Day = z.infer<typeof DaySchema>;
export const DaysSchema = z.array(DaySchema);
