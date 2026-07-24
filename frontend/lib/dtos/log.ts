import { z } from "zod"
import { isoDateField, noHtmlTags } from "../validators"

// Shallow endorser identity — mirrors the backend _ShallowEndorserSchema.
// Deliberately flat (no rank/cert fields): endorsement is factual attestation,
// not a rank broadcast (see plans/M7a.md).
export const EndorserSchema = z.object({
  id: z.uuidv7(),
  username: z.string(),
  name: z.string(),
  avatarUrl: z.string().url().nullish(),
})

export const LogSchema = z.object({
  id: z.uuidv7().optional(),
  userId: z.uuidv7().nullish(),
  // The trip this log documents — the endorsement key. Null = standalone, non-endorsable.
  tripId: z.uuidv7().nullish(),
  date: isoDateField.nullish(),
  hours: z.number().min(0).max(24).nullish(),
  avgSea: z.number().int().min(0).max(12).nullish(),
  distance: z.number().min(0).nullish(),
  notes: z.string().max(2000).nullish(),
  // Derived projections — never sent on create/update.
  endorsementCount: z.number().int().min(0).nullish(),
  endorsers: z.array(EndorserSchema).nullish(),
  // Set server-side only (M8 §8.2 ExpeditionLogService for auto-generated logs).
  source: z.enum(["auto", "manual"]).nullish(),
  routeGeojson: z.record(z.string(), z.unknown()).nullish(),
})

// Mirrors ExploreSort (lib/dtos/itinerary.ts) — one canonical date-sort convention
// across the app's Load-more listing surfaces (M12 §K). Enum-backed per the
// project convention (frontend/CLAUDE.md) — never compare against a raw literal.
export const LOG_SORT = {
  NEWEST: "newest",
  OLDEST: "oldest",
} as const
export type LogSort = (typeof LOG_SORT)[keyof typeof LOG_SORT]

export const LogPageSchema = z.object({
  items: z.array(LogSchema),
  total: z.number(),
  page: z.number(),
  pages: z.number(),
})

export const LogsSchema = z.array(LogSchema)

export const LogFieldsSchema = z.object({
  tripId: z.uuidv7().optional(),
  date: isoDateField.optional(),
  hours: z.number().min(0, "Min 0").max(24, "Max 24 hours").optional(),
  avgSea: z.number().int().min(0, "Min 0").max(12, "Max 12 (Beaufort)").optional(),
  distance: z.number().min(0, "Must be positive").optional(),
  notes: z
    .string()
    .max(2000, "Max 2000 characters")
    .refine(noHtmlTags.check, noHtmlTags.message)
    .optional(),
})

export type Log = z.infer<typeof LogSchema>
export type LogPage = z.infer<typeof LogPageSchema>
export type LogFields = z.infer<typeof LogFieldsSchema>
export type Endorser = z.infer<typeof EndorserSchema>
