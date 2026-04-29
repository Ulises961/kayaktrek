import { z } from "zod"

// Shared refine for free-text string fields. Apply after other string validators:
// z.string().max(200, "...").refine(noHtmlTags.check, noHtmlTags.message)
export const noHtmlTags = {
  check: (v: string) => !/<[^>]*>/.test(v),
  message: "HTML tags are not allowed.",
} as const

// ISO 8601 date string (YYYY-MM-DD), accepts empty string (unmounted date pickers).
export const isoDateField = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD format.")
  .or(z.literal(""))
  .optional()
