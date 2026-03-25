import { z } from "zod";

export const SeaStateSchema = z.object({
  dayId: z.uuidv7().optional(),
  time: z.string().optional(), // HH:MM:SS
  waveHeight: z.number(),
  waveDirection: z.number(),
  swellDirection: z.number(),
  swellPeriod: z.number(),
});

export const SeaSchema = z.object({
  dayId: z.uuidv7(),
  moonPhase: z.string().optional(),
  highTide: z.string().optional(), // HH:MM
  lowTide: z.string().optional(),  // HH:MM
  seaStates: z.array(SeaStateSchema).optional(),
});

export type SeaState = z.infer<typeof SeaStateSchema>;
export type Sea = z.infer<typeof SeaSchema>;
