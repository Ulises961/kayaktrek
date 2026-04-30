import { z } from "zod"
import { isoDateField } from "../validators"

export const LogSchema = z.object({
  id: z.uuidv7().optional(),
  userId: z.uuidv7().nullish(),
  date: isoDateField.nullish(),//z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.").nullish(),
  hours: z.number().min(0).max(24).nullish(),
  avgSea: z.number().int().min(0).max(12).nullish(),
  distance: z.number().min(0).nullish(),
  notes: z.string().max(2000).nullish(),
})

export const LogPageSchema = z.object({
  items: z.array(LogSchema),
  total: z.number(),
  page: z.number(),
  pages: z.number(),
})

export const LogsSchema = z.array(LogSchema)

export type Log = z.infer<typeof LogSchema>
export type LogPage = z.infer<typeof LogPageSchema>
