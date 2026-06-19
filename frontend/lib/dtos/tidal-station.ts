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

// Hours-from-HW covered by a diamond's stream table: −6 … +6 (slack to slack).
export const DIAMOND_HOURS = [-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6] as const

// Drop-a-pin entry form for a user-created diamond. `simple` synthesises the
// hourly table from peak inputs (rule of thirds); `atlas` carries a per-hour
// table verbatim. Validation mirrors TidalDiamondCreateSchema on the backend.
export const TidalDiamondFormSchema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(255, "Name is too long"),
    entryMode: z.enum(["simple", "atlas"]),
    radiusM: z.number().positive("Radius must be positive").max(20000).nullable().optional(),
    maxSpringRateKnots: z.number().min(0).max(20).nullable().optional(),
    maxNeapRateKnots: z.number().min(0).max(20).nullable().optional(),
    floodDirectionDegrees: z.number().min(0).max(360).nullable().optional(),
    ebbDirectionDegrees: z.number().min(0).max(360).nullable().optional(),
    tidalStreamEntries: z.array(TidalStreamEntrySchema).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.entryMode === "simple") {
      const required = [
        "maxSpringRateKnots",
        "floodDirectionDegrees",
        "ebbDirectionDegrees",
      ] as const
      for (const field of required) {
        if (val[field] == null) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: "Required for simple mode",
          })
        }
      }
    } else if (!val.tidalStreamEntries?.some((e) => e.springRateKnots != null)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["tidalStreamEntries"],
        message: "Enter at least one hourly rate for advanced mode",
      })
    }
  })

// Raw editable view of a user diamond (GET /api/tidal-diamond/<id>): the inputs
// the creator supplied, for prefilling the edit form. Simple peaks are null for
// atlas diamonds; the per-hour table is always present.
export const TidalDiamondEditSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  entryMode: z.enum(["simple", "atlas"]),
  radiusM: z.number().nullable().optional(),
  isUserCreated: z.boolean(),
  maxSpringRateKnots: z.number().nullable().optional(),
  maxNeapRateKnots: z.number().nullable().optional(),
  floodDirectionDegrees: z.number().nullable().optional(),
  ebbDirectionDegrees: z.number().nullable().optional(),
  tidalStreamEntries: z.array(TidalStreamEntrySchema),
})

export type TidalStreamEntry = z.infer<typeof TidalStreamEntrySchema>
export type TidalStation = z.infer<typeof TidalStationSchema>
export type TidalDiamondHour = z.infer<typeof TidalDiamondHourSchema>
export type TidalDiamond = z.infer<typeof TidalDiamondSchema>
export type TidalGateWarning = z.infer<typeof TidalGateWarningSchema>
export type TidalDiamondForm = z.infer<typeof TidalDiamondFormSchema>
export type TidalDiamondEdit = z.infer<typeof TidalDiamondEditSchema>

// Map the raw edit view onto entry-form values. The advanced table is rebuilt as
// the full −6…+6 grid (one row per DIAMOND_HOURS), filled from any stored rows so
// the field array always has its fixed 13 slots regardless of what was persisted.
export function diamondEditToFormValues(edit: TidalDiamondEdit): TidalDiamondForm {
  const byHour = new Map(edit.tidalStreamEntries.map((e) => [e.hoursFromHw, e]))
  return {
    name: edit.name,
    entryMode: edit.entryMode,
    radiusM: edit.radiusM ?? 500,
    maxSpringRateKnots: edit.maxSpringRateKnots ?? null,
    maxNeapRateKnots: edit.maxNeapRateKnots ?? null,
    floodDirectionDegrees: edit.floodDirectionDegrees ?? null,
    ebbDirectionDegrees: edit.ebbDirectionDegrees ?? null,
    tidalStreamEntries: DIAMOND_HOURS.map((h) => {
      const e = byHour.get(h)
      return {
        hoursFromHw: h,
        springRateKnots: e?.springRateKnots ?? null,
        neapRateKnots: e?.neapRateKnots ?? null,
        directionDegrees: e?.directionDegrees ?? null,
      }
    }),
  }
}
