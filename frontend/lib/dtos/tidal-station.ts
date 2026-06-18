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

// One row of a diamond's hour-by-hour stream table, keyed by hours relative to HW.
export const TidalDiamondHourSchema = z.object({
  hourFromHw: z.number().int(),
  rateKnots: z.number().nullable(),
  directionDegrees: z.number().nullable(),
})

// A tidal diamond resolved at a requested hour: the flat marker shape (arrow +
// rate + radius) plus the full hourly table for the popup. Mirrors the
// GET /api/day/<id>/tidal-diamonds response.
export const TidalDiamondSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  directionDegrees: z.number().nullable(),
  rateKnots: z.number().nullable(),
  source: z.string().nullable().optional(),
  radiusM: z.number().nullable().optional(),
  isUserCreated: z.boolean(),
  hourlyTable: z.array(TidalDiamondHourSchema),
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
export type TidalDiamondHour = z.infer<typeof TidalDiamondHourSchema>
export type TidalDiamond = z.infer<typeof TidalDiamondSchema>
export type TidalGateWarning = z.infer<typeof TidalGateWarningSchema>
