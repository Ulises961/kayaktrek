import { z } from "zod"

export const TidalStreamEntrySchema = z.object({
  stationId: z.string().uuid().optional(),
  hoursFromHw: z.number().int(),
  directionDegrees: z.number().nullable().optional(),
  springRateKnots: z.number().nullable().optional(),
  neapRateKnots: z.number().nullable().optional(),
})

const GeoJsonPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
})

export const TidalStationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  location: GeoJsonPointSchema,
  source: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  meanSpringRangeM: z.number().nullable().optional(),
  tidalStreamEntries: z.array(TidalStreamEntrySchema).optional(),
})

export const TidalGateWarningSchema = z.object({
  pointId: z.string().uuid(),
  stationName: z.string(),
  rateKnots: z.number(),
  directionDegrees: z.number().nullable().optional(),
  nextSlackUtc: z.string().nullable().optional(),
  isBlocking: z.boolean(),
})

export type TidalStreamEntry = z.infer<typeof TidalStreamEntrySchema>
export type TidalStation = z.infer<typeof TidalStationSchema>
export type TidalGateWarning = z.infer<typeof TidalGateWarningSchema>
