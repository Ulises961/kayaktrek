import { z } from "zod"

export const SeaStateSchema = z.object({
  dayId: z.string().uuid().optional(),
  time: z.string().optional(),
  waveHeight: z.number(),
  waveDirection: z.number(),
  swellDirection: z.number(),
  swellPeriod: z.number(),
  currentSpeed: z.number().nullable().optional(),
  currentDirection: z.number().nullable().optional(),
})

export const RuleOfTwelfthsEntrySchema = z.object({
  hourFromLw: z.number(),
  cumulativeFraction: z.number(),
  estimatedHeightM: z.number(),
})

export const SeaSchema = z.object({
  dayId: z.string().uuid(),
  moonPhase: z.string().nullable().optional(),
  highTide: z.string().nullable().optional(),
  lowTide: z.string().nullable().optional(),
  tidalRangeM: z.number().nullable().optional(),
  seaStates: z.array(SeaStateSchema).optional(),
  recordedAt: z.string().nullable().optional(),
  ruleOfTwelfths: z.array(RuleOfTwelfthsEntrySchema).nullable().optional(),
})

export type SeaState = z.infer<typeof SeaStateSchema>
export type RuleOfTwelfthsEntry = z.infer<typeof RuleOfTwelfthsEntrySchema>
export type Sea = z.infer<typeof SeaSchema>
