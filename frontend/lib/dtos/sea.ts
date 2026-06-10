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
  // tidal reference and correction fields (manual operability)
  referencePortName: z.string().nullable().optional(),
  hwTimeOffsetMinutes: z.number().int().nullable().optional(),
  lwTimeOffsetMinutes: z.number().int().nullable().optional(),
  hwHeightRatio: z.number().nullable().optional(),
  lwHeightRatio: z.number().nullable().optional(),
  tidalSource: z.string().optional(),
  // manual stream fields (drives tidal stream animated layer)
  floodDirectionDegrees: z.number().nullable().optional(),
  ebbDirectionDegrees: z.number().nullable().optional(),
  maxSpringRateKnots: z.number().nullable().optional(),
  maxNeapRateKnots: z.number().nullable().optional(),
  seaStates: z.array(SeaStateSchema).optional(),
  recordedAt: z.string().nullable().optional(),
  ruleOfTwelfths: z.array(RuleOfTwelfthsEntrySchema).nullable().optional(),
})

export type SeaState = z.infer<typeof SeaStateSchema>
export type RuleOfTwelfthsEntry = z.infer<typeof RuleOfTwelfthsEntrySchema>
export type Sea = z.infer<typeof SeaSchema>

// Leader-editable tidal entry form. Base port readings (baseHwHeightM, etc.) are
// transient inputs used to derive corrected HW/LW/range — they are not persisted.
const optionalTime = z
  .string()
  .regex(/^\d{2}:\d{2}$/, "Use HH:MM")
  .optional()
  .or(z.literal(""))

export const TidalEntryFieldsSchema = z.object({
  highTide: optionalTime,
  lowTide: optionalTime,
  tidalRangeM: z.number().min(0).max(20).optional(),
  // port-referenced correction
  referencePortName: z.string().max(255).optional().or(z.literal("")),
  baseHighTide: optionalTime,
  baseLowTide: optionalTime,
  baseHwHeightM: z.number().min(0).max(20).optional(),
  baseLwHeightM: z.number().min(0).max(20).optional(),
  hwTimeOffsetMinutes: z.number().int().min(-720).max(720).optional(),
  lwTimeOffsetMinutes: z.number().int().min(-720).max(720).optional(),
  hwHeightRatio: z.number().min(0).max(5).optional(),
  lwHeightRatio: z.number().min(0).max(5).optional(),
  // stream data (atlas / local knowledge)
  floodDirectionDegrees: z.number().min(0).max(360).optional(),
  ebbDirectionDegrees: z.number().min(0).max(360).optional(),
  maxSpringRateKnots: z.number().min(0).max(20).optional(),
  maxNeapRateKnots: z.number().min(0).max(20).optional(),
})

export type TidalEntryFields = z.infer<typeof TidalEntryFieldsSchema>
