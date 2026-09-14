import { z } from "zod"

export const WeatherStateSchema = z.object({
  dayId: z.string().uuid(),
  time: z.string(),
  temperature: z.number().nullable().optional(),
  precipitation: z.number().nullable().optional(),
  windDirection: z.number().nullable().optional(),
  windForce: z.number().nullable().optional(),
  cloud: z.string().nullable().optional(),
})

export const WeatherSchema = z.object({
  dayId: z.string().uuid(),
  model: z.string().nullable().optional(),
  weatherStates: z.array(WeatherStateSchema).nullable().optional(),
  // Bumped on every refetch (docs/mobile/sync-protocol-spec.md §6.3) — the
  // "forecast as of …" timestamp mobile's offline cache is required to show
  // alongside cached weather. dump_only server-side; never sent on write.
  fetchedAt: z.string().nullable().optional(),
})

export type WeatherState = z.infer<typeof WeatherStateSchema>
export type Weather = z.infer<typeof WeatherSchema>
