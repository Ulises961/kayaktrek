import { z } from "zod";

export const WeatherStateSchema = z.object({
  dayId: z.uuidv7(),
  time: z.string(), // HH:MM:SS
  temperature: z.number().optional(),
  precipitation: z.number().optional(),
  windDirection: z.number().optional(),
  windForce: z.number().optional(),
  cloud: z.string().optional(),
});

export const WeatherSchema = z.object({
  dayId: z.uuidv7(),
  model: z.string(),
  weatherStates: z.array(WeatherStateSchema).optional(),
});

export type WeatherState = z.infer<typeof WeatherStateSchema>;
export type Weather = z.infer<typeof WeatherSchema>;
